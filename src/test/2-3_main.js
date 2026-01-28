/**
 * 2-3 LoD設定と表示テスト - メイン処理
 */

class LoDTestApp {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.worldContainer = null;

        this.textureLoader = null;
        this.chunkManager = null;

        // 視点位置（ワールド座標）
        this.viewX = 8;
        this.viewZ = 8;

        // 設定
        this.wireframeEnabled = false;
        this.greedyEnabled = true;
        this.cullingEnabled = true;
        this.lodDebugMode = false;
        this.totalRange = 3; // 描画半径

        // 移動速度（ブロック/秒）
        this.moveSpeed = 32;

        // 手動移動
        this.keys = {
            w: false,
            s: false,
            a: false,
            d: false
        };

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        // FPSグラフ用
        this.fpsHistory = [];
        this.fpsGraphInterval = 100; // 0.1秒ごと
        this.fpsGraphMaxPoints = 100; // 最大100ポイント（10秒間）
        this.lastFpsRecordTime = performance.now();
        this.fpsGraphCanvas = null;
        this.fpsGraphCtx = null;

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
        if (this.textureLoader._blockData) {
            for (const block of this.textureLoader._blockData) {
                // デフォルトテクスチャの色を取得
                const texName = block.tex_default || block.block_str_id;
                const texData = this.textureLoader._textureData.find(t => t.file_name === texName);
                blockColors[block.block_str_id] = texData ? texData.color_hex : '#808080';
                blockShapes[block.block_str_id] = block.shape_type || 'normal';
            }
        }

        // チャンクマネージャー初期化
        this.chunkManager = new ChunkManager({
            chunkRange: this.totalRange,
            worldName: 'world1'
        });
        await this.chunkManager.init(this.textureLoader, this.worldContainer);

        // ブロック情報を設定
        this.chunkManager.setBlockInfo(blockColors, blockShapes);

        // デフォルト設定を適用
        this.chunkManager.setGreedy(this.greedyEnabled);
        this.chunkManager.setCulling(this.cullingEnabled);

        // 初期チャンク生成
        await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);

        // UI初期化
        this._initUI();

        // キーボードイベント
        this._initKeyboardEvents();

        // ローディング非表示
        document.getElementById('loading-indicator').style.display = 'none';

        // 軸ヘルパー描画
        this._drawAxisHelper();

        // 初期化完了
        this.isReady = true;

        // アニメーションループ開始
        this._animate();
    }

    _initThreeJS() {
        // シーン
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        // カメラ（広い範囲を見るため遠くに配置）
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            5000
        );
        this.camera.position.set(8, 200, 150);

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

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(8, 32, -8);
        this.controls.update();

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    _initUI() {
        // LoD範囲入力
        const lod0Input = document.getElementById('input-lod0-range');
        const totalRangeInput = document.getElementById('input-total-range');

        const updateLoD0Range = async () => {
            const lod0 = parseInt(lod0Input.value) || 3;
            this.chunkManager.setLoD0Range(lod0);
            // LoD範囲変更に伴いチャンクを再描画
            await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
            this._updateLoDCounts();
        };

        lod0Input.addEventListener('change', updateLoD0Range);

        totalRangeInput.addEventListener('change', async () => {
            this.totalRange = parseInt(totalRangeInput.value) || 3;
            this.chunkManager.setChunkRange(this.totalRange);
            await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
        });

        // フレーム処理設定
        const maxProcessingInput = document.getElementById('input-max-processing-per-frame');

        maxProcessingInput.addEventListener('change', () => {
            const value = parseInt(maxProcessingInput.value) || 1;
            this.chunkManager.setMaxProcessingPerFrame(value);
        });

        // ワイヤーフレームボタン
        const wireframeBtn = document.getElementById('btn-wireframe');
        wireframeBtn.addEventListener('click', () => {
            this.wireframeEnabled = !this.wireframeEnabled;
            wireframeBtn.textContent = `ワイヤーフレーム: ${this.wireframeEnabled ? 'ON' : 'OFF'}`;
            wireframeBtn.classList.toggle('active', this.wireframeEnabled);
            this.chunkManager.setWireframe(this.wireframeEnabled);
        });

        // グリーディーボタン
        const greedyBtn = document.getElementById('btn-greedy');
        greedyBtn.addEventListener('click', () => {
            this.greedyEnabled = !this.greedyEnabled;
            greedyBtn.textContent = `グリーディー: ${this.greedyEnabled ? 'ON' : 'OFF'}`;
            greedyBtn.classList.toggle('active', this.greedyEnabled);
            this.chunkManager.setGreedy(this.greedyEnabled);
            this.chunkManager.rebuildAllMeshes();
        });

        // カリングボタン
        const cullingBtn = document.getElementById('btn-culling');
        cullingBtn.addEventListener('click', () => {
            this.cullingEnabled = !this.cullingEnabled;
            cullingBtn.textContent = `カリング: ${this.cullingEnabled ? 'ON' : 'OFF'}`;
            cullingBtn.classList.toggle('active', this.cullingEnabled);
            this.chunkManager.setCulling(this.cullingEnabled);
            this.chunkManager.rebuildAllMeshes();
        });

        // LoD色分けボタン
        const lodDebugBtn = document.getElementById('btn-lod-debug');
        lodDebugBtn.addEventListener('click', () => {
            this.lodDebugMode = !this.lodDebugMode;
            lodDebugBtn.textContent = `LoD色分け: ${this.lodDebugMode ? 'ON' : 'OFF'}`;
            lodDebugBtn.classList.toggle('active', this.lodDebugMode);
            this.chunkManager.setLoDDebugMode(this.lodDebugMode);
            this.chunkManager.applyLoDDebugColors();
        });

        // リセットボタン
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.viewX = 8;
            this.viewZ = 8;
            this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
            this._updateCameraPosition();
        });

        // ストレージクリアボタン
        document.getElementById('btn-clear-storage').addEventListener('click', async () => {
            await this.chunkManager.clearStorage();
            this._updateStats();
        });

        // ワールド選択
        const worldSelect = document.getElementById('select-world');
        const perlinParamsSection = document.getElementById('perlin-params');
        worldSelect.addEventListener('change', async () => {
            const worldType = worldSelect.value;
            // パーリンノイズ設定セクションの表示/非表示
            perlinParamsSection.style.display = worldType === 'perlin' ? 'block' : 'none';
            await this._changeWorld(worldType);
        });

        // パーリンノイズパラメータ設定
        this._initPerlinParamsUI();

        // 初期値を設定
        this.chunkManager.setLoD0Range(parseInt(lod0Input.value));
    }

    _initPerlinParamsUI() {
        const inputs = {
            'input-perlin1-seed': 'perlin1Seed',
            'input-perlin1-scale': 'perlin1Scale',
            'input-perlin1-amplitude': 'perlin1Amplitude',
            'input-perlin2-seed': 'perlin2Seed',
            'input-perlin2-scale': 'perlin2Scale',
            'input-perlin2-amplitude': 'perlin2Amplitude',
            'input-perlin2-threshold': 'perlin2Threshold',
            'input-perlin-min-height': 'perlinMinHeight',
            'input-perlin-max-height': 'perlinMaxHeight'
        };

        for (const [inputId, paramName] of Object.entries(inputs)) {
            const input = document.getElementById(inputId);
            if (!input) continue;

            input.addEventListener('change', async () => {
                const value = parseFloat(input.value);
                if (isNaN(value)) return;

                // WorldGeneratorのパラメータを更新
                this.chunkManager.worldGenerator[paramName] = value;

                // パーリンノイズワールドの場合、再生成
                if (this.chunkManager.worldGenerator.worldType === 'perlin') {
                    await this._regeneratePerlinWorld();
                }
            });
        }
    }

    async _regeneratePerlinWorld() {
        // 全チャンクをクリア
        await this.chunkManager.clearAllChunks();
        // ストレージをクリア
        await this.chunkManager.clearStorage();
        // チャンクを再生成
        await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
    }

    _initKeyboardEvents() {
        // iframe内でのフォーカス対応
        this.canvas.addEventListener('click', () => {
            this.canvas.focus();
        });
        this.canvas.tabIndex = 0;

        const handleKeyDown = (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
                e.preventDefault();
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = false;
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        this.canvas.addEventListener('keydown', handleKeyDown);
        this.canvas.addEventListener('keyup', handleKeyUp);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        // フレーム開始時間
        const now = performance.now();

        // FPS計測
        this.frameCount++;
        const elapsed = now - this.lastTime;

        if (elapsed >= 1000) {
            this.fps = Math.round(this.frameCount * 1000 / elapsed);
            this.frameCount = 0;
            this.lastTime = now;
        }

        // FPSグラフ用：0.1秒ごとに記録
        if (now - this.lastFpsRecordTime >= this.fpsGraphInterval) {
            this.fpsHistory.push(this.fps);
            if (this.fpsHistory.length > this.fpsGraphMaxPoints) {
                this.fpsHistory.shift();
            }
            this.lastFpsRecordTime = now;
            this._drawFpsGraph();
        }

        // 手動移動処理
        this._handleManualMovement();

        // カメラを視点に追従
        this._updateCameraPosition();

        // 描画（最優先）
        this.renderer.render(this.scene, this.camera);

        // 統計更新（軽量版）
        this._updateStatsLight();
    }

    _handleManualMovement() {
        const delta = 1 / 60; // 約60FPS想定
        const moveAmount = this.moveSpeed * delta;

        let moved = false;

        if (this.keys.w) {
            this.viewZ += moveAmount;
            moved = true;
        }
        if (this.keys.s) {
            this.viewZ -= moveAmount;
            moved = true;
        }
        if (this.keys.a) {
            this.viewX -= moveAmount;
            moved = true;
        }
        if (this.keys.d) {
            this.viewX += moveAmount;
            moved = true;
        }

        if (moved) {
            // 視点位置の更新（キュー更新とrequestAnimationFrameベースの処理）
            this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
        }
    }

    _updateCameraPosition() {
        // カメラとターゲットを視点に追従
        // 現在のカメラオフセット（ターゲットからの相対位置）を計算
        const offsetX = this.camera.position.x - this.controls.target.x;
        const offsetY = this.camera.position.y - this.controls.target.y;
        const offsetZ = this.camera.position.z - this.controls.target.z;

        // ターゲットを新しい視点位置に更新
        this.controls.target.x = this.viewX;
        this.controls.target.y = 32; // 視点の高さ
        this.controls.target.z = -this.viewZ; // Three.js座標系（Z反転）

        // カメラ位置も同じオフセットを維持しながら追従
        this.camera.position.x = this.viewX + offsetX;
        this.camera.position.y = this.controls.target.y + offsetY;
        this.camera.position.z = -this.viewZ + offsetZ;

        this.controls.update();
    }

    /**
     * 軽量版統計更新（毎フレーム呼び出し用）
     * DOM操作を最小限に抑える
     */
    _updateStatsLight() {
        // FPS（キャッシュした要素に直接設定）
        if (!this._fpsElement) {
            this._fpsElement = document.getElementById('debug-fps');
            this._drawcallsElement = document.getElementById('debug-drawcalls');
            this._positionElement = document.getElementById('debug-position');
        }

        this._fpsElement.textContent = this.fps;
        this._drawcallsElement.textContent = this.renderer.info.render.calls;

        // 視点座標（計算とDOM更新を分離）
        const chunkX = Math.floor(this.viewX / 16);
        const chunkZ = Math.floor(this.viewZ / 16);
        this._positionElement.textContent =
            `X: ${Math.round(this.viewX)}, Z: ${Math.round(this.viewZ)} (${chunkX}, ${chunkZ})`;

        // 重い処理は1秒ごとに更新
        const now = performance.now();
        if (!this._lastHeavyUpdate || now - this._lastHeavyUpdate > 1000) {
            this._lastHeavyUpdate = now;
            this._updateStatsHeavy();
        }
    }

    /**
     * 重い統計更新（1秒ごと）
     */
    _updateStatsHeavy() {
        // ポリゴン数（チャンク数が多いと重い）
        let totalTriangles = 0;
        const children = this.worldContainer.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.geometry && child.geometry.index) {
                totalTriangles += child.geometry.index.count / 3;
            }
        }
        document.getElementById('debug-triangles').textContent = totalTriangles.toLocaleString();

        // LoD別チャンク数（重い処理）
        this._updateLoDCounts();
    }

    _updateStats() {
        this._updateStatsLight();
    }

    _updateLoDCounts() {
        const counts = this.chunkManager.getLoDCounts();
        const container = document.getElementById('debug-lod-counts');
        container.innerHTML = `
            <div class="lod-count-item"><span style="color:#00FF00">LoD0:</span> <span>${counts.lod0}</span></div>
            <div class="lod-count-item"><span style="color:#FFFF00">LoD1:</span> <span>${counts.lod1}</span></div>
        `;

        // キュー数更新
        const queueCounts = this.chunkManager.getQueueCounts();
        document.getElementById('debug-lod0-queue').textContent = queueCounts.lod0;
        document.getElementById('debug-lod1-queue').textContent = queueCounts.lod1;

        // LoD処理時間更新
        const times = this.chunkManager.getLoDProcessingTimes();
        const formatTime = (t) => t !== null ? t.toFixed(2) : '-';
        document.getElementById('debug-lod1-generate-time').textContent = formatTime(times.lod1Generate);
        document.getElementById('debug-lod1to0-time').textContent = formatTime(times.lod1to0);
        document.getElementById('debug-lod0to1-time').textContent = formatTime(times.lod0to1);
        document.getElementById('debug-lod1-unload-time').textContent = formatTime(times.lod1Unload);
    }

    _drawFpsGraph() {
        // キャッシュ
        if (!this.fpsGraphCanvas) {
            this.fpsGraphCanvas = document.getElementById('fps-graph');
            this.fpsGraphCtx = this.fpsGraphCanvas.getContext('2d');
        }
        const canvas = this.fpsGraphCanvas;
        const ctx = this.fpsGraphCtx;
        const width = canvas.width;
        const height = canvas.height;

        // 背景クリア
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, width, height);

        // 目盛り線（60, 30, 0 FPS）
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height * (1 - 60/60));
        ctx.lineTo(width, height * (1 - 60/60));
        ctx.moveTo(0, height * (1 - 30/60));
        ctx.lineTo(width, height * (1 - 30/60));
        ctx.stroke();

        // 目盛りラベル
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.fillText('60', 2, 12);
        ctx.fillText('30', 2, height/2 + 4);

        if (this.fpsHistory.length < 2) return;

        // グラフ描画
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const pointWidth = width / (this.fpsGraphMaxPoints - 1);

        for (let i = 0; i < this.fpsHistory.length; i++) {
            const x = i * pointWidth;
            const y = height - (this.fpsHistory[i] / 60) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    _drawAxisHelper() {
        const canvas = document.getElementById('axis-helper');
        const ctx = canvas.getContext('2d');
        const centerX = 40;
        const centerY = 50;
        const length = 25;

        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, 80, 80);

        // X軸（東）- 赤
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + length, centerY);
        ctx.stroke();
        ctx.fillStyle = '#ff4444';
        ctx.font = '10px sans-serif';
        ctx.fillText('E', centerX + length + 2, centerY + 3);

        // Z軸（北）- 青（画面上が北）
        ctx.strokeStyle = '#4444ff';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - length);
        ctx.stroke();
        ctx.fillStyle = '#4444ff';
        ctx.fillText('N', centerX - 3, centerY - length - 5);

        // Y軸（上）- 緑
        ctx.strokeStyle = '#44ff44';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX - 15, centerY + 15);
        ctx.stroke();
        ctx.fillStyle = '#44ff44';
        ctx.fillText('Y', centerX - 25, centerY + 20);
    }

    /**
     * ワールドタイプを変更
     * @param {string} worldType - "flat" または "perlin"
     */
    async _changeWorld(worldType) {
        // WorldGeneratorのタイプを変更
        this.chunkManager.worldGenerator.setWorldType(worldType);

        // 全チャンクをクリア
        await this.chunkManager.clearAllChunks();

        // ストレージをクリア（新しいワールドのデータで上書きされるため）
        await this.chunkManager.clearStorage();

        // チャンクを再生成
        await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
    }

    // テスト用メソッド
    getLoDCounts() {
        return this.chunkManager.getLoDCounts();
    }

    getViewPositionX() {
        return this.viewX;
    }

    getViewPositionZ() {
        return this.viewZ;
    }
}

// グローバルに公開
window.LoDTestApp = LoDTestApp;

// 初期化
window.gameApp = new LoDTestApp();
window.gameApp.init().catch(console.error);
