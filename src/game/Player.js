/**
 * Player.js
 * プレイヤー状態管理クラス
 * 位置、向き、速度、状態（接地、飛行、スニーク等）を管理
 */
class Player {
    // プレイヤーサイズ定数（Minecraft準拠）
    static WIDTH = 0.6;                    // 幅（X軸・Z軸）
    static HEIGHT_NORMAL = 1.8;            // 高さ（通常時）
    static HEIGHT_SNEAK = 1.5;             // 高さ（スニーク時）
    static EYE_HEIGHT_NORMAL = 1.62;       // 目線高さ（通常時）
    static EYE_HEIGHT_SNEAK = 1.35;        // 目線高さ（スニーク時）

    /**
     * コンストラクタ
     * @param {number} x - 初期X座標
     * @param {number} y - 初期Y座標（足元）
     * @param {number} z - 初期Z座標
     */
    constructor(x = 0, y = 0, z = 0) {
        // 位置（足元の中心）
        this._position = { x, y, z };

        // 速度ベクトル
        this._velocity = { x: 0, y: 0, z: 0 };

        // 向き（ラジアン）
        this._yaw = 0;      // 左右の向き（0=北/Z+方向）
        this._pitch = 0;    // 上下の向き（-π/2〜π/2）

        // 状態フラグ
        this._isOnGround = false;
        this._isFlying = false;
        this._isSprinting = false;
        this._isSneaking = false;
    }

    // ========================================
    // 位置関連
    // ========================================

    /**
     * 現在位置を取得（足元の中心）
     * @returns {{x: number, y: number, z: number}}
     */
    getPosition() {
        return { ...this._position };
    }

    /**
     * 位置を設定
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setPosition(x, y, z) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
    }

    /**
     * 目線位置を取得
     * @returns {{x: number, y: number, z: number}}
     */
    getEyePosition() {
        const eyeHeight = this._isSneaking ? Player.EYE_HEIGHT_SNEAK : Player.EYE_HEIGHT_NORMAL;
        return {
            x: this._position.x,
            y: this._position.y + eyeHeight,
            z: this._position.z
        };
    }

    // ========================================
    // 向き関連
    // ========================================

    /**
     * Yaw（左右の向き）を取得
     * @returns {number} ラジアン（0=北/Z+方向）
     */
    getYaw() {
        return this._yaw;
    }

    /**
     * Yawを設定
     * @param {number} yaw - ラジアン
     */
    setYaw(yaw) {
        // 0〜2πの範囲に正規化
        this._yaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }

    /**
     * Pitch（上下の向き）を取得
     * @returns {number} ラジアン（-π/2〜π/2）
     */
    getPitch() {
        return this._pitch;
    }

    /**
     * Pitchを設定（-89度〜+89度に制限）
     * @param {number} pitch - ラジアン
     */
    setPitch(pitch) {
        const limit = Math.PI / 2 * 0.99; // 約89度
        this._pitch = Math.max(-limit, Math.min(limit, pitch));
    }

    /**
     * 視線方向の単位ベクトルを取得
     * @returns {{x: number, y: number, z: number}}
     */
    getLookDirection() {
        const cosPitch = Math.cos(this._pitch);
        return {
            x: -Math.sin(this._yaw) * cosPitch,
            y: Math.sin(this._pitch),
            z: Math.cos(this._yaw) * cosPitch
        };
    }

    // ========================================
    // 状態フラグ
    // ========================================

    /**
     * 接地判定を取得
     * @returns {boolean}
     */
    isOnGround() {
        return this._isOnGround;
    }

    /**
     * 接地判定を設定
     * @param {boolean} value
     */
    setOnGround(value) {
        this._isOnGround = value;
    }

    /**
     * 飛行モードを取得
     * @returns {boolean}
     */
    isFlying() {
        return this._isFlying;
    }

    /**
     * 飛行モードを設定
     * @param {boolean} value
     */
    setFlying(value) {
        this._isFlying = value;
    }

    /**
     * 飛行モードをトグル
     */
    toggleFlying() {
        this._isFlying = !this._isFlying;
    }

    /**
     * 走り状態を取得
     * @returns {boolean}
     */
    isSprinting() {
        return this._isSprinting;
    }

    /**
     * 走り状態を設定
     * @param {boolean} value
     */
    setSprinting(value) {
        this._isSprinting = value;
    }

    /**
     * スニーク状態を取得
     * @returns {boolean}
     */
    isSneaking() {
        return this._isSneaking;
    }

    /**
     * スニーク状態を設定
     * @param {boolean} value
     */
    setSneaking(value) {
        this._isSneaking = value;
    }

    // ========================================
    // 速度関連
    // ========================================

    /**
     * 速度ベクトルを取得
     * @returns {{x: number, y: number, z: number}}
     */
    getVelocity() {
        return { ...this._velocity };
    }

    /**
     * 速度を設定
     * @param {number} vx
     * @param {number} vy
     * @param {number} vz
     */
    setVelocity(vx, vy, vz) {
        this._velocity.x = vx;
        this._velocity.y = vy;
        this._velocity.z = vz;
    }

    /**
     * 速度を加算
     * @param {number} vx
     * @param {number} vy
     * @param {number} vz
     */
    addVelocity(vx, vy, vz) {
        this._velocity.x += vx;
        this._velocity.y += vy;
        this._velocity.z += vz;
    }

    // ========================================
    // AABB（当たり判定ボックス）
    // ========================================

    /**
     * AABBを取得
     * @returns {{minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number}}
     */
    getAABB() {
        const halfWidth = Player.WIDTH / 2;
        const height = this._isSneaking ? Player.HEIGHT_SNEAK : Player.HEIGHT_NORMAL;

        return {
            minX: this._position.x - halfWidth,
            minY: this._position.y,
            minZ: this._position.z - halfWidth,
            maxX: this._position.x + halfWidth,
            maxY: this._position.y + height,
            maxZ: this._position.z + halfWidth
        };
    }

    /**
     * 現在の高さを取得（スニーク状態を考慮）
     * @returns {number}
     */
    getHeight() {
        return this._isSneaking ? Player.HEIGHT_SNEAK : Player.HEIGHT_NORMAL;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.Player = Player;
}
