/**
 * PlayerController.js
 * 入力処理とプレイヤー移動を制御するクラス
 * WASD移動、マウス視点操作、ジャンプ、飛行モード等を管理
 */
class PlayerController {
    // 物理パラメータ
    static WALK_SPEED = 7.2;         // 歩行速度（ブロック/秒）
    static SNEAK_SPEED = 3;          // スニーク速度（ブロック/秒）
    static SPRINT_SPEED = 9;         // 走り速度（ブロック/秒）
    static FLY_SPEED = 15;           // 飛行速度（ブロック/秒）
    static JUMP_VELOCITY = 8;        // ジャンプ初速（ブロック/秒）
    static GRAVITY = 32;             // 重力加速度（ブロック/秒²）
    static TERMINAL_VELOCITY = 78.4; // 終端速度（ブロック/秒）

    // 水泳パラメータ
    static SWIM_SPEED = 3;               // 水中移動速度（ブロック/秒）
    static SWIM_UP_VELOCITY = 4;         // 浮上速度（ブロック/秒）
    static SWIM_DOWN_VELOCITY = 4;       // 沈降速度（ブロック/秒）
    static WATER_GRAVITY = 8;            // 水中の重力加速度（ブロック/秒²）
    static WATER_TERMINAL_VELOCITY = 4;  // 水中の終端速度（ブロック/秒）

    // ダブルタップ判定時間（ミリ秒）
    static DOUBLE_TAP_TIME = 300;

    // オートジャンプ設定
    static AUTO_JUMP_MAX_HEIGHT = 1.0;  // オートジャンプ対象の最大段差（ブロック）

    /**
     * コンストラクタ
     * @param {Player} player - プレイヤーインスタンス
     * @param {PhysicsWorld} physicsWorld - 物理演算インスタンス
     * @param {Object} options - オプション
     */
    constructor(player, physicsWorld, options = {}) {
        this._player = player;
        this._physicsWorld = physicsWorld;

        // 入力状態（テスト用にpublicなkeysオブジェクトを公開）
        this.keys = {
            w: false,         // 前進
            s: false,         // 後退
            a: false,         // 左移動
            d: false,         // 右移動
            space: false,     // ジャンプ
            shift: false,     // スニーク
            ctrl: false       // 走り
        };

        // マウス感度（デフォルト: 0.002）
        this._mouseSensitivity = options.mouseSensitivity || 0.002;

        // PointerLock状態
        this._isPointerLocked = false;
        this._pointerLockElement = null;

        // 構造物 Y軸回転
        this._structureRotY = 0;
        this._onRotateStructureCallback = null;
        // UI ブロッキング判定コールバック（インベントリ・クラフト画面が開いているか）
        this._isUIOpenChecker = null;

        // ダブルタップ検出用
        this._lastSpaceTime = 0;
        this._lastWTapTime = 0;
        this._doubleTapSprint = false;

        // オートジャンプ設定（デフォルトON）
        this.autoJumpEnabled = true;

        // 仮想カーソル状態（3人称建築モード用）
        this._virtualCursorEnabled = false;
        this._virtualCursorX = 0;
        this._virtualCursorY = 0;
        this._canvasWidth = 0;
        this._canvasHeight = 0;
        // イベントハンドラをバインド
        this._boundKeyDown = this.handleKeyDown.bind(this);
        this._boundKeyUp = this.handleKeyUp.bind(this);
        this._boundMouseMove = this.handleMouseMove.bind(this);
        this._boundPointerLockChange = this._onPointerLockChange.bind(this);
    }

    // ========================================
    // 入力処理
    // ========================================

    /**
     * キーダウンイベント処理
     * @param {KeyboardEvent} event
     */
    handleKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
                if (!this.keys.w) {
                    const now = performance.now();
                    if (now - this._lastWTapTime < 300) {
                        this._doubleTapSprint = true;
                    }
                    this._lastWTapTime = now;
                }
                this.keys.w = true;
                // Ctrl+Wでブラウザタブが閉じるのを防ぐ
                if (this._isPointerLocked && event.ctrlKey) {
                    event.preventDefault();
                }
                break;
            case 'KeyS':
                this.keys.s = true;
                // Ctrl+Sで保存ダイアログが出るのを防ぐ
                if (this._isPointerLocked && event.ctrlKey) {
                    event.preventDefault();
                }
                break;
            case 'KeyA':
                this.keys.a = true;
                // Ctrl+Aで全選択になるのを防ぐ
                if (this._isPointerLocked && event.ctrlKey) {
                    event.preventDefault();
                }
                break;
            case 'KeyD':
                this.keys.d = true;
                // Ctrl+Dでブックマーク追加になるのを防ぐ
                if (this._isPointerLocked && event.ctrlKey) {
                    event.preventDefault();
                }
                break;
            case 'Space':
                this._handleSpaceKey();
                this.keys.space = true;
                event.preventDefault();
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = true;
                if (!this._player.isFlying()) {
                    this._player.setSneaking(true);
                }
                break;
            case 'ControlLeft':
            case 'ControlRight':
                this.keys.ctrl = true;
                break;
            case 'KeyE':
                if (this._onInventoryToggle) {
                    this._onInventoryToggle();
                }
                break;
            case 'KeyV':
                if (this._onViewpointToggle) {
                    this._onViewpointToggle();
                }
                break;
            case 'KeyR':
                if (this._isPointerLocked &&
                    !(this._isUIOpenChecker && this._isUIOpenChecker())) {
                    this._structureRotY = (this._structureRotY + 1) % 4;
                    if (this._onRotateStructureCallback) {
                        this._onRotateStructureCallback(this._structureRotY);
                    }
                }
                break;
        }
    }

    /**
     * キーアップイベント処理
     * @param {KeyboardEvent} event
     */
    handleKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
                this.keys.w = false;
                this._doubleTapSprint = false;
                break;
            case 'KeyS':
                this.keys.s = false;
                break;
            case 'KeyA':
                this.keys.a = false;
                break;
            case 'KeyD':
                this.keys.d = false;
                break;
            case 'Space':
                this.keys.space = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.shift = false;
                this._player.setSneaking(false);
                break;
            case 'ControlLeft':
            case 'ControlRight':
                this.keys.ctrl = false;
                break;
        }
    }

    /**
     * スペースキー処理（ダブルタップ検出）
     * @private
     */
    _handleSpaceKey() {
        const now = performance.now();
        const timeSinceLastSpace = now - this._lastSpaceTime;

        // ダブルタップ判定
        if (timeSinceLastSpace < PlayerController.DOUBLE_TAP_TIME) {
            this._player.toggleFlying();
            this._lastSpaceTime = 0; // リセット
        } else {
            this._lastSpaceTime = now;
        }
    }

    /**
     * マウス移動イベント処理
     * @param {MouseEvent} event
     */
    handleMouseMove(event) {
        if (!this._isPointerLocked) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        if (this._virtualCursorEnabled && this.keys.shift) {
            // 仮想カーソルモード（しゃがみ時）: movementをカーソル座標に加算
            const margin = 10;
            this._virtualCursorX = Math.max(margin, Math.min(this._canvasWidth - margin,
                this._virtualCursorX + movementX));
            this._virtualCursorY = Math.max(margin, Math.min(this._canvasHeight - margin,
                this._virtualCursorY + movementY));
        } else {
            // 通常モード: yaw/pitch回転
            const yaw = this._player.getYaw();
            this._player.setYaw(yaw - movementX * this._mouseSensitivity);

            const pitch = this._player.getPitch();
            this._player.setPitch(pitch - movementY * this._mouseSensitivity);
        }
    }

    // ========================================
    // 仮想カーソル（3人称建築モード）
    // ========================================

    /**
     * 仮想カーソルモードの有効/無効を切り替える
     * 有効にすると画面中央にリセットされる
     * @param {boolean} enabled
     */
    SetVirtualCursorEnabled(enabled) {
        this._virtualCursorEnabled = enabled;
        if (enabled) {
            this._virtualCursorX = this._canvasWidth / 2;
            this._virtualCursorY = this._canvasHeight / 2;
        }
    }

    /**
     * キャンバスサイズを設定（クランプ用）
     * @param {number} width
     * @param {number} height
     */
    SetCanvasSize(width, height) {
        this._canvasWidth = width;
        this._canvasHeight = height;
    }

    /**
     * 仮想カーソルの現在位置を取得
     * @returns {{ x: number, y: number }}
     */
    GetVirtualCursorPosition() {
        return { x: this._virtualCursorX, y: this._virtualCursorY };
    }

    /**
     * 仮想カーソルモードが有効かどうか
     * @returns {boolean}
     */
    IsVirtualCursorEnabled() {
        return this._virtualCursorEnabled;
    }

    // ========================================
    // 更新処理
    // ========================================

    /**
     * 毎フレームの更新処理
     * @param {number} deltaTime - 前フレームからの経過時間（秒）
     */
    update(deltaTime) {
        // スニーク状態の更新（keys.shiftから直接反映）
        if (!this._player.isFlying()) {
            this._player.setSneaking(this.keys.shift);
        }

        // 走り状態の更新
        this._updateSprintState();

        // 移動速度の決定
        const moveSpeed = this._getMoveSpeed();

        // 移動入力を速度に変換
        const inputVelocity = this._getInputVelocity(moveSpeed);

        // 飛行モード／水中／通常で処理を分岐
        if (this._player.isFlying()) {
            this._updateFlying(inputVelocity, deltaTime);
        } else if (this._physicsWorld.isInWater(this._player)) {
            this._player.setInWater(true);
            this._updateSwimming(inputVelocity, deltaTime);
        } else {
            this._player.setInWater(false);
            this._updateWalking(inputVelocity, deltaTime);
        }
    }

    /**
     * 走り状態を更新
     * @private
     */
    _updateSprintState() {
        // Ctrl+W または Wダブルタップで前進中のみ走り状態
        const shouldSprint = (this.keys.ctrl || this._doubleTapSprint) && this.keys.w && !this._player.isSneaking();
        this._player.setSprinting(shouldSprint);
    }

    /**
     * 現在の移動速度を取得
     * @returns {number} 移動速度（ブロック/秒）
     * @private
     */
    _getMoveSpeed() {
        if (this._player.isFlying()) {
            // 飛行モード: 高度に応じて速度を上げる（低高度でも基本速度を下回らない）
            // ワールドY座標（チャンクbaseY + ローカルY）を使用
            const pos = this._player.getPosition();
            const altitudeFactor = Math.max(1.0, 1.0 + pos.y / 100);
            let baseSpeed = PlayerController.FLY_SPEED * altitudeFactor;
            if (this._player.isSprinting()) {
                baseSpeed *= 1.5; // 飛行中の高速移動
            }
            return baseSpeed;
        } else {
            // 通常モード
            if (this._player.isSneaking()) {
                return PlayerController.SNEAK_SPEED;
            }
            if (this._player.isSprinting()) {
                return PlayerController.SPRINT_SPEED;
            }
            return PlayerController.WALK_SPEED;
        }
    }

    /**
     * 入力から移動速度ベクトルを計算
     * @param {number} speed - 移動速度
     * @returns {{x: number, y: number, z: number}} 速度ベクトル
     * @private
     */
    _getInputVelocity(speed) {
        let moveX = 0;
        let moveZ = 0;

        // WASD入力を収集（後退は前進の60%）
        if (this.keys.w) moveZ += 1;
        if (this.keys.s) moveZ -= 0.6;
        if (this.keys.a) moveX -= 1;
        if (this.keys.d) moveX += 1;

        // 入力がなければゼロベクトル
        if (moveX === 0 && moveZ === 0) {
            return { x: 0, y: 0, z: 0 };
        }

        // 入力ベクトルを正規化
        const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
        moveX /= length;
        moveZ /= length;

        // プレイヤーの向き（Yaw）に基づいて回転
        const yaw = this._player.getYaw();
        const sinYaw = Math.sin(yaw);
        const cosYaw = Math.cos(yaw);

        // ローカル座標系からワールド座標系へ変換
        // Z+が北（前方向）、X+が東（右方向）
        const worldX = moveX * cosYaw - moveZ * sinYaw;
        const worldZ = moveX * sinYaw + moveZ * cosYaw;

        return {
            x: worldX * speed,
            y: 0,
            z: worldZ * speed
        };
    }

    /**
     * 水泳モードの更新
     * @param {{x: number, y: number, z: number}} inputVelocity - 入力による速度
     * @param {number} deltaTime - 経過時間
     * @private
     */
    _updateSwimming(inputVelocity, deltaTime) {
        const velocity = this._player.getVelocity();

        // 水中移動速度（入力を半分に）
        const swimRatio = PlayerController.SWIM_SPEED / PlayerController.WALK_SPEED;
        velocity.x = inputVelocity.x * swimRatio;
        velocity.z = inputVelocity.z * swimRatio;

        // 水中の重力（軽減）
        velocity.y -= PlayerController.WATER_GRAVITY * deltaTime;

        // 浮上（Space）
        if (this.keys.space) {
            velocity.y = PlayerController.SWIM_UP_VELOCITY;
        }
        // 沈降（Shift）
        if (this.keys.shift) {
            velocity.y = -PlayerController.SWIM_DOWN_VELOCITY;
        }

        // 水中の終端速度
        if (velocity.y < -PlayerController.WATER_TERMINAL_VELOCITY) {
            velocity.y = -PlayerController.WATER_TERMINAL_VELOCITY;
        }

        // 物理演算で移動（衝突判定込み）
        this._physicsWorld.movePlayer(this._player, velocity, deltaTime);

        // 接地判定の更新
        const onGround = this._physicsWorld.isOnGround(this._player);
        this._player.setOnGround(onGround);

        // 水中オートジャンプ判定（接地中かつ移動入力がある場合）
        if (onGround && velocity.y <= 0 && this._shouldAutoJump(inputVelocity, deltaTime)) {
            this._triggerAutoJump();
            velocity.y = this._player.getVelocity().y;
        }

        // 接地時は垂直速度をリセット
        if (onGround && velocity.y < 0) {
            velocity.y = 0;
        }

        this._player.setVelocity(velocity.x, velocity.y, velocity.z);
    }

    /**
     * 通常モード（歩行）の更新
     * @param {{x: number, y: number, z: number}} inputVelocity - 入力による速度
     * @param {number} deltaTime - 経過時間
     * @private
     */
    _updateWalking(inputVelocity, deltaTime) {
        const velocity = this._player.getVelocity();

        // 水平方向の速度を入力で上書き
        velocity.x = inputVelocity.x;
        velocity.z = inputVelocity.z;

        // 重力適用
        velocity.y -= PlayerController.GRAVITY * deltaTime;

        // 終端速度で制限
        if (velocity.y < -PlayerController.TERMINAL_VELOCITY) {
            velocity.y = -PlayerController.TERMINAL_VELOCITY;
        }

        // ジャンプ処理
        if (this.keys.space && this._player.isOnGround()) {
            velocity.y = PlayerController.JUMP_VELOCITY;
        }

        // オートジャンプ判定（ジャンプしていない場合のみ）
        if (velocity.y <= 0 && this._shouldAutoJump(inputVelocity, deltaTime)) {
            this._triggerAutoJump();
            velocity.y = this._player.getVelocity().y;
        }

        // スニーク時の落下防止チェック
        let finalVelocityX = velocity.x;
        let finalVelocityZ = velocity.z;

        if (this._player.isSneaking() && this._player.isOnGround()) {
            const edgeCheck = this._physicsWorld.checkSneakEdge(
                this._player,
                velocity.x * deltaTime,
                velocity.z * deltaTime
            );
            // checkSneakEdgeは{dx, dz}を返す（移動できない場合は0）
            if (edgeCheck.dx === 0 && velocity.x !== 0) finalVelocityX = 0;
            if (edgeCheck.dz === 0 && velocity.z !== 0) finalVelocityZ = 0;
        }

        // 物理演算で移動（衝突判定込み）
        this._physicsWorld.movePlayer(
            this._player,
            { x: finalVelocityX, y: velocity.y, z: finalVelocityZ },
            deltaTime
        );

        // 接地判定の更新
        const onGround = this._physicsWorld.isOnGround(this._player);
        this._player.setOnGround(onGround);

        // 接地時は垂直速度をリセット
        if (onGround && velocity.y < 0) {
            velocity.y = 0;
        }

        this._player.setVelocity(velocity.x, velocity.y, velocity.z);
    }

    /**
     * オートジャンプが必要か判定
     * @param {{x: number, y: number, z: number}} inputVelocity - 入力による速度
     * @param {number} deltaTime - 経過時間
     * @returns {boolean} オートジャンプが必要な場合true
     * @private
     */
    _shouldAutoJump(inputVelocity, deltaTime) {
        // オートジャンプが無効な場合
        if (!this.autoJumpEnabled) return false;

        // 接地していない場合
        if (!this._player.isOnGround()) return false;

        // 飛行中は無効
        if (this._player.isFlying()) return false;

        // スニーク中は無効
        if (this._player.isSneaking()) return false;

        // 移動入力がない場合
        if (inputVelocity.x === 0 && inputVelocity.z === 0) return false;

        // 段差チェック
        const stepUp = this._physicsWorld.checkStepUp(
            this._player,
            inputVelocity.x * deltaTime,
            inputVelocity.z * deltaTime,
            PlayerController.AUTO_JUMP_MAX_HEIGHT
        );

        return stepUp.canStepUp;
    }

    /**
     * オートジャンプを実行
     * 接地中、かつ飛行モード/スニーク中でなく、オートジャンプが有効な場合のみ発動
     * @private
     */
    _triggerAutoJump() {
        // オートジャンプが無効な場合は発動しない
        if (!this.autoJumpEnabled) return;

        // 飛行モード中は発動しない
        if (this._player.isFlying()) return;

        // スニーク中は発動しない
        if (this._player.isSneaking()) return;

        // 接地中のみ発動
        if (this._player.isOnGround()) {
            const velocity = this._player.getVelocity();
            velocity.y = PlayerController.JUMP_VELOCITY;
            this._player.setVelocity(velocity.x, velocity.y, velocity.z);
        }
    }

    /**
     * 飛行モードの更新
     * @param {{x: number, y: number, z: number}} inputVelocity - 入力による速度
     * @param {number} deltaTime - 経過時間
     * @private
     */
    _updateFlying(inputVelocity, deltaTime) {
        const speed = this._getMoveSpeed();

        // 水平方向の速度
        let velocityX = inputVelocity.x;
        let velocityZ = inputVelocity.z;
        let velocityY = 0;

        // 上昇・下降
        if (this.keys.space) {
            velocityY = speed;
        } else if (this.keys.shift) {
            velocityY = -speed;
        }

        // 飛行中に下降して着地したら飛行モード解除
        const wasOnGround = this._player.isOnGround();

        // 物理演算で移動（衝突判定込み）
        this._physicsWorld.movePlayer(
            this._player,
            { x: velocityX, y: velocityY, z: velocityZ },
            deltaTime
        );

        const onGround = this._physicsWorld.isOnGround(this._player);

        // 空中から着地した場合（下降中）のみ飛行モードを解除
        if (!wasOnGround && onGround && velocityY < 0) {
            this._player.setFlying(false);
        }
        this._player.setOnGround(onGround);

        // 速度を記録
        this._player.setVelocity(velocityX, velocityY, velocityZ);
    }

    // ========================================
    // PointerLock
    // ========================================

    /**
     * PointerLockをリクエスト
     * @param {HTMLElement} element - ロック対象の要素
     */
    requestPointerLock(element) {
        this._pointerLockElement = element;

        // 重複登録を防ぐため先に除去してから登録
        document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
        document.removeEventListener('keydown', this._boundKeyDown);
        document.removeEventListener('keyup', this._boundKeyUp);
        document.removeEventListener('mousemove', this._boundMouseMove);

        document.addEventListener('pointerlockchange', this._boundPointerLockChange);
        document.addEventListener('keydown', this._boundKeyDown);
        document.addEventListener('keyup', this._boundKeyUp);
        document.addEventListener('mousemove', this._boundMouseMove);

        // PointerLockをリクエスト
        element.requestPointerLock();
    }

    /**
     * PointerLockを解除
     */
    exitPointerLock() {
        document.exitPointerLock();
    }

    /**
     * PointerLockが有効かどうか
     * @returns {boolean}
     */
    isPointerLocked() {
        return this._isPointerLocked;
    }

    /**
     * PointerLock状態変更時のコールバック
     * @private
     */
    _onPointerLockChange() {
        this._isPointerLocked = document.pointerLockElement === this._pointerLockElement;
    }

    // ========================================
    // 設定
    // ========================================

    /**
     * マウス感度を設定
     * @param {number} value - 感度（デフォルト: 0.002）
     */
    setMouseSensitivity(value) {
        this._mouseSensitivity = value;
    }

    /**
     * マウス感度を取得
     * @returns {number}
     */
    getMouseSensitivity() {
        return this._mouseSensitivity;
    }

    /**
     * マウス感度（テスト用のエイリアス）
     */
    get mouseSensitivity() {
        return this._mouseSensitivity;
    }

    set mouseSensitivity(value) {
        this._mouseSensitivity = value;
    }

    /**
     * ジャンプを実行（テスト用）
     * 接地中のみジャンプ可能
     */
    jump() {
        if (this._player.isOnGround() && !this._player.isFlying()) {
            const velocity = this._player.getVelocity();
            velocity.y = PlayerController.JUMP_VELOCITY;
            this._player.setVelocity(velocity.x, velocity.y, velocity.z);
        }
    }

    /**
     * インベントリ開閉コールバックを設定
     * @param {Function} callback
     */
    onInventoryToggle(callback) {
        this._onInventoryToggle = callback;
    }

    /**
     * 視点切替コールバックを設定
     * @param {Function} callback
     */
    onViewpointToggle(callback) {
        this._onViewpointToggle = callback;
    }

    /**
     * 構造物 Y軸回転コールバックを設定
     * R キーが押されるたびに rotY（0〜3）を引数として呼ばれる
     * @param {Function} callback - (rotY: number) => void
     */
    onRotateStructure(callback) {
        this._onRotateStructureCallback = callback;
    }

    /**
     * UI ブロッキング判定コールバックを設定
     * インベントリ・クラフト画面が開いているときに true を返す関数を渡す
     * @param {Function} checker - () => boolean
     */
    setUIOpenChecker(checker) {
        this._isUIOpenChecker = checker;
    }

    /**
     * 現在の構造物 Y軸回転量を取得
     * @returns {number} 0|1|2|3
     */
    get structureRotY() {
        return this._structureRotY;
    }

    /**
     * リソースの解放
     */
    dispose() {
        document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
        document.removeEventListener('keydown', this._boundKeyDown);
        document.removeEventListener('keyup', this._boundKeyUp);
        document.removeEventListener('mousemove', this._boundMouseMove);
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PlayerController = PlayerController;
}
