/**
 * FirstPersonCamera.js
 * 1人称視点カメラ制御クラス
 * PointerLock APIを使用したマウス操作とプレイヤー追従
 */
class FirstPersonCamera {
    // カメラ設定
    static FOV = 70;           // 視野角（度）
    static NEAR = 0.1;         // 近クリップ面
    static FAR = 1000;         // 遠クリップ面

    /**
     * コンストラクタ
     * @param {THREE.PerspectiveCamera} camera - Three.jsカメラ
     * @param {Player} player - プレイヤーインスタンス
     */
    constructor(camera, player) {
        this._camera = camera;
        this._player = player;

        // PointerLock状態
        this._isPointerLocked = false;
        this._pointerLockElement = null;
        this._pointerLockChangeCallback = null;

        // イベントハンドラをバインド
        this._boundPointerLockChange = this._onPointerLockChange.bind(this);

        // カメラ初期設定
        this._camera.fov = FirstPersonCamera.FOV;
        this._camera.near = FirstPersonCamera.NEAR;
        this._camera.far = FirstPersonCamera.FAR;
        this._camera.updateProjectionMatrix();
    }

    // ========================================
    // カメラ更新
    // ========================================

    /**
     * カメラをプレイヤーの位置・向きに同期
     * 毎フレーム呼び出す
     */
    update() {
        // プレイヤーの目線位置を取得
        const eyePos = this._player.getEyePosition();

        // プレイヤー座標（左手系）からカメラ座標（Three.js右手系）へ変換
        // Z軸を反転（worldContainerでscale.z = -1しているため）
        this._camera.position.set(eyePos.x, eyePos.y, -eyePos.z);

        // プレイヤーの向きを取得
        const yaw = this._player.getYaw();
        const pitch = this._player.getPitch();

        // 視線方向を計算（左手系）
        const cosPitch = Math.cos(pitch);
        const lookDir = {
            x: -Math.sin(yaw) * cosPitch,
            y: Math.sin(pitch),
            z: Math.cos(yaw) * cosPitch
        };

        // カメラの向きを設定（Three.js右手系への変換）
        // lookAtを使用してカメラを目標点に向ける
        const targetX = eyePos.x + lookDir.x;
        const targetY = eyePos.y + lookDir.y;
        const targetZ = -(eyePos.z + lookDir.z); // Z軸反転

        this._camera.lookAt(targetX, targetY, targetZ);
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

        // イベントリスナーを登録
        document.addEventListener('pointerlockchange', this._boundPointerLockChange);

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
     * PointerLock状態変更時のコールバックを登録
     * @param {Function} callback - コールバック関数(isLocked: boolean)
     */
    onPointerLockChange(callback) {
        this._pointerLockChangeCallback = callback;
    }

    /**
     * PointerLock状態変更時の内部ハンドラ
     * @private
     */
    _onPointerLockChange() {
        const wasLocked = this._isPointerLocked;
        this._isPointerLocked = document.pointerLockElement === this._pointerLockElement;

        // 状態が変化した場合、コールバックを呼び出す
        if (wasLocked !== this._isPointerLocked && this._pointerLockChangeCallback) {
            this._pointerLockChangeCallback(this._isPointerLocked);
        }
    }

    // ========================================
    // カメラアクセス
    // ========================================

    /**
     * Three.jsカメラを取得
     * @returns {THREE.PerspectiveCamera}
     */
    getCamera() {
        return this._camera;
    }

    /**
     * プレイヤーを取得
     * @returns {Player}
     */
    getPlayer() {
        return this._player;
    }

    /**
     * カメラのアスペクト比を設定
     * @param {number} aspect - アスペクト比
     */
    setAspect(aspect) {
        this._camera.aspect = aspect;
        this._camera.updateProjectionMatrix();
    }

    // ========================================
    // リソース解放
    // ========================================

    /**
     * リソースを解放
     */
    dispose() {
        document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
        this._pointerLockChangeCallback = null;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.FirstPersonCamera = FirstPersonCamera;
}
