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
    static PINCH_SENSITIVITY = 0.05;
    static VIEWPOINT_SWITCH_THRESHOLD = 3.0;

    /**
     * @param {Object} options
     * @param {Object} options.player - プレイヤー
     * @param {Object} options.playerController - プレイヤーコントローラー
     * @param {Object} options.blockInteraction - ブロック操作
     * @param {HTMLElement} options.container - タッチUIコンテナ（#touch-controls）
     * @param {Function} options.onToggleInventory - インベントリ開閉コールバック
     * @param {Object} options.viewpointManager - 視点マネージャー
     * @param {Object} options.thirdPersonCamera - 3人称カメラ
     * @param {THREE.Camera} options.camera - Three.jsカメラ
     * @param {HTMLCanvasElement} options.canvas - キャンバス要素
     */
    constructor(options) {
        this._player = options.player;
        this._playerController = options.playerController;
        this._blockInteraction = options.blockInteraction;
        this._container = options.container;
        this._onToggleInventory = options.onToggleInventory || (() => {});
        this._viewpointManager = options.viewpointManager;
        this._thirdPersonCamera = options.thirdPersonCamera;
        this._camera = options.camera;
        this._canvas = options.canvas;

        this._enabled = false;
        this._sensitivity = TouchController.DEFAULT_SENSITIVITY;

        // 移動ボタン状態（前進/後退で共用する構造）
        this._moveState = {
            forward:  { active: false, touchId: null, lastX: 0, lastY: 0 },
            backward: { active: false, touchId: null, lastX: 0, lastY: 0 },
        };

        // 視点操作状態（タップ/長押しによるアクション判定を含む）
        this._lookActive = false;
        this._lookTouchId = null;
        this._lookLastX = 0;
        this._lookLastY = 0;
        this._lookStartX = 0;
        this._lookStartY = 0;
        this._lookDragged = false;
        this._actionLongPressTimer = null;
        this._actionTriggered = false;

        // ピンチ状態
        this._isPinching = false;
        this._pinchStartDistance = 0;

        // ハイライト状態（2段階タッチ用）
        this._highlightTarget = null;

        // 連続削除モード
        this._continuousDeleteBlockId = null;
        this._continuousDeleteTimer = null;

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
        this._bindMoveButton(this._btnForward, 'forward', 'w');

        // 後退ボタン（タッチで後退、ドラッグで後退+視点回転）
        this._bindMoveButton(this._btnBackward, 'backward', 's');

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

        // ホットバースロット長押しで設置形状切替
        this._bindHotbarLongPress();
    }

    /** ホットバースロットの長押しイベントをバインド（イベント委譲方式） */
    _bindHotbarLongPress() {
        if (!this._blockInteraction) return;
        const hotbar = this._blockInteraction.hotbar;
        if (!hotbar || !hotbar.container) return;

        let timer = null;
        let activeIndex = -1;

        const getSlotIndex = (e) => {
            const slot = e.target.closest('.hotbar-slot');
            if (!slot) return -1;
            const idx = parseInt(slot.dataset.slot, 10);
            return isNaN(idx) ? -1 : idx;
        };

        this._addTouchListeners(hotbar.container,
            (e) => {
                if (!this._enabled) return;
                const idx = getSlotIndex(e);
                if (idx < 0) return;
                activeIndex = idx;
                timer = setTimeout(() => {
                    this._cyclePlacementMode(activeIndex);
                    timer = null;
                }, TouchController.ACTION_LONG_PRESS_MS);
            },
            null,
            () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                activeIndex = -1;
            }
        );
    }

    /** 指定スロットの設置形状をサイクル切替 */
    _cyclePlacementMode(slotIndex) {
        const bi = this._blockInteraction;
        const hotbar = bi.hotbar;
        const block = hotbar.getSlotBlock(slotIndex);
        if (!block) return;
        if (!block.half_placeable && !block.stair_placeable && !block.slope_placeable) return;

        const current = bi._placementModes.get(slotIndex) || 'normal';
        const next = bi._getNextPlacementMode(block, current);
        bi._placementModes.set(slotIndex, next);
        hotbar.setPlacementMode(slotIndex, next);
    }

    // --- 移動ボタン操作（前進/後退共通） ---

    _bindMoveButton(btnEl, stateKey, keyName) {
        this._addTouchListeners(btnEl,
            (e) => this._onMoveStart(e, stateKey, keyName, btnEl),
            (e) => this._onMoveMove(e, stateKey),
            (e) => this._onMoveEnd(e, stateKey, keyName, btnEl)
        );
    }

    _onMoveStart(e, stateKey, keyName, btnEl) {
        if (!this._enabled) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        const s = this._moveState[stateKey];
        s.active = true;
        s.touchId = touch.identifier;
        s.lastX = touch.clientX;
        s.lastY = touch.clientY;

        this._playerController.keys[keyName] = true;
        this._clearHighlight();
        if (btnEl) btnEl.style.opacity = '0.8';
    }

    _onMoveMove(e, stateKey) {
        const s = this._moveState[stateKey];
        if (!this._enabled || !s.active) return;
        e.preventDefault();
        const touch = this._findTouch(e.changedTouches, s.touchId);
        if (!touch) return;

        const dx = touch.clientX - s.lastX;
        const dy = touch.clientY - s.lastY;
        s.lastX = touch.clientX;
        s.lastY = touch.clientY;

        this._applyLookDelta(dx, dy);
    }

    _onMoveEnd(e, stateKey, keyName, btnEl) {
        const s = this._moveState[stateKey];
        if (!s.active) return;
        e.preventDefault();
        s.active = false;
        s.touchId = null;

        this._playerController.keys[keyName] = false;
        if (btnEl) btnEl.style.opacity = '0.5';
    }

    // --- 視点操作 + 2段階ブロック操作 ---

    _onLookStart(e) {
        if (!this._enabled) return;
        e.preventDefault();

        // 2本指 → ピンチ開始
        if (e.touches.length === 2) {
            this._startPinch(e.touches);
            return;
        }

        // ピンチ中は1本指操作を無視
        if (this._isPinching) return;

        const touch = e.changedTouches[0];
        this._lookActive = true;
        this._lookTouchId = touch.identifier;
        this._lookLastX = touch.clientX;
        this._lookLastY = touch.clientY;
        this._lookStartX = touch.clientX;
        this._lookStartY = touch.clientY;
        this._lookDragged = false;
        this._actionTriggered = false;

        // 長押しタイマー開始
        this._cancelLongPressTimer();
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
        if (!this._enabled) return;
        e.preventDefault();

        // ピンチ中の2本指移動
        if (this._isPinching && e.touches.length === 2) {
            this._updatePinch(e.touches);
            return;
        }

        // ピンチ中は1本指操作を無視
        if (this._isPinching) return;

        if (!this._lookActive) return;
        const touch = this._findTouch(e.changedTouches, this._lookTouchId);
        if (!touch) return;

        // ドラッグ判定
        if (!this._lookDragged) {
            const totalDx = touch.clientX - this._lookStartX;
            const totalDy = touch.clientY - this._lookStartY;
            if (Math.abs(totalDx) > TouchController.ACTION_DRAG_THRESHOLD ||
                Math.abs(totalDy) > TouchController.ACTION_DRAG_THRESHOLD) {
                this._lookDragged = true;
                this._cancelLongPressTimer();
            }
        }

        const dx = touch.clientX - this._lookLastX;
        const dy = touch.clientY - this._lookLastY;
        this._lookLastX = touch.clientX;
        this._lookLastY = touch.clientY;

        this._applyLookDelta(dx, dy);
    }

    _onLookEnd(e) {
        e.preventDefault();

        // ピンチ終了判定（残り1本以下で終了）
        if (this._isPinching) {
            if (e.touches.length <= 1) {
                this._isPinching = false;
            }
            return;
        }

        if (!this._lookActive) return;
        this._lookActive = false;
        this._lookTouchId = null;

        this._cancelLongPressTimer();
        this._stopContinuousDelete();

        // 短タップ → 2段階ブロック操作
        if (!this._lookDragged && !this._actionTriggered) {
            this._handleTap(this._lookStartX, this._lookStartY);
        }
        this._actionTriggered = false;
    }

    // --- 2段階ブロック操作 ---

    /** 短タップ/長押し共通: レイキャスト → ハイライト判定 → アクション実行 */
    _handleBlockAction(screenX, screenY, onMatchAction) {
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(screenX, screenY, this._camera, this._canvas);
        if (!target || !target.hit) {
            this._clearHighlight();
            return;
        }

        if (this._highlightTarget && this._isSameBlock(target, this._highlightTarget)) {
            onMatchAction(target);
            this._clearHighlight();
        } else {
            this._showHighlight(target);
        }
    }

    /** 短タップ: ハイライト上→設置 / 新しい場所→ハイライト移動 */
    _handleTap(screenX, screenY) {
        this._handleBlockAction(screenX, screenY, (target) => {
            this._blockInteraction.placeBlockAt(target);
        });
    }

    /** 長押し: ハイライト不要で直接破壊 → 連続削除モード開始 */
    _handleLongPress(screenX, screenY) {
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(screenX, screenY, this._camera, this._canvas);
        if (!target || !target.hit) {
            this._clearHighlight();
            return;
        }

        const pw = this._blockInteraction.physicsWorld;
        const blockId = pw.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (!blockId || blockId === 'air') return;

        const destroyed = this._blockInteraction.destroyBlockAt(target);
        this._clearHighlight();
        if (destroyed) {
            this._startContinuousDelete(blockId);
        }
    }

    /** 連続削除モードを開始 */
    _startContinuousDelete(blockId) {
        this._stopContinuousDelete();
        this._continuousDeleteBlockId = blockId;
        this._continuousDeleteTimer = setInterval(() => {
            this._tryContinuousDelete();
        }, TouchController.ACTION_LONG_PRESS_MS);
    }

    /** 連続削除モードを停止 */
    _stopContinuousDelete() {
        this._continuousDeleteBlockId = null;
        if (this._continuousDeleteTimer) {
            clearInterval(this._continuousDeleteTimer);
            this._continuousDeleteTimer = null;
        }
    }

    /** 連続削除: 現在の指位置でレイキャストし、同じブロックなら破壊 */
    _tryContinuousDelete() {
        if (!this._continuousDeleteBlockId || !this._lookActive) {
            this._stopContinuousDelete();
            return;
        }
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(
            this._lookLastX, this._lookLastY, this._camera, this._canvas
        );
        if (!target || !target.hit) return;

        const pw = this._blockInteraction.physicsWorld;
        const blockId = pw.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (blockId === this._continuousDeleteBlockId) {
            this._blockInteraction.destroyBlockAt(target);
            // 破壊後すぐに次のターゲットのハイライトを更新
            this._updateContinuousDeleteHighlight();
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
            this._blockInteraction._updatePlacementPreview();
        }
    }

    /** ハイライトを消去 */
    _clearHighlight() {
        this._highlightTarget = null;
        if (this._blockInteraction) {
            this._blockInteraction.currentTarget = null;
            this._blockInteraction.highlight.update(null);
            this._blockInteraction._updatePlacementPreview();
        }
    }

    // --- ピンチ操作 ---

    /** 2点間距離を算出 */
    _getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    /** ピンチ開始 */
    _startPinch(touches) {
        this._pinchStartDistance = this._getTouchDistance(touches);
        this._isPinching = true;

        // 1本指操作をキャンセル
        this._lookActive = false;
        this._lookTouchId = null;
        this._cancelLongPressTimer();
    }

    /** ピンチ更新 */
    _updatePinch(touches) {
        if (!this._viewpointManager || !this._thirdPersonCamera) return;

        const currentDistance = this._getTouchDistance(touches);
        const delta = (this._pinchStartDistance - currentDistance) * TouchController.PINCH_SENSITIVITY;
        this._pinchStartDistance = currentDistance;

        const threshold = TouchController.VIEWPOINT_SWITCH_THRESHOLD;

        if (this._viewpointManager.getMode() === 'first_person') {
            if (delta > 0) {
                this._viewpointManager.setMode('third_person');
                this._thirdPersonCamera.setDistance(threshold);
            }
        } else {
            const newDistance = this._thirdPersonCamera.getDistance() + delta;
            if (newDistance <= threshold) {
                this._viewpointManager.setMode('first_person');
            } else {
                this._thirdPersonCamera.setDistance(newDistance);
            }
        }
    }

    // --- ユーティリティ ---

    /** 視点回転の共通処理 */
    _applyLookDelta(dx, dy) {
        const limit = TouchController.PITCH_LIMIT;
        this._player.setYaw(this._player.getYaw() - dx * this._sensitivity);
        this._player.setPitch(
            Math.max(-limit, Math.min(limit, this._player.getPitch() - dy * this._sensitivity))
        );
    }

    _findTouch(touchList, id) {
        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === id) return touchList[i];
        }
        return null;
    }

    /** 長押しタイマーをキャンセル */
    _cancelLongPressTimer() {
        if (this._actionLongPressTimer) {
            clearTimeout(this._actionLongPressTimer);
            this._actionLongPressTimer = null;
        }
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
        // 連続削除中は毎フレーム指位置のハイライトを更新
        if (this._continuousDeleteBlockId && this._lookActive) {
            this._updateContinuousDeleteHighlight();
        }
        // ハイライト表示中はゴーストブロック（設置予測）を毎フレーム更新
        if (this._highlightTarget && this._blockInteraction) {
            this._blockInteraction._updatePlacementPreview();
        }
    }

    /** 連続削除中: 指位置のブロックにハイライトを表示（同種ブロックのみ） */
    _updateContinuousDeleteHighlight() {
        if (!this._blockInteraction || !this._camera || !this._canvas) return;

        const target = this._blockInteraction.raycastFromScreen(
            this._lookLastX, this._lookLastY, this._camera, this._canvas
        );
        if (!target || !target.hit) {
            this._clearHighlight();
            return;
        }

        const pw = this._blockInteraction.physicsWorld;
        const blockId = pw.getBlockAt(target.blockX, target.blockY, target.blockZ);
        if (blockId === this._continuousDeleteBlockId) {
            this._showHighlight(target);
        } else {
            this._clearHighlight();
        }
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
        this._stopContinuousDelete();
    }
}
