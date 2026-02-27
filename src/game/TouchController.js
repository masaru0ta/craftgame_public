/**
 * TouchController.js
 * タッチ操作UIを一元管理するクラス
 * 前進ボタン、視点操作、各種ボタンのタッチ入力を処理し、
 * PlayerController / BlockInteraction のAPIを呼び出す
 *
 * ブロック操作は2段階方式:
 *   1. タップ → レイキャスト → ハイライト表示
 *   2. ハイライト上タップ → 設置、ハイライト上長押し → 破壊
 *   異なる場所タップ → ハイライト移動
 *   移動/設置/破壊 → ハイライト消去
 */
class TouchController {
    static DEFAULT_SENSITIVITY = 0.0056;
    static ACTION_LONG_PRESS_MS = 400;
    static ACTION_DRAG_THRESHOLD = 10;
    static PITCH_LIMIT = Math.PI / 2 * 0.99;

    /**
     * @param {Object} options
     * @param {Object} options.player - プレイヤー
     * @param {Object} options.playerController - プレイヤーコントローラー
     * @param {Object} options.blockInteraction - ブロック操作
     * @param {HTMLElement} options.container - タッチUIコンテナ（#touch-controls）
     * @param {Function} options.onToggleInventory - インベントリ開閉コールバック
     * @param {Function} options.onToggleViewpoint - 視点切替コールバック
     * @param {THREE.Camera} options.camera - Three.jsカメラ
     * @param {HTMLCanvasElement} options.canvas - キャンバス要素
     */
    constructor(options) {
        this._player = options.player;
        this._playerController = options.playerController;
        this._blockInteraction = options.blockInteraction;
        this._container = options.container;
        this._onToggleInventory = options.onToggleInventory || (() => {});
        this._onToggleViewpoint = options.onToggleViewpoint || (() => {});
        this._camera = options.camera;
        this._canvas = options.canvas;

        this._enabled = false;
        this._sensitivity = TouchController.DEFAULT_SENSITIVITY;

        // 前進/後退ボタン状態
        this._forwardActive = false;
        this._forwardTouchId = null;
        this._forwardLastX = 0;
        this._forwardLastY = 0;
        this._backwardActive = false;
        this._backwardTouchId = null;
        this._backwardLastX = 0;
        this._backwardLastY = 0;

        // 視点操作状態（タップ/長押しによるアクション判定を含む）
        this._lookActive = false;
        this._lookTouchId = null;
        this._lookLastX = 0;
        this._lookLastY = 0;
        this._lookStartX = 0;
        this._lookStartY = 0;
        this._lookDragged = false;
        this._lastLookTapTime = 0;
        this._actionLongPressTimer = null;
        this._actionTriggered = false;

        // ハイライト状態（2段階タッチ用）
        this._highlightTarget = null;

        // UI要素キャッシュ
        this._btnForward = document.getElementById('touch-btn-forward');
        this._btnBackward = document.getElementById('touch-btn-backward');

        this._bindEvents();
    }

    // --- イベントバインド ---

    /** タッチイベント3種（start/move/end+cancel）を一括登録するヘルパー */
    _addTouchListeners(el, onStart, onMove, onEnd) {
        if (!el) return;
        const opts = { passive: false };
        if (onStart) el.addEventListener('touchstart', onStart, opts);
        if (onMove) el.addEventListener('touchmove', onMove, opts);
        if (onEnd) {
            el.addEventListener('touchend', onEnd, opts);
            el.addEventListener('touchcancel', onEnd, opts);
        }
    }

    /** ボタンのタッチ/リリースを登録するヘルパー */
    _addButtonListeners(el, onRelease) {
        if (!el) return;
        this._addTouchListeners(el,
            (e) => { if (!this._enabled) return; e.preventDefault(); el.style.opacity = '0.8'; },
            null,
            (e) => { e.preventDefault(); el.style.opacity = '0.5'; onRelease(); }
        );
    }

    _bindEvents() {
        // 前進ボタン（タッチで前進、ドラッグで前進+視点回転）
        this._addTouchListeners(this._btnForward,
            (e) => this._onForwardStart(e),
            (e) => this._onForwardMove(e),
            (e) => this._onForwardEnd(e)
        );

        // 後退ボタン（タッチで後退、ドラッグで後退+視点回転）
        this._addTouchListeners(this._btnBackward,
            (e) => this._onBackwardStart(e),
            (e) => this._onBackwardMove(e),
            (e) => this._onBackwardEnd(e)
        );

        // 視点操作エリア
        const lookArea = document.getElementById('touch-look-area');
        this._addTouchListeners(lookArea,
            (e) => this._onLookStart(e),
            (e) => this._onLookMove(e),
            (e) => this._onLookEnd(e)
        );

        // ジャンプボタン（押し続け対応）
        const btnJump = document.getElementById('touch-btn-jump');
        if (btnJump) {
            this._addTouchListeners(btnJump,
                (e) => { if (!this._enabled) return; e.preventDefault(); btnJump.style.opacity = '0.8'; this._playerController.keys.space = true; },
                null,
                (e) => { e.preventDefault(); btnJump.style.opacity = '0.5'; this._playerController.keys.space = false; }
            );
        }

        // インベントリボタン
        this._addButtonListeners(document.getElementById('touch-btn-inventory'),
            () => this._onToggleInventory()
        );

        // スニークボタン（トグル）
        this._addButtonListeners(document.getElementById('touch-btn-sneak'), () => {
            const next = !this._player.isSneaking();
            this._player.setSneaking(next);
            this._playerController.keys.shift = next;
        });

        // 飛行ボタン（トグル）
        this._addButtonListeners(document.getElementById('touch-btn-fly'),
            () => this._player.toggleFlying()
        );
    }

    // --- 前進ボタン操作 ---

    _onForwardStart(e) {
        if (!this._enabled) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        this._forwardActive = true;
        this._forwardTouchId = touch.identifier;
        this._forwardLastX = touch.clientX;
        this._forwardLastY = touch.clientY;

        // 前進開始 → ハイライト消去
        this._playerController.keys.w = true;
        this._clearHighlight();
        if (this._btnForward) this._btnForward.style.opacity = '0.8';
    }

    _onForwardMove(e) {
        if (!this._enabled || !this._forwardActive) return;
        e.preventDefault();
        const touch = this._findTouch(e.changedTouches, this._forwardTouchId);
        if (!touch) return;

        const dx = touch.clientX - this._forwardLastX;
        const dy = touch.clientY - this._forwardLastY;
        this._forwardLastX = touch.clientX;
        this._forwardLastY = touch.clientY;

        this._applyLookDelta(dx, dy);
    }

    _onForwardEnd(e) {
        if (!this._forwardActive) return;
        e.preventDefault();
        this._forwardActive = false;
        this._forwardTouchId = null;

        this._playerController.keys.w = false;
        if (this._btnForward) this._btnForward.style.opacity = '0.5';
    }

    // --- 後退ボタン操作 ---

    _onBackwardStart(e) {
        if (!this._enabled) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        this._backwardActive = true;
        this._backwardTouchId = touch.identifier;
        this._backwardLastX = touch.clientX;
        this._backwardLastY = touch.clientY;

        // 後退開始 → ハイライト消去
        this._playerController.keys.s = true;
        this._clearHighlight();
        if (this._btnBackward) this._btnBackward.style.opacity = '0.8';
    }

    _onBackwardMove(e) {
        if (!this._enabled || !this._backwardActive) return;
        e.preventDefault();
        const touch = this._findTouch(e.changedTouches, this._backwardTouchId);
        if (!touch) return;

        const dx = touch.clientX - this._backwardLastX;
        const dy = touch.clientY - this._backwardLastY;
        this._backwardLastX = touch.clientX;
        this._backwardLastY = touch.clientY;

        this._applyLookDelta(dx, dy);
    }

    _onBackwardEnd(e) {
        if (!this._backwardActive) return;
        e.preventDefault();
        this._backwardActive = false;
        this._backwardTouchId = null;

        this._playerController.keys.s = false;
        if (this._btnBackward) this._btnBackward.style.opacity = '0.5';
    }

    // --- 視点操作 + 2段階ブロック操作 ---

    _onLookStart(e) {
        if (!this._enabled) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        this._lookActive = true;
        this._lookTouchId = touch.identifier;
        this._lookLastX = touch.clientX;
        this._lookLastY = touch.clientY;
        this._lookStartX = touch.clientX;
        this._lookStartY = touch.clientY;
        this._lookDragged = false;
        this._actionTriggered = false;

        // ダブルタップ検出
        const now = performance.now();
        if (now - this._lastLookTapTime < 300) {
            this._onToggleViewpoint();
        }
        this._lastLookTapTime = now;

        // 長押しタイマー開始
        if (this._actionLongPressTimer) clearTimeout(this._actionLongPressTimer);
        const startX = touch.clientX;
        const startY = touch.clientY;
        this._actionLongPressTimer = setTimeout(() => {
            if (!this._lookDragged) {
                this._actionTriggered = true;
                this._handleLongPress(startX, startY);
            }
            this._actionLongPressTimer = null;
        }, TouchController.ACTION_LONG_PRESS_MS);
    }

    _onLookMove(e) {
        if (!this._enabled || !this._lookActive) return;
        e.preventDefault();
        const touch = this._findTouch(e.changedTouches, this._lookTouchId);
        if (!touch) return;

        // ドラッグ判定
        if (!this._lookDragged) {
            const totalDx = touch.clientX - this._lookStartX;
            const totalDy = touch.clientY - this._lookStartY;
            if (Math.abs(totalDx) > TouchController.ACTION_DRAG_THRESHOLD ||
                Math.abs(totalDy) > TouchController.ACTION_DRAG_THRESHOLD) {
                this._lookDragged = true;
                if (this._actionLongPressTimer) {
                    clearTimeout(this._actionLongPressTimer);
                    this._actionLongPressTimer = null;
                }
            }
        }

        const dx = touch.clientX - this._lookLastX;
        const dy = touch.clientY - this._lookLastY;
        this._lookLastX = touch.clientX;
        this._lookLastY = touch.clientY;

        this._applyLookDelta(dx, dy);
    }

    _onLookEnd(e) {
        if (!this._lookActive) return;
        e.preventDefault();
        this._lookActive = false;
        this._lookTouchId = null;

        if (this._actionLongPressTimer) {
            clearTimeout(this._actionLongPressTimer);
            this._actionLongPressTimer = null;
        }

        // 短タップ → 2段階ブロック操作
        if (!this._lookDragged && !this._actionTriggered) {
            this._handleTap(this._lookStartX, this._lookStartY);
        }
        this._actionTriggered = false;
    }

    // --- 2段階ブロック操作 ---

    /** 短タップ: ハイライト無し→ハイライト表示 / ハイライト上→設置 / 異なる場所→ハイライト移動 */
    _handleTap(screenX, screenY) {
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(screenX, screenY, this._camera, this._canvas);
        if (!target || !target.hit) {
            this._clearHighlight();
            return;
        }

        if (this._highlightTarget && this._isSameBlock(target, this._highlightTarget)) {
            // ハイライト上タップ → 設置
            this._blockInteraction.placeBlockAt(target);
            this._clearHighlight();
        } else {
            // 新しい場所 → ハイライト移動
            this._showHighlight(target);
        }
    }

    /** 長押し: ハイライト上→破壊 / 異なる場所→ハイライト移動 */
    _handleLongPress(screenX, screenY) {
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(screenX, screenY, this._camera, this._canvas);
        if (!target || !target.hit) {
            this._clearHighlight();
            return;
        }

        if (this._highlightTarget && this._isSameBlock(target, this._highlightTarget)) {
            // ハイライト上長押し → 破壊
            this._blockInteraction.destroyBlockAt(target);
            this._clearHighlight();
        } else {
            // 新しい場所 → ハイライト移動
            this._showHighlight(target);
        }
    }

    /** 2つのレイキャスト結果が同じブロックかを判定 */
    _isSameBlock(a, b) {
        return a.blockX === b.blockX && a.blockY === b.blockY && a.blockZ === b.blockZ;
    }

    /** ハイライトを表示 */
    _showHighlight(target) {
        this._highlightTarget = target;
        if (this._blockInteraction) {
            this._blockInteraction.currentTarget = target;
            this._blockInteraction.highlight.update(target);
        }
    }

    /** ハイライトを消去 */
    _clearHighlight() {
        this._highlightTarget = null;
        if (this._blockInteraction) {
            this._blockInteraction.currentTarget = null;
            this._blockInteraction.highlight.update(null);
        }
    }

    /** 視点回転の共通処理 */
    _applyLookDelta(dx, dy) {
        const limit = TouchController.PITCH_LIMIT;
        this._player.setYaw(this._player.getYaw() - dx * this._sensitivity);
        this._player.setPitch(
            Math.max(-limit, Math.min(limit, this._player.getPitch() - dy * this._sensitivity))
        );
    }

    // --- ユーティリティ ---

    _findTouch(touchList, id) {
        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === id) return touchList[i];
        }
        return null;
    }

    // --- 公開API ---

    enable() {
        this._enabled = true;
        this.show();
    }

    disable() {
        this._enabled = false;
        this.hide();
        this._playerController.keys.w = false;
        this._playerController.keys.s = false;
        this._playerController.keys.space = false;
        this._playerController.keys.shift = false;
        this._clearHighlight();
    }

    isEnabled() {
        return this._enabled;
    }

    update(deltaTime) {
        // 入力は touchmove で随時更新されるため追加処理不要
    }

    show() {
        if (this._container) this._container.style.display = 'block';
    }

    hide() {
        if (this._container) this._container.style.display = 'none';
    }

    setLookSensitivity(value) {
        this._sensitivity = value;
    }

    setControlsVisible(visible) {
        if (!this._container) return;
        this._container.style.visibility = visible ? 'visible' : 'hidden';
        this._container.style.pointerEvents = visible ? 'auto' : 'none';
    }

    dispose() {
        this._enabled = false;
        this._clearHighlight();
    }
}
