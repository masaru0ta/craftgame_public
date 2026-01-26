/**
 * 2-1 1チャンク生成・表示テスト - メイン処理
 */

class GameApp {
    constructor() {
        // Three.js関連
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.worldContainer = null;

        // ゲーム関連
        this.textureLoader = null;
        this.meshBuilder = null;
        this.chunks = new Map();      // チャンクデータ
        this.meshes = new Map();      // チャンクメッシュ

        // 設定
        this.settings = {
            culling: true,
            wireframe: false,
            greedy: false,
            chunkCount: 1  // 1 or 3
        };

        // FPS計算用
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;

        // 三角形数のキャッシュ
        this.triangleCount = 0;

        // 軸ヘルパー用キャッシュ（毎フレームのオブジェクト生成を削減）
        this._axisHelperCache = null;
    }

    /**
     * 初期化
     */
    async init() {
        this._showLoading(true);

        // Three.js初期化
        this._initThreeJS();

        // テクスチャ読み込み
        this.textureLoader = new TextureLoader();
        await this.textureLoader.loadAll();

        // メッシュビルダー初期化
        this.meshBuilder = new ChunkMeshBuilder(this.textureLoader);

        // チャンク生成
        this._generateChunks();

        // メッシュ生成
        this._rebuildMeshes();

        // UI初期化
        this._initUI();

        // ローディング非表示
        this._showLoading(false);

        // アニメーションループ開始
        this._animate();
    }

    /**
     * Three.js初期化
     */
    _initThreeJS() {
        const canvas = document.getElementById('game-canvas');

        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // 空色

        // 左手座標系用コンテナ（Z軸反転）
        this.worldContainer = new THREE.Group();
        this.worldContainer.scale.z = -1;
        this.scene.add(this.worldContainer);

        // カメラ
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // 南側（Three.jsではZ+方向）からチャンクを見下ろす
        this.camera.position.set(8, 80, 40);

        // レンダラー
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(8, 32, -8); // チャンク中心（Three.js座標）
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.update();

        // 照明
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);

        // リサイズ対応
        window.addEventListener('resize', () => this._onResize());
    }

    /**
     * チャンク生成
     */
    _generateChunks() {
        this.chunks.clear();

        const generator = new WorldGenerator();
        const count = this.settings.chunkCount;
        const offset = count === 3 ? -1 : 0;

        for (let cz = 0; cz < count; cz++) {
            for (let cx = 0; cx < count; cx++) {
                const chunkX = cx + offset;
                const chunkZ = cz + offset;
                const chunk = new ChunkData(chunkX, chunkZ);
                generator.generateTest(chunk);
                this.chunks.set(`${chunkX},${chunkZ}`, chunk);
            }
        }
    }

    /**
     * メッシュ再生成
     */
    _rebuildMeshes() {
        // 既存メッシュを削除
        for (const mesh of this.meshes.values()) {
            this.worldContainer.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        this.meshes.clear();

        const mode = this.settings.culling ? 'CULLED' : 'FULL';

        // 三角形数カウント用
        this.triangleCount = 0;

        // 各チャンクのメッシュを生成
        for (const [key, chunk] of this.chunks) {
            const mesh = this.meshBuilder.build(
                chunk,
                mode,
                this.settings.greedy,
                this.chunks
            );

            // チャンク座標に応じたワールド座標にメッシュを配置
            mesh.position.x = chunk.chunkX * ChunkData.SIZE_X;
            mesh.position.z = chunk.chunkZ * ChunkData.SIZE_Z;

            // ワイヤーフレーム設定
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.wireframe = this.settings.wireframe);
                } else {
                    mesh.material.wireframe = this.settings.wireframe;
                }
            }

            this.meshes.set(key, mesh);
            this.worldContainer.add(mesh);

            // 三角形数を加算
            if (mesh.geometry && mesh.geometry.index) {
                this.triangleCount += mesh.geometry.index.count / 3;
            }
        }

        // UI更新
        this._updateStats();
    }

    /**
     * UI初期化
     */
    _initUI() {
        // カリングボタン
        const btnCulling = document.getElementById('btn-culling');
        btnCulling.addEventListener('click', () => {
            this.settings.culling = !this.settings.culling;
            btnCulling.textContent = `Culling: ${this.settings.culling ? 'ON' : 'OFF'}`;
            btnCulling.classList.toggle('active', this.settings.culling);
            this._rebuildMeshes();
        });

        // ワイヤーフレームボタン
        const btnWireframe = document.getElementById('btn-wireframe');
        btnWireframe.addEventListener('click', () => {
            this.settings.wireframe = !this.settings.wireframe;
            btnWireframe.textContent = `Wireframe: ${this.settings.wireframe ? 'ON' : 'OFF'}`;
            btnWireframe.classList.toggle('active', this.settings.wireframe);
            this._updateWireframe();
        });

        // グリーディーボタン
        const btnGreedy = document.getElementById('btn-greedy');
        btnGreedy.addEventListener('click', () => {
            this.settings.greedy = !this.settings.greedy;
            btnGreedy.textContent = `Greedy: ${this.settings.greedy ? 'ON' : 'OFF'}`;
            btnGreedy.classList.toggle('active', this.settings.greedy);
            this._rebuildMeshes();
        });

        // チャンク数ボタン
        const btnChunkCount = document.getElementById('btn-chunk-count');
        btnChunkCount.addEventListener('click', () => {
            this.settings.chunkCount = this.settings.chunkCount === 1 ? 3 : 1;
            btnChunkCount.textContent = `Chunks: ${this.settings.chunkCount}x${this.settings.chunkCount}`;
            btnChunkCount.classList.toggle('active', this.settings.chunkCount === 3);
            this._generateChunks();
            this._rebuildMeshes();
            this._updateCameraTarget();
        });
    }

    /**
     * ワイヤーフレーム更新（メッシュ再生成なし）
     */
    _updateWireframe() {
        for (const mesh of this.meshes.values()) {
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.wireframe = this.settings.wireframe);
                } else {
                    mesh.material.wireframe = this.settings.wireframe;
                }
            }
        }
    }

    /**
     * カメラターゲット更新
     */
    _updateCameraTarget() {
        if (this.settings.chunkCount === 3) {
            this.controls.target.set(8, 32, -8);
        } else {
            this.controls.target.set(8, 32, -8);
        }
    }

    /**
     * 統計情報更新
     */
    _updateStats() {
        document.getElementById('debug-triangles').textContent = this.triangleCount.toLocaleString();
        document.getElementById('debug-drawcalls').textContent = this.renderer.info.render.calls;
        document.getElementById('debug-memory').textContent =
            `${this.renderer.info.memory.geometries} / ${this.renderer.info.memory.textures}`;
    }

    /**
     * ローディング表示
     */
    _showLoading(show) {
        const el = document.getElementById('loading-indicator');
        el.classList.toggle('hidden', !show);
    }

    /**
     * リサイズ処理
     */
    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * アニメーションループ
     */
    _animate() {
        requestAnimationFrame(() => this._animate());

        // FPS計算
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
            document.getElementById('debug-fps').textContent = this.fps;
        }

        // カメラ座標更新（左手座標系で表示）
        const cam = this.camera.position;
        document.getElementById('debug-camera').textContent =
            `X:${cam.x.toFixed(1)} Y:${cam.y.toFixed(1)} Z:${(-cam.z).toFixed(1)}`;

        // 軸ヘルパー更新
        this._updateAxisHelper();

        // コントロール更新
        this.controls.update();

        // レンダリング
        this.renderer.render(this.scene, this.camera);

        // 統計更新
        document.getElementById('debug-drawcalls').textContent = this.renderer.info.render.calls;
    }

    /**
     * 軸ヘルパー更新
     */
    _updateAxisHelper() {
        // キャッシュの初期化（初回のみ）
        if (!this._axisHelperCache) {
            this._axisHelperCache = {
                canvas: document.getElementById('axis-canvas'),
                size: 100,
                center: 50,
                length: 35,
                axes: [
                    { base: new THREE.Vector3(1, 0, 0), dir: new THREE.Vector3(), color: '#ff0000', label: 'X+' },
                    { base: new THREE.Vector3(0, 1, 0), dir: new THREE.Vector3(), color: '#00ff00', label: 'Y+' },
                    { base: new THREE.Vector3(0, 0, -1), dir: new THREE.Vector3(), color: '#0088ff', label: 'Z+' }
                ]
            };
        }

        const cache = this._axisHelperCache;
        const ctx = cache.canvas.getContext('2d');
        const { size, center, length, axes } = cache;

        ctx.clearRect(0, 0, size, size);

        // カメラの回転を取得
        const quaternion = this.camera.quaternion;

        // 各軸を描画
        for (const axis of axes) {
            // 既存のベクトルを再利用
            axis.dir.copy(axis.base).applyQuaternion(quaternion);

            const endX = center + axis.dir.x * length;
            const endY = center - axis.dir.y * length;

            ctx.beginPath();
            ctx.moveTo(center, center);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = axis.color;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = axis.color;
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(axis.label, endX + 2, endY + 3);
        }
    }

    // ========================================
    // テスト用API
    // ========================================

    /**
     * 背景色を取得
     * @returns {string} 16進カラー
     */
    getBgColor() {
        return '#' + this.scene.background.getHexString();
    }

    /**
     * メッシュが存在するか
     * @returns {boolean}
     */
    hasMesh() {
        return this.meshes.size > 0;
    }

    /**
     * worldContainerのscale.zを取得
     * @returns {number}
     */
    getWorldContainerScaleZ() {
        return this.worldContainer.scale.z;
    }
}

// グローバルインスタンス
let gameApp = null;

// 初期化
window.addEventListener('DOMContentLoaded', async () => {
    gameApp = new GameApp();
    await gameApp.init();
    window.gameApp = gameApp;
});
