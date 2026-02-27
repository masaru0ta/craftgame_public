/**
 * 2-14 ブロック破壊演出テスト - メイン処理
 * 2-13をベースにパーティクルエフェクトを追加
 */

class BlockBreakEffectTestApp {
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

        // 2-12 追加
        this.inventory = null;

        // 2-13 追加
        this.craftingScreen = null;
        this.hotbar = null; // ショートカット参照

        // 2-14 追加
        this.particleSystem = null;

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

        // ブロックサムネイル生成（非同期、バックグラウンドで実行）
        this._generateBlockThumbnails();

        // ブロック色情報を収集（パーティクル色にも利用）
        this._blockColorMap = {};
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
                // パーティクル色用: デフォルト色を16進数で保持
                this._blockColorMap[block.block_str_id] = parseInt(defaultColor.replace('#', ''), 16);
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
        this.chunkManager.setGreedy(true);

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

        // GASからdefaultキャラクターを読み込み
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
            // ホットバーは空で初期化
            this.blockInteraction.init([], hotbarContainer);
            this.hotbar = this.blockInteraction.hotbar;

            // 2-12: インベントリ初期化
            this.inventory = new Inventory({
                container: document.getElementById('inventory-container'),
                hotbar: this.hotbar,
                allBlocks: placeableBlocks
            });

            // 全ブロックをインベントリに追加
            for (const block of placeableBlocks) {
                this.inventory.addItem(block.block_str_id, 99);
            }

            // 2-14: パーティクルシステム初期化（衝突判定付き）
            this.particleSystem = new VoxelParticleSystem({
                scene: this.scene,
                THREE: THREE,
                getBlockAt: (x, y, z) => this.physicsWorld.getBlockAt(x, y, z),
                flipZ: true
            });

            // ブロック破壊時にインベントリに自動収集 + パーティクル飛散
            this.blockInteraction.onBlockDestroyed((blockStrId, x, y, z) => {
                this.inventory.addItem(blockStrId, 1);

                // パーティクル飛散（座標が渡された場合のみ）
                if (x !== undefined && this.particleSystem) {
                    const color = this._getBlockColor(blockStrId);
                    // worldContainerのscale.z=-1に合わせてZ座標を反転
                    this.particleSystem.emit(x + 0.5, y + 0.5, -(z + 0.5), color);
                }
            });

            // ブロック設置時にホットバーのカウントを減らす
            this.blockInteraction.onBlockPlaced(() => {
                const hotbar = this.hotbar;
                const idx = hotbar.getSelectedSlot();
                const count = hotbar.getSlotCount(idx);
                if (count <= 1) {
                    hotbar.setSlotBlock(idx, null);
                } else {
                    hotbar.setSlotCount(idx, count - 1);
                }
            });

            // 2-13: クラフト画面初期化
            const recipes = this._getRecipes();
            this.craftingScreen = new CraftingScreen({
                container: document.getElementById('crafting-container'),
                inventory: this.inventory,
                hotbar: this.hotbar,
                allBlocks: placeableBlocks,
                recipes: recipes
            });

            // 作業台右クリックコールバック設定
            this.blockInteraction.onWorkbenchInteract(() => {
                this._openCrafting();
            });

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
                } else {
                    // クラフト画面が開いている場合はPointerLock復帰しない
                    if (!this.craftingScreen || !this.craftingScreen.isOpen()) {
                        this._requestPointerLock();
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
                } else {
                    this._requestPointerLock();
                }
            });
        }

        // 初期チャンク生成
        const pos = this.player.getPosition();
        await this.chunkManager.updateViewPosition(pos.x, pos.z);

        // チャンク生成キューを処理してから作業台を設置
        for (let i = 0; i < 20; i++) {
            this.chunkManager._processQueuesWithPriority();
        }

        // 作業台をプレイヤー正面に設置
        this._placeWorkbench();

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
                if ((!this.inventory || !this.inventory.isOpen()) &&
                    (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                    clickToStart.style.display = 'block';
                }
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

    _getRecipes() {
        // GASから読み込んだレシピを使用、なければフォールバック
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
        // 地表を探す（上から下へ探索してair以外の上に設置）
        let y = Math.floor(pos.y) + 2;
        for (; y >= 0; y--) {
            const block = this.physicsWorld.getBlockAt(x, y, z);
            if (block && block !== 'air' && block !== 'water') {
                break;
            }
        }
        y++; // 固体ブロックの上
        const result = this.blockInteraction.placeBlock(x, y, z, 'workbench');
        if (!result) {
            console.warn('[CraftingTest] 作業台の設置に失敗。直接チャンクデータに書き込みます。');
            // フォールバック: チャンクデータに直接書き込み
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
        // インベントリが開いていたら閉じる
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

        // クラフト画面が開いている場合 → クラフト画面を閉じてインベントリを開く
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

    async _loadCharacterFromGAS(characterStrId) {
        try {
            const GAS_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';
            const api = new GasApi(GAS_URL);
            const characters = await api.getCharacters();
            const found = characters.find(c => c.character_str_id === characterStrId);
            if (found) {
                return CharacterData.fromJSON(found);
            }
        } catch (e) {
            console.warn(`[CraftingTest] GAS読み込み失敗: ${e.message}。ダミーデータを使用`);
        }
        return this._createDummyCharacterData();
    }

    _createDummyCharacterData() {
        const data = new CharacterData();
        const SKIN = 0xFFCD94;
        const BLUE = 0x3498DB;
        const DARK = 0x2C3E50;
        const EYE = 0x333333;
        const MOUTH = 0xCC6644;

        this._fillAllFaces(data, 'head', SKIN);
        data.setCell('head', 5, 2, 2, EYE);
        data.setCell('head', 5, 2, 5, EYE);
        for (let c = 2; c <= 5; c++) {
            data.setCell('head', 5, 5, c, MOUTH);
        }

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

    async _generateBlockThumbnails() {
        if (typeof BlockThumbnail === 'undefined') return;
        const generator = new BlockThumbnail({
            THREE: THREE,
            size: 64,
            backgroundColor: null
        });
        const blocks = this.textureLoader.blocks.filter(b => b.block_str_id !== 'air');
        for (const block of blocks) {
            try {
                block.thumbnail = await generator.generate(block, this.textureLoader.textures);
            } catch (e) {
                // サムネイル生成失敗は無視
            }
        }
        generator.dispose();
        if (this.blockInteraction && this.hotbar) {
            this.hotbar._createSlots();
            this.hotbar.updateDisplay();
        }
    }

    _initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

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

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    _initUI() {
        // キャンバスクリックでPointerLock開始
        this.canvas.addEventListener('click', () => {
            if (!this.playerController.isPointerLocked() &&
                (!this.inventory || !this.inventory.isOpen()) &&
                (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                this._requestPointerLock();
            }
        });

        // クリックして開始表示のクリックイベント
        document.getElementById('click-to-start').addEventListener('click', () => {
            this._requestPointerLock();
        });

        // 右クリックメニュー抑止（canvas + document両方）
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => e.preventDefault());

        // ホイールクリック（中ボタン）でインベントリ開閉
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

        // ブロック操作のマウスイベント（document レベルで捕捉、PointerLock中はcanvasにイベントが届かない場合がある）
        if (this.blockInteraction) {
            document.addEventListener('mousedown', (e) => {
                if ((e.button === 0 || e.button === 2) &&
                    this.playerController.isPointerLocked() &&
                    (!this.inventory || !this.inventory.isOpen()) &&
                    (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                    this.blockInteraction.handleMouseDown(e);
                }
            });
            this.canvas.addEventListener('wheel', (e) => {
                if ((!this.inventory || !this.inventory.isOpen()) &&
                    (!this.craftingScreen || !this.craftingScreen.isOpen())) {
                    this.blockInteraction.handleWheel(e);
                }
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

        // インベントリ・クラフト画面が開いている間はプレイヤー移動をスキップ
        if ((!this.inventory || !this.inventory.isOpen()) &&
            (!this.craftingScreen || !this.craftingScreen.isOpen())) {
            this.playerController.update(this.deltaTime);
        }

        // 視点マネージャー更新
        this.viewpointManager.update(this.deltaTime);

        // ブロック操作更新
        if (this.blockInteraction) {
            if (this.viewpointManager.getMode() === ViewpointManager.MODE_THIRD_PERSON) {
                const cam = this.camera;
                const camDir = new THREE.Vector3();
                cam.getWorldDirection(camDir);
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
        const flying = this.player.isFlying();
        if (this._lastFlyingState !== flying) {
            this._lastFlyingState = flying;
            this._updateFlyButton();
        }

        // チャンク更新
        const pos = this.player.getPosition();
        this.chunkManager.updateViewPosition(pos.x, pos.z);

        // キュー処理
        this.chunkManager._processQueuesWithPriority();

        // 2-14: パーティクル更新
        if (this.particleSystem) {
            this.particleSystem.update(this.deltaTime);
        }

        // 描画
        this.renderer.render(this.scene, this.camera);

        // 統計更新
        this._updateStats();
    }

    /**
     * PointerLockを要求する
     */
    _requestPointerLock() {
        this.playerController.requestPointerLock(this.canvas);
        this.firstPersonCamera.requestPointerLock(this.canvas);
    }

    /**
     * ブロックIDからパーティクル色（0xRRGGBB）を取得
     */
    _getBlockColor(blockStrId) {
        return this._blockColorMap[blockStrId] || 0x808080;
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
        } else if (!this.player.isOnGround()) {
            state = '空中';
        }
        document.getElementById('debug-player-state').textContent = state;

        // クラフト画面・インベントリ情報
        if (this.craftingScreen) {
            document.getElementById('debug-crafting-open').textContent =
                this.craftingScreen.isOpen() ? '開' : '閉';
        }
        if (this.inventory) {
            document.getElementById('debug-inventory-open').textContent =
                this.inventory.isOpen() ? '開' : '閉';
            document.getElementById('debug-inventory-items').textContent =
                this.inventory.getItemCount();
        }

        // 対象ブロック
        if (this.blockInteraction && this.blockInteraction.currentTarget) {
            const target = this.blockInteraction.currentTarget;
            const blockId = this.physicsWorld.getBlockAt(target.blockX, target.blockY, target.blockZ);
            document.getElementById('debug-target-block').textContent = blockId || '-';
        } else {
            document.getElementById('debug-target-block').textContent = '-';
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

        // ポリゴン数
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
window.BlockBreakEffectTestApp = BlockBreakEffectTestApp;

// 初期化
window.testApp = new BlockBreakEffectTestApp();
window.testApp.init().catch(console.error);
