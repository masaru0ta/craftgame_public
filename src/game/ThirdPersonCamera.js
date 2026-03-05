/**
 * ThirdPersonCamera.js
 * 3人称視点カメラ制御クラス
 * プレイヤー背後上方からのカメラ位置計算
 */
class ThirdPersonCamera {
    // 距離の範囲
    static MIN_DISTANCE = 1.5;
    static MAX_DISTANCE = 30.0;

    // 仰角の範囲
    static MIN_ELEVATION = 0.1;
    static MAX_ELEVATION = 1.2;

    /**
     * @param {THREE.PerspectiveCamera} camera - 共有カメラ
     * @param {Player} player - プレイヤーインスタンス
     */
    constructor(camera, player) {
        this._camera = camera;
        this._player = player;
        this._distance = 18.0;
        this._elevation = 0.4;
    }

    /**
     * カメラ位置をプレイヤーに同期（毎フレーム呼出）
     */
    update() {
        const eyePos = this._player.getEyePosition();
        const yaw = this._player.getYaw();
        const pitch = this._player.getPitch();

        // pitchをカメラ仰角に反映（上向き→カメラが下がる、下向き→カメラが上がる）
        const effectiveElevation = Math.max(-0.3, Math.min(1.5, this._elevation - pitch * 0.5));

        // 球面座標でカメラ位置を計算（左手系）
        const cosElev = Math.cos(effectiveElevation);
        const sinElev = Math.sin(effectiveElevation);
        const camX = eyePos.x + Math.sin(yaw) * cosElev * this._distance;
        const camY = eyePos.y + sinElev * this._distance;
        const camZ = eyePos.z - Math.cos(yaw) * cosElev * this._distance;

        // Three.js右手系への変換（Z軸反転）
        this._camera.position.set(camX, camY, -camZ);

        // 注視点 = プレイヤー目線位置から1ブロック上（Z反転）
        this._camera.lookAt(eyePos.x, eyePos.y + 1, -eyePos.z);
    }

    /** @returns {number} */
    getDistance() {
        return this._distance;
    }

    /** @param {number} d */
    setDistance(d) {
        this._distance = Math.max(ThirdPersonCamera.MIN_DISTANCE,
            Math.min(ThirdPersonCamera.MAX_DISTANCE, d));
    }

    /** @returns {number} */
    getElevation() {
        return this._elevation;
    }

    /** @param {number} e */
    setElevation(e) {
        this._elevation = Math.max(ThirdPersonCamera.MIN_ELEVATION,
            Math.min(ThirdPersonCamera.MAX_ELEVATION, e));
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ThirdPersonCamera = ThirdPersonCamera;
}
