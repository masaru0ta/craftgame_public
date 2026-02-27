/**
 * 2-4 移動テスト - メイン処理
 * 1人称視点でのプレイヤー移動テスト
 */

class MovementTestApp {
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

        // データローダー
        this.textureLoader = null;
        this.chunkManager = null;

        // 設定
        this.wireframeEnabled = false;
        this.showCollision = false;

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        this.deltaTime = 0;

        // FPS履歴（パフォーマンステスト用）
        this.fpsHistory = [];
        this._lastFpsRecordTime = performance.now();
        this._lastFpsTime = performance.now();

        // 初期化完了フラグ
        this.isReady = false;

        // 衝突判定可視化用
        this.collisionHelpers = [];
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

        // プレイヤー初期化（初期位置: チャンク(0,0)の中央、地表より少し上）
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

    _initThreeJS() {
        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        // カメラ（1人称視点）
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
            if (this.firstPersonCamera) {
                this.firstPersonCamera.setAspect(window.innerWidth / window.innerHeight);
            }
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
        const flyBtn = document.getElementById('btn-fly-toggle');
        flyBtn.addEventListener('click', () => {
            this.player.toggleFlying();
            this._updateFlyButton();
        });

        // 衝突判定表示ボタン
        const collisionBtn = document.getElementById('btn-show-collision');
        collisionBtn.addEventListener('click', () => {
            this.showCollision = !this.showCollision;
            collisionBtn.classList.toggle('active', this.showCollision);
            if (!this.showCollision) {
                this._clearCollisionHelpers();
            }
        });

        // ワイヤーフレームボタン
        const wireframeBtn = document.getElementById('btn-wireframe');
        wireframeBtn.addEventListener('click', () => {
            this.wireframeEnabled = !this.wireframeEnabled;
            wireframeBtn.classList.toggle('active', this.wireframeEnabled);
            wireframeBtn.textContent = `ワイヤーフレーム: ${this.wireframeEnabled ? 'ON' : 'OFF'}`;
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

        // deltaTimeの上限を設定（フレーム落ち時の暴走防止）
        if (this.deltaTime > 0.1) {
            this.deltaTime = 0.1;
        }

        // FPS計測
        this.frameCount++;
        const fpsElapsed = now - this._lastFpsTime;
        if (fpsElapsed >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / fpsElapsed);
            this.frameCount = 0;
            this._lastFpsTime = now;
        }

        // FPS履歴記録（100msごと）- 即時FPSを使用
        const historyElapsed = now - this._lastFpsRecordTime;
        if (historyElapsed >= 100) {
            // 100ms間の即時FPSを計算
            const instantFps = this.fps > 0 ? this.fps : Math.round(1000 / Math.max(this.deltaTime * 1000, 1));
            this.fpsHistory.push(instantFps);
            if (this.fpsHistory.length > 100) {
                this.fpsHistory.shift();
            }
            this._lastFpsRecordTime = now;
        }

        this.lastTime = now;

        if (!this.isReady) return;

        // プレイヤー更新
        this.playerController.update(this.deltaTime);

        // カメラ更新
        this.firstPersonCamera.update();

        // 飛行ボタンの状態更新
        this._updateFlyButton();

        // チャンク更新
        const pos = this.player.getPosition();
        this.chunkManager.updateViewPosition(pos.x, pos.z);

        // キュー処理
        this.chunkManager._processQueuesWithPriority();

        // 衝突判定可視化更新
        if (this.showCollision) {
            this._updateCollisionHelpers();
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

            // LoD別チャンク数
            const counts = this.chunkManager.getLoDCounts();
            document.getElementById('debug-lod-counts').innerHTML = `
                <div class="lod-count-item"><span style="color:#00FF00">LoD0:</span> <span>${counts.lod0}</span></div>
                <div class="lod-count-item"><span style="color:#FFFF00">LoD1:</span> <span>${counts.lod1}</span></div>
            `;
        }
    }

    _clearCollisionHelpers() {
        for (const helper of this.collisionHelpers) {
            this.scene.remove(helper);
            if (helper.geometry) helper.geometry.dispose();
            if (helper.material) helper.material.dispose();
        }
        this.collisionHelpers = [];
    }

    _updateCollisionHelpers() {
        this._clearCollisionHelpers();

        const pos = this.player.getPosition();
        const radius = 2;

        // プレイヤー周辺のブロックをチェック
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -1; dy <= Math.ceil(this.player.getHeight()); dy++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const bx = Math.floor(pos.x + dx);
                    const by = Math.floor(pos.y + dy);
                    const bz = Math.floor(pos.z + dz);

                    const aabbs = this.physicsWorld.getBlockCollisionAABBs(bx, by, bz);
                    for (const aabb of aabbs) {
                        this._addCollisionHelper(aabb);
                    }
                }
            }
        }

        // プレイヤーAABBも表示
        const playerAABB = this.player.getAABB();
        this._addPlayerHelper(playerAABB);
    }

    _addCollisionHelper(aabb) {
        const width = aabb.maxX - aabb.minX;
        const height = aabb.maxY - aabb.minY;
        const depth = aabb.maxZ - aabb.minZ;
        const centerX = (aabb.minX + aabb.maxX) / 2;
        const centerY = (aabb.minY + aabb.maxY) / 2;
        const centerZ = (aabb.minZ + aabb.maxZ) / 2;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(centerX, centerY, -centerZ); // Z軸反転
        this.scene.add(mesh);
        this.collisionHelpers.push(mesh);
    }

    _addPlayerHelper(aabb) {
        const width = aabb.maxX - aabb.minX;
        const height = aabb.maxY - aabb.minY;
        const depth = aabb.maxZ - aabb.minZ;
        const centerX = (aabb.minX + aabb.maxX) / 2;
        const centerY = (aabb.minY + aabb.maxY) / 2;
        const centerZ = (aabb.minZ + aabb.maxZ) / 2;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(centerX, centerY, -centerZ); // Z軸反転
        this.scene.add(mesh);
        this.collisionHelpers.push(mesh);
    }

    // テスト用メソッド
    getPlayer() {
        return this.player;
    }

    getPlayerController() {
        return this.playerController;
    }

    getPhysicsWorld() {
        return this.physicsWorld;
    }

    getFirstPersonCamera() {
        return this.firstPersonCamera;
    }

    getFPS() {
        return this.fps;
    }

    getLoDCounts() {
        return this.chunkManager.getLoDCounts();
    }
}

// グローバルに公開
window.MovementTestApp = MovementTestApp;

// 初期化
window.gameApp = new MovementTestApp();
window.gameApp.init().catch(console.error);
