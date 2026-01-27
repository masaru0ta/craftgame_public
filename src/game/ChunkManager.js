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
        this.chunksPerFrame = 2; // 1フレームで生成するチャンク数の上限

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

        // LoD設定
        this.lod0Range = 3;   // LoD 0の範囲（チャンク数）
        this.lod1Range = 7;   // LoD 1の範囲（チャンク数）
        this.lod2Range = 15;  // LoD 2の範囲（チャンク数）
        // LoD 3はそれ以上

        // LoD 2/3 メッシュ管理
        this.lod2Meshes = new Map(); // "chunkX,chunkZ" -> mesh
        this.lod3Meshes = new Map(); // "gridX,gridZ" -> mesh

        // ブロック色情報（LoD 1用）
        this.blockColors = {};
        this.blockShapes = {};

        // LoDデバッグモード
        this.lodDebugMode = false;
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
     * 1フレームで生成するチャンク数の上限を設定
     */
    setChunksPerFrame(n) {
        this.chunksPerFrame = n;
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

            // 必要なチャンクの座標リスト（LoD 0/1 のみ）
            const neededChunks = new Set();
            // 必要な LoD 2 チャンク
            const neededLoD2Chunks = new Set();
            // 必要な LoD 3 グリッド
            const neededLoD3Grids = new Set();

            for (let dx = -halfRange; dx <= halfRange; dx++) {
                for (let dz = -halfRange; dz <= halfRange; dz++) {
                    const cx = center.chunkX + dx;
                    const cz = center.chunkZ + dz;
                    const lod = this.getChunkLoD(cx, cz);

                    if (lod <= 1) {
                        // LoD 0/1: 通常チャンクとして管理
                        neededChunks.add(`${cx},${cz}`);
                    } else if (lod === 2) {
                        // LoD 2: 簡易メッシュ
                        neededLoD2Chunks.add(`${cx},${cz}`);
                    } else {
                        // LoD 3: 4x4グリッドメッシュ
                        const grid = LoDHelper.getLoD3Grid(cx, cz);
                        neededLoD3Grids.add(`${grid.gridX},${grid.gridZ}`);
                    }
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

            // 範囲外の LoD 2 メッシュを削除
            for (const key of this.lod2Meshes.keys()) {
                if (!neededLoD2Chunks.has(key)) {
                    const [cx, cz] = key.split(',').map(Number);
                    this._removeLoD2Mesh(cx, cz);
                }
            }

            // 範囲外の LoD 3 メッシュを削除
            for (const key of this.lod3Meshes.keys()) {
                if (!neededLoD3Grids.has(key)) {
                    const [gx, gz] = key.split(',').map(Number);
                    this._removeLoD3Mesh(gx, gz);
                }
            }

            // LoD 0/1 チャンクのLoD変更を検出し、再生成が必要なものをリストアップ
            const chunksToRebuild = [];
            for (const key of neededChunks) {
                const chunk = this.chunks.get(key);
                if (chunk && chunk.mesh) {
                    const [cx, cz] = key.split(',').map(Number);
                    const newLoD = this.getChunkLoD(cx, cz);
                    const currentLoD = chunk.mesh.userData.lodLevel;

                    // LoDレベルが変わった場合は再生成が必要
                    if (currentLoD !== newLoD) {
                        chunksToRebuild.push({ key, chunkX: cx, chunkZ: cz, newLoD });
                    }
                }
            }

            // LoD変更があるチャンクのメッシュを再生成
            for (const item of chunksToRebuild) {
                await this._rebuildChunkMesh(item.chunkX, item.chunkZ, item.newLoD);
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

            // LoD 2 メッシュを生成
            for (const key of neededLoD2Chunks) {
                if (!this.lod2Meshes.has(key)) {
                    const [cx, cz] = key.split(',').map(Number);
                    this._getOrCreateLoD2Mesh(cx, cz);
                }
            }

            // LoD 3 メッシュを生成
            for (const key of neededLoD3Grids) {
                if (!this.lod3Meshes.has(key)) {
                    const [gx, gz] = key.split(',').map(Number);
                    this._getOrCreateLoD3Mesh(gx, gz);
                }
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
     * キューを処理（1フレームでchunksPerFrame個まで）
     */
    async _processQueue() {
        if (this.isGenerating) return;
        if (this.generationQueue.length === 0) return;

        this.isGenerating = true;

        let processed = 0;
        while (this.generationQueue.length > 0 && processed < this.chunksPerFrame) {
            const item = this.generationQueue.shift();
            await this._generateChunk(item.chunkX, item.chunkZ);
            processed++;
        }

        this.isGenerating = false;

        // キューが残っている場合は次のフレームで継続
        if (this.generationQueue.length > 0) {
            requestAnimationFrame(() => this._processQueue());
        }
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
            this.worldGenerator.generate(chunkData);
            this.stats.newGenerated++;
        }

        // LoDレベルを取得
        const lodLevel = this.getChunkLoD(chunkX, chunkZ);

        // メッシュ生成（LoDレベルに応じて）
        let mesh;
        const mode = this.useCulling !== false ? 'CULLED' : 'FULL';

        if (lodLevel === 0) {
            // LoD 0: フルテクスチャ
            mesh = this.meshBuilder.build(chunkData, mode, this.useGreedy || false);
        } else if (lodLevel === 1) {
            // LoD 1: 頂点カラー
            mesh = this.meshBuilder.buildLoD1(chunkData, this.blockColors, this.blockShapes, this.useGreedy || false);
        } else {
            // LoD 2/3: 高さマップメッシュはここでは生成しない（別途管理）
            mesh = this.meshBuilder.build(chunkData, mode, this.useGreedy || false);
        }

        mesh.position.x = chunkX * ChunkData.SIZE_X;
        mesh.position.z = chunkZ * ChunkData.SIZE_Z;
        mesh.userData.lodLevel = lodLevel;
        mesh.name = `chunk_${chunkX}_${chunkZ}`;

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

        // ストレージに保存（速度テストのため一時的に無効化）
        // await this.storage.save(this.worldName, chunkX, chunkZ, chunk.chunkData);

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

        // バッチ保存用データを収集（速度テストのため一時的に無効化）
        // const chunksToSave = [];
        // for (const key of keys) {
        //     const chunk = this.chunks.get(key);
        //     if (!chunk) continue;
        //
        //     const [chunkX, chunkZ] = key.split(',').map(Number);
        //     chunksToSave.push({
        //         worldName: this.worldName,
        //         chunkX,
        //         chunkZ,
        //         chunkData: chunk.chunkData
        //     });
        // }
        //
        // // バッチ保存（1つのトランザクション）
        // await this.storage.saveBatch(chunksToSave);

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
     * カリングの有効/無効を設定
     */
    setCulling(enabled) {
        this.useCulling = enabled;
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
            const mode = this.useCulling !== false ? 'CULLED' : 'FULL';
            const mesh = this.meshBuilder.build(chunk.chunkData, mode, this.useGreedy || false);
            mesh.position.x = chunkX * ChunkData.SIZE_X;
            mesh.position.z = chunkZ * ChunkData.SIZE_Z;

            if (this.worldContainer) {
                this.worldContainer.add(mesh);
            }

            chunk.mesh = mesh;
        }
    }

    /**
     * 単一チャンクのメッシュを再生成（LoD変更時）
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @param {number} newLoD - 新しいLoDレベル
     */
    async _rebuildChunkMesh(chunkX, chunkZ, newLoD) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // 古いメッシュを削除
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

        // 新しいLoDレベルでメッシュを生成
        let mesh;
        const mode = this.useCulling !== false ? 'CULLED' : 'FULL';

        if (newLoD === 0) {
            // LoD 0: フルテクスチャ
            mesh = this.meshBuilder.build(chunk.chunkData, mode, this.useGreedy || false);
        } else if (newLoD === 1) {
            // LoD 1: 頂点カラー
            mesh = this.meshBuilder.buildLoD1(chunk.chunkData, this.blockColors, this.blockShapes, this.useGreedy || false);
        } else {
            // LoD 2/3 はこのメソッドでは処理しない
            return;
        }

        mesh.position.x = chunkX * ChunkData.SIZE_X;
        mesh.position.z = chunkZ * ChunkData.SIZE_Z;
        mesh.userData.lodLevel = newLoD;
        mesh.name = `chunk_${chunkX}_${chunkZ}`;

        if (this.worldContainer) {
            this.worldContainer.add(mesh);
        }

        chunk.mesh = mesh;
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
     * 全チャンクをクリア（メモリ上のみ、ストレージは別途クリア）
     */
    async clearAllChunks() {
        // 全チャンクをアンロード
        const keys = Array.from(this.chunks.keys());
        for (const key of keys) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.mesh && this.worldContainer) {
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
            this.chunks.delete(key);
        }

        // LoD 2/3 メッシュもクリア
        for (const [key, mesh] of this.lod2Meshes) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.lod2Meshes.clear();

        for (const [key, mesh] of this.lod3Meshes) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.lod3Meshes.clear();

        // キューもクリア
        this.generationQueue = [];
    }

    /**
     * 保存済みチャンク数を取得
     */
    async getStoredChunkCount() {
        return await this.storage.getStoredChunkCount(this.worldName);
    }

    // ========================================
    // LoD関連メソッド
    // ========================================

    /**
     * LoD閾値を設定
     * @param {number} lod0Range - LoD 0の範囲（チャンク数）
     * @param {number} lod1Range - LoD 1の範囲（チャンク数）
     * @param {number} lod2Range - LoD 2の範囲（チャンク数）
     */
    setLoDRanges(lod0Range, lod1Range, lod2Range) {
        this.lod0Range = lod0Range;
        this.lod1Range = lod1Range;
        this.lod2Range = lod2Range;
    }

    /**
     * チャンクのLoDレベルを取得
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {number} LoDレベル（0-3）
     */
    getChunkLoD(chunkX, chunkZ) {
        const center = this.worldToChunk(this.viewX, this.viewZ);
        // チェビシェフ距離（最大座標差）
        const distance = Math.max(
            Math.abs(chunkX - center.chunkX),
            Math.abs(chunkZ - center.chunkZ)
        );

        if (distance <= this.lod0Range) return 0;
        if (distance <= this.lod1Range) return 1;
        if (distance <= this.lod2Range) return 2;
        return 3;
    }

    /**
     * ブロック色情報を設定（LoD 1用）
     * @param {Object} colors - {"blockStrId": "#RRGGBB", ...}
     * @param {Object} shapes - {"blockStrId": "normal"|"custom", ...}
     */
    setBlockInfo(colors, shapes) {
        this.blockColors = colors;
        this.blockShapes = shapes;
    }

    /**
     * LoDデバッグモードを設定
     * @param {boolean} enabled
     */
    setLoDDebugMode(enabled) {
        this.lodDebugMode = enabled;
    }

    /**
     * LoD別のチャンク数を取得
     * @returns {{lod0: number, lod1: number, lod2: number, lod3: number}}
     */
    getLoDCounts() {
        const counts = { lod0: 0, lod1: 0, lod2: 0, lod3: 0 };

        // LoD 0/1 チャンク（chunks マップから）
        for (const key of this.chunks.keys()) {
            const [cx, cz] = key.split(',').map(Number);
            const lod = this.getChunkLoD(cx, cz);
            if (lod === 0) {
                counts.lod0++;
            } else if (lod === 1) {
                counts.lod1++;
            }
        }

        // LoD 2 メッシュ（1メッシュ = 1チャンク）
        counts.lod2 = this.lod2Meshes.size;

        // LoD 3 メッシュ（1メッシュ = 16チャンク分）
        counts.lod3 = this.lod3Meshes.size * 16;

        return counts;
    }

    /**
     * LoD 2 メッシュを作成または取得
     */
    _getOrCreateLoD2Mesh(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.lod2Meshes.has(key)) {
            return this.lod2Meshes.get(key);
        }

        const mesh = LoDHelper.createLoD2Mesh(chunkX, chunkZ, this.worldGenerator);
        mesh.userData.lodLevel = 2;

        if (this.lodDebugMode) {
            mesh.material.color.setStyle(LoDHelper.getDebugColor(2));
        }

        this.lod2Meshes.set(key, mesh);

        if (this.worldContainer) {
            this.worldContainer.add(mesh);
        }

        return mesh;
    }

    /**
     * LoD 3 メッシュを作成または取得
     */
    _getOrCreateLoD3Mesh(gridX, gridZ) {
        const key = `${gridX},${gridZ}`;
        if (this.lod3Meshes.has(key)) {
            return this.lod3Meshes.get(key);
        }

        const mesh = LoDHelper.createLoD3Mesh(gridX, gridZ, this.worldGenerator);
        mesh.userData.lodLevel = 3;

        if (this.lodDebugMode) {
            mesh.material.color.setStyle(LoDHelper.getDebugColor(3));
        }

        this.lod3Meshes.set(key, mesh);

        if (this.worldContainer) {
            this.worldContainer.add(mesh);
        }

        return mesh;
    }

    /**
     * LoD 2/3 メッシュを削除
     */
    _removeLoD2Mesh(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const mesh = this.lod2Meshes.get(key);
        if (mesh) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            this.lod2Meshes.delete(key);
        }
    }

    _removeLoD3Mesh(gridX, gridZ) {
        const key = `${gridX},${gridZ}`;
        const mesh = this.lod3Meshes.get(key);
        if (mesh) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            this.lod3Meshes.delete(key);
        }
    }

    /**
     * 全LoD 2/3メッシュをクリア
     */
    clearLoDMeshes() {
        for (const [key, mesh] of this.lod2Meshes) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.lod2Meshes.clear();

        for (const [key, mesh] of this.lod3Meshes) {
            if (this.worldContainer) {
                this.worldContainer.remove(mesh);
            }
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.lod3Meshes.clear();
    }

    /**
     * LoDデバッグ色を適用/解除
     */
    applyLoDDebugColors() {
        // 通常チャンク（LoD 0/1）
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const lod = this.getChunkLoD(cx, cz);

            if (chunk.mesh && chunk.mesh.material) {
                if (this.lodDebugMode) {
                    // デバッグ色を適用
                    if (!chunk.mesh.material.isShaderMaterial) {
                        // vertexColorsを無効にして単色表示
                        chunk.mesh.material.vertexColors = false;
                        chunk.mesh.material.color.setStyle(LoDHelper.getDebugColor(lod));
                        chunk.mesh.material.needsUpdate = true;
                    }
                } else {
                    // 元の表示に戻す
                    if (!chunk.mesh.material.isShaderMaterial) {
                        // LoD 1 は vertexColors を有効に
                        if (lod === 1) {
                            chunk.mesh.material.vertexColors = true;
                        }
                        chunk.mesh.material.color.setStyle('#FFFFFF');
                        chunk.mesh.material.needsUpdate = true;
                    }
                }
            }
        }

        // LoD 2メッシュ
        for (const [key, mesh] of this.lod2Meshes) {
            if (this.lodDebugMode) {
                mesh.material.vertexColors = false;
                mesh.material.color.setStyle(LoDHelper.getDebugColor(2));
                mesh.material.needsUpdate = true;
            } else {
                mesh.material.vertexColors = true;
                mesh.material.color.setStyle('#FFFFFF');
                mesh.material.needsUpdate = true;
            }
        }

        // LoD 3メッシュ
        for (const [key, mesh] of this.lod3Meshes) {
            if (this.lodDebugMode) {
                mesh.material.vertexColors = false;
                mesh.material.color.setStyle(LoDHelper.getDebugColor(3));
                mesh.material.needsUpdate = true;
            } else {
                mesh.material.vertexColors = true;
                mesh.material.color.setStyle('#FFFFFF');
                mesh.material.needsUpdate = true;
            }
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ChunkManager = ChunkManager;
}
