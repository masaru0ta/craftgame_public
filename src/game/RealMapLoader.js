/**
 * RealMapLoader - リアル地形PNGローダー
 *
 * delta4_lc4形式のPNG画像をバイナリレベルで解析し、
 * 標高・被覆データを復元するクラス。
 *
 * Canvas APIは使用しない（パレットインデックスPNGはRGB展開されるため）。
 */
class RealMapLoader {
    constructor() {
        /** @type {Int16Array|null} 各ピクセルの標高（ブロック単位） */
        this.elevationMap = null;
        /** @type {Uint8Array|null} 各ピクセルの被覆クラスインデックス */
        this.landcoverMap = null;
        /** @type {Uint8Array|null} 各行頭の絶対標高オフセット値 */
        this.rowStarts = null;
        /** @type {number[]} 被覆クラス値リスト */
        this.lcClasses = [];
        /** @type {number} マップ幅 */
        this._width = 0;
        /** @type {number} マップ高さ */
        this._height = 0;
        /** @type {number} ブロックサイズ（メートル） */
        this.blockSize = 0;
        /** @type {string} グリッドサイズ文字列 */
        this.gridSize = '';
        /** @type {string} フォーマット識別子 */
        this.format = '';
        /** @type {boolean} 読み込み完了フラグ */
        this._loaded = false;
    }

    /** @returns {boolean} 読み込み完了状態 */
    get loaded() { return this._loaded; }

    /** @returns {number} マップ幅（ピクセル） */
    get mapWidth() { return this._width; }

    /** @returns {number} マップ高さ（ピクセル） */
    get mapHeight() { return this._height; }

    /**
     * PNGファイルを読み込みデコードする
     * @param {string} url - PNGファイルのURL
     * @returns {Promise<void>}
     */
    async load(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        // PNGシグネチャ検証
        this._verifySignature(data);

        // PNGチャンクをパース
        const chunks = this._parseChunks(data);

        // IHDRからサイズ取得
        const ihdr = chunks.find(c => c.type === 'IHDR');
        if (!ihdr) throw new Error('IHDRチャンクが見つかりません');
        this._parseIHDR(ihdr.data);

        // tEXtメタデータ取得
        const textChunks = chunks.filter(c => c.type === 'tEXt');
        this._parseTextChunks(textChunks);

        // IDATデータを連結して解凍
        const idatChunks = chunks.filter(c => c.type === 'IDAT');
        const compressedData = this._concatIDATChunks(idatChunks);
        const rawData = pako.inflate(compressedData);

        // PNGフィルタを適用してピクセルデータを復元
        const pixelData = this._applyFilters(rawData, this._width, this._height);

        // delta4_lc4形式をデコード
        this._decode(pixelData);

        this._loaded = true;
    }

    /**
     * 指定ワールド座標の標高（ブロック単位）を取得
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {number}
     */
    getElevation(worldX, worldZ) {
        if (worldX < 0 || worldX >= this._width || worldZ < 0 || worldZ >= this._height) {
            return 0;
        }
        // X軸反転: 画像の左右とゲーム表示の左右を一致させる
        const mx = this._width - 1 - worldX;
        return this.elevationMap[worldZ * this._width + mx];
    }

    /**
     * 指定ワールド座標の被覆クラスインデックスを取得
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {number}
     */
    getLandcover(worldX, worldZ) {
        if (worldX < 0 || worldX >= this._width || worldZ < 0 || worldZ >= this._height) {
            return 0;
        }
        const mx = this._width - 1 - worldX;
        return this.landcoverMap[worldZ * this._width + mx];
    }

    // ========== 内部メソッド ==========

    /**
     * PNGシグネチャを検証
     * @param {Uint8Array} data
     */
    _verifySignature(data) {
        const sig = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
            if (data[i] !== sig[i]) {
                throw new Error('不正なPNGシグネチャ');
            }
        }
    }

    /**
     * PNGチャンクをパース
     * @param {Uint8Array} data
     * @returns {Array<{type: string, data: Uint8Array}>}
     */
    _parseChunks(data) {
        const chunks = [];
        let offset = 8; // シグネチャの後

        while (offset < data.length) {
            // チャンク長（4バイト、ビッグエンディアン）
            const length = (data[offset] << 24) | (data[offset + 1] << 16) |
                           (data[offset + 2] << 8) | data[offset + 3];
            offset += 4;

            // チャンクタイプ（4バイト、ASCII）
            const type = String.fromCharCode(data[offset], data[offset + 1],
                                             data[offset + 2], data[offset + 3]);
            offset += 4;

            // チャンクデータ
            const chunkData = data.slice(offset, offset + length);
            offset += length;

            // CRC（4バイト、スキップ）
            offset += 4;

            chunks.push({ type, data: chunkData });

            if (type === 'IEND') break;
        }

        return chunks;
    }

    /**
     * IHDRチャンクをパース
     * @param {Uint8Array} data
     */
    _parseIHDR(data) {
        this._width = (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
        this._height = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7];
        const bitDepth = data[8];
        const colorType = data[9];

        if (colorType !== 3) {
            console.warn(`colorType=${colorType} (期待値: 3/インデックスカラー)`);
        }
        if (bitDepth !== 8) {
            console.warn(`bitDepth=${bitDepth} (期待値: 8)`);
        }
    }

    /**
     * tEXtチャンクからメタデータを取得
     * @param {Array<{type: string, data: Uint8Array}>} textChunks
     */
    _parseTextChunks(textChunks) {
        for (const chunk of textChunks) {
            // tEXt: keyword\0text
            const nullIdx = chunk.data.indexOf(0);
            if (nullIdx < 0) continue;

            const keyword = this._bytesToString(chunk.data.slice(0, nullIdx));
            const value = this._bytesToString(chunk.data.slice(nullIdx + 1));

            switch (keyword) {
                case 'RowStarts':
                    this.rowStarts = this._base64ToUint8Array(value);
                    break;
                case 'BlockSize':
                    this.blockSize = parseInt(value, 10);
                    break;
                case 'GridSize':
                    this.gridSize = value;
                    break;
                case 'Format':
                    this.format = value;
                    break;
                case 'LcClasses':
                    this.lcClasses = value.split(',').map(Number);
                    break;
            }
        }
    }

    /**
     * IDATチャンクを連結
     * @param {Array<{type: string, data: Uint8Array}>} idatChunks
     * @returns {Uint8Array}
     */
    _concatIDATChunks(idatChunks) {
        const totalLength = idatChunks.reduce((sum, c) => sum + c.data.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of idatChunks) {
            result.set(chunk.data, offset);
            offset += chunk.data.length;
        }
        return result;
    }

    /**
     * PNGフィルタを適用してピクセルデータを復元
     * フィルタタイプ: 0(None), 1(Sub), 2(Up), 3(Average), 4(Paeth)
     * @param {Uint8Array} rawData - 解凍後データ（フィルタバイト含む）
     * @param {number} width
     * @param {number} height
     * @returns {Uint8Array} フィルタ適用後のピクセルデータ
     */
    _applyFilters(rawData, width, height) {
        const bpp = 1; // 8bitインデックスカラー: 1バイト/ピクセル
        const stride = width * bpp; // 1行のバイト数（フィルタバイト除く）
        const pixels = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
            const filterType = rawData[y * (stride + 1)];
            const rowStart = y * (stride + 1) + 1;
            const outStart = y * stride;

            for (let x = 0; x < stride; x++) {
                const raw = rawData[rowStart + x];
                const a = x >= bpp ? pixels[outStart + x - bpp] : 0; // 左
                const b = y > 0 ? pixels[outStart - stride + x] : 0; // 上
                const c = (x >= bpp && y > 0) ? pixels[outStart - stride + x - bpp] : 0; // 左上

                let value;
                switch (filterType) {
                    case 0: // None
                        value = raw;
                        break;
                    case 1: // Sub
                        value = (raw + a) & 0xFF;
                        break;
                    case 2: // Up
                        value = (raw + b) & 0xFF;
                        break;
                    case 3: // Average
                        value = (raw + Math.floor((a + b) / 2)) & 0xFF;
                        break;
                    case 4: // Paeth
                        value = (raw + this._paethPredictor(a, b, c)) & 0xFF;
                        break;
                    default:
                        value = raw;
                }
                pixels[outStart + x] = value;
            }
        }

        return pixels;
    }

    /**
     * Paeth予測関数
     * @param {number} a - 左
     * @param {number} b - 上
     * @param {number} c - 左上
     * @returns {number}
     */
    _paethPredictor(a, b, c) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        if (pa <= pb && pa <= pc) return a;
        if (pb <= pc) return b;
        return c;
    }

    /**
     * delta4_lc4形式のピクセルデータをデコード
     * @param {Uint8Array} pixelData
     */
    _decode(pixelData) {
        const w = this._width;
        const h = this._height;
        this.elevationMap = new Int16Array(w * h);
        this.landcoverMap = new Uint8Array(w * h);

        for (let y = 0; y < h; y++) {
            let elevBlocks = this.rowStarts[y] - 128; // 行頭の絶対標高

            for (let x = 0; x < w; x++) {
                const pixel = pixelData[y * w + x];
                const deltaEnc = pixel >> 4;       // 上位4bit
                const lcIndex = pixel & 0x0F;      // 下位4bit
                const delta = deltaEnc - 8;

                if (x > 0) {
                    elevBlocks += delta;
                }

                this.elevationMap[y * w + x] = elevBlocks;
                this.landcoverMap[y * w + x] = lcIndex;
            }
        }
    }

    /**
     * Uint8Arrayを文字列に変換
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    _bytesToString(bytes) {
        let str = '';
        for (let i = 0; i < bytes.length; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return str;
    }

    /**
     * Base64文字列をUint8Arrayに変換
     * @param {string} base64
     * @returns {Uint8Array}
     */
    _base64ToUint8Array(base64) {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes;
    }
}

// グローバルスコープに公開
window.RealMapLoader = RealMapLoader;
