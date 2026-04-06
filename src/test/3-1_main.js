/**
 * 3-1 ゲーム本編テスト - メイン処理
 * 2-1〜2-14の全機能統合テスト環境
 * リアルマップ（沼津）固定、折りたたみ式デバッグパネル
 */

/** 被覆クラス名テーブル */
const LC_NAMES = [
    '海/不明', '樹木', '低木', '草地', '農地', '市街地',
    '裸地', '雪氷', '水域', '湿地', 'マングローブ', '蘚苔'
];

class GameTestApp {
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

        // 視点・キャラクター
        this.thirdPersonCamera = null;
        this.characterRenderer = null;
        this.viewpointManager = null;
        this.characterData = null;

        // ブロック操作
        this.blockInteraction = null;
        this.hotbar = null;

        // UI
        this.inventory = null;
        this.craftingScreen = null;

        // タッチ操作
        this.touchController = null;

        // マルチプレイ
        this.multiplayerManager = null;
        this.peerPlayerRenderer = null;
        this.multiplayerSync = null;
        this.matchmakingUI = null;

        // ランダムティック
        this.randomTickEngine = null;

        // スケジュールティック
        this.scheduleTickEngine = null;

        // 天候システム
        this.weatherSystem = null;
        this.rainParticleSystem = null;
        this._baseTickSpeed = 3;

        // 回転軸ブロック
        this.rotationAxisManager = null;

        // 移動ブロック
        this.directionBlockManager = null;

        // エフェクト
        this.particleSystem = null;

        // データローダー
        this.textureLoader = null;
        this.chunkManager = null;
        this.realMapLoader = null;

        // 設定
        this.wireframeEnabled = false;
        this.lightingEnabled = true;
        this.fogEnabled = true;

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.deltaTime = 0;
        this._lastFpsTime = performance.now();

        // ブロック色マップ（パーティクル用）
        this._blockColorMap = {};

        // 初期化完了フラグ
        this.isReady = false;
    }

    async init() {
        // 1. Three.js初期化
        this._initThreeJS();

        // 2. テクスチャ読み込み
        this.textureLoader = new TextureLoader();
        await this.textureLoader.loadAll();

        // 3. ブロックサムネイル生成（バックグラウンド）
        this._generateBlockThumbnails();

        // 4. ブロック色情報収集
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
                // 6面分の色配列を構築（重複を除去）
                const colorSet = new Set();
                for (const fn of faceNames) {
                    colorSet.add(parseInt((faceColors[fn] || defaultColor).replace('#', ''), 16));
                }
                this._blockColorMap[block.block_str_id] = [...colorSet];
            }
        }

        // waterブロックの色を登録
        if (!blockColors['water']) {
            blockColors['water'] = {
                top: '#2196F3', bottom: '#1565C0',
                front: '#1E88E5', back: '#1E88E5',
                left: '#1E88E5', right: '#1E88E5'
            };
        }

        // 5. RealMapLoader でPNG読み込み
        this.realMapLoader = new RealMapLoader();
        await this.realMapLoader.load('../../assets/map/numazu_data_2000x2000.png');

        // 6. ChunkManager初期化
        const totalRange = parseInt(document.getElementById('input-total-range').value) || 20;
        this._updateFog(totalRange);
        this.chunkManager = new ChunkManager({
            chunkRange: totalRange,
            worldName: 'realmap_game'
        });
        await this.chunkManager.init(this.textureLoader, this.worldContainer);
        this.chunkManager.setBlockInfo(blockColors, blockShapes, lightTransparentIds);
        this.chunkManager.setGreedy(true);

        // LoD0範囲を設定
        const lod0Range = parseInt(document.getElementById('input-lod0-range').value) || 4;
        this.chunkManager.setLoD0Range(lod0Range);

        // 7. WorldGeneratorをrealmapモードに設定
        this.chunkManager.worldGenerator.realMapLoader = this.realMapLoader;
        this.chunkManager.worldGenerator.setWorldType('realmap');

        // 8. 木構造物をWorldGeneratorにセット
        const treeStructure = this.textureLoader.structures.find(s => s.structure_str_id === 'tree');
        if (treeStructure) {
            this.chunkManager.worldGenerator.setTreeStructure(treeStructure);
        }

        // 9. Player初期化（マップ中央、地面+5）
        const spawnX = Math.floor(this.realMapLoader.mapWidth / 2);
        const spawnZ = Math.floor(this.realMapLoader.mapHeight / 2);
        const elev = this.realMapLoader.getElevation(spawnX, spawnZ);
        const spawnY = Math.max(WorldGenerator.SEA_LEVEL + elev, WorldGenerator.SEA_LEVEL) + 5;
        this.player = new Player(spawnX, spawnY, spawnZ);

        // 10. PhysicsWorld初期化
        this.physicsWorld = new PhysicsWorld(this.chunkManager, this.textureLoader);

        // 11. PlayerController初期化
        const sensitivity = parseFloat(document.getElementById('input-mouse-sensitivity').value) || 0.002;
        this.playerController = new PlayerController(this.player, this.physicsWorld, {
            mouseSensitivity: sensitivity
        });
        this.playerController.SetCanvasSize(this.canvas.width, this.canvas.height);

        // 12. FirstPersonCamera初期化
        this.firstPersonCamera = new FirstPersonCamera(this.camera, this.player);

        // 13. ThirdPersonCamera初期化
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, this.player);

        // 14. CharacterRenderer初期化 + GASからキャラ読み込み
        this.characterRenderer = new CharacterRenderer({
            worldContainer: this.worldContainer,
            player: this.player,
            THREE: THREE
        });
        this.characterData = await this._loadCharacterFromGAS('default');
        this.characterRenderer.loadCharacterData(this.characterData);

        // 15. ViewpointManager初期化
        this.viewpointManager = new ViewpointManager({
            firstPersonCamera: this.firstPersonCamera,
            thirdPersonCamera: this.thirdPersonCamera,
            characterRenderer: this.characterRenderer
        });

        // Vキーコールバック設定
        this.playerController.onViewpointToggle(() => {
            this.viewpointManager.toggleMode();
        });

        // 16. BlockInteraction初期化（ホットバー空で開始）
        this.blockInteraction = new BlockInteraction(
            this.player, this.physicsWorld, this.chunkManager,
            this.chunkManager.storage, this.scene
        );
        const placeableBlocks = this.textureLoader.blocks.filter(
            b => b.block_str_id !== 'air'
        );

        // ハーフブロック設置を許可するブロックにフラグを付与（テスト用）
        const stoneBlock = placeableBlocks.find(b => b.block_str_id === 'stone');
        if (stoneBlock) {
            stoneBlock.half_placeable = true;
        }

        const hotbarContainer = document.getElementById('hotbar-container');
        this.blockInteraction.init([], hotbarContainer, this.textureLoader);
        this.blockInteraction._blocks = placeableBlocks;
        this.hotbar = this.blockInteraction.hotbar;

        // 回転軸ブロック管理初期化
        if (typeof RotationAxisManager !== 'undefined') {
            this.rotationAxisManager = new RotationAxisManager(
                this.chunkManager, this.worldContainer, this.textureLoader
            );
            this.blockInteraction.rotationAxisManager = this.rotationAxisManager;
            if (this.physicsWorld) {
                this.physicsWorld.rotationAxisManager = this.rotationAxisManager;
            }
        }

        // ロープ管理初期化
        if (typeof RopeManager !== 'undefined') {
            this.ropeManager = new RopeManager(this.chunkManager, this.worldContainer);
            this.blockInteraction.ropeManager = this.ropeManager;
            if (this.rotationAxisManager) {
                this.ropeManager._rotationAxisManager = this.rotationAxisManager;
                this.rotationAxisManager.ropeManager = this.ropeManager;
            }
        }

        // 移動ブロック管理初期化
        if (typeof DirectionBlockManager !== 'undefined') {
            this.directionBlockManager = new DirectionBlockManager(
                this.chunkManager, this.worldContainer, this.textureLoader
            );
            this.blockInteraction.directionBlockManager = this.directionBlockManager;
        }

        // ロープウェイ管理初期化
        if (typeof RopeWayManager !== 'undefined' && this.ropeManager) {
            this.ropeWayManager = new RopeWayManager(
                this.chunkManager, this.worldContainer, this.textureLoader, this.ropeManager
            );
            this.blockInteraction.ropeWayManager = this.ropeWayManager;
            if (this.physicsWorld) {
                this.physicsWorld.ropeWayManager = this.ropeWayManager;
            }
            if (this.rotationAxisManager) {
                this.ropeWayManager.rotationAxisManager = this.rotationAxisManager;
            }
        }

        // 粘着ピストン管理初期化
        if (typeof PistonManager !== 'undefined') {
            this.pistonManager = new PistonManager(
                this.chunkManager, this.worldContainer, this.textureLoader
            );
            this.blockInteraction.pistonManager = this.pistonManager;
        }

        // 統一アイテムリストを構築（ブロック・構造物・道具）
        const allItems = this._buildUnifiedItems(placeableBlocks);

        // ホットバーに先頭9アイテムを設定
        allItems.slice(0, Hotbar.SLOT_COUNT).forEach((item, i) => {
            this.hotbar.setSlotBlock(i, item);
            this.hotbar.setSlotCount(i, item.max_stack || 99);
        });

        // 17. Inventory初期化（全アイテム）
        this.inventory = new Inventory({
            container: document.getElementById('inventory-container'),
            hotbar: this.hotbar,
            allItems: allItems
        });
        for (let i = Hotbar.SLOT_COUNT; i < allItems.length; i++) {
            this.inventory.addItem(allItems[i].item_str_id, allItems[i].max_stack || 99);
        }

        // 18. VoxelParticleSystem初期化（衝突判定付き）
        this.particleSystem = new VoxelParticleSystem({
            scene: this.scene,
            THREE: THREE,
            getBlockAt: (x, y, z) => this.physicsWorld.getBlockAt(x, y, z),
            flipZ: true
        });

        // 19. 破壊コールバック登録（インベントリ収集 + パーティクル）
        this.blockInteraction.onBlockDestroyed((blockStrId, x, y, z) => {
            // drop_item フィールドがあればそれをドロップ、なければブロック自身
            const blockDef = this.blockInteraction._blocks?.find(b => b.block_str_id === blockStrId);
            const dropId = (blockDef && blockDef.drop_item) ? blockDef.drop_item : blockStrId;
            this.inventory.addItem(dropId, 1);
            if (x !== undefined && this.particleSystem) {
                const colors = this._blockColorMap[blockStrId] || [0x808080];
                this.particleSystem.emit(x + 0.5, y + 0.5, -(z + 0.5), colors);
            }
        });

        // 20. 設置コールバック登録（ホットバーカウント減少）
        this.blockInteraction.onBlockPlaced(() => {
            const idx = this.hotbar.getSelectedSlot();
            const count = this.hotbar.getSlotCount(idx);
            if (count <= 1) {
                this.hotbar.setSlotBlock(idx, null);
            } else {
                this.hotbar.setSlotCount(idx, count - 1);
            }
        });

        // 21. CraftingScreen初期化
        const recipes = this._getRecipes();
        this.craftingScreen = new CraftingScreen({
            container: document.getElementById('crafting-container'),
            inventory: this.inventory,
            hotbar: this.hotbar,
            allBlocks: placeableBlocks,
            allItems: allItems,
            recipes: recipes
        });

        // 22. 作業台右クリックコールバック登録
        this.blockInteraction.onWorkbenchInteract(() => {
            this._openCrafting();
        });

        // 23. UI初期化（イベントリスナー）
        // Eキーでインベントリ開閉
        this.playerController.onInventoryToggle(() => {
            this._toggleInventory();
        });

        // インベントリ開閉時のUI更新
        this.inventory.onToggle((isOpen) => {
            const crosshair = document.getElementById('crosshair');
            const clickToStart = document.getElementById('click-to-start');
            if (isOpen) {
                crosshair.style.display = 'none';
                clickToStart.style.display = 'none';
                if (this.touchController) this.touchController.setControlsVisible(false);
            } else {
                if (!this.craftingScreen || !this.craftingScreen.isOpen()) {
                    if (this.touchController) {
                        this.touchController.setControlsVisible(true);
                    } else {
                        this._requestPointerLock();
                    }
                }
            }
        });

        // クラフト画面開閉時のUI更新
        this.craftingScreen.onToggle((isOpen) => {
            const crosshair = document.getElementById('crosshair');
            const clickToStart = document.getElementById('click-to-start');
            if (isOpen) {
                crosshair.style.display = 'none';
                clickToStart.style.display = 'none';
                if (this.touchController) this.touchController.setControlsVisible(false);
            } else {
                if (this.touchController) {
                    this.touchController.setControlsVisible(true);
                } else {
                    this._requestPointerLock();
                }
            }
        });

        this._initUI();

        // 24. 初期チャンク生成
        const pos = this.player.getPosition();
        await this.chunkManager.updateViewPosition(pos.x, pos.z);

        // チャンク生成キューを処理
        for (let i = 0; i < 20; i++) {
            this.chunkManager._processQueuesWithPriority();
        }

        // 25. 作業台をプレイヤー正面に設置
        this._placeWorkbench();

        // 26. PointerLock設定
        this.firstPersonCamera.onPointerLockChange((isLocked) => {
            const clickToStart = document.getElementById('click-to-start');
            const crosshair = document.getElementById('crosshair');
            if (isLocked) {
                clickToStart.style.display = 'none';
                crosshair.style.display = 'block';
            } else {
                if ((!this.inventory || !this.inventory.isOpen()) &&
                    (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                    clickToStart.style.display = 'block';
                }
                crosshair.style.display = 'none';
            }
        });

        // マップ情報を表示
        document.getElementById('debug-map-info').textContent =
            `${this.realMapLoader.mapWidth}x${this.realMapLoader.mapHeight} (numazu)`;

        // 27. ローディング非表示 → クリック開始表示
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('click-to-start').style.display = 'block';
        document.getElementById('crosshair').style.display = 'none';

        // 28. タッチデバイス判定 → TouchController初期化
        this._initTouch();

        // 29. マッチングUI初期化
        this._initMatchmaking();

        // 30. ランダムティックエンジン初期化
        this.randomTickEngine = new RandomTickEngine();
        this.randomTickEngine.register('grass', grassTickHandler);
        this.randomTickEngine.register('leaf_block', leavesTickHandler);
        this.randomTickEngine.onBlockDecayed((wx, wy, wz, blockStrId) => {
            if (this.particleSystem) {
                const colors = this._blockColorMap[blockStrId] || [0x808080];
                this.particleSystem.emit(wx + 0.5, wy + 0.5, -(wz + 0.5), colors);
            }
        });

        // ティック速度デバッグUI連携
        const tickSpeedInput = document.getElementById('debug-tick-speed');
        if (tickSpeedInput) {
            tickSpeedInput.addEventListener('change', () => {
                const v = parseInt(tickSpeedInput.value, 10);
                this.randomTickEngine.speed = isNaN(v) ? 3 : v;
                document.getElementById('debug-tick-status').textContent =
                    this.randomTickEngine.speed === 0 ? '停止中' : '動作中';
            });
        }

        // 31. スケジュールティックエンジン初期化
        this.scheduleTickEngine = new ScheduleTickEngine();
        this.scheduleTickEngine.Register('water', waterTickHandler);
        this.scheduleTickEngine.Update(0, this.chunkManager); // _chunkManager を初期化時にセット
        this.blockInteraction.scheduleTickEngine = this.scheduleTickEngine;

        // 32. 天候システム初期化
        this._baseTickSpeed = this.randomTickEngine.speed;
        this.weatherSystem = new WeatherSystem();
        this.weatherSystem.scheduleTickEngine = this.scheduleTickEngine;
        this.weatherSystem.OnWeatherChange((state) => this._applyWeatherVisuals(state));
        this.rainParticleSystem = new RainParticleSystem(this.scene);
        this.rainParticleSystem.chunkManager = this.chunkManager;

        // 天候デバッグUI連携
        const weatherToggleBtn = document.getElementById('btn-weather-toggle');
        if (weatherToggleBtn) {
            weatherToggleBtn.addEventListener('click', () => {
                const next = this.weatherSystem.IsRaining ? 'clear' : 'rain';
                this.weatherSystem.SetWeather(next);
            });
        }

        // 33. （旧回転軸初期化コードは削除済み。初期化は上部 247行付近で実施）

        // 34. StructurePlacer 初期化・接続
        if (typeof StructurePlacer !== 'undefined') {
            this.structurePlacer = new StructurePlacer({
                chunkManager:  this.chunkManager,
                physicsWorld:  this.physicsWorld,
                player:        this.player,
                chunkStorage:  this.chunkManager.storage,
            });
            this.blockInteraction.structurePlacer = this.structurePlacer;
            this.blockInteraction._structureRotY = 0;

            // R キー → PlacementPreview 回転更新
            this.playerController.onRotateStructure((rotY) => {
                this.blockInteraction._structureRotY = rotY;
                // プレビューをキャッシュ無効化して再描画
                if (this.blockInteraction.placementPreview) {
                    this.blockInteraction.placementPreview._structureCacheKey = '';
                }
            });

            // UI ブロッキング設定（インベントリ・クラフト画面が開いているときはRキー無効）
            this.playerController.setUIOpenChecker(() => {
                return (this.inventory && this.inventory.isOpen()) ||
                       (this.craftingScreen && this.craftingScreen.isOpen());
            });
        }

        // 初期化完了
        this.isReady = true;

        // アニメーションループ開始
        this._animate();
    }

    _initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this._fogInstance = new THREE.Fog(0x87ceeb, 10, 480);
        this.scene.fog = this._fogInstance;

        // フォグをユークリッド距離で計算するようパッチ
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

        this.worldContainer = new THREE.Group();
        this.worldContainer.scale.z = -1;
        this.scene.add(this.worldContainer);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        this._ambientLight = ambientLight;
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.playerController.SetCanvasSize(this.canvas.width, this.canvas.height);
        });
    }

    _initUI() {
        // デバッグパネル全体の折りたたみ
        document.getElementById('debug-panel-header').addEventListener('click', () => {
            const panel = document.getElementById('debug-panel');
            panel.classList.toggle('collapsed');
            document.getElementById('debug-panel-toggle').textContent =
                panel.classList.contains('collapsed') ? '+' : '\u2212';
        });

        // セクション折りたたみ
        document.querySelectorAll('#debug-panel .debug-section h4').forEach(h4 => {
            h4.addEventListener('click', () => {
                h4.parentElement.classList.toggle('collapsed');
            });
        });

        // キャンバスクリックでPointerLock開始
        this.canvas.addEventListener('click', () => {
            if (!this.playerController.isPointerLocked() &&
                (!this.inventory || !this.inventory.isOpen()) &&
                (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                this._requestPointerLock();
            }
        });

        document.getElementById('click-to-start').addEventListener('click', () => {
            this._requestPointerLock();
        });

        // 右クリックメニュー抑止
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        // ホイールクリックでインベントリ開閉
        document.addEventListener('mousedown', (e) => {
            if (e.button === 1 && this.inventory) {
                e.preventDefault();
                this._toggleInventory();
            }
        });

        // Cキーでクラフト画面開閉（テスト用）
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyC' && this.craftingScreen) {
                if (this.craftingScreen.isOpen()) {
                    this.craftingScreen.close();
                } else {
                    this._openCrafting();
                }
            }
        });

        // ブロック操作のマウスイベント
        if (this.blockInteraction) {
            const isUIBlocked = () =>
                !this.playerController.isPointerLocked() ||
                (this.inventory && this.inventory.isOpen()) ||
                (this.craftingScreen && this.craftingScreen.isOpen());

            document.addEventListener('mousedown', (e) => {
                if (isUIBlocked()) return;
                if (e.button === 0 || e.button === 2) {
                    this.blockInteraction.handleMouseDown(e);
                }
            });
            document.addEventListener('mouseup', (e) => {
                if (isUIBlocked()) return;
                if (e.button === 2) {
                    this.blockInteraction.handleMouseUp(e);
                }
            });
            this.canvas.addEventListener('wheel', (e) => {
                if ((!this.inventory || !this.inventory.isOpen()) &&
                    (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                    // しゃがみ + 3人称 → カメラ距離変更
                    if (this.playerController.keys.shift &&
                        this.viewpointManager && this.viewpointManager.getMode() === ViewpointManager.MODE_THIRD_PERSON) {
                        const d = this.thirdPersonCamera.getDistance();
                        const step = e.deltaY > 0 ? 1.5 : -1.5;
                        this.thirdPersonCamera.setDistance(d + step);
                    } else {
                        this.blockInteraction.handleWheel(e);
                    }
                }
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
        document.getElementById('btn-wireframe').addEventListener('click', () => {
            this.wireframeEnabled = !this.wireframeEnabled;
            const btn = document.getElementById('btn-wireframe');
            btn.classList.toggle('active', this.wireframeEnabled);
            this.chunkManager.setWireframe(this.wireframeEnabled);
        });

        // 視点切替ボタン
        document.getElementById('btn-toggle-viewpoint').addEventListener('click', () => {
            this.viewpointManager.toggleMode();
        });

        // フォグトグルボタン
        document.getElementById('btn-fog-toggle').addEventListener('click', () => {
            this.fogEnabled = !this.fogEnabled;
            const btn = document.getElementById('btn-fog-toggle');
            btn.classList.toggle('active', this.fogEnabled);
            btn.textContent = `フォグ: ${this.fogEnabled ? 'ON' : 'OFF'}`;
            this.scene.fog = this.fogEnabled ? this._fogInstance : null;
        });

        // ライティングトグルボタン
        document.getElementById('btn-lighting-toggle').addEventListener('click', () => {
            this.lightingEnabled = !this.lightingEnabled;
            const btn = document.getElementById('btn-lighting-toggle');
            btn.classList.toggle('active', this.lightingEnabled);
            btn.textContent = `ライティング: ${this.lightingEnabled ? 'ON' : 'OFF'}`;

            if (!this.lightingEnabled) {
                for (const [key, entry] of this.chunkManager.chunks) {
                    if (entry.chunkData && entry.chunkData._lightMap) {
                        entry.chunkData._lightMap.fill(15);
                    }
                }
            } else {
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

        // ストレージクリアボタン
        document.getElementById('btn-clear-storage').addEventListener('click', async () => {
            await this.chunkManager.clearStorage();
        });

        // LoD範囲入力
        document.getElementById('input-lod0-range').addEventListener('change', async (e) => {
            const lod0 = parseInt(e.target.value) || 4;
            this.chunkManager.setLoD0Range(lod0);
            const pos = this.player.getPosition();
            await this.chunkManager.updateViewPosition(pos.x, pos.z);
        });

        document.getElementById('input-total-range').addEventListener('change', async (e) => {
            const total = parseInt(e.target.value) || 20;
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
    }

    _getRecipes() {
        const gasRecipes = this.textureLoader.recipes;
        if (gasRecipes && gasRecipes.length > 0) {
            return gasRecipes;
        }
        return this._createFallbackRecipes();
    }

    _createFallbackRecipes() {
        const blocks = this.textureLoader.blocks.filter(b =>
            b.block_str_id !== 'air' && b.block_str_id !== 'workbench'
        );
        if (blocks.length < 2) return [];
        const a = blocks[0].block_str_id;
        const b = blocks[1].block_str_id;
        const aName = blocks[0].name || a;
        const bName = blocks[1].name || b;
        return [
            { recipe_id: 1, recipe_str_id: 'test_single', name: `${bName}変換`,
              materials: `${a}:1`, result_id: b, result_count: 2, category: 'tools' },
            { recipe_id: 2, recipe_str_id: 'test_multi', name: `${bName}圧縮`,
              materials: `${a}:4`, result_id: b, result_count: 1, category: 'building' },
            { recipe_id: 3, recipe_str_id: 'test_two_materials', name: `${aName}合成`,
              materials: `${a}:2,${b}:2`, result_id: a, result_count: 3, category: 'tools' },
        ];
    }

    _placeWorkbench() {
        const pos = this.player.getPosition();
        const x = Math.floor(pos.x) + 2;
        const z = Math.floor(pos.z);
        let y = Math.floor(pos.y) + 2;
        for (; y >= 0; y--) {
            const block = this.physicsWorld.getBlockAt(x, y, z);
            if (block && block !== 'air' && block !== 'water') break;
        }
        y++;
        const result = this.blockInteraction.placeBlock(x, y, z, 'workbench');
        if (!result) {
            console.warn('[GameTest] 作業台の設置に失敗。直接チャンクデータに書き込みます。');
            const chunkX = Math.floor(x / 16);
            const chunkZ = Math.floor(z / 16);
            const key = `${chunkX},${chunkZ}`;
            const chunk = this.chunkManager.chunks.get(key);
            if (chunk && chunk.chunkData) {
                const localX = ((x % 16) + 16) % 16;
                const localY = y - chunk.chunkData.baseY;
                const localZ = ((z % 16) + 16) % 16;
                chunk.chunkData.setBlock(localX, localY, localZ, 'workbench');
                this.chunkManager.rebuildChunkMesh(chunkX, chunkZ);
            }
        }
    }

    _openCrafting() {
        if (this.inventory && this.inventory.isOpen()) {
            this.inventory.close();
        }
        if (this.craftingScreen) {
            this.craftingScreen.open();
            document.exitPointerLock();
        }
    }

    _toggleInventory() {
        if (!this.inventory) return;
        if (this.craftingScreen && this.craftingScreen.isOpen()) {
            this.craftingScreen.close();
            this.inventory.open();
            document.exitPointerLock();
            return;
        }
        if (this.inventory.isOpen()) {
            this.inventory.close();
        } else {
            this.inventory.open();
            document.exitPointerLock();
        }
    }

    _initTouch() {
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (!isTouchDevice) return;

        const container = document.getElementById('touch-controls');
        if (!container) return;

        this.touchController = new TouchController({
            player: this.player,
            playerController: this.playerController,
            blockInteraction: this.blockInteraction,
            container: container,
            camera: this.camera,
            canvas: document.getElementById('game-canvas'),
            onToggleInventory: () => this._toggleInventory(),
            viewpointManager: this.viewpointManager,
            thirdPersonCamera: this.thirdPersonCamera,
        });
        this.touchController.enable();

        // タッチデバイスではクリック開始・クロスヘアを非表示
        document.getElementById('click-to-start').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
    }

    // --- マルチプレイ ---

    _initMatchmaking() {
        this.matchmakingUI = new MatchmakingUI({
            container: document.getElementById('matchmaking-container'),
            onJoinWorld: (peerId) => this._joinAsGuest(peerId),
            onRegister: (name, passphrase) => this._startMatchmaking(name, passphrase)
        });
    }

    async _startMatchmaking(name, passphrase) {
        // 既存のマネージャーを破棄（二重ポーリング防止）
        if (this.multiplayerManager) {
            this.multiplayerManager.dispose();
            this.multiplayerManager = null;
        }

        this._pendingMessages = [];
        this.multiplayerManager = new MultiplayerManager({
            onMessage: (peerId, data) => {
                if (this.multiplayerSync) {
                    this.multiplayerSync.handleMessage(peerId, data);
                } else {
                    // MultiplayerSync初期化前のメッセージをキューに保存
                    this._pendingMessages.push({ peerId, data });
                }
            },
            onConnected: (peerId, peerName) => {
                console.log(`[Multiplayer] 接続確立: ${peerName} (${peerId})`);
                this._onPeerConnected(peerId, peerName);
            },
            onDisconnected: (peerId, reason) => {
                console.log(`[Multiplayer] 切断: ${peerId} (${reason})`);
                this._onPeerDisconnected(peerId);
            },
            onMatchFound: (matchList) => {
                // 最初のマッチング相手の参加ボタンを表示
                if (matchList.length > 0) {
                    const peer = matchList[0];
                    this.matchmakingUI.showJoinButton(peer.id, peer.name);
                }
            },
            onRegistered: (id) => {
                console.log(`[Multiplayer] 登録完了: ${id}`);
            },
            onError: (error) => {
                console.error('[Multiplayer] エラー:', error);
            },
            onStatusChange: (status) => {
                this._updateMatchmakingStatus(status);
            }
        });

        this.matchmakingUI.show();
        this.matchmakingUI.setStatus('登録中...');

        try {
            await this.multiplayerManager.register(name, passphrase);
        } catch (e) {
            this.matchmakingUI.setStatus('登録失敗: ' + e.message);
        }
    }

    async _joinAsGuest(peerId) {
        if (!this.multiplayerManager) return;

        this.matchmakingUI.setStatus('接続試行中...');
        this.matchmakingUI.hideJoinButton();

        try {
            await this.multiplayerManager.connectToPeer(peerId);
        } catch (e) {
            this.matchmakingUI.setStatus('接続失敗: ' + e.message);
        }
    }

    _onPeerConnected(peerId, peerName) {
        // PeerPlayerRenderer初期化
        this.peerPlayerRenderer = new PeerPlayerRenderer(
            this.worldContainer,
            this.textureLoader.blocks
        );

        // MultiplayerSync初期化・開始
        this.multiplayerSync = new MultiplayerSync({
            multiplayerManager: this.multiplayerManager,
            blockInteraction: this.blockInteraction,
            chunkManager: this.chunkManager,
            chunkStorage: this.chunkManager.storage,
            peerPlayerRenderer: this.peerPlayerRenderer,
            player: this.player,
            characterData: this.characterData
        });

        this.multiplayerSync.startSync();

        // キューに溜まったメッセージを処理
        if (this._pendingMessages && this._pendingMessages.length > 0) {
            for (const msg of this._pendingMessages) {
                this.multiplayerSync.handleMessage(msg.peerId, msg.data);
            }
            this._pendingMessages = [];
        }

        this.matchmakingUI.setStatus(`${peerName} と接続済み`);
        const debugStatus = document.getElementById('debug-mp-status');
        if (debugStatus) {
            debugStatus.textContent = `${peerName} と接続済み`;
            debugStatus.style.color = '#4fc3f7';
        }
    }

    _onPeerDisconnected(peerId) {
        // クリーンアップ
        if (this.multiplayerSync) {
            this.multiplayerSync.dispose();
            this.multiplayerSync = null;
        }
        if (this.peerPlayerRenderer) {
            this.peerPlayerRenderer.dispose();
            this.peerPlayerRenderer = null;
        }

        this.matchmakingUI.setStatus('切断されました');
        const debugStatus = document.getElementById('debug-mp-status');
        if (debugStatus) {
            debugStatus.textContent = '切断';
            debugStatus.style.color = '#ff5252';
        }
    }

    _updateMatchmakingStatus(status) {
        const statusMap = {
            'registering': '登録中...',
            'waiting': '相手を待っています...',
            'connecting': '接続試行中...',
            'connected': '接続済み',
            'disconnected': '未接続'
        };
        const text = statusMap[status] || status;
        this.matchmakingUI.setStatus(text);

        const debugStatus = document.getElementById('debug-mp-status');
        if (debugStatus) {
            debugStatus.textContent = text;
        }
    }

    _requestPointerLock() {
        // タッチデバイスではPointerLockを使わない（スクリーンショット禁止回避）
        if (this.touchController) return;
        this.playerController.requestPointerLock(this.canvas);
        this.firstPersonCamera.requestPointerLock(this.canvas);
    }

    /**
     * 天候状態に応じて視覚・ゲームプレイを更新する
     * @param {'clear'|'rain'} state
     */
    _applyWeatherVisuals(state) {
        if (state === 'rain') {
            this.scene.background.setHex(0x5a6575);
            this._fogInstance.color.setHex(0x5a6575);
            this._ambientLight.intensity = 0.35;
            this.rainParticleSystem.SetVisible(true);
            if (this.randomTickEngine) this.randomTickEngine.speed = this._baseTickSpeed * 3;
        } else {
            this.scene.background.setHex(0x87ceeb);
            this._fogInstance.color.setHex(0x87ceeb);
            this._ambientLight.intensity = 0.6;
            this.rainParticleSystem.SetVisible(false);
            if (this.randomTickEngine) this.randomTickEngine.speed = this._baseTickSpeed;
        }
        // デバッグUI更新
        const el = document.getElementById('debug-weather-state');
        if (el) el.textContent = state;
        const btn = document.getElementById('btn-weather-toggle');
        if (btn) btn.textContent = state === 'rain' ? '雨を止める' : '雨を降らせる';
    }

    _updateFog(chunkRange) {
        const fogNear = chunkRange * 16 * 0.5;
        const fogFar = chunkRange * 16 * 0.9;
        this._fogInstance.near = fogNear;
        this._fogInstance.far = fogFar;
    }

    _updateFlyButton() {
        const flyBtn = document.getElementById('btn-fly-toggle');
        flyBtn.textContent = `飛行モード: ${this.player.isFlying() ? 'ON' : 'OFF'}`;
        flyBtn.classList.toggle('active', this.player.isFlying());
    }

    /**
     * クロスヘアの位置を仮想カーソル位置に更新
     */
    _updateCrosshairPosition(screenX, screenY) {
        const el = this._crosshairEl || (this._crosshairEl = document.getElementById('crosshair'));
        if (!el) return;
        el.style.left = screenX + 'px';
        el.style.top = screenY + 'px';
    }

    /**
     * クロスヘアを画面中央に戻す
     */
    _resetCrosshairPosition() {
        const el = this._crosshairEl || (this._crosshairEl = document.getElementById('crosshair'));
        if (!el) return;
        el.style.left = '50%';
        el.style.top = '50%';
    }

    async _loadCharacterFromGAS(characterStrId) {
        try {
            const GAS_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';
            const api = new GasApi(GAS_URL);
            const characters = await api.getCharacters();
            const found = characters.find(c => c.character_str_id === characterStrId);
            if (found) return CharacterData.fromJSON(found);
        } catch (e) {
            console.warn(`[GameTest] GAS読み込み失敗: ${e.message}。ダミーデータを使用`);
        }
        return this._createDummyCharacterData();
    }

    _createDummyCharacterData() {
        const data = new CharacterData();
        const SKIN = 0xFFCD94, BLUE = 0x3498DB, DARK = 0x2C3E50;
        const EYE = 0x333333, MOUTH = 0xCC6644;

        this._fillAllFaces(data, 'head', SKIN);
        data.setCell('head', 5, 2, 2, EYE);
        data.setCell('head', 5, 2, 5, EYE);
        for (let c = 2; c <= 5; c++) data.setCell('head', 5, 5, c, MOUTH);

        this._fillAllFaces(data, 'body', BLUE);
        this._fillAllFaces(data, 'arm_r', SKIN);
        this._fillAllFaces(data, 'arm_l', SKIN);
        this._fillAllFaces(data, 'leg_r', DARK);
        this._fillAllFaces(data, 'leg_l', DARK);
        return data;
    }

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

    _buildUnifiedItems(placeableBlocks) {
        return BuildUnifiedItems(this.textureLoader, placeableBlocks);
    }

    async _generateBlockThumbnails() {
        if (typeof BlockThumbnail === 'undefined') return;
        const generator = new BlockThumbnail({ THREE: THREE, size: 64, backgroundColor: null });
        const blocks = this.textureLoader.blocks.filter(b => b.block_str_id !== 'air');
        for (const block of blocks) {
            try {
                block.thumbnail = await generator.generate(block, this.textureLoader.textures);
            } catch (e) { /* サムネイル生成失敗は無視 */ }
        }
        generator.dispose();
        // 統一アイテムマップのサムネイルも更新
        if (this.inventory && this.inventory._itemMap) {
            for (const block of blocks) {
                const item = this.inventory._itemMap.get(block.block_str_id);
                if (item && block.thumbnail) item.thumbnail = block.thumbnail;
            }
            this.inventory._renderAllSlots();
        }
        if (this.blockInteraction && this.blockInteraction.hotbar) {
            this.blockInteraction.hotbar._createSlots();
            this.blockInteraction.hotbar.updateDisplay();
        }
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

        // タッチコントローラー更新
        if (this.touchController && this.touchController.isEnabled()) {
            this.touchController.update(this.deltaTime);
        }

        // インベントリ・クラフト画面が開いている間はプレイヤー移動をスキップ
        if ((!this.inventory || !this.inventory.isOpen()) &&
            (!this.craftingScreen || !this.craftingScreen.isOpen())) {
            this.playerController.update(this.deltaTime);
        }

        // 視点マネージャー更新
        this.viewpointManager.update(this.deltaTime);

        // ブロック操作更新（タッチデバイスでは常時レイキャスト/ハイライトを行わない）
        if (this.blockInteraction && !this.touchController) {
            const k = this.playerController.keys;
            const isMoving = k.w || k.s || k.a || k.d;
            const isThirdPerson = this.viewpointManager.getMode() === ViewpointManager.MODE_THIRD_PERSON;

            // 仮想カーソルの有効/無効切替
            const shouldEnableVirtualCursor = isThirdPerson && !isMoving;
            if (shouldEnableVirtualCursor !== this.playerController.IsVirtualCursorEnabled()) {
                this.playerController.SetVirtualCursorEnabled(shouldEnableVirtualCursor);
                if (!shouldEnableVirtualCursor) {
                    this._resetCrosshairPosition();
                }
            }

            if (isMoving) {
                // 移動中はハイライト・ゴーストを非表示
                this.blockInteraction.currentTarget = null;
                this.blockInteraction.highlight.update(null);
                this.blockInteraction._updatePlacementPreview();
            } else if (isThirdPerson && k.shift) {
                // 3人称 + しゃがみ中: 仮想カーソル位置からスクリーンレイキャスト
                const cursorPos = this.playerController.GetVirtualCursorPosition();
                const rect = this.canvas.getBoundingClientRect();
                this.blockInteraction.currentTarget = this.blockInteraction.raycastFromScreen(
                    cursorPos.x + rect.left, cursorPos.y + rect.top,
                    this.camera, this.canvas
                );
                this.blockInteraction.highlight.update(this.blockInteraction.currentTarget);
                this.blockInteraction._updatePlacementPreview();

                // クロスヘア位置を仮想カーソルに追従
                this._updateCrosshairPosition(cursorPos.x, cursorPos.y);

                // ターゲット方向にキャラクタの体を向ける（カメラには影響しない）
                const target = this.blockInteraction.currentTarget;
                if (target && target.hit && this.characterRenderer) {
                    const pos = this.player.getPosition();
                    const dx = (target.blockX + 0.5) - pos.x;
                    const dz = (target.blockZ + 0.5) - pos.z;
                    this.characterRenderer._bodyYaw = Math.atan2(dx, dz);
                }
            } else if (isThirdPerson) {
                // 3人称 + 非しゃがみ: 画面中央からレイキャスト（視点移動モード）
                const rect = this.canvas.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                this.blockInteraction.currentTarget = this.blockInteraction.raycastFromScreen(
                    centerX, centerY, this.camera, this.canvas
                );
                this.blockInteraction.highlight.update(this.blockInteraction.currentTarget);
                this.blockInteraction._updatePlacementPreview();
                this._resetCrosshairPosition();
            } else {
                // 1人称: 従来通り
                this.blockInteraction.update();
            }
        }

        // 飛行ボタンの状態更新
        const flying = this.player.isFlying();
        if (this._lastFlyingState !== flying) {
            this._lastFlyingState = flying;
            this._updateFlyButton();
        }

        // チャンク更新
        const pos = this.player.getPosition();
        this.chunkManager.updateViewPosition(pos.x, pos.z);
        this.chunkManager._processQueuesWithPriority();

        // ピアプレイヤー更新
        if (this.peerPlayerRenderer) {
            this.peerPlayerRenderer.update(this.deltaTime);
        }

        // パーティクル更新
        if (this.particleSystem) {
            this.particleSystem.update(this.deltaTime);
        }

        // ランダムティック
        if (this.randomTickEngine) {
            this.randomTickEngine.tick(this.chunkManager);
        }

        // スケジュールティック
        if (this.scheduleTickEngine) {
            this.scheduleTickEngine.Update(this.deltaTime, this.chunkManager);
        }

        // 天候システム
        if (this.weatherSystem && this.scheduleTickEngine) {
            this.weatherSystem.Update(this.scheduleTickEngine.currentTick);
        }

        // 回転軸ブロック更新
        if (this.rotationAxisManager) {
            this.rotationAxisManager.Update(this.deltaTime);
        }

        // ロープ動的更新
        if (this.ropeManager) {
            this.ropeManager.Update(this.deltaTime);
        }

        // 移動ブロック更新
        if (this.directionBlockManager) {
            this.directionBlockManager.Update(this.deltaTime);
        }

        // ロープウェイ更新
        if (this.ropeWayManager) {
            this.ropeWayManager.Update(this.deltaTime);
        }

        // ピストン更新
        if (this.pistonManager) {
            this.pistonManager.Update(this.deltaTime);
        }

        // 雨粒パーティクル
        if (this.rainParticleSystem) {
            this.rainParticleSystem.Update(this.deltaTime, this.camera.position);
        }

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

        // 状態
        let state = '地上';
        if (this.player.isFlying()) {
            state = '飛行中';
        } else if (this.physicsWorld && this.physicsWorld.isInWater(this.player)) {
            state = '水中';
        } else if (!this.player.isOnGround()) {
            state = '空中';
        }
        document.getElementById('debug-player-state').textContent = state;

        // 標高・被覆クラス
        if (this.realMapLoader && this.realMapLoader.loaded) {
            const wx = Math.floor(pos.x);
            const wz = Math.floor(pos.z);
            const elev = this.realMapLoader.getElevation(wx, wz);
            const lcIndex = this.realMapLoader.getLandcover(wx, wz);
            document.getElementById('debug-elevation').textContent =
                `${elev} blocks (${elev * this.realMapLoader.blockSize}m)`;
            document.getElementById('debug-landcover').textContent =
                `${lcIndex}: ${LC_NAMES[lcIndex] || '不明'}`;
        }

        // ブロック操作情報
        if (this.blockInteraction && this.blockInteraction.currentTarget) {
            const target = this.blockInteraction.currentTarget;
            const blockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
            document.getElementById('debug-target-block').textContent = blockId || '-';
        } else {
            document.getElementById('debug-target-block').textContent = '-';
        }

        // インベントリ・クラフト
        if (this.inventory) {
            document.getElementById('debug-inventory-open').textContent =
                this.inventory.isOpen() ? '開' : '閉';
            document.getElementById('debug-inventory-items').textContent =
                this.inventory.getItemCount();
        }
        if (this.craftingScreen) {
            document.getElementById('debug-crafting-open').textContent =
                this.craftingScreen.isOpen() ? '開' : '閉';
        }

        // パーティクル数
        if (this.particleSystem) {
            document.getElementById('debug-particle-count').textContent =
                this.particleSystem.getActiveCount();
        }

        // 視点情報
        const mode = this.viewpointManager.getMode();
        document.getElementById('debug-viewpoint-mode').textContent =
            mode === ViewpointManager.MODE_FIRST_PERSON ? '1人称' : '3人称';
        document.getElementById('debug-character-visible').textContent =
            this.characterRenderer.isVisible() ? '表示' : '非表示';

        // ポリゴン数（1秒ごと）
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

        // スケジュールティックキュー件数
        if (this.scheduleTickEngine) {
            document.getElementById('debug-schedule-tick-count').textContent =
                this.scheduleTickEngine.pendingCount;
        }

        // 天候
        if (this.weatherSystem) {
            const el = document.getElementById('debug-weather-state');
            if (el) el.textContent = this.weatherSystem.State;
        }
    }
}

// グローバルに公開
window.GameTestApp = GameTestApp;

// 初期化
window.testApp = new GameTestApp();
window.testApp.init().catch(console.error);
