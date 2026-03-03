/**
 * ランダムティックハンドラ共通ヘルパー（仕様書 2-18）
 * grassTick.js / leavesTick.js 等から参照する
 */
const TickHelpers = {
    /**
     * ワールド座標をチャンクローカル座標に解決する
     * @returns {{ ch, cd, lx, ly, lz, cx, cz, key }|null}
     */
    _resolve(cm, wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const key = `${cx},${cz}`;
        const ch = cm.chunks.get(key);
        if (!ch || !ch.chunkData) return null;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - ch.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return { ch, cd: ch.chunkData, lx, ly, lz, cx, cz, key };
    },

    /** ワールド座標のブロックIDを取得する @returns {string|null} */
    getBlock(cm, wx, wy, wz) {
        const r = this._resolve(cm, wx, wy, wz);
        return r ? r.cd.getBlock(r.lx, r.ly, r.lz) : null;
    },

    /** ワールド座標のライトレベルを取得する @returns {number} 0-15 */
    getLight(cm, wx, wy, wz) {
        const r = this._resolve(cm, wx, wy, wz);
        return r ? r.cd.getLight(r.lx, r.ly, r.lz) : 0;
    },

    /**
     * ワールド座標にブロックをセットし、チャンクキーを dirty に追加する
     * ライトマップも更新する（air ならonBlockRemoved、それ以外はonBlockPlaced）
     * @returns {boolean} 成功したか
     */
    setBlock(cm, wx, wy, wz, blockId, dirty) {
        const r = this._resolve(cm, wx, wy, wz);
        if (!r) return false;
        r.cd.setBlock(r.lx, r.ly, r.lz, blockId);
        if (dirty) dirty.add(r.key);

        if (cm.lightCalculator && cm._getNeighborChunks) {
            const neighbors = cm._getNeighborChunks(r.cx, r.cz);
            const affected = blockId === 'air'
                ? cm.lightCalculator.onBlockRemoved(r.cd, r.lx, r.ly, r.lz, neighbors)
                : cm.lightCalculator.onBlockPlaced(r.cd, r.lx, r.ly, r.lz, neighbors);
            if (dirty && affected) {
                for (const nk of affected) dirty.add(nk);
            }
        }

        return true;
    },
};
