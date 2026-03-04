/**
 * 雨粒パーティクルシステム（仕様書 2-20）
 * - カスタムシェーダーによる縦長ストリーク（WebGL の lineWidth 制限を回避）
 * - 初回表示時に高さをランダム散布（帯状出現の防止）
 * - ブロック着弾検出 + スプラッシュエフェクト
 */
class RainParticleSystem {
    /** 同時表示する雨粒数 */
    static DropCount = 2000;
    /** カメラ中心の生成半径（XZ） */
    static SpawnRadius = 40;
    /** 生成Y オフセット（カメラY + この値） */
    static SpawnHeightOffset = 20;
    /** 消滅Y オフセット（カメラY + この値） */
    static DespawnHeightOffset = -5;
    /** 落下速度（Three.js 単位/秒） */
    static FallSpeed = 30;
    /** シェーダーが描画するストリークの基準サイズ */
    static StreakSize = 2.0;
    /** 着弾判定に使うストリーク長さ（Three.js 単位） */
    static StreakLength = 0.6;

    /** 着弾時のスプラッシュ粒子数 */
    static SplashPerImpact = 6;
    /** スプラッシュプールサイズ */
    static SplashPoolSize = 400;
    /** スプラッシュ寿命（秒） */
    static SplashLifetime = 0.35;
    /** スプラッシュ水平速度 */
    static SplashSpeedH = 2.5;
    /** スプラッシュ初期上昇速度 */
    static SplashSpeedV = 3.0;

    /** @param {THREE.Scene} scene */
    constructor(scene) {
        this._scene = scene;

        /**
         * ブロック衝突判定用 chunkManager（外部から設定）
         * @type {Object|null}
         */
        this.chunkManager = null;

        this._firstUpdate = true;

        // 雨粒中心座標（ x, y, z ）
        this._dropPos = new Float32Array(RainParticleSystem.DropCount * 3);
        // 各雨粒の消滅Y（ブロック天井面 または DespawnY）
        this._deathY  = new Float32Array(RainParticleSystem.DropCount).fill(-1e9);
        this._points  = null;

        // スプラッシュ粒子
        this._splashPos  = new Float32Array(RainParticleSystem.SplashPoolSize * 3).fill(-1e9);
        this._splashVel  = new Float32Array(RainParticleSystem.SplashPoolSize * 3);
        this._splashLife = new Float32Array(RainParticleSystem.SplashPoolSize);
        this._splashHead = 0;
        this._splashPts  = null;

        this._build();
    }

    /** 雨粒が表示中かどうか @returns {boolean} */
    get Visible() { return this._points ? this._points.visible : false; }

    /**
     * 表示・非表示を切り替える
     * @param {boolean} visible
     */
    SetVisible(visible) {
        if (this._points)    this._points.visible = visible;
        if (this._splashPts) this._splashPts.visible = visible;
        if (!visible) this._firstUpdate = true; // 次の表示時に再スキャッター
    }

    /**
     * 毎フレーム呼び出す
     * @param {number} deltaTime
     * @param {{x:number,y:number,z:number}} cameraPos - Three.js カメラ座標
     */
    Update(deltaTime, cameraPos) {
        if (!this._points || !this._points.visible) return;
        if (this._firstUpdate) {
            this._firstUpdate = false;
            this._scatter(cameraPos);
        }
        this._updateDrops(deltaTime, cameraPos);
        this._updateSplashes(deltaTime);
    }

    // ----- private -----

    _build() {
        // 縦長ストリーク用カスタムシェーダー
        // gl_PointCoord を使い x 方向を大きく切り取ることで縦長に見せる
        const vertShader = `
            uniform float uSize;
            void main() {
                vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = uSize * (200.0 / -mvPos.z);
                gl_Position = projectionMatrix * mvPos;
            }
        `;
        const fragShader = `
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                // 幅10% のみ描画して縦長ストリークに見せる
                if (abs(c.x) > 0.1) discard;
                float alpha = max(0.0, 1.0 - abs(c.y) * 1.8) * 0.75;
                if (alpha <= 0.0) discard;
                gl_FragColor = vec4(0.67, 0.80, 1.0, alpha);
            }
        `;

        const dropGeom = new THREE.BufferGeometry();
        dropGeom.setAttribute('position', new THREE.BufferAttribute(this._dropPos, 3));
        this._points = new THREE.Points(dropGeom, new THREE.ShaderMaterial({
            uniforms: { uSize: { value: RainParticleSystem.StreakSize } },
            vertexShader: vertShader,
            fragmentShader: fragShader,
            transparent: true,
            depthWrite: false,
        }));
        this._points.visible = false;
        this._points.frustumCulled = false;
        this._scene.add(this._points);

        // スプラッシュ粒子（通常の PointsMaterial）
        const splashGeom = new THREE.BufferGeometry();
        splashGeom.setAttribute('position', new THREE.BufferAttribute(this._splashPos, 3));
        this._splashPts = new THREE.Points(splashGeom, new THREE.PointsMaterial({
            color: 0xaaccff,
            size: 0.1,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
        }));
        this._splashPts.visible = false;
        this._splashPts.frustumCulled = false;
        this._scene.add(this._splashPts);
    }

    /** 全雨粒を高さをばらけさせてカメラ周辺に散布する（初回表示時のみ） */
    _scatter(cam) {
        const { DropCount: n, SpawnRadius: r,
                SpawnHeightOffset: top, DespawnHeightOffset: bot } = RainParticleSystem;
        const topY = cam.y + top, botY = cam.y + bot;
        const rangeY = topY - botY;
        const pos = this._dropPos;
        for (let i = 0; i < n; i++) {
            const x = cam.x + (Math.random() - 0.5) * r * 2;
            const z = cam.z + (Math.random() - 0.5) * r * 2;
            pos[i * 3] = x; pos[i * 3 + 1] = botY + Math.random() * rangeY; pos[i * 3 + 2] = z;
            this._deathY[i] = this._columnDeathY(x, z, topY, botY);
        }
        this._points.geometry.attributes.position.needsUpdate = true;
    }

    _updateDrops(dt, cam) {
        const { DropCount: n, SpawnRadius: r, FallSpeed,
                SpawnHeightOffset: top, DespawnHeightOffset: bot,
                StreakLength } = RainParticleSystem;
        const fall = FallSpeed * dt;
        const topY = cam.y + top, botY = cam.y + bot;
        const pos = this._dropPos, dy = this._deathY;

        for (let i = 0; i < n; i++) {
            pos[i * 3 + 1] -= fall;
            if (pos[i * 3 + 1] < dy[i] + StreakLength) {
                if (dy[i] > botY + 0.5) this._splash(pos[i * 3], dy[i], pos[i * 3 + 2]);
                const x = cam.x + (Math.random() - 0.5) * r * 2;
                const z = cam.z + (Math.random() - 0.5) * r * 2;
                pos[i * 3] = x; pos[i * 3 + 1] = topY; pos[i * 3 + 2] = z;
                dy[i] = this._columnDeathY(x, z, topY, botY);
            }
        }
        this._points.geometry.attributes.position.needsUpdate = true;
    }

    _updateSplashes(dt) {
        const pos = this._splashPos, vel = this._splashVel, life = this._splashLife;
        const n = RainParticleSystem.SplashPoolSize;
        for (let i = 0; i < n; i++) {
            if (life[i] <= 0) continue;
            life[i] -= dt;
            if (life[i] <= 0) { pos[i * 3 + 1] = -1e9; continue; }
            pos[i * 3    ] += vel[i * 3    ] * dt;
            pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
            pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
            vel[i * 3 + 1] -= 9.8 * dt; // 重力
        }
        this._splashPts.geometry.attributes.position.needsUpdate = true;
    }

    _splash(x, y, z) {
        const { SplashPerImpact: per, SplashPoolSize: total,
                SplashLifetime, SplashSpeedH, SplashSpeedV } = RainParticleSystem;
        const pos = this._splashPos, vel = this._splashVel, life = this._splashLife;
        for (let j = 0; j < per; j++) {
            const i = (this._splashHead + j) % total;
            const angle = Math.random() * Math.PI * 2;
            const spd   = Math.random() * SplashSpeedH;
            pos[i * 3    ] = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = z;
            vel[i * 3    ] = Math.cos(angle) * spd;
            vel[i * 3 + 1] = SplashSpeedV * (0.5 + Math.random() * 0.5);
            vel[i * 3 + 2] = Math.sin(angle) * spd;
            life[i] = SplashLifetime * (0.6 + Math.random() * 0.4);
        }
        this._splashHead = (this._splashHead + per) % total;
    }

    /**
     * 列スキャンで最高固体ブロック面Yを返す
     * @param {number} tx - Three.js X（≒ ワールドX）
     * @param {number} tz - Three.js Z（ワールドZ = -tz）
     */
    _columnDeathY(tx, tz, topY, botY) {
        if (!this.chunkManager) return botY;
        const wx = Math.floor(tx), wz = Math.floor(-tz);
        // チャンクをループ外でキャッシュして map ルックアップを1回に削減
        const ch = this.chunkManager.chunks.get(`${wx >> 4},${wz >> 4}`);
        if (!ch?.chunkData) return botY;
        const cd = ch.chunkData;
        const lx = wx & 15, lz = wz & 15;
        for (let y = Math.floor(topY); y >= Math.floor(botY); y--) {
            const ly = y - cd.baseY;
            if (ly < 0 || ly >= 128) continue;
            const b = cd.getBlock(lx, ly, lz);
            if (b !== null && b !== 'air') return y + 1;
        }
        return botY;
    }

    _block(wx, wy, wz) {
        const cm = this.chunkManager;
        const ch = cm.chunks.get(`${wx >> 4},${wz >> 4}`);
        if (!ch?.chunkData) return null;
        const ly = wy - ch.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return ch.chunkData.getBlock(wx & 15, ly, wz & 15);
    }
}
