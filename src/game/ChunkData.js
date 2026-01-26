/**
 * ChunkData - チャンクデータ管理クラス
 * 16x128x16 ブロックの領域を管理する
 */
class ChunkData {
    // チャンクサイズ定数
    static SIZE_X = 16;
    static SIZE_Y = 128;
    static SIZE_Z = 16;

    /**
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     */
    constructor(chunkX, chunkZ) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        // ブロックデータを格納するMap（キー: "x,y,z", 値: block_str_id）
        this._blocks = new Map();
    }

    /**
     * 座標からキーを生成
     * @param {number} x - ローカルX座標 (0-15)
     * @param {number} y - Y座標 (0-127)
     * @param {number} z - ローカルZ座標 (0-15)
     * @returns {string} キー文字列
     */
    _getKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    /**
     * 座標がチャンク範囲内かチェック
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @returns {boolean} 範囲内ならtrue
     */
    _isInBounds(x, y, z) {
        return x >= 0 && x < ChunkData.SIZE_X &&
               y >= 0 && y < ChunkData.SIZE_Y &&
               z >= 0 && z < ChunkData.SIZE_Z;
    }

    /**
     * ブロックを設置
     * @param {number} x - ローカルX座標 (0-15)
     * @param {number} y - Y座標 (0-127)
     * @param {number} z - ローカルZ座標 (0-15)
     * @param {string} blockStrId - ブロックID
     */
    setBlock(x, y, z, blockStrId) {
        if (!this._isInBounds(x, y, z)) {
            return; // 範囲外は無視
        }
        if (blockStrId === 'air') {
            // 空気は削除（メモリ節約）
            this._blocks.delete(this._getKey(x, y, z));
        } else {
            this._blocks.set(this._getKey(x, y, z), blockStrId);
        }
    }

    /**
     * ブロックを取得
     * @param {number} x - ローカルX座標 (0-15)
     * @param {number} y - Y座標 (0-127)
     * @param {number} z - ローカルZ座標 (0-15)
     * @returns {string|null} ブロックID（範囲外はnull、未設定は'air'）
     */
    getBlock(x, y, z) {
        if (!this._isInBounds(x, y, z)) {
            return null;
        }
        return this._blocks.get(this._getKey(x, y, z)) || 'air';
    }

    /**
     * ワールド座標からローカル座標に変換
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {{x: number, z: number}} ローカル座標
     */
    worldToLocal(worldX, worldZ) {
        return {
            x: worldX - this.chunkX * ChunkData.SIZE_X,
            z: worldZ - this.chunkZ * ChunkData.SIZE_Z
        };
    }

    /**
     * ローカル座標からワールド座標に変換
     * @param {number} localX - ローカルX座標
     * @param {number} localZ - ローカルZ座標
     * @returns {{x: number, z: number}} ワールド座標
     */
    localToWorld(localX, localZ) {
        return {
            x: localX + this.chunkX * ChunkData.SIZE_X,
            z: localZ + this.chunkZ * ChunkData.SIZE_Z
        };
    }

    /**
     * チャンク内の全ブロックをイテレート
     * @param {function(number, number, number, string): void} callback - コールバック(x, y, z, blockStrId)
     */
    forEachBlock(callback) {
        for (const [key, blockStrId] of this._blocks) {
            const [x, y, z] = key.split(',').map(Number);
            callback(x, y, z, blockStrId);
        }
    }

    /**
     * 指定範囲の全座標をイテレート（空気含む）
     * @param {function(number, number, number, string): void} callback - コールバック(x, y, z, blockStrId)
     */
    forEachPosition(callback) {
        for (let y = 0; y < ChunkData.SIZE_Y; y++) {
            for (let z = 0; z < ChunkData.SIZE_Z; z++) {
                for (let x = 0; x < ChunkData.SIZE_X; x++) {
                    const blockStrId = this.getBlock(x, y, z);
                    callback(x, y, z, blockStrId);
                }
            }
        }
    }
}

// グローバルスコープに公開
window.ChunkData = ChunkData;
