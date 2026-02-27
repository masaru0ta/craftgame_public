/**
 * 2-11 キャラクター表示テスト - メイン処理
 * 1人称/3人称視点切り替えとキャラクター表示のテスト
 */

class CharacterViewTestApp {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.worldContainer = null;

        // ゲームオブジェクト
        this.player = null;
        this.playerController = null;
        this.physicsWorld = null;
        this.firstPersonCamera = null;

        // 2-11 追加
        this.thirdPersonCamera = null;
        this.characterRenderer = null;
        this.viewpointManager = null;
        this.characterData = null;
        this.blockInteraction = null;

        // データローダー
        this.textureLoader = null;
        this.chunkManager = null;

        // 設定
        this.wireframeEnabled = false;

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.deltaTime = 0;
        this._lastFpsTime = performance.now();

        // 初期化完了フラグ
        this.isReady = false;
    }

    async init() {
        // Three.js 初期化
        this._initThreeJS();

        // テクスチャ読み込み
        this.textureLoader = new TextureLoader();
        await this.textureLoader.loadAll();

        // ブロック色情報を収集
        const blockColors = {};
        const blockShapes = {};
        const faceNames = ['top', 'bottom', 'front', 'back', 'left', 'right'];

        if (this.textureLoader.blocks) {
            for (const block of this.textureLoader.blocks) {
                const faceColors = {};
                const defaultTexName = block.tex_default || block.block_str_id;
                const defaultTexData = this.textureLoader.textures.find(t => t.file_name === defaultTexName);
                const defaultColor = (defaultTexData && defaultTexData.color_hex) || '#808080';

                for (const faceName of faceNames) {
                    const faceTexName = block[`tex_${faceName}`];
                    if (faceTexName) {
                        const faceTexData = this.textureLoader.textures.find(t => t.file_name === faceTexName);
                        faceColors[faceName] = (faceTexData && faceTexData.color_hex) || defaultColor;
                    } else {
                        faceColors[faceName] = defaultColor;
                    }
                }
                blockColors[block.block_str_id] = faceColors;
                blockShapes[block.block_str_id] = block.shape_type || 'normal';
            }
        }

        // チャンクマネージャー初期化
        const totalRange = parseInt(document.getElementById('input-total-range').value) || 15;
        this.chunkManager = new ChunkManager({
            chunkRange: totalRange,
            worldName: 'world1'
        });
        await this.chunkManager.init(this.textureLoader, this.worldContainer);
        this.chunkManager.setBlockInfo(blockColors, blockShapes);

        // LoD0範囲を設定
        const lod0Range = parseInt(document.getElementById('input-lod0-range').value) || 3;
        this.chunkManager.setLoD0Range(lod0Range);

        // プレイヤー初期化
        this.player = new Player(8, 65, 8);

        // 物理演算初期化
        this.physicsWorld = new PhysicsWorld(this.chunkManager, this.textureLoader);

        // プレイヤーコントローラー初期化
        const sensitivity = parseFloat(document.getElementById('input-mouse-sensitivity').value) || 0.002;
        this.playerController = new PlayerController(this.player, this.physicsWorld, {
            mouseSensitivity: sensitivity
        });

        // 1人称カメラ初期化
        this.firstPersonCamera = new FirstPersonCamera(this.camera, this.player);

        // 3人称カメラ初期化
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player);

        // キャラクターレンダラー初期化
        this.characterRenderer = new CharacterRenderer({
            worldContainer: this.worldContainer,
            player: this.player,
            THREE: THREE
        });

        // GASからdefaultキャラクターを読み込み（失敗時はダミーデータ）
        this.characterData = await this._loadCharacterFromGAS('default');
        this.characterRenderer.loadCharacterData(this.characterData);

        // 視点マネージャー初期化
        this.viewpointManager = new ViewpointManager({
            firstPersonCamera: this.firstPersonCamera,
            thirdPersonCamera: this.thirdPersonCamera,
            characterRenderer: this.characterRenderer
        });

        // Vキーコールバック設定
        this.playerController.onViewpointToggle(() => {
            this.viewpointManager.toggleMode();
        });

        // ブロック操作初期化
        if (typeof BlockInteraction !== 'undefined') {
            this.blockInteraction = new BlockInteraction(
                this.player, this.physicsWorld, this.chunkManager,
                this.chunkManager.storage, this.scene
            );
            const placeableBlocks = this.textureLoader.blocks.filter(
                b => b.block_str_id !== 'air'
            );
            const hotbarContainer = document.getElementById('hotbar-container');
            this.blockInteraction.init(placeableBlocks, hotbarContainer);
        }

        // 初期チャンク生成
        const pos = this.player.getPosition();
        await this.chunkManager.updateViewPosition(pos.x, pos.z);

        // UI初期化
        this._initUI();

        // PointerLock状態変更コールバック
        this.firstPersonCamera.onPointerLockChange((isLocked) => {
            const clickToStart = document.getElementById('click-to-start');
            const crosshair = document.getElementById('crosshair');
            if (isLocked) {
                clickToStart.style.display = 'none';
                crosshair.style.display = 'block';
            } else {
                clickToStart.style.display = 'block';
                crosshair.style.display = 'none';
            }
        });

        // ローディング非表示、クリック開始を表示
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('click-to-start').style.display = 'block';
        document.getElementById('crosshair').style.display = 'none';

        // 初期化完了
        this.isReady = true;

        // アニメーションループ開始
        this._animate();
    }

    /**
     * GASからキャラクターデータを読み込み
     * @param {string} characterStrId - キャラクターの文字列ID
     * @returns {Promise<CharacterData>}
     */
    async _loadCharacterFromGAS(characterStrId) {
        try {
            const GAS_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';
            const api = new GasApi(GAS_URL);
            const characters = await api.getCharacters();
            const found = characters.find(c => c.character_str_id === characterStrId);
            if (found) {
                console.log(`[CharacterView] GASからキャラクター "${characterStrId}" を読み込みました`);
                return CharacterData.fromJSON(found);
            }
            console.warn(`[CharacterView] キャラクター "${characterStrId}" がGASに見つかりません。ダミーデータを使用`);
        } catch (e) {
            console.warn(`[CharacterView] GAS読み込み失敗: ${e.message}。ダミーデータを使用`);
        }
        return this._createDummyCharacterData();
    }

    /**
     * ダミーキャラクターデータを生成
     */
    _createDummyCharacterData() {
        const data = new CharacterData();
        const SKIN = 0xFFCD94;
        const BLUE = 0x3498DB;
        const DARK = 0x2C3E50;
        const EYE = 0x333333;
        const MOUTH = 0xCC6644;

        // 頭: スキンカラーで全面塗装
        this._fillAllFaces(data, 'head', SKIN);
        // 前面(NZ=5)に目と口を描画
        const headFrontSize = data.getFaceSize('head', 5);
        // 目: row=2, col=1とcol=4
        data.setCell('head', 5, 2, 1, EYE);
        data.setCell('head', 5, 2, 2, EYE);
        data.setCell('head', 5, 2, 5, EYE);
        data.setCell('head', 5, 2, 6, EYE);
        // 口: row=5, col=2〜5
        for (let c = 2; c <= 5; c++) {
            data.setCell('head', 5, 5, c, MOUTH);
        }

        // 胴体: 青色で全面塗装
        this._fillAllFaces(data, 'body', BLUE);

        // 両腕: スキンカラー
        this._fillAllFaces(data, 'arm_r', SKIN);
        this._fillAllFaces(data, 'arm_l', SKIN);

        // 両脚: 紺色
        this._fillAllFaces(data, 'leg_r', DARK);
        this._fillAllFaces(data, 'leg_l', DARK);

        return data;
    }

    /**
     * パーツの全面を指定色で塗る
     */
    _fillAllFaces(data, partId, color) {
        for (let faceId = 0; faceId < 6; faceId++) {
            const size = data.getFaceSize(partId, faceId);
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    data.setCell(partId, faceId, row, col, color);
                }
            }
        }
    }

    _initThreeJS() {
        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        // カメラ
        this.camera = new THREE.PerspectiveCamera(
            FirstPersonCamera.FOV,
            window.innerWidth / window.innerHeight,
            FirstPersonCamera.NEAR,
            FirstPersonCamera.FAR
        );

        // レンダラー
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // ワールドコンテナ（左手座標系対応）
        this.worldContainer = new THREE.Group();
        this.worldContainer.scale.z = -1;
        this.scene.add(this.worldContainer);

        // 照明
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    _initUI() {
        // キャンバスクリックでPointerLock開始
        this.canvas.addEventListener('click', () => {
            if (!this.playerController.isPointerLocked()) {
                this.playerController.requestPointerLock(this.canvas);
                this.firstPersonCamera.requestPointerLock(this.canvas);
            }
        });

        // クリックして開始表示のクリックイベント
        document.getElementById('click-to-start').addEventListener('click', () => {
            this.playerController.requestPointerLock(this.canvas);
            this.firstPersonCamera.requestPointerLock(this.canvas);
        });

        // 右クリックメニュー抑止
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // ブロック操作のマウスイベント
        if (this.blockInteraction) {
            this.canvas.addEventListener('mousedown', (e) => {
                if (this.playerController.isPointerLocked()) {
                    this.blockInteraction.handleMouseDown(e);
                }
            });
            this.canvas.addEventListener('wheel', (e) => {
                this.blockInteraction.handleWheel(e);
            });
        }

        // リセットボタン
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.player.setPosition(8, 65, 8);
            this.player.setYaw(0);
            this.player.setPitch(0);
            this.player.setVelocity(0, 0, 0);
            this.player.setFlying(false);
            this.player.setSneaking(false);
            this.player.setSprinting(false);
            this._updateFlyButton();
        });

        // 飛行モードボタン
        document.getElementById('btn-fly-toggle').addEventListener('click', () => {
            this.player.toggleFlying();
            this._updateFlyButton();
        });

        // ワイヤーフレームボタン
        const wireframeBtn = document.getElementById('btn-wireframe');
        wireframeBtn.addEventListener('click', () => {
            this.wireframeEnabled = !this.wireframeEnabled;
            wireframeBtn.classList.toggle('active', this.wireframeEnabled);
            this.chunkManager.setWireframe(this.wireframeEnabled);
        });

        // 視点切替ボタン
        document.getElementById('btn-toggle-viewpoint').addEventListener('click', () => {
            this.viewpointManager.toggleMode();
        });

        // カメラ距離±ボタン
        document.getElementById('btn-camera-distance-up').addEventListener('click', () => {
            this.thirdPersonCamera.setDistance(this.thirdPersonCamera.getDistance() + 1.0);
        });
        document.getElementById('btn-camera-distance-down').addEventListener('click', () => {
            this.thirdPersonCamera.setDistance(this.thirdPersonCamera.getDistance() - 1.0);
        });

        // LoD範囲入力
        document.getElementById('input-lod0-range').addEventListener('change', async (e) => {
            const lod0 = parseInt(e.target.value) || 3;
            this.chunkManager.setLoD0Range(lod0);
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });

        document.getElementById('input-total-range').addEventListener('change', async (e) => {
            const total = parseInt(e.target.value) || 15;
            this.chunkManager.setChunkRange(total);
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });

        // マウス感度入力
        document.getElementById('input-mouse-sensitivity').addEventListener('change', (e) => {
            const sensitivity = parseFloat(e.target.value) || 0.002;
            this.playerController.setMouseSensitivity(sensitivity);
        });

        // ワールド選択
        document.getElementById('select-world').addEventListener('change', async (e) => {
            const worldType = e.target.value;
            this.chunkManager.worldGenerator.setWorldType(worldType);
            await this.chunkManager.clearAllChunks();
            await this.chunkManager.clearStorage();
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });

        // オートジャンプ設定
        const autoJumpCheckbox = document.getElementById('checkbox-auto-jump');
        if (autoJumpCheckbox) {
            autoJumpCheckbox.addEventListener('change', (e) => {
                this.playerController.autoJumpEnabled = e.target.checked;
            });
        }
    }

    _updateFlyButton() {
        const flyBtn = document.getElementById('btn-fly-toggle');
        flyBtn.textContent = `飛行モード: ${this.player.isFlying() ? 'ON' : 'OFF'}`;
        flyBtn.classList.toggle('active', this.player.isFlying());
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const now = performance.now();
        this.deltaTime = (now - this.lastTime) / 1000;
        if (this.deltaTime > 0.1) this.deltaTime = 0.1;

        // FPS計測
        this.frameCount++;
        const fpsElapsed = now - this._lastFpsTime;
        if (fpsElapsed >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / fpsElapsed);
            this.frameCount = 0;
            this._lastFpsTime = now;
        }

        this.lastTime = now;

        if (!this.isReady) return;

        // プレイヤー更新
        this.playerController.update(this.deltaTime);

        // 視点マネージャー更新（カメラ + キャラクターレンダラー）
        this.viewpointManager.update(this.deltaTime);

        // ブロック操作更新（レイキャスト・ハイライト）
        if (this.blockInteraction) {
            if (this.viewpointManager.getMode() === ViewpointManager.MODE_THIRD_PERSON) {
                // 3人称: カメラ位置・方向でレイキャスト（クロスヘアと一致させる）
                const cam = this.camera;
                const camDir = new THREE.Vector3();
                cam.getWorldDirection(camDir);
                // Scene座標→ゲーム座標（Z反転）
                const origin = { x: cam.position.x, y: cam.position.y, z: -cam.position.z };
                const direction = { x: camDir.x, y: camDir.y, z: -camDir.z };
                this.blockInteraction.currentTarget = this.physicsWorld.raycast(
                    origin, direction, BlockInteraction.MAX_REACH
                );
                this.blockInteraction.highlight.update(this.blockInteraction.currentTarget);
            } else {
                this.blockInteraction.update();
            }
        }

        // 飛行ボタンの状態更新
        this._updateFlyButton();

        // チャンク更新
        const pos = this.player.getPosition();
        this.chunkManager.updateViewPosition(pos.x, pos.z);

        // キュー処理
        this.chunkManager._processQueuesWithPriority();

        // 描画
        this.renderer.render(this.scene, this.camera);

        // 統計更新
        this._updateStats();
    }

    _updateStats() {
        // FPS
        document.getElementById('debug-fps').textContent = this.fps;

        // プレイヤー座標
        const pos = this.player.getPosition();
        document.getElementById('debug-player-pos').textContent =
            `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;

        // チャンク座標
        const chunkX = Math.floor(pos.x / 16);
        const chunkZ = Math.floor(pos.z / 16);
        document.getElementById('debug-chunk-pos').textContent = `(${chunkX}, ${chunkZ})`;

        // 向き
        const yaw = (this.player.getYaw() * 180 / Math.PI).toFixed(0);
        const pitch = (this.player.getPitch() * 180 / Math.PI).toFixed(0);
        document.getElementById('debug-player-dir').textContent = `Yaw: ${yaw}°, Pitch: ${pitch}°`;

        // 速度
        const vel = this.player.getVelocity();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        document.getElementById('debug-player-speed').textContent = speed.toFixed(2);

        // 状態
        let state = '地上';
        if (this.player.isFlying()) {
            state = '飛行中';
        } else if (!this.player.isOnGround()) {
            state = '空中';
        }
        document.getElementById('debug-player-state').textContent = state;

        // 接地判定
        document.getElementById('debug-on-ground').textContent = this.player.isOnGround();

        // 視点情報
        const mode = this.viewpointManager.getMode();
        document.getElementById('debug-viewpoint-mode').textContent =
            mode === ViewpointManager.MODE_FIRST_PERSON ? '1人称' : '3人称';
        document.getElementById('debug-camera-distance').textContent =
            this.thirdPersonCamera.getDistance().toFixed(1);
        document.getElementById('debug-camera-elevation').textContent =
            this.thirdPersonCamera.getElevation().toFixed(2);
        document.getElementById('debug-character-visible').textContent =
            this.characterRenderer.isVisible() ? '表示' : '非表示';

        // アニメ状態
        const animState = this.characterRenderer.getAnimatorState();
        document.getElementById('debug-anim-state').textContent =
            animState.isPlaying ? animState.currentAnimation : '停止';

        // ポリゴン数（1秒ごとに更新）
        if (!this._lastTriangleUpdate || performance.now() - this._lastTriangleUpdate > 1000) {
            this._lastTriangleUpdate = performance.now();
            let totalTriangles = 0;
            this.worldContainer.traverse((child) => {
                if (child.geometry && child.geometry.index) {
                    totalTriangles += child.geometry.index.count / 3;
                }
            });
            document.getElementById('debug-triangles').textContent = totalTriangles.toLocaleString();

            const counts = this.chunkManager.getLoDCounts();
            document.getElementById('debug-lod-counts').innerHTML = `
                <div class="lod-count-item"><span style="color:#00FF00">LoD0:</span> <span>${counts.lod0}</span></div>
                <div class="lod-count-item"><span style="color:#FFFF00">LoD1:</span> <span>${counts.lod1}</span></div>
            `;
        }
    }
}

// グローバルに公開
window.CharacterViewTestApp = CharacterViewTestApp;

// 初期化
window.testApp = new CharacterViewTestApp();
window.testApp.init().catch(console.error);
