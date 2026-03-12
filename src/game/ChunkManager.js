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

        // 変更済みチャンクのメモリキャッシュ（同期ロード用）
        // Map<"chunkX,chunkZ", serializedData>
        this.modifiedChunkCache = new Map();

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

        // チャンク生成キュー（視点移動時に丸ごと作り直し）
        this.chunkQueue = [];

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

        // ライト計算
        this.lightCalculator = typeof LightCalculator !== 'undefined' ? new LightCalculator() : null;

        // AO有効/無効
        this.aoEnabled = true;

        // LoDデバッグモード
        this.lodDebugMode = false;

        // LoD1品質設定
        this.lod1AoEnabled = true;
        this.lod1LightEnabled = true;
        this.lod1TextureEnabled = false;

        // リージョンメッシュ統合（LoD1 draw calls削減）
        this.regionSize = 8;  // リージョンあたりのチャンク数（1辺）
        this.regionMeshes = new Map();   // "rx,rz" → { normalMesh, waterMesh, chunkKeys: Set }
        this.dirtyRegions = new Set();   // 統合(merge)または分解(unmerge)の再評価が必要なリージョンキー
        this._regionNormalMaterial = null;
        this._regionWaterMaterial = null;

        // リージョンメッシュキャッシュ
        this.cachedRegionKeys = new Set();
        this._restoringRegions = new Set(); // 復元中のリージョン（二重復元防止）
    }

    /**
     * 初期化
     */
    async init(textureLoader, worldContainer) {
        this.textureLoader = textureLoader;
        this.meshBuilder = new ChunkMeshBuilder(textureLoader);
        this.worldContainer = worldContainer;
        await this.storage.open();

        // IndexedDB保存済みチャンクをメモリキャッシュにプリロード
        try {
            const stored = await this.storage.loadAll(this.worldName);
            for (const [key, data] of stored) {
                this.modifiedChunkCache.set(key, data);
            }
        } catch (e) {
            console.error('Failed to preload chunks from IndexedDB:', e);
        }

        // リージョンキャッシュキーをロード
        try {
            const regionKeys = await this.storage.loadAllRegionKeys(this.worldName);
            for (const key of regionKeys) {
                this.cachedRegionKeys.add(key);
            }
        } catch (e) {
            console.error('Failed to load region cache keys:', e);
        }
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

            const centerCX = center.chunkX;
            const centerCZ = center.chunkZ;
            const range = this.chunkRange;
            const lod0Range = this.lod0Range;

            // 範囲外のチャンクをアンロード（数値比較のみ、Set不要）
            const chunksToUnload = [];
            for (const key of this.chunks.keys()) {
                const chunk = this.chunks.get(key);
                if (!chunk) {
                    chunksToUnload.push(key);
                    continue;
                }

                // cached状態チャンク: chunkDataはnullだがリージョンメッシュで表示中
                // 範囲外のみアンロード（キーから座標をパース）
                if (chunk.state === 'cached') {
                    const [cx, cz] = key.split(',').map(Number);
                    if (Math.abs(cx - centerCX) > range || Math.abs(cz - centerCZ) > range) {
                        chunksToUnload.push(key);
                    }
                    continue;
                }

                if (!chunk.chunkData) {
                    chunksToUnload.push(key);
                    continue;
                }
                const cx = chunk.chunkData.chunkX;
                const cz = chunk.chunkData.chunkZ;
                if (Math.abs(cx - centerCX) > range || Math.abs(cz - centerCZ) > range) {
                    chunksToUnload.push(key);
                }
            }

            // アンロードキューに追加（フレーム分散）
            if (chunksToUnload.length > 0) {
                this._addToUnloadQueue(chunksToUnload);
            }

            // LoD変更を検出し、再生成キューに追加
            // 全ロード済みチャンクをスキャンしてLoD不一致を検出
            const cachedToLod0 = [];
            for (const [key, chunk] of this.chunks) {
                if (chunk && chunk.mesh) {
                    const cx = chunk.chunkData.chunkX;
                    const cz = chunk.chunkData.chunkZ;
                    this._checkLoDChange(cx, cz, centerCX, centerCZ, lod0Range);
                } else if (chunk && chunk.state === 'cached') {
                    // cached状態チャンクがLoD0範囲に入った場合、個別生成が必要
                    const [cx, cz] = key.split(',').map(Number);
                    if (Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ)) <= lod0Range) {
                        cachedToLod0.push(key);
                    }
                }
            }
            // cached→LoD0: リージョンメッシュは保持（個別チャンクが揃うまで表示し続ける）
            // cachedチャンクのみ削除して再生成キューに回す
            const regionsToInvalidate = new Set();
            for (const key of cachedToLod0) {
                const [cx, cz] = key.split(',').map(Number);
                regionsToInvalidate.add(this._getRegionKey(cx, cz));
            }
            for (const regionKey of regionsToInvalidate) {
                this._clearCachedChunksForRegeneration(regionKey);
                this.dirtyRegions.add(regionKey);
            }

            // キューを丸ごと作り直し（現在位置基準で常に正しい優先度を保証）
            const chunksToLoad = [];
            const regionsToRestore = new Set(); // キャッシュ復元が必要なリージョン

            for (let dx = -range; dx <= range; dx++) {
                for (let dz = -range; dz <= range; dz++) {
                    const cx = centerCX + dx;
                    const cz = centerCZ + dz;
                    const key = `${cx},${cz}`;
                    // 未ロードのチャンクのみ対象
                    if (!this.chunks.has(key)) {
                        const dist = Math.max(Math.abs(dx), Math.abs(dz));
                        const lod = dist <= lod0Range ? 0 : 1;

                        // LoD1かつキャッシュ済み非境界リージョンならキュー追加せずcached状態で登録
                        // 境界リージョン（LoD0範囲と重なる）は個別生成が必要なのでスキップ
                        if (lod === 1) {
                            const rx = Math.floor(cx / this.regionSize);
                            const rz = Math.floor(cz / this.regionSize);
                            const regionKey = `${rx},${rz}`;
                            if (this.cachedRegionKeys.has(regionKey) && !this._isBoundaryRegion(rx, rz)) {
                                this.chunks.set(key, { chunkData: null, mesh: null, state: 'cached' });
                                // リージョンメッシュが未表示かつ復元中でなければ復元キューに追加
                                if (!this.regionMeshes.has(regionKey) && !this._restoringRegions.has(regionKey)) {
                                    regionsToRestore.add(regionKey);
                                }
                                continue;
                            }
                        }

                        const distance = Math.abs(dx) + Math.abs(dz);
                        chunksToLoad.push({ key, chunkX: cx, chunkZ: cz, distance, lod });
                    }
                }
            }

            // キャッシュ済みリージョンを非同期復元
            for (const regionKey of regionsToRestore) {
                this._restoreRegionFromCache(regionKey);
            }

            // LoD0を先に、LoD1を後に。同じLoDなら距離が近い順
            chunksToLoad.sort((a, b) => {
                if (a.lod !== b.lod) return a.lod - b.lod;
                return a.distance - b.distance;
            });

            // キューを置き換え（追加ではなく全入替）
            this.chunkQueue = chunksToLoad;
            // キュー処理はanimate()から毎フレーム呼び出される
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
     * 単一チャンクのLoD変更を検出し、必要なら再生成キューに追加
     * @param {number} cx - チャンクX座標
     * @param {number} cz - チャンクZ座標
     * @param {number} centerCX - 視点チャンクX
     * @param {number} centerCZ - 視点チャンクZ
     * @param {number} lod0Range - LoD0範囲
     */
    _checkLoDChange(cx, cz, centerCX, centerCZ, lod0Range) {
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (chunk && chunk.mesh) {
            const dist = Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ));
            const newLoD = dist <= lod0Range ? 0 : 1;
            if (chunk.mesh.userData.lodLevel !== newLoD) {
                this._addToLoDRebuildQueue(cx, cz);
            }
        }
    }

    /**
     * LoD再生成キューに追加（O(1)重複チェック）
     * 注: newLoDは保持しない。処理時にgetChunkLoD()で再計算する（stale newLoD対策）
     */
    _addToLoDRebuildQueue(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (!this.lodRebuildQueueKeys.has(key)) {
            this.lodRebuildQueue.push({ chunkX, chunkZ, key });
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
        // lastChunkX/Zはキュー更新時にキャッシュ済み
        if (this.lastChunkX === null) return false;
        const dx = Math.abs(chunkX - this.lastChunkX);
        const dz = Math.abs(chunkZ - this.lastChunkZ);
        return dx <= this.chunkRange && dz <= this.chunkRange;
    }

    /**
     * 処理すべきキューがあるか判定（新しいキュー追加時はここにも追加すること）
     */
    _hasWorkToDo() {
        return this.lodRebuildQueue.length > 0 ||
               this.unloadQueue.length > 0 ||
               this.chunkQueue.length > 0 ||
               this.dirtyRegions.size > 0;
    }

    /**
     * 統合キュー処理（優先度順: 再生成 > アンロード > 生成）
     * 1フレームで最大 maxProcessingPerFrame 個の処理を行う
     */
    _processQueuesWithPriority() {
        if (this.isProcessingQueues) return;
        if (!this._hasWorkToDo()) return;

        this.isProcessingQueues = true;

        let processed = 0;

        // 優先度1: LoD再生成（処理時点で正しいLoDを再計算）
        while (this.lodRebuildQueue.length > 0 && processed < this.maxProcessingPerFrame) {
            const item = this.lodRebuildQueue.shift();
            this.lodRebuildQueueKeys.delete(item.key);
            // 処理時点で正しいLoDを再計算（エントリのnewLoDは使わない）
            const correctLoD = this.getChunkLoD(item.chunkX, item.chunkZ);
            const chunk = this.chunks.get(item.key);
            if (chunk && chunk.mesh && chunk.mesh.userData.lodLevel !== correctLoD) {
                this._rebuildChunkMeshSync(item.chunkX, item.chunkZ, correctLoD);
            }
            processed++;
        }

        // 優先度2: 生成（遅延評価付き、同期版を使用）
        while (this.chunkQueue.length > 0 && processed < this.maxProcessingPerFrame) {
            const item = this.chunkQueue.shift();

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

        // 優先度3: アンロード（軽量なので最大100チャンク/フレーム）
        const maxUnloadPerFrame = 100;
        let unloaded = 0;
        while (this.unloadQueue.length > 0 && unloaded < maxUnloadPerFrame) {
            const key = this.unloadQueue.shift();
            this.unloadQueueKeys.delete(key);
            this._unloadChunkSync(key);
            unloaded++;
        }

        // 優先度4: リージョンメッシュ統合（1フレーム1リージョン）
        this._processRegionMerges();

        this.isProcessingQueues = false;
    }

    /**
     * チャンクを同期生成（メモリキャッシュから復元 or 新規生成）
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

        // 変更済みキャッシュから復元、なければ新規生成
        let chunkData;
        const cached = this.modifiedChunkCache.get(key);
        if (cached) {
            chunkData = ChunkData.fromSerializedData(chunkX, chunkZ, cached);
            this.stats.loadedFromStorage++;
        } else {
            chunkData = new ChunkData(chunkX, chunkZ);
            this.worldGenerator.generate(chunkData);
            this.stats.newGenerated++;
        }

        // 隣接チャンク情報を取得（ライトマップ計算＆面カリング共用）
        const neighborChunks = this._getNeighborChunks(chunkX, chunkZ);

        // ライトマップ計算
        if (this.lightCalculator) {
            this.lightCalculator.calculate(chunkData, neighborChunks);
        }

        // LoDレベルを取得（キャッシュ済み座標でインライン計算）
        const dist = Math.max(Math.abs(chunkX - this.lastChunkX), Math.abs(chunkZ - this.lastChunkZ));
        const lodLevel = dist <= this.lod0Range ? 0 : 1;

        // メッシュ生成
        const chunkGroup = this._buildChunkGroup(chunkData, lodLevel, neighborChunks);

        // シーンに追加
        if (this.worldContainer) {
            const regionKey = this._getRegionKey(chunkX, chunkZ);
            if (this.regionMeshes.has(regionKey)) {
                // リージョンメッシュ表示中: 個別メッシュはシーンに追加しない（二重表示防止）
                // チャンクが揃い次第 _processRegionMerges で一括切り替え
                this.dirtyRegions.add(regionKey);
            } else if (lodLevel === 0 || this._isBoundaryRegion(
                Math.floor(chunkX / this.regionSize),
                Math.floor(chunkZ / this.regionSize)
            )) {
                this.worldContainer.add(chunkGroup);
            }
        }

        // 登録
        this.chunks.set(key, {
            chunkData,
            mesh: chunkGroup,
            state: 'active'
        });

        // 処理時間計測終了
        const elapsed = performance.now() - startTime;
        this._recordTime(this.stats.newGenerateTimes, elapsed);

        // LoD1生成時間を別途記録
        if (lodLevel === 1) {
            this._recordTime(this.stats.lod1GenerateTimes, elapsed);
        }

        // 隣接チャンクの境界面カリング更新:
        // このチャンクが生成されたことで4方向の隣接チャンクが全て揃ったチャンクを再構築
        this._rebuildNeighborsIfComplete(chunkX, chunkZ);

        // リージョン統合: LoD1チャンク生成時にdirtyマーク
        if (lodLevel === 1) {
            this._markRegionDirty(chunkX, chunkZ);
        }

        // コールバック: 生成完了
        if (this.onChunkGenerated) {
            this.onChunkGenerated(chunkX, chunkZ, chunkData, false);
        }
    }

    /**
     * チャンクをアンロード（同期版）
     */
    _unloadChunkSync(key) {
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // cached状態チャンク: 個別メッシュがないためリージョン無効化せず削除のみ
        if (chunk.state === 'cached') {
            this.chunks.delete(key);
            // リージョン内のcachedチャンクが全てなくなったらリージョンメッシュ除去
            const [cx, cz] = key.split(',').map(Number);
            const regionKey = this._getRegionKey(cx, cz);
            const regionData = this.regionMeshes.get(regionKey);
            if (regionData) {
                const anyRemaining = [...regionData.chunkKeys].some(k => this.chunks.has(k));
                if (!anyRemaining) {
                    if (regionData.normalMesh) {
                        this.worldContainer.remove(regionData.normalMesh);
                        regionData.normalMesh.geometry.dispose();
                    }
                    if (regionData.waterMesh) {
                        this.worldContainer.remove(regionData.waterMesh);
                        regionData.waterMesh.geometry.dispose();
                    }
                    this.regionMeshes.delete(regionKey);
                }
            }
            return;
        }

        // 処理時間計測開始
        const startTime = performance.now();

        // アンロード前のLoDレベルを記録
        const lodLevel = chunk.mesh ? chunk.mesh.userData.lodLevel : null;

        const [chunkX, chunkZ] = key.split(',').map(Number);

        // リージョン統合: アンロード前にリージョン無効化
        this._unmergeRegion(this._getRegionKey(chunkX, chunkZ));

        // メッシュをシーンから削除
        if (this.worldContainer && chunk.mesh) {
            this.worldContainer.remove(chunk.mesh);
            this._disposeObject(chunk.mesh);
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
            if (chunk.mesh) {
                this._setWireframeRecursive(chunk.mesh, enabled);
            }
        }
        // リージョンメッシュにも適用
        for (const regionData of this.regionMeshes.values()) {
            if (regionData.normalMesh) regionData.normalMesh.material.wireframe = enabled;
            if (regionData.waterMesh) regionData.waterMesh.material.wireframe = enabled;
        }
    }

    /**
     * オブジェクトとその子に再帰的にワイヤーフレームを設定
     * @private
     */
    _setWireframeRecursive(obj, enabled) {
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.wireframe = enabled);
            } else {
                obj.material.wireframe = enabled;
            }
        }
        if (obj.children) {
            for (const child of obj.children) {
                this._setWireframeRecursive(child, enabled);
            }
        }
    }

    /**
     * 全チャンクのメッシュを再生成
     */
    rebuildAllMeshes() {
        // 全リージョンメッシュを先に無効化（強制）
        for (const regionKey of [...this.regionMeshes.keys()]) {
            this._unmergeRegion(regionKey, true);
        }

        // AOフラグをビルダーに反映
        if (this.meshBuilder) this.meshBuilder.aoEnabled = this.aoEnabled;

        for (const [key, chunk] of this.chunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const lodLevel = this.getChunkLoD(chunkX, chunkZ);

            // 古いメッシュを削除
            if (this.worldContainer && chunk.mesh) {
                this.worldContainer.remove(chunk.mesh);
                this._disposeObject(chunk.mesh);
            }

            // 新しいメッシュを生成
            const neighborChunks = this._getNeighborChunks(chunkX, chunkZ);
            const chunkGroup = this._buildChunkGroup(chunk.chunkData, lodLevel, neighborChunks);

            if (this.worldContainer) {
                const regionKey = this._getRegionKey(chunkX, chunkZ);
                if (this.regionMeshes.has(regionKey)) {
                    this.dirtyRegions.add(regionKey);
                } else if (lodLevel === 0 || this._isBoundaryRegion(
                    Math.floor(chunkX / this.regionSize),
                    Math.floor(chunkZ / this.regionSize)
                )) {
                    this.worldContainer.add(chunkGroup);
                }
            }

            chunk.mesh = chunkGroup;

            // LoD1チャンクのリージョンをdirtyマーク
            if (lodLevel === 1) {
                this._markRegionDirty(chunkX, chunkZ);
            }
        }
    }

    /**
     * 単一チャンクのメッシュを再生成（公開メソッド）
     * 現在のLoDレベルを維持してメッシュを再構築
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     */
    rebuildChunkMesh(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        if (!chunk || !chunk.chunkData) return;

        // 現在のLoDレベルを取得
        const currentLoD = chunk.mesh ? (chunk.mesh.userData.lodLevel || 0) : 0;
        this._rebuildChunkMeshSync(chunkX, chunkZ, currentLoD);
    }

    /**
     * ワールド座標の配列から影響チャンク（境界隣接含む）をまとめて再構築
     * ブロック設置・破壊・移動など、チャンクデータ変更後に呼ぶ共通メソッド。
     * 面カリング・AO・ライティングの隣接チャンク更新漏れを防ぐ。
     * @param {Array<[number, number, number]>} worldPositions - [wx, wy, wz] の配列
     * @param {Set<string>} [extraChunks] - ライトマップ等で既に判明している追加チャンク ("cx,cz" の Set)
     */
    rebuildChunksAtPositions(worldPositions, extraChunks = null) {
        const affected = new Set();
        for (const [wx, , wz] of worldPositions) {
            const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
            affected.add(`${cx},${cz}`);
            const lx = ((wx % 16) + 16) % 16;
            const lz = ((wz % 16) + 16) % 16;
            if (lx === 0)  affected.add(`${cx - 1},${cz}`);
            if (lx === 15) affected.add(`${cx + 1},${cz}`);
            if (lz === 0)  affected.add(`${cx},${cz - 1}`);
            if (lz === 15) affected.add(`${cx},${cz + 1}`);
        }
        if (extraChunks) {
            for (const key of extraChunks) affected.add(key);
        }
        for (const key of affected) {
            const [cx, cz] = key.split(',').map(Number);
            this.rebuildChunkMesh(cx, cz);
        }
    }

    /**
     * 新チャンク生成時、隣接チャンクのうち4方向全て揃ったものを再構築
     * チャンク境界の面カリング・AO を正確にするための遅延再構築。
     * @param {number} newCX - 新しく生成されたチャンクX
     * @param {number} newCZ - 新しく生成されたチャンクZ
     */
    _rebuildNeighborsIfComplete(newCX, newCZ) {
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dx, dz] of offsets) {
            const nx = newCX + dx, nz = newCZ + dz;
            const neighborChunk = this.chunks.get(`${nx},${nz}`);
            if (!neighborChunk || !neighborChunk.chunkData) continue;
            // このチャンクの4方向が全て揃っているかチェック
            let allPresent = true;
            for (const [dx2, dz2] of offsets) {
                if (!this.chunks.has(`${nx + dx2},${nz + dz2}`)) {
                    allPresent = false;
                    break;
                }
            }
            if (allPresent) {
                this.rebuildChunkMesh(nx, nz);
            }
        }
    }

    /**
     * チャンクメッシュ（通常＋カスタム＋水）をグループとして生成
     * @param {ChunkData} chunkData
     * @param {number} lodLevel
     * @param {Map} neighborChunks
     * @returns {THREE.Group}
     * @private
     */
    _buildChunkGroup(chunkData, lodLevel, neighborChunks) {
        const mode = this.useCulling !== false ? 'CULLED' : 'FULL';
        let normalMesh;

        if (lodLevel === 0 || (lodLevel === 1 && this.lod1TextureEnabled)) {
            normalMesh = this.meshBuilder.build(chunkData, mode, this.useGreedy || false, neighborChunks);
        } else {
            // LoD1品質設定をmeshBuilderに反映
            this.meshBuilder.lod1AoEnabled = this.lod1AoEnabled;
            this.meshBuilder.lod1LightEnabled = this.lod1LightEnabled;
            normalMesh = this.meshBuilder.buildLoD1(chunkData, this.blockColors, this.blockShapes, this.useGreedy || false, neighborChunks);
        }

        const chunkGroup = new THREE.Group();
        chunkGroup.add(normalMesh);

        // カスタムブロックはアトラスメッシュに統合済み（normalMeshに含まれる）

        // 水メッシュを追加（LoD0/LoD1共通、同じ色・同じ描画パス）
        if (this.meshBuilder) {
            const colorData = this.blockColors && this.blockColors['water'];
            const waterColor = typeof colorData === 'string' ? colorData
                : (typeof colorData === 'object' && colorData !== null ? (colorData.top || colorData.front) : undefined);
            const waterMesh = this.meshBuilder.buildWaterMesh(chunkData, neighborChunks, waterColor ? { waterColor } : {});
            if (waterMesh) {
                waterMesh.renderOrder = 1;
                chunkGroup.add(waterMesh);
            }
        }

        chunkGroup.position.x = chunkData.chunkX * ChunkData.SIZE_X;
        chunkGroup.position.y = chunkData.baseY;
        chunkGroup.position.z = chunkData.chunkZ * ChunkData.SIZE_Z;
        chunkGroup.userData.lodLevel = lodLevel;
        chunkGroup.name = `chunk_${chunkData.chunkX}_${chunkData.chunkZ}`;

        return chunkGroup;
    }

    /**
     * 単一チャンクのメッシュを再生成（LoD変更時）
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @param {number} newLoD - 新しいLoDレベル
     */
    _rebuildChunkMeshSync(chunkX, chunkZ, newLoD) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        // AOフラグをビルダーに反映
        if (this.meshBuilder) this.meshBuilder.aoEnabled = this.aoEnabled;

        // 処理時間計測開始
        const startTime = performance.now();

        // 変換前のLoDレベルを記録
        const oldLoD = chunk.mesh ? chunk.mesh.userData.lodLevel : null;

        // 古いメッシュを削除
        if (this.worldContainer && chunk.mesh) {
            this.worldContainer.remove(chunk.mesh);
            this._disposeObject(chunk.mesh);
        }

        // 新しいLoDレベルでメッシュを生成
        const neighborChunks = this._getNeighborChunks(chunkX, chunkZ);
        const chunkGroup = this._buildChunkGroup(chunk.chunkData, newLoD, neighborChunks);

        if (this.worldContainer) {
            // LoD変更時は常にシーンに追加（メッシュ無し状態を防ぐ）
            this.worldContainer.add(chunkGroup);
        }

        chunk.mesh = chunkGroup;

        // 処理時間計測終了
        const elapsed = performance.now() - startTime;
        if (oldLoD === 1 && newLoD === 0) {
            this._recordTime(this.stats.lod1to0Times, elapsed);
        } else if (oldLoD === 0 && newLoD === 1) {
            this._recordTime(this.stats.lod0to1Times, elapsed);
        }

        // リージョン統合: LoD変更時の管理
        if (newLoD === 0) {
            // LoD0化 → リージョンを即座に無効化
            this._unmergeRegion(this._getRegionKey(chunkX, chunkZ));
        }
        // 境界状態変化の再評価のため常にdirtyマーク
        this._markRegionDirty(chunkX, chunkZ);
    }

    /**
     * オブジェクトを再帰的に破棄
     * @private
     */
    _disposeObject(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
        if (obj.children) {
            for (const child of obj.children) {
                this._disposeObject(child);
            }
        }
    }

    /**
     * 全チャンクをアンロード
     */
    unloadAll() {
        const keys = Array.from(this.chunks.keys());
        for (const key of keys) {
            this._unloadChunkSync(key);
        }
    }

    /**
     * ワールド設定からハッシュ文字列を生成（キャッシュ無効化用）
     */
    getConfigHash() {
        const config = {
            worldType: this.worldGenerator.worldType || 'default',
            blockColors: this.blockColors,
            lod1AoEnabled: this.lod1AoEnabled,
            lod1LightEnabled: this.lod1LightEnabled
        };
        const str = JSON.stringify(config);
        // シンプルなハッシュ（djb2）
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
        }
        return hash.toString(36);
    }

    /**
     * ストレージをクリア（リージョンキャッシュも削除）
     */
    async clearStorage() {
        await this.storage.clear(this.worldName);
        await this.storage.clearRegions(this.worldName);
        this.cachedRegionKeys.clear();
    }

    /**
     * 全チャンクをクリア（メモリ上のみ、ストレージは別途クリア）
     */
    async clearAllChunks() {
        // 全リージョンメッシュを破棄
        for (const regionKey of [...this.regionMeshes.keys()]) {
            this._unmergeRegion(regionKey, true);
        }
        this.dirtyRegions.clear();

        // 全チャンクをアンロード
        for (const [key, chunk] of this.chunks) {
            if (chunk && chunk.mesh && this.worldContainer) {
                this.worldContainer.remove(chunk.mesh);
                this._disposeObject(chunk.mesh);
            }
        }
        this.chunks.clear();

        // キューをクリア
        this.chunkQueue = [];
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
    // リージョンメッシュ統合（LoD1 draw calls削減）
    // ========================================

    /**
     * チャンク座標からリージョンキーを取得
     * @param {number} cx - チャンクX座標
     * @param {number} cz - チャンクZ座標
     * @returns {string} "rx,rz"
     */
    _getRegionKey(cx, cz) {
        const rx = Math.floor(cx / this.regionSize);
        const rz = Math.floor(cz / this.regionSize);
        return `${rx},${rz}`;
    }

    /**
     * リージョンをdirtyマーク（統合再評価が必要）
     * @param {number} cx - チャンクX座標
     * @param {number} cz - チャンクZ座標
     */
    _markRegionDirty(cx, cz) {
        this.dirtyRegions.add(this._getRegionKey(cx, cz));
    }

    /**
     * リージョンが境界リージョン（LoD0範囲と重なる）かどうか判定
     * 境界リージョンではLoD1チャンクを個別描画する
     * @param {number} rx - リージョンX座標
     * @param {number} rz - リージョンZ座標
     * @returns {boolean} LoD0範囲と重なればtrue
     */
    _isBoundaryRegion(rx, rz) {
        const minCX = rx * this.regionSize;
        const maxCX = minCX + this.regionSize - 1;
        const minCZ = rz * this.regionSize;
        const maxCZ = minCZ + this.regionSize - 1;

        // キャッシュ済みチャンク座標を使用（worldToChunk呼び出し不要）
        const centerCX = this.lastChunkX !== null ? this.lastChunkX : Math.floor(this.viewX / ChunkData.SIZE_X);
        const centerCZ = this.lastChunkZ !== null ? this.lastChunkZ : Math.floor(this.viewZ / ChunkData.SIZE_Z);
        const lod0MinX = centerCX - this.lod0Range;
        const lod0MaxX = centerCX + this.lod0Range;
        const lod0MinZ = centerCZ - this.lod0Range;
        const lod0MaxZ = centerCZ + this.lod0Range;

        // LoD0範囲のAABBとリージョン範囲のAABBが重なるかチェック
        return minCX <= lod0MaxX && maxCX >= lod0MinX && minCZ <= lod0MaxZ && maxCZ >= lod0MinZ;
    }

    /**
     * リージョン内でメッシュを持つがシーン未追加のチャンクをシーンに追加
     * @param {number} rx - リージョンX座標
     * @param {number} rz - リージョンZ座標
     */
    _addChunkMeshesToScene(rx, rz) {
        const minCX = rx * this.regionSize;
        const minCZ = rz * this.regionSize;
        for (let cx = minCX; cx < minCX + this.regionSize; cx++) {
            for (let cz = minCZ; cz < minCZ + this.regionSize; cz++) {
                const key = `${cx},${cz}`;
                const chunk = this.chunks.get(key);
                if (chunk && chunk.mesh && !chunk.mesh.parent) {
                    this.worldContainer.add(chunk.mesh);
                }
            }
        }
    }

    /**
     * リージョン統合メッシュを分解（unmerge）できるか判定
     * LoD0範囲: 個別メッシュ必須（分解後に表示するため）
     * LoD1範囲: チャンクが存在すればOK（cached状態でも再生成キューで回復可能）
     */
    _canUnmergeRegion(rx, rz) {
        const minCX = rx * this.regionSize;
        const minCZ = rz * this.regionSize;
        const centerCX = this.lastChunkX;
        const centerCZ = this.lastChunkZ;
        const range = this.chunkRange;
        const lod0Range = this.lod0Range;

        for (let cx = minCX; cx < minCX + this.regionSize; cx++) {
            for (let cz = minCZ; cz < minCZ + this.regionSize; cz++) {
                // 描画範囲外のチャンクは無視
                if (Math.abs(cx - centerCX) > range || Math.abs(cz - centerCZ) > range) {
                    continue;
                }
                const key = `${cx},${cz}`;
                const chunk = this.chunks.get(key);
                const dist = Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ));
                if (dist <= lod0Range) {
                    // LoD0範囲: 個別メッシュが必須
                    if (!chunk || !chunk.mesh) {
                        return false;
                    }
                } else {
                    // LoD1範囲: 存在すればOK（cached状態でもリージョンメッシュでカバー）
                    if (!chunk) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * リージョン統合メッシュを分解し、個別チャンクメッシュに戻す
     * force=false: _canUnmergeRegion()で安全確認後に実行（穴防止）
     * force=true: 即座に分解（rebuildAllMeshes, clearAllChunks等）
     * @param {string} regionKey - "rx,rz"
     * @param {boolean} force - trueで安全確認をスキップ
     */
    _unmergeRegion(regionKey, force = false) {
        const regionData = this.regionMeshes.get(regionKey);
        if (!regionData) return;

        // 範囲内のチャンクでメッシュがないものがある場合はリージョンメッシュを保持（穴防止）
        // force=trueの場合は強制無効化（rebuildAllMeshes, clearAllChunks等）
        if (!force) {
            const [rx, rz] = regionKey.split(',').map(Number);
            if (!this._canUnmergeRegion(rx, rz)) {
                this.dirtyRegions.add(regionKey);
                return;
            }
        }

        // 統合メッシュをシーンから削除・破棄
        if (regionData.normalMesh) {
            this.worldContainer.remove(regionData.normalMesh);
            regionData.normalMesh.geometry.dispose();
        }
        if (regionData.waterMesh) {
            this.worldContainer.remove(regionData.waterMesh);
            regionData.waterMesh.geometry.dispose();
        }

        // 個別チャンクメッシュを再表示
        for (const key of regionData.chunkKeys) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.mesh) {
                this.worldContainer.add(chunk.mesh);
            }
        }

        this.regionMeshes.delete(regionKey);
    }

    /**
     * リージョン内のLoD1チャンクを統合メッシュにまとめられるか判定
     * 全チャンクがLoD1メッシュを持ち、2個以上ある場合にready=true
     * @param {number} rx - リージョンX座標
     * @param {number} rz - リージョンZ座標
     * @returns {{ ready: boolean, chunkEntries: Array }} 統合可能ならready=true、対象チャンクリスト付き
     */
    _canMergeRegion(rx, rz) {
        const minCX = rx * this.regionSize;
        const minCZ = rz * this.regionSize;
        const result = { ready: false, chunkEntries: [] };

        for (let cx = minCX; cx < minCX + this.regionSize; cx++) {
            for (let cz = minCZ; cz < minCZ + this.regionSize; cz++) {
                if (!this._isInRange(cx, cz)) continue;

                const key = `${cx},${cz}`;
                const chunk = this.chunks.get(key);

                // チャンクがロードされていない → 未完成
                if (!chunk || !chunk.mesh) return result;
                // LoD0が含まれている → 統合不可
                if (chunk.mesh.userData.lodLevel !== 1) return result;

                result.chunkEntries.push({ key, chunk, cx, cz });
            }
        }

        // 2チャンク以上あれば統合する価値がある
        result.ready = result.chunkEntries.length >= 2;
        return result;
    }

    /**
     * リージョン内のLoD1チャンクメッシュを統合
     * @param {string} regionKey - "rx,rz"
     * @param {Array} chunkEntries - 統合対象チャンクの配列
     */
    _mergeRegion(regionKey, chunkEntries) {
        const normalGeometries = [];
        const waterGeometries = [];
        const chunkKeys = new Set();

        for (const entry of chunkEntries) {
            const chunkGroup = entry.chunk.mesh;
            if (!chunkGroup) continue;

            chunkKeys.add(entry.key);

            // チャンクグループの位置をマトリクスに変換
            const matrix = new THREE.Matrix4().makeTranslation(
                chunkGroup.position.x,
                chunkGroup.position.y,
                chunkGroup.position.z
            );

            // 子メッシュを分類して収集
            for (const child of chunkGroup.children) {
                if (!child.geometry || !child.geometry.index || child.geometry.index.count === 0) continue;

                const geo = child.geometry.clone();
                geo.applyMatrix4(matrix);

                if (child.name && child.name.startsWith('water_')) {
                    waterGeometries.push(geo);
                } else {
                    normalGeometries.push(geo);
                }
            }

            // 個別メッシュをシーンから除去（チャンクエントリは保持）
            this.worldContainer.remove(chunkGroup);
        }

        const regionData = { normalMesh: null, waterMesh: null, chunkKeys };

        // 通常メッシュ統合
        if (normalGeometries.length > 0) {
            const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(normalGeometries, false);
            if (mergedGeo) {
                const mesh = new THREE.Mesh(mergedGeo, this._getRegionNormalMaterial());
                mesh.name = `region_${regionKey}`;
                this.worldContainer.add(mesh);
                regionData.normalMesh = mesh;
            }
        }

        // 水メッシュ統合
        if (waterGeometries.length > 0) {
            const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(waterGeometries, false);
            if (mergedGeo) {
                const mesh = new THREE.Mesh(mergedGeo, this._getRegionWaterMaterial());
                mesh.name = `region_water_${regionKey}`;
                mesh.renderOrder = 1;
                this.worldContainer.add(mesh);
                regionData.waterMesh = mesh;
            }
        }

        // クローンしたジオメトリを破棄（統合済み）
        for (const geo of normalGeometries) geo.dispose();
        for (const geo of waterGeometries) geo.dispose();

        this.regionMeshes.set(regionKey, regionData);

        // リージョンメッシュをストレージにキャッシュ保存（非同期）
        this._saveRegionCache(regionKey, regionData);
    }

    /**
     * リージョンメッシュのジオメトリデータをストレージに保存
     */
    _saveRegionCache(regionKey, regionData) {
        // 完全なリージョン（全チャンク揃い）のみキャッシュ保存
        const expectedSize = this.regionSize * this.regionSize;
        if (regionData.chunkKeys.size < expectedSize) {
            return;
        }

        const [rx, rz] = regionKey.split(',').map(Number);
        this.cachedRegionKeys.add(regionKey);

        // バイナリパック→gzip圧縮→保存（非同期）
        const rawBuffer = this._packGeometryToBuffer(regionData);
        this._compressBuffer(rawBuffer).then(compressed => {
            const cacheData = {
                version: 2,
                geometry: compressed,
                chunkKeys: Array.from(regionData.chunkKeys),
                configHash: this.getConfigHash(),
                timestamp: Date.now()
            };
            return this.storage.saveRegion(this.worldName, rx, rz, cacheData);
        }).catch(e => {
            console.error('Failed to cache region:', regionKey, e);
        });
    }

    /**
     * リージョンメッシュのジオメトリをコンパクトなバイナリにパック
     * positions: Float32→Int16, colors: Float32→Uint8, indices: Uint32→Uint16/Uint32
     */
    _packGeometryToBuffer(regionData) {
        const packMesh = (mesh) => {
            if (!mesh || !mesh.geometry) return null;
            const geo = mesh.geometry;
            const posArray = geo.getAttribute('position').array;
            const colArray = geo.getAttribute('color') ? geo.getAttribute('color').array : null;
            const idxArray = geo.index.array;

            const vertCount = posArray.length / 3;
            const idxCount = idxArray.length;

            // Uint16で足りるか判定
            let maxIdx = 0;
            for (let i = 0; i < idxCount; i++) {
                if (idxArray[i] > maxIdx) maxIdx = idxArray[i];
            }
            const useUint32 = maxIdx > 65535;

            // Int16 positions
            const positions = new Int16Array(vertCount * 3);
            for (let i = 0; i < positions.length; i++) {
                positions[i] = Math.round(posArray[i]);
            }

            // Uint8 colors
            const colorLen = colArray ? colArray.length : 0;
            const colors = new Uint8Array(colorLen);
            for (let i = 0; i < colorLen; i++) {
                colors[i] = Math.max(0, Math.min(255, Math.round(colArray[i] * 255)));
            }

            // indices
            const indices = useUint32 ? new Uint32Array(idxArray) : new Uint16Array(idxArray);

            return { vertCount, idxCount, positions, colors, indices, useUint32 };
        };

        const normal = packMesh(regionData.normalMesh);
        const water = packMesh(regionData.waterMesh);

        // フラグ
        let flags = 0;
        if (normal) flags |= 1;
        if (water) flags |= 2;
        if (normal && normal.useUint32) flags |= 4;
        if (water && water.useUint32) flags |= 8;

        // バッファサイズ計算
        let totalSize = 20; // ヘッダー
        if (normal) totalSize += normal.positions.byteLength + normal.colors.byteLength + normal.indices.byteLength;
        if (water) totalSize += water.positions.byteLength + water.colors.byteLength + water.indices.byteLength;

        const buffer = new ArrayBuffer(totalSize);
        const header = new DataView(buffer);
        header.setUint32(0, flags, true);
        header.setUint32(4, normal ? normal.vertCount : 0, true);
        header.setUint32(8, normal ? normal.idxCount : 0, true);
        header.setUint32(12, water ? water.vertCount : 0, true);
        header.setUint32(16, water ? water.idxCount : 0, true);

        let offset = 20;
        const dst = new Uint8Array(buffer);
        const copyBytes = (src) => {
            dst.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), offset);
            offset += src.byteLength;
        };

        if (normal) { copyBytes(normal.positions); copyBytes(normal.colors); copyBytes(normal.indices); }
        if (water) { copyBytes(water.positions); copyBytes(water.colors); copyBytes(water.indices); }

        return buffer;
    }

    /**
     * 圧縮バイナリからジオメトリデータを復元
     * @returns {{ normalGeometry, waterGeometry }}
     */
    _unpackGeometryFromBuffer(buffer) {
        const header = new DataView(buffer);
        const flags = header.getUint32(0, true);
        const normalVertCount = header.getUint32(4, true);
        const normalIdxCount = header.getUint32(8, true);
        const waterVertCount = header.getUint32(12, true);
        const waterIdxCount = header.getUint32(16, true);

        const hasNormal = (flags & 1) !== 0;
        const hasWater = (flags & 2) !== 0;
        const normalIdxUint32 = (flags & 4) !== 0;
        const waterIdxUint32 = (flags & 8) !== 0;

        let offset = 20;
        const src = new Uint8Array(buffer);

        const readGeo = (vertCount, idxCount, idxUint32) => {
            // Int16 positions → Float32
            const posBytes = vertCount * 3 * 2;
            const posInt16 = new Int16Array(vertCount * 3);
            new Uint8Array(posInt16.buffer).set(src.subarray(offset, offset + posBytes));
            offset += posBytes;
            const positions = new Float32Array(vertCount * 3);
            for (let i = 0; i < positions.length; i++) positions[i] = posInt16[i];

            // Uint8 colors → Float32
            const colBytes = vertCount * 3;
            const colUint8 = src.subarray(offset, offset + colBytes);
            offset += colBytes;
            const colors = new Float32Array(vertCount * 3);
            for (let i = 0; i < colors.length; i++) colors[i] = colUint8[i] / 255;

            // indices
            let indices;
            if (idxUint32) {
                const idxBytes = idxCount * 4;
                indices = new Uint32Array(idxCount);
                new Uint8Array(indices.buffer).set(src.subarray(offset, offset + idxBytes));
                offset += idxBytes;
            } else {
                const idxBytes = idxCount * 2;
                const idx16 = new Uint16Array(idxCount);
                new Uint8Array(idx16.buffer).set(src.subarray(offset, offset + idxBytes));
                offset += idxBytes;
                indices = new Uint32Array(idx16); // Three.jsはUint32を期待
            }

            return { positions, colors, indices };
        };

        return {
            normalGeometry: hasNormal ? readGeo(normalVertCount, normalIdxCount, normalIdxUint32) : null,
            waterGeometry: hasWater ? readGeo(waterVertCount, waterIdxCount, waterIdxUint32) : null
        };
    }

    async _compressBuffer(buffer) {
        const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
        return await new Response(stream).arrayBuffer();
    }

    async _decompressBuffer(buffer) {
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).arrayBuffer();
    }

    /**
     * キャッシュからリージョンメッシュを復元
     * @param {string} regionKey - "rx,rz"
     */
    async _restoreRegionFromCache(regionKey) {
        this._restoringRegions.add(regionKey);
        const [rx, rz] = regionKey.split(',').map(Number);
        try {
            const cacheData = await this.storage.loadRegion(this.worldName, rx, rz);
            if (!cacheData) {
                console.warn(`[RegionCache] キャッシュデータなし: ${regionKey}`);
                this.cachedRegionKeys.delete(regionKey);
                this._clearCachedChunksForRegeneration(regionKey);
                return;
            }

            // configHash検証
            if (cacheData.configHash !== this.getConfigHash()) {
                console.warn(`[RegionCache] configHash不一致: ${regionKey}`);
                this.cachedRegionKeys.delete(regionKey);
                this._clearCachedChunksForRegeneration(regionKey);
                return;
            }

            // 圧縮バイナリを展開してジオメトリ復元
            const rawBuffer = await this._decompressBuffer(cacheData.geometry);
            const { normalGeometry, waterGeometry } = this._unpackGeometryFromBuffer(rawBuffer);

            const regionData = { normalMesh: null, waterMesh: null, chunkKeys: new Set(cacheData.chunkKeys) };

            // ジオメトリからThree.jsメッシュを生成するヘルパー
            const buildMesh = (geoData, material, name) => {
                if (!geoData || geoData.positions.length === 0) return null;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(geoData.positions, 3));
                if (geoData.colors.length > 0) {
                    geo.setAttribute('color', new THREE.BufferAttribute(geoData.colors, 3));
                }
                geo.setIndex(new THREE.BufferAttribute(geoData.indices, 1));
                const mesh = new THREE.Mesh(geo, material);
                mesh.name = name;
                return mesh;
            };

            // 通常メッシュ復元
            const normalMesh = buildMesh(normalGeometry, this._getRegionNormalMaterial(), `region_${regionKey}`);
            if (normalMesh) {
                this.worldContainer.add(normalMesh);
                regionData.normalMesh = normalMesh;
            }

            // 水メッシュ復元
            const waterMesh = buildMesh(waterGeometry, this._getRegionWaterMaterial(), `region_water_${regionKey}`);
            if (waterMesh) {
                waterMesh.renderOrder = 1;
                this.worldContainer.add(waterMesh);
                regionData.waterMesh = waterMesh;
            }

            this.regionMeshes.set(regionKey, regionData);

            // リージョン内の全チャンクを整理:
            // - 個別メッシュがあれば削除してcached状態に（リージョンメッシュで表示するため）
            // - キャッシュに含まれないcachedチャンクは削除（通常生成に回す）
            const cachedChunkKeys = regionData.chunkKeys;
            const minCX = rx * this.regionSize;
            const minCZ = rz * this.regionSize;
            for (let cx = minCX; cx < minCX + this.regionSize; cx++) {
                for (let cz = minCZ; cz < minCZ + this.regionSize; cz++) {
                    const key = `${cx},${cz}`;
                    const chunk = this.chunks.get(key);
                    if (!chunk) continue;

                    if (chunk.state === 'cached') {
                        // cachedチャンク: キャッシュに含まれなければ削除
                        if (!cachedChunkKeys.has(key)) {
                            this.chunks.delete(key);
                        }
                    } else if (chunk.mesh) {
                        // 生成済みLoD0チャンクはリージョンメッシュに統合しない
                        if (chunk.mesh.userData.lodLevel === 0) {
                            continue;
                        }
                        // LoD1個別チャンク: メッシュ除去してcached状態に
                        this.worldContainer.remove(chunk.mesh);
                        this._disposeObject(chunk.mesh);
                        this.chunks.set(key, { chunkData: null, mesh: null, state: 'cached' });
                    }
                }
            }
            // 再統合キューから除外（キャッシュ復元で完了）
            this.dirtyRegions.delete(regionKey);

            console.log(`[RegionCache] 復元成功: region(${regionKey}) チャンク数=${regionData.chunkKeys.size}`);
        } catch (e) {
            console.error(`[RegionCache] 復元失敗: ${regionKey}`, e);
            this.cachedRegionKeys.delete(regionKey);
            this._clearCachedChunksForRegeneration(regionKey);
        } finally {
            this._restoringRegions.delete(regionKey);
        }
    }

    /**
     * リージョン内のcachedチャンクを削除し、通常の生成キューに再投入可能にする
     * キャッシュ復元失敗時やcached→LoD0変換時に使用
     * @param {string} regionKey - "rx,rz"
     */
    _clearCachedChunksForRegeneration(regionKey) {
        const [rx, rz] = regionKey.split(',').map(Number);
        const minCX = rx * this.regionSize;
        const maxCX = minCX + this.regionSize - 1;
        const minCZ = rz * this.regionSize;
        const maxCZ = minCZ + this.regionSize - 1;
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cz = minCZ; cz <= maxCZ; cz++) {
                const key = `${cx},${cz}`;
                const chunk = this.chunks.get(key);
                if (chunk && chunk.state === 'cached') {
                    this.chunks.delete(key);
                }
            }
        }
    }

    /**
     * dirtyリージョンを処理（merge/unmerge両方を扱う）
     *
     * 境界リージョン（LoD0範囲と重なる）:
     *   - メッシュあり & unmerge可能 → 分解して個別チャンク表示
     *   - メッシュあり & unmerge不可 → 次フレームで再チェック
     *   - メッシュなし → 個別チャンクをシーンに追加
     *
     * 非境界リージョン（1フレーム1個まで）:
     *   - メッシュあり → unmerge試行（失敗なら待機）
     *   - メッシュなし & merge可能 → 統合メッシュ作成
     *   - メッシュなし & merge不可 → 次フレームで再チェック（範囲外なら破棄）
     */
    _processRegionMerges() {
        if (this.dirtyRegions.size === 0) return;

        let mergedNonBoundary = false;
        const processed = [];
        const requeue = [];

        for (const regionKey of this.dirtyRegions) {
            const [rx, rz] = regionKey.split(',').map(Number);

            if (this._isBoundaryRegion(rx, rz)) {
                // 境界リージョン: 全チャンクが揃ってから一気に切り替え
                if (this.regionMeshes.has(regionKey)) {
                    // リージョンメッシュあり: 全チャンクが個別メッシュを持つまで保持
                    if (this._canUnmergeRegion(rx, rz)) {
                        this._unmergeRegion(regionKey, true);
                        this._addChunkMeshesToScene(rx, rz);
                        processed.push(regionKey);
                    } else {
                        // まだ揃っていない → 次フレームで再チェック
                        requeue.push(regionKey);
                        processed.push(regionKey);
                    }
                } else {
                    // リージョンメッシュなし: 個別メッシュを表示
                    this._addChunkMeshesToScene(rx, rz);
                    processed.push(regionKey);
                }
            } else if (!mergedNonBoundary) {
                // 非境界リージョン: 1フレーム1個まで統合処理
                if (this.regionMeshes.has(regionKey)) {
                    this._unmergeRegion(regionKey);
                    // ガードでブロックされた場合（チャンク未完了）→ リージョンメッシュ保持して待機
                    if (this.regionMeshes.has(regionKey)) {
                        requeue.push(regionKey);
                        processed.push(regionKey);
                        mergedNonBoundary = true;
                        continue;
                    }
                }
                const { ready, chunkEntries } = this._canMergeRegion(rx, rz);
                if (ready) {
                    this._mergeRegion(regionKey, chunkEntries);
                }
                processed.push(regionKey);
                if (!ready && chunkEntries.length > 0) {
                    // チャンクはあるが未完成 → 次フレームで再チェック
                    // チャンク0個（全て範囲外）の場合は再キューしない
                    requeue.push(regionKey);
                }
                mergedNonBoundary = true;
            }
        }

        for (const key of processed) {
            this.dirtyRegions.delete(key);
        }
        // 統合失敗リージョンを末尾に再追加（他のリージョンをブロックしない）
        for (const key of requeue) {
            this.dirtyRegions.add(key);
        }
    }

    /**
     * リージョン通常メッシュ用共有マテリアルを取得
     * @returns {THREE.MeshBasicMaterial}
     */
    _getRegionNormalMaterial() {
        if (!this._regionNormalMaterial) {
            this._regionNormalMaterial = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.FrontSide
            });
        }
        return this._regionNormalMaterial;
    }

    /**
     * リージョン水メッシュ用共有マテリアルを取得
     * @returns {THREE.MeshBasicMaterial}
     */
    _getRegionWaterMaterial() {
        if (!this._regionWaterMaterial) {
            this._regionWaterMaterial = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                depthWrite: false,
                side: THREE.FrontSide
            });
        }
        return this._regionWaterMaterial;
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
        // キャッシュ済みチャンク座標を使用（worldToChunk呼び出し不要）
        const centerCX = this.lastChunkX !== null ? this.lastChunkX : Math.floor(this.viewX / ChunkData.SIZE_X);
        const centerCZ = this.lastChunkZ !== null ? this.lastChunkZ : Math.floor(this.viewZ / ChunkData.SIZE_Z);
        // チェビシェフ距離（最大座標差）
        const distance = Math.max(
            Math.abs(chunkX - centerCX),
            Math.abs(chunkZ - centerCZ)
        );

        if (distance <= this.lod0Range) return 0;
        return 1;
    }

    /**
     * ブロック色情報を設定（LoD 1用）
     * @param {Object} colors - {"blockStrId": "#RRGGBB", ...}
     * @param {Object} shapes - {"blockStrId": "normal"|"custom", ...}
     */
    /**
     * ブロック情報を設定
     * @param {Object} colors - ブロック色情報
     * @param {Object} shapes - ブロック形状情報 { blockId: 'normal' | 'custom' }
     * @param {string[]} [lightTransparentIds] - 光透過ブロックIDの配列
     */
    setBlockInfo(colors, shapes, lightTransparentIds) {
        this.blockColors = colors;
        this.blockShapes = shapes;

        // 光透過ブロックIDをLightCalculatorに設定
        if (this.lightCalculator) {
            const ids = new Set(lightTransparentIds || []);
            // カスタムブロックも光透過
            if (shapes) {
                for (const [id, shape] of Object.entries(shapes)) {
                    if (shape === 'custom') ids.add(id);
                }
            }
            this.lightCalculator.setCustomBlockIds([...ids]);
        }
    }

    /**
     * 隣接チャンクのChunkDataを取得
     * @param {number} chunkX - 中心チャンクX
     * @param {number} chunkZ - 中心チャンクZ
     * @returns {Map<string, ChunkData>} "chunkX,chunkZ" -> ChunkData
     */
    _getNeighborChunks(chunkX, chunkZ) {
        const neighbors = new Map();
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dx, dz] of offsets) {
            const key = `${chunkX + dx},${chunkZ + dz}`;
            const chunk = this.chunks.get(key);
            if (chunk && chunk.chunkData) {
                neighbors.set(key, chunk.chunkData);
            }
        }
        return neighbors;
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
            if (!chunk.mesh) continue;
            const lod = chunk.mesh.userData.lodLevel;

            // Group内の各子メッシュに適用
            const children = chunk.mesh.children || [];
            for (const child of children) {
                if (!child.material) continue;

                if (this.lodDebugMode) {
                    // デバッグ色を適用
                    if (!child.material.isShaderMaterial) {
                        child.material.vertexColors = false;
                        child.material.color.setStyle(LoDHelper.getDebugColor(lod));
                        child.material.needsUpdate = true;
                    }
                } else {
                    // 元の表示に戻す
                    if (!child.material.isShaderMaterial) {
                        if (lod === 1) {
                            child.material.vertexColors = true;
                        }
                        child.material.color.setStyle('#FFFFFF');
                        child.material.needsUpdate = true;
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
