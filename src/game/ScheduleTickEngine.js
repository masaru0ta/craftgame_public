/**
 * スケジュールティックエンジン（仕様書 2-19）
 * 指定ゲームティック後にブロック更新処理を確実に実行する遅延実行エンジン。
 * ランダムティック（RandomTickEngine）が確率的な更新を行うのに対し、
 * スケジュールティックは決定論的な遅延実行を提供する。
 */
class ScheduleTickEngine {
    /** 1ゲームティックの間隔（ms）。20 TPS = 50ms/ティック（Minecraft準拠） */
    static TickInterval = 50;

    constructor() {
        /** @type {Map<string, Function>} blockStrId → handler */
        this._handlers = new Map();
        /** @type {Map<number, Array<{wx,wy,wz,blockStrId,meta}>>} targetTick → entries */
        this._queue = new Map();
        /** @type {Set<string>} 重複排除キー "wx,wy,wz,blockStrId" */
        this._scheduled = new Set();
        /** @type {number} 現在のゲームティックカウント */
        this._currentTick = 0;
        /** @type {number} deltaTime 蓄積（ms） */
        this._accumulated = 0;
        /** @type {Object|null} 最後に受け取った chunkManager（advanceTick 用） */
        this._chunkManager = null;
    }

    /** 現在のゲームティックカウント */
    get currentTick() { return this._currentTick; }

    /** 現在のスケジュール済みエントリ数 */
    get pendingCount() { return this._scheduled.size; }

    /**
     * ブロック種別ごとにハンドラを登録する
     * @param {string} blockStrId
     * @param {Function} handler - (chunkManager, wx, wy, wz, scheduleFunc, dirty, meta) => void
     */
    Register(blockStrId, handler) {
        this._handlers.set(blockStrId, handler);
    }

    /**
     * 指定座標・ブロック種別のティック処理をスケジュール登録する。
     * 同一座標・同一ブロック種別の重複登録は無視する。
     * @param {number} wx - ワールド座標X
     * @param {number} wy - ワールド座標Y
     * @param {number} wz - ワールド座標Z
     * @param {string} blockStrId - ブロック文字列ID
     * @param {number} delay - ゲームティック数（0 は次のティックで実行）
     * @param {Object} [meta] - ハンドラに渡す任意のメタデータ
     */
    schedule(wx, wy, wz, blockStrId, delay, meta) {
        const key = `${wx},${wy},${wz},${blockStrId}`;
        if (this._scheduled.has(key)) return;
        this._scheduled.add(key);

        // delay=0 は次のティック（1）として扱う
        const targetTick = this._currentTick + Math.max(1, delay | 0);
        if (!this._queue.has(targetTick)) {
            this._queue.set(targetTick, []);
        }
        this._queue.get(targetTick).push({ wx, wy, wz, blockStrId, meta: meta || {} });
    }

    /**
     * ゲームループから毎フレーム呼ぶ。
     * deltaTime 分のゲームティックを処理する。
     * @param {number} deltaTime - 経過時間（秒）
     * @param {Object} chunkManager
     */
    Update(deltaTime, chunkManager) {
        this._chunkManager = chunkManager;
        this._accumulated += deltaTime * 1000;
        while (this._accumulated >= ScheduleTickEngine.TickInterval) {
            this._accumulated -= ScheduleTickEngine.TickInterval;
            this._processTick(chunkManager);
        }
    }

    /**
     * 1ゲームティック処理する（内部用）
     * @param {Object} chunkManager
     */
    _processTick(chunkManager) {
        this._currentTick++;
        const entries = this._queue.get(this._currentTick);
        if (!entries || entries.length === 0) return;
        this._queue.delete(this._currentTick);

        const dirty = new Set();

        for (const { wx, wy, wz, blockStrId, meta } of entries) {
            // 実行済みとして重複キーを解放（次回の登録を受け入れる）
            this._scheduled.delete(`${wx},${wy},${wz},${blockStrId}`);

            // ブロックが変化していれば無視
            const current = TickHelpers.getBlock(chunkManager, wx, wy, wz);
            if (current !== blockStrId) continue;

            const handler = this._handlers.get(blockStrId);
            if (!handler) continue;

            handler(
                chunkManager, wx, wy, wz,
                (nx, ny, nz, nId, nDelay, nMeta) => this.schedule(nx, ny, nz, nId, nDelay, nMeta),
                dirty,
                meta
            );
        }

        // バッチ再構築 + IndexedDB 保存
        for (const key of dirty) {
            const parts = key.split(',');
            const cx = parseInt(parts[0], 10);
            const cz = parseInt(parts[1], 10);
            chunkManager.rebuildChunkMesh(cx, cz);

            const chunk = chunkManager.chunks.get(key);
            if (chunk && chunk.chunkData) {
                chunkManager.modifiedChunkCache.set(key, chunk.chunkData.getSerializedData());
                chunkManager.storage.save(chunkManager.worldName, cx, cz, chunk.chunkData)
                    .catch(err => console.error('ScheduleTick: chunk save failed', err));
            }
        }
    }

    /**
     * ゲームティックを n 回分強制進める（テスト用）
     * @param {number} n - 進めるティック数
     */
    advanceTick(n) {
        const cm = this._chunkManager;
        if (!cm) return;
        for (let i = 0; i < n; i++) {
            this._processTick(cm);
        }
    }
}
