/**
 * ChunkManager - 複数チャンクの管理クラス
 * NxN範囲のチャンクを管理、キュー制御、非同期生成
 */
class ChunkManager {
    constructor(options = {}) {
        this.chunkRange = options.chunkRange || 3; // NxN（デフォルト3x3）
        this.worldName = options.worldName || 'world1';

        // 読み込み済みチャンク: Map<"chunkX,chunkZ", { chunkData, mesh, state }>
        this.chunks = new Map();

        // 生成キュー
        this.generationQueue = [];
        this.isGenerating = false;

        // コールバック
        this.onChunkGenerating = null;  // (chunkX, chunkZ) => void
        this.onChunkGenerated = null;   // (chunkX, chunkZ, chunkData, isFromStorage) => void
        this.onChunkUnloaded = null;    // (chunkX, chunkZ) => void

        // 依存クラス
        this.storage = new ChunkStorage();
        this.worldGenerator = new WorldGenerator();
        this.textureLoader = null;
        this.meshBuilder = null;
        this.worldContainer = null;

        // 統計
        this.stats = {
            newGenerated: 0,
            loadedFromStorage: 0,
            // 処理時間計測用
            newGenerateTimes: [],    // 新規生成時間（ms）
            loadGenerateTimes: [],   // 読込生成時間（ms）
            unloadTimes: []          // 保存解放時間（ms）
        };

        // 現在の視点位置（ワールド座標）
        this.viewX = 0;
        this.viewZ = 0;

        // 同時実行防止フラグ
        this.isUpdatingView = false;
    }

    /**
     * 初期化
     */
    async init(textureLoader, worldContainer) {
        this.textureLoader = textureLoader;
        this.meshBuilder = new ChunkMeshBuilder(textureLoader);
        this.worldContainer = worldContainer;
        await this.storage.open();
    }

    /**
     * チャンク範囲（N）を設定
     */
    setChunkRange(n) {
        this.chunkRange = n;
    }

    /**
     * ワールド座標からチャンク座標を計算
     */
    worldToChunk(worldX, worldZ) {
        return {
            chunkX: Math.floor(worldX / ChunkData.SIZE_X),
            chunkZ: Math.floor(worldZ / ChunkData.SIZE_Z)
        };
    }

    /**
     * 視点位置を更新し、必要なチャンクを管理
     */
    async updateViewPosition(worldX, worldZ) {
        // 視点位置は常に更新（移動を滑らかにするため）
        this.viewX = worldX;
        this.viewZ = worldZ;

        // チャンク処理中は重複実行を防止
        if (this.isUpdatingView) return;
        this.isUpdatingView = true;

        try {
            // 処理開始時点の視点位置を使用
            const currentX = this.viewX;
            const currentZ = this.viewZ;

            const center = this.worldToChunk(currentX, currentZ);
            const halfRange = Math.floor(this.chunkRange / 2);

            // 必要なチャンクの座標リスト
            const neededChunks = new Set();
            for (let dx = -halfRange; dx <= halfRange; dx++) {
                for (let dz = -halfRange; dz <= halfRange; dz++) {
                    const cx = center.chunkX + dx;
                    const cz = center.chunkZ + dz;
                    neededChunks.add(`${cx},${cz}`);
                }
            }

            // 範囲外のチャンクをアンロード
            const chunksToUnload = [];
            for (const key of this.chunks.keys()) {
                if (!neededChunks.has(key)) {
                    chunksToUnload.push(key);
                }
            }

            if (chunksToUnload.length > 0) {
                await this._unloadChunksBatch(chunksToUnload);
            }

            // 必要なチャンクをキューに追加（距離順）
            const chunksToLoad = [];
            for (const key of neededChunks) {
                if (!this.chunks.has(key) && !this._isInQueue(key)) {
                    const [cx, cz] = key.split(',').map(Number);
                    const distance = Math.abs(cx - center.chunkX) + Math.abs(cz - center.chunkZ);
                    chunksToLoad.push({ key, chunkX: cx, chunkZ: cz, distance });
                }
            }

            // 距離でソート（近い順）
            chunksToLoad.sort((a, b) => a.distance - b.distance);

            for (const chunk of chunksToLoad) {
                this._addToQueue(chunk.chunkX, chunk.chunkZ);
            }

            // 生成処理を開始
            await this._processQueue();
        } finally {
            this.isUpdatingView = false;
        }
    }

    /**
     * キューにチャンクを追加
     */
    _addToQueue(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (!this._isInQueue(key) && !this.chunks.has(key)) {
            this.generationQueue.push({ chunkX, chunkZ, key });
        }
    }

    /**
     * キューに存在するか確認
     */
    _isInQueue(key) {
        return this.generationQueue.some(item => item.key === key);
    }

    /**
     * キューを処理（1つずつ順番に）
     */
    async _processQueue() {
        if (this.isGenerating) return;
        if (this.generationQueue.length === 0) return;

        this.isGenerating = true;

        while (this.generationQueue.length > 0) {
            const item = this.generationQueue.shift();
            await this._generateChunk(item.chunkX, item.chunkZ);
        }

        this.isGenerating = false;
    }

    /**
     * チャンクを生成
     */
    async _generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;

        // 既にロード済みなら何もしない
        if (this.chunks.has(key)) return;

        // 処理時間計測開始
        const startTime = performance.now();

        // コールバック: 生成開始
        if (this.onChunkGenerating) {
            this.onChunkGenerating(chunkX, chunkZ);
        }

        let chunkData;
        let isFromStorage = false;

        // ストレージから読み込み試行
        const stored = await this.storage.load(this.worldName, chunkX, chunkZ);
        if (stored) {
            chunkData = stored;
            isFromStorage = true;
            this.stats.loadedFromStorage++;
        } else {
            // 新規生成
            chunkData = new ChunkData(chunkX, chunkZ);
            this.worldGenerator.generateTest(chunkData);
            this.stats.newGenerated++;
        }

        // メッシュ生成
        const mesh = this.meshBuilder.build(chunkData, 'CULLED', this.useGreedy || false);
        mesh.position.x = chunkX * ChunkData.SIZE_X;
        mesh.position.z = chunkZ * ChunkData.SIZE_Z;

        // シーンに追加
        if (this.worldContainer) {
            this.worldContainer.add(mesh);
        }

        // 登録
        this.chunks.set(key, {
            chunkData,
            mesh,
            state: 'active'
        });

        // 処理時間計測終了（直近10件を保持）
        const elapsed = performance.now() - startTime;
        if (isFromStorage) {
            this._recordTime(this.stats.loadGenerateTimes, elapsed);
        } else {
            this._recordTime(this.stats.newGenerateTimes, elapsed);
        }

        // コールバック: 生成完了
        if (this.onChunkGenerated) {
            this.onChunkGenerated(chunkX, chunkZ, chunkData, isFromStorage);
        }
    }

    /**
     * チャンクをアンロード
     */
    async _unloadChunk(key) {
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // 処理時間計測開始
        const startTime = performance.now();

        const [chunkX, chunkZ] = key.split(',').map(Number);

        // ストレージに保存
        await this.storage.save(this.worldName, chunkX, chunkZ, chunk.chunkData);

        // メッシュをシーンから削除
        if (this.worldContainer && chunk.mesh) {
            this.worldContainer.remove(chunk.mesh);
            if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
            if (chunk.mesh.material) {
                if (Array.isArray(chunk.mesh.material)) {
                    chunk.mesh.material.forEach(m => m.dispose());
                } else {
                    chunk.mesh.material.dispose();
                }
            }
        }

        // 登録解除
        this.chunks.delete(key);

        // 処理時間計測終了（直近10件を保持）
        this._recordTime(this.stats.unloadTimes, performance.now() - startTime);

        // コールバック
        if (this.onChunkUnloaded) {
            this.onChunkUnloaded(chunkX, chunkZ);
        }
    }

    /**
     * 複数チャンクをバッチでアンロード（1つのトランザクションで保存）
     */
    async _unloadChunksBatch(keys) {
        if (keys.length === 0) return;

        // 処理時間計測開始
        const startTime = performance.now();

        // バッチ保存用データを収集
        const chunksToSave = [];
        for (const key of keys) {
            const chunk = this.chunks.get(key);
            if (!chunk) continue;

            const [chunkX, chunkZ] = key.split(',').map(Number);
            chunksToSave.push({
                worldName: this.worldName,
                chunkX,
                chunkZ,
                chunkData: chunk.chunkData
            });
        }

        // バッチ保存（1つのトランザクション）
        await this.storage.saveBatch(chunksToSave);

        // メッシュ削除と登録解除
        for (const key of keys) {
            const chunk = this.chunks.get(key);
            if (!chunk) continue;

            const [chunkX, chunkZ] = key.split(',').map(Number);

            // メッシュをシーンから削除
            if (this.worldContainer && chunk.mesh) {
                this.worldContainer.remove(chunk.mesh);
                if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
                if (chunk.mesh.material) {
                    if (Array.isArray(chunk.mesh.material)) {
                        chunk.mesh.material.forEach(m => m.dispose());
                    } else {
                        chunk.mesh.material.dispose();
                    }
                }
            }

            // 登録解除
            this.chunks.delete(key);

            // コールバック
            if (this.onChunkUnloaded) {
                this.onChunkUnloaded(chunkX, chunkZ);
            }
        }

        // 処理時間計測終了（1チャンクあたりの平均時間を記録）
        const elapsed = performance.now() - startTime;
        const avgTime = elapsed / keys.length;
        this._recordTime(this.stats.unloadTimes, avgTime);
    }

    /**
     * 読み込み済みチャンク数を取得
     */
    getLoadedChunkCount() {
        return this.chunks.size;
    }

    /**
     * 読み込み済みチャンクのキー一覧を取得
     */
    getLoadedChunkKeys() {
        return Array.from(this.chunks.keys());
    }

    /**
     * 現在生成中のチャンク数を取得
     */
    getCurrentlyGeneratingCount() {
        return this.isGenerating ? 1 : 0;
    }

    /**
     * 統計をリセット
     */
    resetStats() {
        this.stats.newGenerated = 0;
        this.stats.loadedFromStorage = 0;
        this.stats.newGenerateTimes = [];
        this.stats.loadGenerateTimes = [];
        this.stats.unloadTimes = [];
    }

    /**
     * 処理時間を記録（直近10件を保持）
     */
    _recordTime(arr, time) {
        arr.push(time);
        if (arr.length > 10) {
            arr.shift();
        }
    }

    /**
     * 平均処理時間を取得（直近10チャンクの平均）
     * @returns {Object} 各処理の平均時間（ms）、データがない場合は null
     */
    getAverageTimes() {
        const avg = (arr) => arr.length > 0
            ? arr.reduce((a, b) => a + b, 0) / arr.length
            : null;

        return {
            newGenerate: avg(this.stats.newGenerateTimes),
            loadGenerate: avg(this.stats.loadGenerateTimes),
            unload: avg(this.stats.unloadTimes)
        };
    }

    /**
     * グリーディーメッシングの有効/無効を設定
     */
    setGreedy(enabled) {
        this.useGreedy = enabled;
    }

    /**
     * ワイヤーフレームの有効/無効を設定
     */
    setWireframe(enabled) {
        for (const chunk of this.chunks.values()) {
            if (chunk.mesh && chunk.mesh.material) {
                if (Array.isArray(chunk.mesh.material)) {
                    chunk.mesh.material.forEach(m => m.wireframe = enabled);
                } else {
                    chunk.mesh.material.wireframe = enabled;
                }
            }
        }
    }

    /**
     * 全チャンクのメッシュを再生成
     */
    rebuildAllMeshes() {
        for (const [key, chunk] of this.chunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);

            // 古いメッシュを削除
            if (this.worldContainer && chunk.mesh) {
                this.worldContainer.remove(chunk.mesh);
                if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
            }

            // 新しいメッシュを生成
            const mesh = this.meshBuilder.build(chunk.chunkData, 'CULLED', this.useGreedy || false);
            mesh.position.x = chunkX * ChunkData.SIZE_X;
            mesh.position.z = chunkZ * ChunkData.SIZE_Z;

            if (this.worldContainer) {
                this.worldContainer.add(mesh);
            }

            chunk.mesh = mesh;
        }
    }

    /**
     * 全チャンクをアンロード
     */
    async unloadAll() {
        const keys = Array.from(this.chunks.keys());
        for (const key of keys) {
            await this._unloadChunk(key);
        }
    }

    /**
     * ストレージをクリア
     */
    async clearStorage() {
        await this.storage.clear(this.worldName);
    }

    /**
     * 保存済みチャンク数を取得
     */
    async getStoredChunkCount() {
        return await this.storage.getStoredChunkCount(this.worldName);
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ChunkManager = ChunkManager;
}
