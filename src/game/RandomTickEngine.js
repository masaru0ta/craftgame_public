/**
 * ランダムティックエンジン
 * チャンク内ブロックへのランダムティック配信を管理する（仕様書 2-18）
 */
class RandomTickEngine {
    constructor() {
        /** @type {Map<string, Function>} blockStrId → handler(chunkManager, wx, wy, wz, dirty, effects) */
        this._handlers = new Map();
        /** @type {number} 1チャンク・1フレームあたりのサンプル数 */
        this._speed = 3;
        /** @type {Function|null} ブロック腐敗時コールバック (wx, wy, wz, blockStrId) => void */
        this._onBlockDecayed = null;
        /** @type {{ onDecay: Function|null }} ハンドラへ渡すエフェクト群（毎フレーム再生成しないようキャッシュ） */
        this._effects = { onDecay: null };
    }

    /** ティックレート getter */
    get speed() {
        return this._speed;
    }

    /** ティックレート setter（0 で無効化、小数は切り捨て） */
    set speed(v) {
        this._speed = Math.max(0, Math.floor(v));
    }

    /**
     * ティックハンドラを登録する
     * @param {string} blockStrId - ブロック文字列ID
     * @param {Function} handler - (chunkManager, wx, wy, wz, dirty: Set) => void
     */
    register(blockStrId, handler) {
        this._handlers.set(blockStrId, handler);
    }

    /**
     * ブロック腐敗（→ air 変換）時のコールバックを登録する
     * @param {Function} callback - (wx: number, wy: number, wz: number, blockStrId: string) => void
     */
    onBlockDecayed(callback) {
        this._onBlockDecayed = callback;
        this._effects.onDecay = callback;
    }

    /**
     * 毎フレーム呼び出す。ロード済みチャンクごとにランダムサンプルしてハンドラを発火する。
     * 同一フレーム内でのメッシュ再構築はチャンク単位でバッチ化する。
     * @param {Object} chunkManager
     */
    tick(chunkManager) {
        if (this._speed === 0) return;

        const dirty = new Set();

        const centerCX = chunkManager.lastChunkX;
        const centerCZ = chunkManager.lastChunkZ;
        const lod0Range = chunkManager.lod0Range;

        for (const [key, chunk] of chunkManager.chunks) {
            if (!chunk.chunkData) continue;

            const parts = key.split(',');
            const cx = parseInt(parts[0], 10);
            const cz = parseInt(parts[1], 10);

            // LoD0 チャンクのみ処理
            if (centerCX !== null && centerCZ !== null) {
                const dist = Math.max(Math.abs(cx - centerCX), Math.abs(cz - centerCZ));
                if (dist > lod0Range) continue;
            }

            const cd = chunk.chunkData;

            for (let i = 0; i < this._speed; i++) {
                const lx = (Math.random() * 16) | 0;
                const ly = (Math.random() * 128) | 0;
                const lz = (Math.random() * 16) | 0;

                const blockStrId = cd.getBlock(lx, ly, lz);
                if (!blockStrId || blockStrId === 'air') continue;

                const handler = this._handlers.get(blockStrId);
                if (!handler) continue;

                const wx = cx * 16 + lx;
                const wy = cd.baseY + ly;
                const wz = cz * 16 + lz;
                handler(chunkManager, wx, wy, wz, dirty, this._effects);
            }
        }

        // バッチ再構築 + IndexedDB 保存
        for (const key of dirty) {
            const parts = key.split(',');
            const cx = parseInt(parts[0], 10);
            const cz = parseInt(parts[1], 10);
            chunkManager.rebuildChunkMesh(cx, cz);

            const chunk = chunkManager.chunks.get(key);
            if (chunk && chunk.chunkData) {
                // メモリキャッシュに即時保存
                chunkManager.modifiedChunkCache.set(key, chunk.chunkData.getSerializedData());
                // IndexedDB に非同期保存
                chunkManager.storage.save(chunkManager.worldName, cx, cz, chunk.chunkData)
                    .catch(err => console.error('RandomTick: chunk save failed', err));
            }
        }
    }

    /**
     * 指定ワールド座標のブロックに強制ティックを発行する（テスト用）
     * @param {Object} chunkManager
     * @param {number} wx - ワールド座標X
     * @param {number} wy - ワールド座標Y
     * @param {number} wz - ワールド座標Z
     * @returns {boolean} ハンドラが実行されたか
     */
    tickBlock(chunkManager, wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const key = `${cx},${cz}`;
        const chunk = chunkManager.chunks.get(key);
        if (!chunk || !chunk.chunkData) return false;

        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return false;

        const blockStrId = chunk.chunkData.getBlock(lx, ly, lz);
        if (!blockStrId) return false;

        const handler = this._handlers.get(blockStrId);
        if (!handler) return false;

        const dirty = new Set();
        handler(chunkManager, wx, wy, wz, dirty, this._effects);

        for (const k of dirty) {
            const parts = k.split(',');
            chunkManager.rebuildChunkMesh(parseInt(parts[0], 10), parseInt(parts[1], 10));
        }
        return true;
    }
}
