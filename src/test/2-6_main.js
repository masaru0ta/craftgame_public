/**
 * 2-6 リアル地形マップテスト - メイン処理
 * delta4_lc4形式PNGからリアル地形を生成して表示
 */

/** 被覆クラス名テーブル */
const LC_NAMES = [
    '海/不明', '樹木', '低木', '草地', '農地', '市街地',
    '裸地', '雪氷', '水域', '湿地', 'マングローブ', '蘚苔'
];

class RealMapTestApp {
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
        this.blockInteraction = null;

        // データローダー
        this.textureLoader = null;
        this.chunkManager = null;
        this.realMapLoader = null;

        // 設定
        this.wireframeEnabled = false;
        this.lightingEnabled = true;

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.deltaTime = 0;

        // FPS履歴（パフォーマンステスト用）
        this.fpsHistory = [];
        this._lastFpsRecordTime = performance.now();
        this._lastFpsTime = performance.now();

        // PNG読み込み時間（パフォーマンステスト用）
        this.realMapLoadTime = undefined;

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
        const lightTransparentIds = [];
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
                if (block.is_transparent) {
                    lightTransparentIds.push(block.block_str_id);
                }
            }
        }

        // waterブロックの色を登録（ブロック定義に無い場合）
        if (!blockColors['water']) {
            blockColors['water'] = {
                top: '#2196F3', bottom: '#1565C0',
                front: '#1E88E5', back: '#1E88E5',
                left: '#1E88E5', right: '#1E88E5'
            };
        }

        // RealMapLoader でPNG読み込み
        this.realMapLoader = new RealMapLoader();
        const loadStart = performance.now();
        await this.realMapLoader.load('../../assets/map/numazu_data_2000x2000.png');
        this.realMapLoadTime = performance.now() - loadStart;

        // チャンクマネージャー初期化
        const totalRange = parseInt(document.getElementById('input-total-range').value) || 30;
        this._updateFog(totalRange);
        this.chunkManager = new ChunkManager({
            chunkRange: totalRange,
            worldName: 'realmap1'
        });
        await this.chunkManager.init(this.textureLoader, this.worldContainer);
        this.chunkManager.setBlockInfo(blockColors, blockShapes, lightTransparentIds);
        this.chunkManager.setGreedy(true);

        // LoD0範囲を設定
        const lod0Range = parseInt(document.getElementById('input-lod0-range').value) || 4;
        this.chunkManager.setLoD0Range(lod0Range);

        // WorldGeneratorをrealmapモードに設定
        this.chunkManager.worldGenerator.realMapLoader = this.realMapLoader;
        this.chunkManager.worldGenerator.setWorldType('realmap');

        // 木構造物をWorldGeneratorにセット
        const treeStructure = this.textureLoader.structures.find(s => s.structure_str_id === 'tree');
        if (treeStructure) {
            this.chunkManager.worldGenerator.setTreeStructure(treeStructure);
        }

        // プレイヤー初期位置: マップ中央の地面の上
        const spawnX = Math.floor(this.realMapLoader.mapWidth / 2);
        const spawnZ = Math.floor(this.realMapLoader.mapHeight / 2);
        const elev = this.realMapLoader.getElevation(spawnX, spawnZ);
        const spawnY = Math.max(WorldGenerator.SEA_LEVEL + elev, WorldGenerator.SEA_LEVEL) + 5;

        this.player = new Player(spawnX, spawnY, spawnZ);

        // 物理演算初期化
        this.physicsWorld = new PhysicsWorld(this.chunkManager, this.textureLoader);

        // プレイヤーコントローラー初期化
        const sensitivity = parseFloat(document.getElementById('input-mouse-sensitivity').value) || 0.002;
        this.playerController = new PlayerController(this.player, this.physicsWorld, {
            mouseSensitivity: sensitivity
        });

        // 1人称カメラ初期化
        this.firstPersonCamera = new FirstPersonCamera(this.camera, this.player);

        // ブロック操作初期化
        if (typeof BlockInteraction !== 'undefined') {
            this.blockInteraction = new BlockInteraction(
                this.player, this.physicsWorld, this.chunkManager,
                this.chunkManager.storage, this.scene
            );
            // 設置可能なブロック一覧（テクスチャロードのblock定義から取得）
            const placeableBlocks = this.textureLoader.blocks.filter(
                b => b.block_str_id !== 'air'
            );
            // 水ブロック・草丸ブロックをホットバー末尾に配置
            while (placeableBlocks.length >= 8) placeableBlocks.pop();
            placeableBlocks.push({
                block_str_id: 'grass_round',
                name: '草(丸)',
                shape_type: 'custom'
            });
            placeableBlocks.push({
                block_str_id: 'water',
                name: '水',
                shape_type: 'normal'
            });
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

        // ローディング非表示
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('click-to-start').style.display = 'block';
        document.getElementById('crosshair').style.display = 'none';

        // マップ情報を表示
        document.getElementById('debug-map-info').textContent =
            `Map: ${this.realMapLoader.mapWidth}x${this.realMapLoader.mapHeight} (numazu)`;

        // 初期化完了
        this.isReady = true;

        // アニメーションループ開始
        this._animate();
    }

    _initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this._fogInstance = new THREE.Fog(0x87ceeb, 10, 480);
        this.fogEnabled = true;
        this.scene.fog = this._fogInstance;

        // フォグをZ深度ではなくユークリッド距離で計算するようパッチ
        THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
    fogDepth = length( mvPosition.xyz );
#endif
`;

        this.camera = new THREE.PerspectiveCamera(
            FirstPersonCamera.FOV,
            window.innerWidth / window.innerHeight,
            FirstPersonCamera.NEAR,
            FirstPersonCamera.FAR
        );

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
            if (this.firstPersonCamera) {
                this.firstPersonCamera.setAspect(window.innerWidth / window.innerHeight);
            }
        });
    }

    _initUI() {
        // キャンバスクリックでPointerLock
        this.canvas.addEventListener('click', () => {
            if (!this.playerController.isPointerLocked()) {
                this.playerController.requestPointerLock(this.canvas);
                this.firstPersonCamera.requestPointerLock(this.canvas);
            }
        });
        document.getElementById('click-to-start').addEventListener('click', () => {
            this.playerController.requestPointerLock(this.canvas);
            this.firstPersonCamera.requestPointerLock(this.canvas);
        });
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
            const spawnX = Math.floor(this.realMapLoader.mapWidth / 2);
            const spawnZ = Math.floor(this.realMapLoader.mapHeight / 2);
            const elev = this.realMapLoader.getElevation(spawnX, spawnZ);
            const spawnY = Math.max(WorldGenerator.SEA_LEVEL + elev, WorldGenerator.SEA_LEVEL) + 5;
            this.player.setPosition(spawnX, spawnY, spawnZ);
            this.player.setYaw(0);
            this.player.setPitch(0);
            this.player.setVelocity(0, 0, 0);
            this.player.setFlying(false);
            this._updateFlyButton();
        });

        // 飛行モードボタン
        document.getElementById('btn-fly-toggle').addEventListener('click', () => {
            this.player.toggleFlying();
            this._updateFlyButton();
        });

        // フォグトグルボタン
        document.getElementById('btn-fog-toggle').addEventListener('click', () => {
            this.fogEnabled = !this.fogEnabled;
            const btn = document.getElementById('btn-fog-toggle');
            btn.classList.toggle('active', this.fogEnabled);
            btn.textContent = `フォグ: ${this.fogEnabled ? 'ON' : 'OFF'}`;
            this.scene.fog = this.fogEnabled ? this._fogInstance : null;
        });

        // ワイヤーフレームボタン
        document.getElementById('btn-wireframe').addEventListener('click', () => {
            this.wireframeEnabled = !this.wireframeEnabled;
            const btn = document.getElementById('btn-wireframe');
            btn.classList.toggle('active', this.wireframeEnabled);
            btn.textContent = `ワイヤーフレーム: ${this.wireframeEnabled ? 'ON' : 'OFF'}`;
            this.chunkManager.setWireframe(this.wireframeEnabled);
        });

        // ストレージクリアボタン
        document.getElementById('btn-clear-storage').addEventListener('click', async () => {
            await this.chunkManager.clearStorage();
        });

        // LoD範囲入力
        document.getElementById('input-lod0-range').addEventListener('change', async (e) => {
            const lod0 = parseInt(e.target.value) || 3;
            this.chunkManager.setLoD0Range(lod0);
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });
        document.getElementById('input-total-range').addEventListener('change', async (e) => {
            const total = parseInt(e.target.value) || 30;
            this._updateFog(total);
            this.chunkManager.setChunkRange(total);
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });

        // マウス感度入力
        document.getElementById('input-mouse-sensitivity').addEventListener('change', (e) => {
            const sensitivity = parseFloat(e.target.value) || 0.002;
            this.playerController.setMouseSensitivity(sensitivity);
        });

        // ライティングトグルボタン
        document.getElementById('btn-lighting-toggle').addEventListener('click', () => {
            this.lightingEnabled = !this.lightingEnabled;
            const btn = document.getElementById('btn-lighting-toggle');
            btn.classList.toggle('active', this.lightingEnabled);
            btn.textContent = `ライティング: ${this.lightingEnabled ? 'ON' : 'OFF'}`;

            // 全チャンクのライトマップを更新
            if (!this.lightingEnabled) {
                // OFF: 全チャンクのライトマップを15で埋める
                for (const [key, entry] of this.chunkManager.chunks) {
                    if (entry.chunkData && entry.chunkData._lightMap) {
                        entry.chunkData._lightMap.fill(15);
                    }
                }
            } else {
                // ON: 全チャンクのライトマップを再計算
                if (this.chunkManager.lightCalculator) {
                    for (const [key, entry] of this.chunkManager.chunks) {
                        if (entry.chunkData) {
                            const neighborChunks = this.chunkManager._getNeighborChunks(
                                entry.chunkData.chunkX, entry.chunkData.chunkZ
                            );
                            this.chunkManager.lightCalculator.calculate(entry.chunkData, neighborChunks);
                        }
                    }
                }
            }

            // メッシュを再構築
            this.chunkManager.rebuildAllMeshes();
        });

        // AOトグルボタン
        document.getElementById('btn-ao-toggle').addEventListener('click', () => {
            this.chunkManager.aoEnabled = !this.chunkManager.aoEnabled;
            const btn = document.getElementById('btn-ao-toggle');
            btn.classList.toggle('active', this.chunkManager.aoEnabled);
            btn.textContent = `AO: ${this.chunkManager.aoEnabled ? 'ON' : 'OFF'}`;
            this.chunkManager.rebuildAllMeshes();
        });

        // LoD1 AO トグル
        document.getElementById('btn-lod1-ao').addEventListener('click', () => {
            this.chunkManager.lod1AoEnabled = !this.chunkManager.lod1AoEnabled;
            const btn = document.getElementById('btn-lod1-ao');
            btn.classList.toggle('active', this.chunkManager.lod1AoEnabled);
            btn.textContent = `LoD1 AO: ${this.chunkManager.lod1AoEnabled ? 'ON' : 'OFF'}`;
            this.chunkManager.rebuildAllMeshes();
        });

        // LoD1 ライトマップ トグル
        document.getElementById('btn-lod1-light').addEventListener('click', () => {
            this.chunkManager.lod1LightEnabled = !this.chunkManager.lod1LightEnabled;
            const btn = document.getElementById('btn-lod1-light');
            btn.classList.toggle('active', this.chunkManager.lod1LightEnabled);
            btn.textContent = `LoD1 ライト: ${this.chunkManager.lod1LightEnabled ? 'ON' : 'OFF'}`;
            this.chunkManager.rebuildAllMeshes();
        });

        // LoD1 テクスチャ トグル
        document.getElementById('btn-lod1-texture').addEventListener('click', () => {
            this.chunkManager.lod1TextureEnabled = !this.chunkManager.lod1TextureEnabled;
            const btn = document.getElementById('btn-lod1-texture');
            btn.classList.toggle('active', this.chunkManager.lod1TextureEnabled);
            btn.textContent = `LoD1 テクスチャ: ${this.chunkManager.lod1TextureEnabled ? 'ON' : 'OFF'}`;
            this.chunkManager.rebuildAllMeshes();
        });

        // オートジャンプ
        const autoJumpCheckbox = document.getElementById('checkbox-auto-jump');
        if (autoJumpCheckbox) {
            autoJumpCheckbox.addEventListener('change', (e) => {
                this.playerController.autoJumpEnabled = e.target.checked;
            });
        }
    }

    /**
     * フォグ距離を描画半径に合わせて更新
     * @param {number} chunkRange - 描画半径（チャンク数）
     */
    _updateFog(chunkRange) {
        const farBlock = chunkRange * 16;
        this._fogInstance.near = farBlock * 0.5;
        this._fogInstance.far = farBlock;
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

        // FPS履歴記録（100msごと）
        const historyElapsed = now - this._lastFpsRecordTime;
        if (historyElapsed >= 100) {
            const instantFps = this.fps > 0 ? this.fps : Math.round(1000 / Math.max(this.deltaTime * 1000, 1));
            this.fpsHistory.push(instantFps);
            if (this.fpsHistory.length > 100) this.fpsHistory.shift();
            this._lastFpsRecordTime = now;
        }

        this.lastTime = now;
        if (!this.isReady) return;

        // プレイヤー更新
        this.playerController.update(this.deltaTime);

        // カメラ更新
        this.firstPersonCamera.update();

        // ブロック操作更新
        if (this.blockInteraction) {
            this.blockInteraction.update();
        }

        // チャンク更新
        const pos = this.player.getPosition();
        this.chunkManager.updateViewPosition(pos.x, pos.z);
        this.chunkManager._processQueuesWithPriority();

        // 描画
        this.renderer.render(this.scene, this.camera);

        // 統計更新
        this._updateStats();
    }

    _updateStats() {
        document.getElementById('debug-fps').textContent = this.fps;

        const pos = this.player.getPosition();
        document.getElementById('debug-player-pos').textContent =
            `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;

        const chunkX = Math.floor(pos.x / 16);
        const chunkZ = Math.floor(pos.z / 16);
        document.getElementById('debug-chunk-pos').textContent = `(${chunkX}, ${chunkZ})`;

        // 水中状態
        if (this.physicsWorld && this.player) {
            const inWater = this.physicsWorld.isInWater(this.player);
            document.getElementById('debug-in-water').textContent = inWater ? 'はい' : 'いいえ';
        }

        // ターゲットブロック情報
        if (this.blockInteraction) {
            const target = this.blockInteraction.getTargetBlock();
            if (target) {
                const blockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
                document.getElementById('debug-target-block').textContent = blockId || '-';
                document.getElementById('debug-target-pos').textContent =
                    `(${target.blockX}, ${target.blockY}, ${target.blockZ})`;
                document.getElementById('debug-target-face').textContent = target.face || '-';
                document.getElementById('debug-target-dist').textContent =
                    target.distance !== undefined ? target.distance.toFixed(2) : '-';
            } else {
                document.getElementById('debug-target-block').textContent = '-';
                document.getElementById('debug-target-pos').textContent = '-';
                document.getElementById('debug-target-face').textContent = '-';
                document.getElementById('debug-target-dist').textContent = '-';
            }
        }

        // 足元の明るさ
        if (this.chunkManager) {
            const chunkX = Math.floor(pos.x / 16);
            const chunkZ = Math.floor(pos.z / 16);
            const chunkKey = `${chunkX},${chunkZ}`;
            const chunk = this.chunkManager.chunks.get(chunkKey);
            if (chunk && chunk.chunkData) {
                const localX = Math.floor(pos.x) - chunkX * 16;
                const localZ = Math.floor(pos.z) - chunkZ * 16;
                const lightY = Math.floor(pos.y);
                const light = chunk.chunkData.getLight(localX, lightY, localZ);
                document.getElementById('debug-light-level').textContent = `${light} / 15`;
            }
        }

        // 標高・被覆クラス
        if (this.realMapLoader && this.realMapLoader.loaded) {
            const wx = Math.floor(pos.x);
            const wz = Math.floor(pos.z);
            const elev = this.realMapLoader.getElevation(wx, wz);
            const lcIndex = this.realMapLoader.getLandcover(wx, wz);
            document.getElementById('debug-elevation').textContent = `${elev} blocks (${elev * this.realMapLoader.blockSize}m)`;
            document.getElementById('debug-landcover').textContent = `${lcIndex}: ${LC_NAMES[lcIndex] || '不明'}`;
        }

        // Draw Calls（毎フレーム更新）
        const drawCalls = this.renderer.info.render.calls;
        document.getElementById('debug-drawcalls').textContent = drawCalls.toLocaleString();

        // ポリゴン数・LoD（1秒ごと更新）
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
window.RealMapTestApp = RealMapTestApp;

// 初期化
window.gameApp = new RealMapTestApp();
window.gameApp.init().catch(console.error);
