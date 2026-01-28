/**
 * 2-2 チャンク管理テスト - メイン処理
 */

class ChunkManagerTestApp {
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
        this.greedyEnabled = true;  // デフォルトON
        this.cullingEnabled = true; // デフォルトON
        this.chunkRange = 9;

        // チャンク範囲表示
        this.chunkBoundaryLine = null;

        // 移動速度（ブロック/秒）
        this.moveSpeedSettings = {
            slow: 32,
            medium: 64,
            fast: 128
        };
        this.currentMoveSpeed = this.moveSpeedSettings.slow; // 現在の移動速度

        // 手動移動
        this.keys = {
            w: false,
            s: false,
            a: false,
            d: false
        };

        // 連続移動テスト
        this.isTestRunning = false;
        this.testStartTime = 0;
        this.testFpsValues = [];
        this.testStats = {
            newGenerated: 0,
            loadedFromStorage: 0
        };

        // FPS計測
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;

        // FPSグラフ用履歴
        this.fpsHistory = [];
        this.fpsHistoryMaxLength = 120; // 直近120フレーム分（半分の速度で移動）

        // 初期化完了フラグ
        this.isReady = false;
    }

    async init() {
        // Three.js 初期化
        this._initThreeJS();

        // テクスチャ読み込み
        this.textureLoader = new TextureLoader();
        await this.textureLoader.loadAll();

        // チャンクマネージャー初期化
        this.chunkManager = new ChunkManager({
            chunkRange: this.chunkRange,
            worldName: 'world1'
        });
        await this.chunkManager.init(this.textureLoader, this.worldContainer);

        // グリーディーとカリングのデフォルト設定を適用
        this.chunkManager.setGreedy(this.greedyEnabled);
        this.chunkManager.setCulling(this.cullingEnabled);

        // チャンク範囲表示を初期化
        this._initChunkBoundaryLine();

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

        // カメラ
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(8, 100, 60);

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

        // リサイズ対応
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    _initUI() {
        // チャンク範囲選択
        const chunkRangeSelect = document.getElementById('select-chunk-range');
        chunkRangeSelect.value = this.chunkRange.toString();
        chunkRangeSelect.addEventListener('change', async (e) => {
            this.chunkRange = parseInt(e.target.value);
            this.chunkManager.setChunkRange(this.chunkRange);
            await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
            this._updateChunkBoundaryLine();
        });

        // 生成数/F
        const chunksPerFrameInput = document.getElementById('input-chunks-per-frame');
        chunksPerFrameInput.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 2;
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

        // グリーディーボタン（デフォルトON）
        const greedyBtn = document.getElementById('btn-greedy');
        greedyBtn.addEventListener('click', () => {
            this.greedyEnabled = !this.greedyEnabled;
            greedyBtn.textContent = `グリーディー: ${this.greedyEnabled ? 'ON' : 'OFF'}`;
            greedyBtn.classList.toggle('active', this.greedyEnabled);
            this.chunkManager.setGreedy(this.greedyEnabled);
            this.chunkManager.rebuildAllMeshes();
        });

        // カリングボタン（デフォルトON）
        const cullingBtn = document.getElementById('btn-culling');
        cullingBtn.addEventListener('click', () => {
            this.cullingEnabled = !this.cullingEnabled;
            cullingBtn.textContent = `カリング: ${this.cullingEnabled ? 'ON' : 'OFF'}`;
            cullingBtn.classList.toggle('active', this.cullingEnabled);
            this.chunkManager.setCulling(this.cullingEnabled);
            this.chunkManager.rebuildAllMeshes();
        });

        // 速度プルダウン
        const speedSelect = document.getElementById('select-move-speed');
        speedSelect.addEventListener('change', (e) => {
            this.currentMoveSpeed = this.moveSpeedSettings[e.target.value];
        });

        // テスト開始ボタン
        const startTestBtn = document.getElementById('btn-start-test');
        startTestBtn.addEventListener('click', () => this._startContinuousTest());

        // ストレージクリアボタン
        const clearStorageBtn = document.getElementById('btn-clear-storage');
        clearStorageBtn.addEventListener('click', async () => {
            await this.chunkManager.clearStorage();
            this._updateStorageCount();
        });

        // リセットボタン
        const resetBtn = document.getElementById('btn-reset');
        resetBtn.addEventListener('click', async () => {
            this.viewX = 8;
            this.viewZ = 8;
            await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);
            this.controls.target.set(8, 32, -8);
            this.camera.position.set(8, 100, 60);
            this.controls.update();
        });
    }

    _initKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = true;
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(key)) {
                this.keys[key] = false;
            }
        });
    }

    _initChunkBoundaryLine() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));

        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.chunkBoundaryLine = new THREE.LineSegments(geometry, material);

        this.worldContainer.add(this.chunkBoundaryLine);
        this._updateChunkBoundaryLine();
    }

    _updateChunkBoundaryLine() {
        if (!this.chunkBoundaryLine) return;

        const halfRange = Math.floor(this.chunkRange / 2);
        const chunkX = Math.floor(this.viewX / ChunkData.SIZE_X);
        const chunkZ = Math.floor(this.viewZ / ChunkData.SIZE_Z);

        const minX = (chunkX - halfRange) * ChunkData.SIZE_X;
        const maxX = (chunkX + halfRange + 1) * ChunkData.SIZE_X;
        const minZ = (chunkZ - halfRange) * ChunkData.SIZE_Z;
        const maxZ = (chunkZ + halfRange + 1) * ChunkData.SIZE_Z;
        const y = 64;

        const positions = this.chunkBoundaryLine.geometry.attributes.position.array;
        // 下辺
        positions[0] = minX; positions[1] = y; positions[2] = minZ;
        positions[3] = maxX; positions[4] = y; positions[5] = minZ;
        // 右辺
        positions[6] = maxX; positions[7] = y; positions[8] = minZ;
        positions[9] = maxX; positions[10] = y; positions[11] = maxZ;
        // 上辺
        positions[12] = maxX; positions[13] = y; positions[14] = maxZ;
        positions[15] = minX; positions[16] = y; positions[17] = maxZ;
        // 左辺
        positions[18] = minX; positions[19] = y; positions[20] = maxZ;
        positions[21] = minX; positions[22] = y; positions[23] = minZ;

        this.chunkBoundaryLine.geometry.attributes.position.needsUpdate = true;
    }

    _drawAxisHelper() {
        const canvas = document.getElementById('axis-helper');
        const ctx = canvas.getContext('2d');
        canvas.width = 80;
        canvas.height = 80;

        ctx.clearRect(0, 0, 80, 80);

        const centerX = 40;
        const centerY = 45;
        const length = 25;

        // X軸（赤、東）
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + length, centerY);
        ctx.stroke();
        ctx.fillStyle = '#ff4444';
        ctx.font = '10px sans-serif';
        ctx.fillText('X(東)', centerX + length - 5, centerY + 12);

        // Z軸（青、北）
        ctx.strokeStyle = '#4444ff';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX, centerY - length);
        ctx.stroke();
        ctx.fillStyle = '#4444ff';
        ctx.fillText('Z(北)', centerX - 15, centerY - length + 5);

        // Y軸（緑、上）
        ctx.strokeStyle = '#44ff44';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX - 15, centerY + 15);
        ctx.stroke();
        ctx.fillStyle = '#44ff44';
        ctx.fillText('Y', centerX - 25, centerY + 25);
    }

    async _startContinuousTest() {
        if (this.isTestRunning) return;

        const distance = parseInt(document.getElementById('input-move-distance').value) || 10;
        const direction = document.getElementById('select-move-direction').value;
        const speedName = document.getElementById('select-move-speed').value;

        const speed = this.moveSpeedSettings[speedName];

        // 方向ベクトル
        let dx = 0, dz = 0;
        switch (direction) {
            case 'north': dz = 1; break;
            case 'south': dz = -1; break;
            case 'northwest': dx = -1; dz = 1; break;
            case 'southeast': dx = 1; dz = -1; break;
        }

        // 斜め移動の場合は速度を調整
        const magnitude = Math.sqrt(dx * dx + dz * dz);
        if (magnitude > 0) {
            dx /= magnitude;
            dz /= magnitude;
        }

        // テスト開始
        this.isTestRunning = true;
        this.testStartTime = performance.now();
        this.testFpsValues = [];
        this.chunkManager.resetStats();

        // UI更新
        const statusEl = document.getElementById('test-status');
        statusEl.textContent = '実行中...';
        statusEl.className = 'running';
        document.getElementById('test-results').classList.remove('visible');

        // 移動距離（ワールド座標）
        const targetDistance = distance * ChunkData.SIZE_X;
        let movedDistance = 0;
        let testLastTime = performance.now();

        const testLoop = async () => {
            if (!this.isTestRunning) return;

            const now = performance.now();
            const delta = (now - testLastTime) / 1000;
            testLastTime = now;

            // 移動
            const moveAmount = speed * delta;
            this.viewX += dx * moveAmount;
            this.viewZ += dz * moveAmount;
            movedDistance += moveAmount;

            // チャンク更新（非同期で実行、待たない）
            this.chunkManager.updateViewPosition(this.viewX, this.viewZ);

            // 境界線更新
            this._updateChunkBoundaryLine();

            // FPS記録
            if (this.fps > 0) {
                this.testFpsValues.push(this.fps);
            }

            // 完了判定
            if (movedDistance >= targetDistance) {
                this._finishTest();
                return;
            }

            requestAnimationFrame(testLoop);
        };

        requestAnimationFrame(testLoop);
    }

    _finishTest() {
        this.isTestRunning = false;

        // 結果計算
        const avgFps = this.testFpsValues.length > 0
            ? Math.round(this.testFpsValues.reduce((a, b) => a + b, 0) / this.testFpsValues.length)
            : 0;
        const minFps = this.testFpsValues.length > 0
            ? Math.round(Math.min(...this.testFpsValues))
            : 0;

        const stats = this.chunkManager.stats;
        const totalChunks = stats.newGenerated + stats.loadedFromStorage;

        // UI更新
        const statusEl = document.getElementById('test-status');
        statusEl.textContent = '完了';
        statusEl.className = 'completed';

        document.getElementById('result-avg-fps').textContent = avgFps.toString();
        document.getElementById('result-min-fps').textContent = minFps.toString();
        document.getElementById('result-total-chunks').textContent = totalChunks.toString();
        document.getElementById('result-new-chunks').textContent = stats.newGenerated.toString();
        document.getElementById('result-loaded-chunks').textContent = stats.loadedFromStorage.toString();

        document.getElementById('test-results').classList.add('visible');
    }

    async _updateManualMovement(delta) {
        if (this.isTestRunning) return;

        let dx = 0, dz = 0;

        if (this.keys.w) dz += 1; // 北
        if (this.keys.s) dz -= 1; // 南
        if (this.keys.a) dx -= 1; // 西
        if (this.keys.d) dx += 1; // 東

        if (dx === 0 && dz === 0) return;

        // 正規化
        const magnitude = Math.sqrt(dx * dx + dz * dz);
        dx /= magnitude;
        dz /= magnitude;

        // 移動
        const moveAmount = this.currentMoveSpeed * delta;
        this.viewX += dx * moveAmount;
        this.viewZ += dz * moveAmount;

        // チャンク更新
        await this.chunkManager.updateViewPosition(this.viewX, this.viewZ);

        // 境界線更新
        this._updateChunkBoundaryLine();
    }

    _updateDebugInfo() {
        // ポリゴン数
        let totalTriangles = 0;
        for (const chunk of this.chunkManager.chunks.values()) {
            if (chunk.mesh && chunk.mesh.geometry && chunk.mesh.geometry.index) {
                totalTriangles += chunk.mesh.geometry.index.count / 3;
            }
        }
        document.getElementById('debug-triangles').textContent = totalTriangles.toLocaleString();

        // ドローコール
        document.getElementById('debug-drawcalls').textContent =
            this.renderer.info.render.calls.toString();

        // 読込済みチャンク数
        document.getElementById('debug-loaded-chunks').textContent =
            this.chunkManager.getLoadedChunkCount().toString();

        // 視点座標
        const chunkX = Math.floor(this.viewX / ChunkData.SIZE_X);
        const chunkZ = Math.floor(this.viewZ / ChunkData.SIZE_Z);
        document.getElementById('debug-position').textContent =
            `X: ${Math.round(this.viewX)}, Z: ${Math.round(this.viewZ)} (${chunkX}, ${chunkZ})`;

        // 処理時間統計
        const avgTimes = this.chunkManager.getAverageTimes();
        document.getElementById('debug-avg-new-time').textContent =
            avgTimes.newGenerate !== null ? avgTimes.newGenerate.toFixed(1) : '-';
        document.getElementById('debug-avg-load-time').textContent =
            avgTimes.loadGenerate !== null ? avgTimes.loadGenerate.toFixed(1) : '-';
        document.getElementById('debug-avg-unload-time').textContent =
            avgTimes.unload !== null ? avgTimes.unload.toFixed(1) : '-';

        // FPSグラフ更新
        this._updateFpsGraph();
    }

    _updateFpsGraph() {
        // FPS履歴への追加は1秒ごと（_animate内で制御）
        // ここではグラフ描画のみ行う

        // グラフを描画
        const canvas = document.getElementById('fps-graph');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // 背景クリア
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, width, height);

        if (this.fpsHistory.length < 2) return;

        // グラフ描画
        const maxFps = 120;
        const barWidth = width / this.fpsHistoryMaxLength;

        ctx.beginPath();
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;

        for (let i = 0; i < this.fpsHistory.length; i++) {
            const fps = this.fpsHistory[i];
            const x = i * barWidth;
            const y = height - (fps / maxFps) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // 60FPSライン
        ctx.strokeStyle = '#4caf50';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        const y60 = height - (60 / maxFps) * height;
        ctx.moveTo(0, y60);
        ctx.lineTo(width, y60);
        ctx.stroke();
        ctx.setLineDash([]);

        // 現在のFPS表示
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${this.fps} FPS`, 5, 15);
    }

    async _updateStorageCount() {
        const count = await this.chunkManager.getStoredChunkCount();
        document.getElementById('debug-stored-chunks').textContent = count.toString();
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // FPS計算
        this.frameCount++;
        if (this.frameCount >= 10) {
            this.fps = Math.round(1000 / ((now - this.fpsStartTime) / this.frameCount));
            this.frameCount = 0;
            this.fpsStartTime = now;
        }
        if (!this.fpsStartTime) {
            this.fpsStartTime = now;
        }

        // 手動移動
        this._updateManualMovement(delta);

        // チャンクキュー処理（毎フレーム呼び出し）
        this.chunkManager._processQueuesWithPriority();

        // カメラとターゲットを視点に追従
        // 現在のカメラオフセット（ターゲットからの相対位置）を計算
        const offsetX = this.camera.position.x - this.controls.target.x;
        const offsetZ = this.camera.position.z - this.controls.target.z;

        // ターゲットを新しい視点位置に更新
        this.controls.target.x = this.viewX;
        this.controls.target.z = -this.viewZ; // Three.js座標系

        // カメラ位置も同じオフセットを維持しながら追従
        this.camera.position.x = this.viewX + offsetX;
        this.camera.position.z = -this.viewZ + offsetZ;

        this.controls.update();

        // レンダリング
        this.renderer.render(this.scene, this.camera);

        // デバッグ情報更新
        this._updateDebugInfo();

        // ストレージ数は1秒ごとに更新
        if (!this.lastStorageUpdate || now - this.lastStorageUpdate > 1000) {
            this._updateStorageCount();
            this.lastStorageUpdate = now;
        }

        // FPS履歴は1秒ごとに追加
        if (!this.lastFpsHistoryUpdate || now - this.lastFpsHistoryUpdate >= 1000) {
            if (this.fps > 0) {
                this.fpsHistory.push(this.fps);
                if (this.fpsHistory.length > this.fpsHistoryMaxLength) {
                    this.fpsHistory.shift();
                }
            }
            this.lastFpsHistoryUpdate = now;
        }
    }

    // テスト用API
    getBgColor() {
        const color = this.scene.background;
        return '#' + color.getHexString();
    }

    getWorldContainerScaleZ() {
        return this.worldContainer.scale.z;
    }

    getViewPositionX() {
        return this.viewX;
    }

    getViewPositionZ() {
        return this.viewZ;
    }
}

// グローバル公開
window.gameApp = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    window.gameApp = new ChunkManagerTestApp();
    await window.gameApp.init();
});
