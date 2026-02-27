/**
 * ChunkData - チャンクデータ管理クラス
 * 16x128x16 ブロックの領域を管理する
 * 内部はパレット + ビットパック形式で効率的に保存
 */
class ChunkData {
    // チャンクサイズ定数
    static SIZE_X = 16;
    static SIZE_Y = 128;
    static SIZE_Z = 16;
    static TOTAL_BLOCKS = ChunkData.SIZE_X * ChunkData.SIZE_Y * ChunkData.SIZE_Z;

    /**
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     */
    constructor(chunkX, chunkZ) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;

        /** @type {number} チャンクのワールドY座標オフセット */
        this.baseY = 0;

        // パレット（インデックス0は常にair）
        this._palette = ['air'];
        this._paletteIndex = new Map([['air', 0]]);

        // ビットパックデータ（初期は1ビット、全部air=0）
        this._bitsPerBlock = 1;
        const bytesNeeded = Math.ceil(ChunkData.TOTAL_BLOCKS / 8);
        this._data = new Uint8Array(bytesNeeded);

        // ライトマップ（0〜15、1バイト/座標）
        this._lightMap = new Uint8Array(ChunkData.TOTAL_BLOCKS);

        // ハイトマップ（各(x,z)列の最高不透明ブロックY座標、-1=全て空気）
        this._heightMap = new Int8Array(ChunkData.SIZE_X * ChunkData.SIZE_Z);
        this._heightMap.fill(-1);
    }

    /**
     * 座標からインデックスを計算
     * Y → Z → X の順（Yが最も内側）
     */
    _getIndex(x, y, z) {
        return x * ChunkData.SIZE_Y * ChunkData.SIZE_Z + z * ChunkData.SIZE_Y + y;
    }

    /**
     * 座標がチャンク範囲内かチェック
     */
    _isInBounds(x, y, z) {
        return x >= 0 && x < ChunkData.SIZE_X &&
               y >= 0 && y < ChunkData.SIZE_Y &&
               z >= 0 && z < ChunkData.SIZE_Z;
    }

    /**
     * パレットサイズから必要なビット数を計算
     */
    _calculateBitsPerBlock(paletteSize) {
        if (paletteSize <= 2) return 1;
        if (paletteSize <= 4) return 2;
        if (paletteSize <= 16) return 4;
        return 8;
    }

    /**
     * ビットを読み取る
     */
    _readBits(index) {
        const bitIndex = index * this._bitsPerBlock;
        const byteIndex = bitIndex >> 3;
        const bitOffset = bitIndex & 7;

        // 1バイト内に収まる場合
        if (bitOffset + this._bitsPerBlock <= 8) {
            const mask = (1 << this._bitsPerBlock) - 1;
            return (this._data[byteIndex] >> bitOffset) & mask;
        }

        // 2バイトにまたがる場合
        const mask = (1 << this._bitsPerBlock) - 1;
        const lowBits = this._data[byteIndex] >> bitOffset;
        const highBits = this._data[byteIndex + 1] << (8 - bitOffset);
        return (lowBits | highBits) & mask;
    }

    /**
     * ビットを書き込む
     */
    _writeBits(index, value) {
        const bitIndex = index * this._bitsPerBlock;
        const byteIndex = bitIndex >> 3;
        const bitOffset = bitIndex & 7;

        // 1バイト内に収まる場合
        if (bitOffset + this._bitsPerBlock <= 8) {
            const mask = (1 << this._bitsPerBlock) - 1;
            this._data[byteIndex] &= ~(mask << bitOffset);
            this._data[byteIndex] |= (value & mask) << bitOffset;
            return;
        }

        // 2バイトにまたがる場合
        const mask = (1 << this._bitsPerBlock) - 1;
        const lowMask = 0xFF >> bitOffset;
        const highMask = mask >> (8 - bitOffset);

        this._data[byteIndex] &= ~(lowMask << bitOffset);
        this._data[byteIndex] |= (value << bitOffset) & 0xFF;

        this._data[byteIndex + 1] &= ~highMask;
        this._data[byteIndex + 1] |= (value >> (8 - bitOffset)) & highMask;
    }

    /**
     * ビット幅を拡張
     */
    _expandBits(newBits) {
        const oldData = this._data;
        const oldBits = this._bitsPerBlock;

        // 新しいデータ配列を作成
        const newBytesNeeded = Math.ceil(ChunkData.TOTAL_BLOCKS * newBits / 8);
        this._data = new Uint8Array(newBytesNeeded);
        this._bitsPerBlock = newBits;

        // 古いデータを新しいフォーマットにコピー
        for (let i = 0; i < ChunkData.TOTAL_BLOCKS; i++) {
            // 古いデータから読み取り
            const oldBitIndex = i * oldBits;
            const oldByteIndex = oldBitIndex >> 3;
            const oldBitOffset = oldBitIndex & 7;

            let value;
            if (oldBitOffset + oldBits <= 8) {
                const mask = (1 << oldBits) - 1;
                value = (oldData[oldByteIndex] >> oldBitOffset) & mask;
            } else {
                const mask = (1 << oldBits) - 1;
                const lowBits = oldData[oldByteIndex] >> oldBitOffset;
                const highBits = oldData[oldByteIndex + 1] << (8 - oldBitOffset);
                value = (lowBits | highBits) & mask;
            }

            // 新しいデータに書き込み
            this._writeBits(i, value);
        }
    }

    /**
     * パレットにブロックIDを事前登録（ブロックデータは変更しない）
     * _expandBits() が必要な場合はこの時点で実行される
     * @param {string} blockStrId - ブロックID
     */
    ensurePaletteEntry(blockStrId) {
        if (this._paletteIndex.has(blockStrId)) return;
        const paletteIdx = this._palette.length;
        this._palette.push(blockStrId);
        this._paletteIndex.set(blockStrId, paletteIdx);
        const newBits = this._calculateBitsPerBlock(this._palette.length);
        if (newBits > this._bitsPerBlock) {
            this._expandBits(newBits);
        }
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
            return;
        }

        let paletteIdx = this._paletteIndex.get(blockStrId);
        if (paletteIdx === undefined) {
            // 新しいブロックをパレットに追加
            paletteIdx = this._palette.length;
            this._palette.push(blockStrId);
            this._paletteIndex.set(blockStrId, paletteIdx);

            // パレットサイズに応じてビット数を再計算
            const newBits = this._calculateBitsPerBlock(this._palette.length);
            if (newBits > this._bitsPerBlock) {
                this._expandBits(newBits);
            }
        }

        const index = this._getIndex(x, y, z);
        this._writeBits(index, paletteIdx);
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
        const index = this._getIndex(x, y, z);
        const paletteIdx = this._readBits(index);
        return this._palette[paletteIdx] || 'air';
    }

    /**
     * ワールド座標からローカル座標に変換
     */
    worldToLocal(worldX, worldZ) {
        return {
            x: worldX - this.chunkX * ChunkData.SIZE_X,
            z: worldZ - this.chunkZ * ChunkData.SIZE_Z
        };
    }

    /**
     * ローカル座標からワールド座標に変換
     */
    localToWorld(localX, localZ) {
        return {
            x: localX + this.chunkX * ChunkData.SIZE_X,
            z: localZ + this.chunkZ * ChunkData.SIZE_Z
        };
    }

    /**
     * チャンク内の全ブロックをイテレート（air以外）
     * @param {function(number, number, number, string): void} callback
     */
    forEachBlock(callback) {
        for (let x = 0; x < ChunkData.SIZE_X; x++) {
            for (let z = 0; z < ChunkData.SIZE_Z; z++) {
                for (let y = 0; y < ChunkData.SIZE_Y; y++) {
                    const index = this._getIndex(x, y, z);
                    const paletteIdx = this._readBits(index);
                    if (paletteIdx !== 0) {
                        callback(x, y, z, this._palette[paletteIdx]);
                    }
                }
            }
        }
    }

    /**
     * 指定範囲の全座標をイテレート（空気含む）
     * @param {function(number, number, number, string): void} callback
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

    // ========== ライトマップ ==========

    /**
     * 明るさを取得
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @returns {number} 明るさ（0〜15、範囲外は0）
     */
    getLight(x, y, z) {
        if (!this._isInBounds(x, y, z)) return 0;
        return this._lightMap[this._getIndex(x, y, z)];
    }

    /**
     * 明るさを設定
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @param {number} level - 明るさ（0〜15にクランプ）
     */
    setLight(x, y, z, level) {
        if (!this._isInBounds(x, y, z)) return;
        this._lightMap[this._getIndex(x, y, z)] = Math.max(0, Math.min(15, level));
    }

    // ========== ハイトマップ ==========

    /**
     * ハイトマップを構築（チャンク生成後に1回呼び出す）
     * 各(x,z)列の最高不透明ブロックY座標を記録
     * @param {Set<string>} [transparentIds] - 光透過ブロックIDのセット
     */
    buildHeightMap(transparentIds) {
        for (let x = 0; x < ChunkData.SIZE_X; x++) {
            for (let z = 0; z < ChunkData.SIZE_Z; z++) {
                let maxY = -1;
                for (let y = ChunkData.SIZE_Y - 1; y >= 0; y--) {
                    const block = this.getBlock(x, y, z);
                    if (block && block !== 'air' && block !== 'water' &&
                        !(transparentIds && transparentIds.has(block))) {
                        maxY = y;
                        break;
                    }
                }
                this._heightMap[x * ChunkData.SIZE_Z + z] = maxY;
            }
        }
    }

    /**
     * 指定列の最高不透明ブロックY座標を取得
     * @param {number} x - ローカルX座標
     * @param {number} z - ローカルZ座標
     * @returns {number} 最高ブロックY座標（-1 = 全て空気）
     */
    getHeight(x, z) {
        if (x < 0 || x >= ChunkData.SIZE_X || z < 0 || z >= ChunkData.SIZE_Z) return -1;
        return this._heightMap[x * ChunkData.SIZE_Z + z];
    }

    /**
     * 指定座標から空が見えるか判定
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @returns {boolean} 空が見えるか
     */
    isSkyVisible(x, y, z) {
        if (!this._isInBounds(x, y, z)) return false;
        return y > this.getHeight(x, z);
    }

    /**
     * シリアライズ用にデータを取得（ChunkStorage用）
     */
    getSerializedData() {
        return {
            palette: this._palette.slice(),
            bitsPerBlock: this._bitsPerBlock,
            data: new Uint8Array(this._data),
            baseY: this.baseY
        };
    }

    /**
     * シリアライズデータから復元（ChunkStorage用）
     */
    static fromSerializedData(chunkX, chunkZ, serialized) {
        const chunk = new ChunkData(chunkX, chunkZ);
        chunk._palette = serialized.palette.slice();
        chunk._bitsPerBlock = serialized.bitsPerBlock;
        chunk._data = new Uint8Array(serialized.data);
        chunk.baseY = serialized.baseY || 0;

        // paletteIndex を再構築
        chunk._paletteIndex = new Map();
        serialized.palette.forEach((block, index) => {
            chunk._paletteIndex.set(block, index);
        });

        return chunk;
    }
}

// グローバルスコープに公開
window.ChunkData = ChunkData;
