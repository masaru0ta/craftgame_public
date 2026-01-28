/**
 * ChunkManager - 複数チャンクの管理クラス
 * NxN範囲のチャンクを管理、キュー制御、非同期生成
 */
class ChunkManager {
    constructor(options = {}) {
        this.chunkRange = options.chunkRange || 3; // 描画半径（チャンク数）
        this.worldName = options.worldName || 'world1';

        // 読み込み済みチャンク: Map<"chunkX,chunkZ", { chunkData, mesh, state }>
        this.chunks = new Map();

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
            unloadTimes: [],         // 保存解放時間（ms）
            // LoD処理時間計測用（直近10件）
            lod1GenerateTimes: [],   // LoD1生成時間
            lod1to0Times: [],        // LoD1→0変換時間
            lod0to1Times: [],        // LoD0→1変換時間
            lod1UnloadTimes: []      // LoD1解放時間
        };

        // 現在の視点位置（ワールド座標）
        this.viewX = 0;
        this.viewZ = 0;

        // 同時実行防止フラグ
        this.isUpdatingView = false;

        // LoD設定（2段階のみ）
        this.lod0Range = 3;   // LoD 0の範囲（チャンク数）
        // LoD 0 範囲外は全て LoD 1

        // チャンクキュー（生成・LoD変更を統合）
        this.chunkQueue = [];
        this.chunkQueueKeys = new Set();  // O(1)重複チェック用

        // LoD再生成キュー（フレーム分散用）
        this.lodRebuildQueue = [];
        this.lodRebuildQueueKeys = new Set();  // O(1)重複チェック用

        // アンロードキュー（フレーム分散用）
        this.unloadQueue = [];
        this.unloadQueueKeys = new Set();  // O(1)重複チェック用

        // 統合キュー処理
        this.isProcessingQueues = false;
        this.maxProcessingPerFrame = 1; // 1フレームで処理する最大数（全キュー合計）

        // 前回のチャンク座標（差分処理用）
        this.lastChunkX = null;
        this.lastChunkZ = null;

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
     * 設定変更時はキュー更新を強制
     */
    setChunkRange(n) {
        this.chunkRange = n;
        // 設定変更時はキュー更新を強制
        this.lastChunkX = null;
        this.lastChunkZ = null;
    }

    /**
     * 1フレームで処理する最大数（全キュー合計）を設定
     * 優先度順: LoD再生成 > アンロード > 生成
     * @param {number} n - 上限数
     */
    setMaxProcessingPerFrame(n) {
        this.maxProcessingPerFrame = n;
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

            // チャンク座標が変わっていなければキュー更新をスキップ
            if (this.lastChunkX === center.chunkX && this.lastChunkZ === center.chunkZ) {
                return;
            }

            // チャンク座標を更新
            this.lastChunkX = center.chunkX;
            this.lastChunkZ = center.chunkZ;

            // 必要なチャンクの座標リスト（chunkRange は半径）
            const neededChunks = new Set();

            for (let dx = -this.chunkRange; dx <= this.chunkRange; dx++) {
                for (let dz = -this.chunkRange; dz <= this.chunkRange; dz++) {
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

            // アンロードキューに追加（フレーム分散）
            if (chunksToUnload.length > 0) {
                this._addToUnloadQueue(chunksToUnload);
            }

            // LoD変更を検出し、再生成キューに追加
            // 最適化: LoD0境界のチャンクのみチェック（全チャンクをループしない）
            // LoD0境界 = 距離がlod0Rangeまたはlod0Range+1のチャンク
            for (let d = this.lod0Range; d <= this.lod0Range + 1; d++) {
                // 境界の4辺をチェック
                for (let i = -d; i <= d; i++) {
                    // 上辺と下辺
                    const keys1 = [`${center.chunkX + i},${center.chunkZ + d}`, `${center.chunkX + i},${center.chunkZ - d}`];
                    // 左辺と右辺（角は除く）
                    const keys2 = i !== -d && i !== d ? [`${center.chunkX + d},${center.chunkZ + i}`, `${center.chunkX - d},${center.chunkZ + i}`] : [];

                    for (const key of [...keys1, ...keys2]) {
                        const chunk = this.chunks.get(key);
                        if (chunk && chunk.mesh) {
                            const [cx, cz] = key.split(',').map(Number);
                            const newLoD = this.getChunkLoD(cx, cz);
                            const currentLoD = chunk.mesh.userData.lodLevel;
                            if (currentLoD !== newLoD) {
                                this._addToLoDRebuildQueue(cx, cz, newLoD);
                            }
                        }
                    }
                }
            }

            // 必要なチャンクをキューに追加（LoD0優先でソート）
            const chunksToLoad = [];

            for (const key of neededChunks) {
                // 既にロード済み or キューにある場合はスキップ（O(1)チェック）
                if (!this.chunks.has(key) && !this.chunkQueueKeys.has(key)) {
                    const [cx, cz] = key.split(',').map(Number);
                    const lod = this.getChunkLoD(cx, cz);
                    const distance = Math.abs(cx - center.chunkX) + Math.abs(cz - center.chunkZ);
                    chunksToLoad.push({ key, chunkX: cx, chunkZ: cz, distance, lod });
                }
            }

            // LoD0を先に、LoD1を後に。同じLoDなら距離が近い順
            chunksToLoad.sort((a, b) => {
                if (a.lod !== b.lod) return a.lod - b.lod;
                return a.distance - b.distance;
            });

            // チャンクキューに追加（Set も更新）
            for (const chunk of chunksToLoad) {
                this.chunkQueue.push({ chunkX: chunk.chunkX, chunkZ: chunk.chunkZ, key: chunk.key, lod: chunk.lod });
                this.chunkQueueKeys.add(chunk.key);
            }

            // 統合キュー処理を開始（優先度順: 再生成 > アンロード > 生成）
            this._processQueuesWithPriority();
        } finally {
            this.isUpdatingView = false;
        }
    }

    /**
     * キュー数を取得（高速版：追加時のLoD情報を使用）
     * @returns {{lod0: number, lod1: number}}
     */
    getQueueCounts() {
        let lod0 = 0;
        let lod1 = 0;
        for (const item of this.chunkQueue) {
            // 追加時のLoD情報を使用（視点移動で変わる可能性あるがUI表示用なら許容）
            if (item.lod === 0) lod0++;
            else lod1++;
        }
        return { lod0, lod1 };
    }

    /**
     * LoD再生成キューに追加（O(1)重複チェック）
     */
    _addToLoDRebuildQueue(chunkX, chunkZ, newLoD) {
        const key = `${chunkX},${chunkZ}`;
        // 既にキューにあれば追加しない（O(1)チェック）
        if (!this.lodRebuildQueueKeys.has(key)) {
            this.lodRebuildQueue.push({ chunkX, chunkZ, key, newLoD });
            this.lodRebuildQueueKeys.add(key);
        }
    }

    /**
     * アンロードキューに追加（O(1)重複チェック）
     */
    _addToUnloadQueue(keys) {
        for (const key of keys) {
            if (!this.unloadQueueKeys.has(key)) {
                this.unloadQueue.push(key);
                this.unloadQueueKeys.add(key);
            }
        }
    }

    /**
     * チャンクが描画範囲内かどうかを判定
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {boolean} 範囲内ならtrue
     */
    _isInRange(chunkX, chunkZ) {
        const center = this.worldToChunk(this.viewX, this.viewZ);
        const dx = Math.abs(chunkX - center.chunkX);
        const dz = Math.abs(chunkZ - center.chunkZ);
        return dx <= this.chunkRange && dz <= this.chunkRange;
    }

    /**
     * チャンクキュー処理（遅延評価）
     * 処理時に範囲チェックを行い、範囲外ならスキップ
     */
    async _processChunkQueue() {
        if (this.chunkQueue.length === 0) return;

        const item = this.chunkQueue.shift();

        // 遅延評価：処理時に範囲チェック
        if (!this._isInRange(item.chunkX, item.chunkZ)) {
            // 範囲外なのでスキップ
            return;
        }

        // 既にロード済みならスキップ
        if (this.chunks.has(item.key)) {
            return;
        }

        // チャンク生成
        await this._generateChunk(item.chunkX, item.chunkZ);
    }

    /**
     * フレームタイムバジェットを考慮したキュー処理
     * 指定した時間（ms）内で可能な限り処理を行う
     * @param {number} budgetMs - 処理に使える時間（ミリ秒）
     */
    processQueuesWithBudget(budgetMs) {
        const startTime = performance.now();
        const endTime = startTime + budgetMs;

        // 優先度1: アンロード（軽い処理なので先に片付ける）
        while (this.unloadQueue.length > 0 && performance.now() < endTime) {
            const key = this.unloadQueue.shift();
            this.unloadQueueKeys.delete(key);
            this._unloadChunkSync(key);
        }

        // 優先度2: LoD再生成（重要：視覚的な不整合を防ぐ）
        while (this.lodRebuildQueue.length > 0 && performance.now() < endTime) {
            const item = this.lodRebuildQueue.shift();
            this.lodRebuildQueueKeys.delete(item.key);
            this._rebuildChunkMeshSync(item.chunkX, item.chunkZ, item.newLoD);
        }

        // 優先度3: 生成（遅延評価付き）- 時間が余っている場合のみ
        while (this.chunkQueue.length > 0 && performance.now() < endTime) {
            const item = this.chunkQueue.shift();
            this.chunkQueueKeys.delete(item.key);

            // 遅延評価：処理時に範囲チェック
            if (!this._isInRange(item.chunkX, item.chunkZ)) {
                continue;
            }

            // 既にロード済みならスキップ
            if (this.chunks.has(item.key)) {
                continue;
            }

            // 同期生成（awaitなし）
            this._generateChunkSync(item.chunkX, item.chunkZ);
        }
    }

    /**
     * 統合キュー処理（優先度順: 再生成 > アンロード > 生成）
     * 1フレームで最大 maxProcessingPerFrame 個の処理を行う
     */
    _processQueuesWithPriority() {
        if (this.isProcessingQueues) return;

        const hasWork = this.lodRebuildQueue.length > 0 ||
                       this.unloadQueue.length > 0 ||
                       this.chunkQueue.length > 0;

        if (!hasWork) return;

        this.isProcessingQueues = true;

        let processed = 0;

        // 優先度1: LoD再生成（LoD0を正しく維持するため移動中も処理）
        while (this.lodRebuildQueue.length > 0 && processed < this.maxProcessingPerFrame) {
            const item = this.lodRebuildQueue.shift();
            this.lodRebuildQueueKeys.delete(item.key);
            this._rebuildChunkMeshSync(item.chunkX, item.chunkZ, item.newLoD);
            processed++;
        }

        // 優先度2: アンロード
        while (this.unloadQueue.length > 0 && processed < this.maxProcessingPerFrame) {
            const key = this.unloadQueue.shift();
            this.unloadQueueKeys.delete(key);
            this._unloadChunkSync(key);
            processed++;
        }

        // 優先度3: 生成（遅延評価付き、同期版を使用）
        while (this.chunkQueue.length > 0 && processed < this.maxProcessingPerFrame) {
            const item = this.chunkQueue.shift();
            this.chunkQueueKeys.delete(item.key);

            // 遅延評価：処理時に範囲チェック
            if (!this._isInRange(item.chunkX, item.chunkZ)) {
                continue;
            }

            // 既にロード済みならスキップ
            if (this.chunks.has(item.key)) {
                continue;
            }

            // 同期版を使用（ストレージ読み込みなし）
            this._generateChunkSync(item.chunkX, item.chunkZ);
            processed++;
        }

        this.isProcessingQueues = false;

        // キューが残っている場合は次のフレームで継続
        if (this.lodRebuildQueue.length > 0 ||
            this.unloadQueue.length > 0 ||
            this.chunkQueue.length > 0) {
            requestAnimationFrame(() => this._processQueuesWithPriority());
        }
    }

    /**
     * チャンクを同期生成（ストレージ読み込みなし）
     * フレームタイムバジェット用の軽量版
     */
    _generateChunkSync(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;

        // 既にロード済みなら何もしない
        if (this.chunks.has(key)) return;

        // 処理時間計測開始
        const startTime = performance.now();

        // コールバック: 生成開始
        if (this.onChunkGenerating) {
            this.onChunkGenerating(chunkX, chunkZ);
        }

        // 新規生成のみ（ストレージ読み込みなし）
        const chunkData = new ChunkData(chunkX, chunkZ);
        this.worldGenerator.generate(chunkData);
        this.stats.newGenerated++;

        // LoDレベルを取得
        const lodLevel = this.getChunkLoD(chunkX, chunkZ);

        // メッシュ生成（LoDレベルに応じて）
        let mesh;
        const mode = this.useCulling !== false ? 'CULLED' : 'FULL';

        if (lodLevel === 0) {
            // LoD 0: フルテクスチャ
            mesh = this.meshBuilder.build(chunkData, mode, this.useGreedy || false);
        } else {
            // LoD 1: 頂点カラー
            mesh = this.meshBuilder.buildLoD1(chunkData, this.blockColors, this.blockShapes, this.useGreedy || false);
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

        // 処理時間計測終了
        const elapsed = performance.now() - startTime;
        this._recordTime(this.stats.newGenerateTimes, elapsed);

        // LoD1生成時間を別途記録
        if (lodLevel === 1) {
            this._recordTime(this.stats.lod1GenerateTimes, elapsed);
        }

        // コールバック: 生成完了
        if (this.onChunkGenerated) {
            this.onChunkGenerated(chunkX, chunkZ, chunkData, false);
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
        } else {
            // LoD 1: 頂点カラー
            mesh = this.meshBuilder.buildLoD1(chunkData, this.blockColors, this.blockShapes, this.useGreedy || false);
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

        // LoD1生成時間を別途記録
        if (lodLevel === 1) {
            this._recordTime(this.stats.lod1GenerateTimes, elapsed);
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
        this._unloadChunkSync(key);
    }

    /**
     * チャンクをアンロード（同期版）
     */
    _unloadChunkSync(key) {
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // 処理時間計測開始
        const startTime = performance.now();

        // アンロード前のLoDレベルを記録
        const lodLevel = chunk.mesh ? chunk.mesh.userData.lodLevel : null;

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

        // 処理時間計測終了（直近10件を保持）
        const elapsed = performance.now() - startTime;
        this._recordTime(this.stats.unloadTimes, elapsed);

        // LoD1解放時間を別途記録
        if (lodLevel === 1) {
            this._recordTime(this.stats.lod1UnloadTimes, elapsed);
        }

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
        return this.isProcessingQueues ? 1 : 0;
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
     * LoD処理時間の平均を取得（直近10チャンク）
     * @returns {{lod1Generate: number|null, lod1to0: number|null, lod0to1: number|null, lod1Unload: number|null}}
     */
    getLoDProcessingTimes() {
        const avg = (arr) => arr.length > 0
            ? arr.reduce((a, b) => a + b, 0) / arr.length
            : null;

        return {
            lod1Generate: avg(this.stats.lod1GenerateTimes),
            lod1to0: avg(this.stats.lod1to0Times),
            lod0to1: avg(this.stats.lod0to1Times),
            lod1Unload: avg(this.stats.lod1UnloadTimes)
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
        this._rebuildChunkMeshSync(chunkX, chunkZ, newLoD);
    }

    /**
     * 単一チャンクのメッシュを再生成（同期版）
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @param {number} newLoD - 新しいLoDレベル
     */
    _rebuildChunkMeshSync(chunkX, chunkZ, newLoD) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // 処理時間計測開始
        const startTime = performance.now();

        // 変換前のLoDレベルを記録
        const oldLoD = chunk.mesh ? chunk.mesh.userData.lodLevel : null;

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
        } else {
            // LoD 1: 頂点カラー
            mesh = this.meshBuilder.buildLoD1(chunk.chunkData, this.blockColors, this.blockShapes, this.useGreedy || false);
        }

        mesh.position.x = chunkX * ChunkData.SIZE_X;
        mesh.position.z = chunkZ * ChunkData.SIZE_Z;
        mesh.userData.lodLevel = newLoD;
        mesh.name = `chunk_${chunkX}_${chunkZ}`;

        if (this.worldContainer) {
            this.worldContainer.add(mesh);
        }

        chunk.mesh = mesh;

        // 処理時間計測終了
        const elapsed = performance.now() - startTime;
        if (oldLoD === 1 && newLoD === 0) {
            this._recordTime(this.stats.lod1to0Times, elapsed);
        } else if (oldLoD === 0 && newLoD === 1) {
            this._recordTime(this.stats.lod0to1Times, elapsed);
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

        // キューをクリア
        this.chunkQueue = [];
        this.chunkQueueKeys.clear();
        this.lodRebuildQueue = [];
        this.lodRebuildQueueKeys.clear();
        this.unloadQueue = [];
        this.unloadQueueKeys.clear();

        // チャンク座標をリセット
        this.lastChunkX = null;
        this.lastChunkZ = null;
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
     * LoD 0 範囲を設定
     * 設定変更時はキュー更新を強制
     * @param {number} range - LoD 0の範囲（チャンク数）
     */
    setLoD0Range(range) {
        this.lod0Range = range;
        // 設定変更時はキュー更新を強制
        this.lastChunkX = null;
        this.lastChunkZ = null;
    }

    /**
     * チャンクのLoDレベルを取得
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {number} LoDレベル（0または1）
     */
    getChunkLoD(chunkX, chunkZ) {
        const center = this.worldToChunk(this.viewX, this.viewZ);
        // チェビシェフ距離（最大座標差）
        const distance = Math.max(
            Math.abs(chunkX - center.chunkX),
            Math.abs(chunkZ - center.chunkZ)
        );

        if (distance <= this.lod0Range) return 0;
        return 1;
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
     * @returns {{lod0: number, lod1: number}}
     */
    getLoDCounts() {
        const counts = { lod0: 0, lod1: 0 };

        for (const [key, chunk] of this.chunks) {
            if (chunk.mesh && chunk.mesh.userData.lodLevel !== undefined) {
                if (chunk.mesh.userData.lodLevel === 0) {
                    counts.lod0++;
                } else {
                    counts.lod1++;
                }
            }
        }

        return counts;
    }

    /**
     * LoDデバッグ色を適用/解除
     */
    applyLoDDebugColors() {
        for (const [key, chunk] of this.chunks) {
            if (chunk.mesh && chunk.mesh.material) {
                const lod = chunk.mesh.userData.lodLevel;

                if (this.lodDebugMode) {
                    // デバッグ色を適用
                    if (!chunk.mesh.material.isShaderMaterial) {
                        chunk.mesh.material.vertexColors = false;
                        chunk.mesh.material.color.setStyle(LoDHelper.getDebugColor(lod));
                        chunk.mesh.material.needsUpdate = true;
                    }
                } else {
                    // 元の表示に戻す
                    if (!chunk.mesh.material.isShaderMaterial) {
                        if (lod === 1) {
                            chunk.mesh.material.vertexColors = true;
                        }
                        chunk.mesh.material.color.setStyle('#FFFFFF');
                        chunk.mesh.material.needsUpdate = true;
                    }
                }
            }
        }
    }

}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ChunkManager = ChunkManager;
}
