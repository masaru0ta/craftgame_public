/**
 * 2-12 インベントリテスト - メイン処理
 * 2-11をベースにインベントリ機能を追加
 */

class InventoryTestApp {
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

            // 統一アイテムリストを構築
            const allItems = this._buildUnifiedItems(placeableBlocks);

            // 2-12: インベントリ初期化
            this.inventory = new Inventory({
                container: document.getElementById('inventory-container'),
                hotbar: this.blockInteraction.hotbar,
                allItems: allItems
            });

            // 先頭9件をホットバーに、残りをインベントリに設定
            const hotbar = this.blockInteraction.hotbar;
            for (let i = 0; i < Math.min(allItems.length, Hotbar.SLOT_COUNT); i++) {
                hotbar.setSlotBlock(i, allItems[i]);
                hotbar.setSlotCount(i, allItems[i].max_stack || 99);
            }
            for (let i = Hotbar.SLOT_COUNT; i < allItems.length; i++) {
                this.inventory.addItem(allItems[i].item_str_id, allItems[i].max_stack || 99);
            }

            // ブロック破壊時にインベントリに自動収集
            this.blockInteraction.onBlockDestroyed((blockStrId) => {
                this.inventory.addItem(blockStrId, 1);
            });

            // ブロック設置時にホットバーのカウントを減らす
            this.blockInteraction.onBlockPlaced(() => {
                const hotbar = this.blockInteraction.hotbar;
                const idx = hotbar.getSelectedSlot();
                const count = hotbar.getSlotCount(idx);
                if (count <= 1) {
                    hotbar.setSlotBlock(idx, null);
                } else {
                    hotbar.setSlotCount(idx, count - 1);
                }
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
                    // どの閉じ方でもPointerLockを再取得する
                    this.playerController.requestPointerLock(this.canvas);
                    this.firstPersonCamera.requestPointerLock(this.canvas);
                }
            });
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
                // インベントリが開いている場合はクリック開始を表示しない
                if (!this.inventory || !this.inventory.isOpen()) {
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
            console.warn(`[InventoryTest] GAS読み込み失敗: ${e.message}。ダミーデータを使用`);
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
        const headFrontSize = data.getFaceSize('head', 5);
        data.setCell('head', 5, 2, 1, EYE);
        data.setCell('head', 5, 2, 2, EYE);
        data.setCell('head', 5, 2, 5, EYE);
        data.setCell('head', 5, 2, 6, EYE);
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

    _toggleInventory() {
        if (!this.inventory) return;
        if (this.inventory.isOpen()) {
            // close()内で_onToggleが呼ばれ、そこでPointerLock再取得される
            this.inventory.close();
        } else {
            this.inventory.open();
            document.exitPointerLock();
        }
    }

    /**
     * 3ソースから統一アイテムリストを構築
     * @param {Array} placeableBlocks - air除外のブロック一覧
     * @returns {Array} 統一アイテム定義配列
     */
    _buildUnifiedItems(placeableBlocks) {
        const items = [];
        const textures = this.textureLoader.textures || [];

        // 1. ブロックアイテム（is_item=true）
        for (const block of placeableBlocks) {
            if (!block.is_item) continue;
            items.push({
                item_str_id: block.block_str_id,
                block_str_id: block.block_str_id,
                item_type: 'block',
                name: block.name || block.block_str_id,
                max_stack: block.max_stack || 99,
                thumbnail: block.thumbnail || null,
                _blockData: block
            });
        }

        // 2. 構造物アイテム（is_item=true）
        const structures = this.textureLoader.structures || [];
        for (const struct of structures) {
            if (!struct.is_item) continue;
            items.push({
                item_str_id: struct.structure_str_id,
                block_str_id: struct.structure_str_id,
                item_type: 'structure',
                name: struct.name || struct.structure_str_id,
                max_stack: struct.max_stack || 1,
                thumbnail: null,
                _structureData: struct
            });
        }

        // 3. 道具アイテム（アイテムシート）
        const toolItems = this.textureLoader.items || [];
        for (const item of toolItems) {
            // ブロック・構造物と重複するIDはスキップ
            if (items.some(i => i.item_str_id === item.item_str_id)) continue;
            // テクスチャからサムネイル取得
            let thumbnail = null;
            if (item.texture) {
                const tex = textures.find(t => t.file_name === item.texture);
                if (tex && tex.image_base64) thumbnail = tex.image_base64;
            }
            items.push({
                item_str_id: item.item_str_id,
                block_str_id: item.item_str_id,
                item_type: 'tool',
                name: item.name || item.item_str_id,
                max_stack: item.max_stack || 99,
                thumbnail: thumbnail,
                _toolData: item
            });
        }

        return items;
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

        // 統一アイテムマップのサムネイルも更新
        if (this.inventory && this.inventory._itemMap) {
            for (const block of blocks) {
                const item = this.inventory._itemMap.get(block.block_str_id);
                if (item && block.thumbnail) {
                    item.thumbnail = block.thumbnail;
                }
            }
            // インベントリUIを再描画
            this.inventory._renderAllSlots();
        }

        // ホットバーを再描画してサムネイルを反映
        if (this.blockInteraction && this.blockInteraction.hotbar) {
            this.blockInteraction.hotbar._createSlots();
            this.blockInteraction.hotbar.updateDisplay();
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
            if (!this.playerController.isPointerLocked() && (!this.inventory || !this.inventory.isOpen())) {
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

        // ホイールクリック（中ボタン）でインベントリ開閉（document レベルで検知）
        document.addEventListener('mousedown', (e) => {
            if (e.button === 1 && this.inventory) {
                e.preventDefault();
                this._toggleInventory();
            }
        });

        // ブロック操作のマウスイベント
        if (this.blockInteraction) {
            this.canvas.addEventListener('mousedown', (e) => {
                if (this.playerController.isPointerLocked() && (!this.inventory || !this.inventory.isOpen())) {
                    this.blockInteraction.handleMouseDown(e);
                }
            });
            this.canvas.addEventListener('wheel', (e) => {
                if (!this.inventory || !this.inventory.isOpen()) {
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

        // インベントリが開いている間はプレイヤー移動をスキップ
        if (!this.inventory || !this.inventory.isOpen()) {
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

        // 飛行ボタンの状態更新（変化時のみ）
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
        } else if (!this.player.isOnGround()) {
            state = '空中';
        }
        document.getElementById('debug-player-state').textContent = state;

        // インベントリ情報
        if (this.inventory) {
            document.getElementById('debug-inventory-open').textContent =
                this.inventory.isOpen() ? '開' : '閉';
            document.getElementById('debug-inventory-items').textContent =
                this.inventory.getItemCount();
        }

        // 視点情報
        const mode = this.viewpointManager.getMode();
        document.getElementById('debug-viewpoint-mode').textContent =
            mode === ViewpointManager.MODE_FIRST_PERSON ? '1人称' : '3人称';
        document.getElementById('debug-character-visible').textContent =
            this.characterRenderer.isVisible() ? '表示' : '非表示';

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
window.InventoryTestApp = InventoryTestApp;

// 初期化
window.testApp = new InventoryTestApp();
window.testApp.init().catch(console.error);
