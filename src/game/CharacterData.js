/**
 * CharacterData
 * キャラクターパーツ表面カラーデータの管理・エンコード/デコード
 */
class CharacterData {
    // パーツ定義（固定）
    static PARTS = {
        head:  { width: 8, height: 8,  depth: 8, pivot: [4, 0, 4], offset: [0, 24, -2] },
        body:  { width: 8, height: 12, depth: 4, pivot: [4, 6, 2], offset: [0, 12, 0] },
        arm_r: { width: 4, height: 12, depth: 4, pivot: [0, 12, 2], offset: [-4, 12, 0] },
        arm_l: { width: 4, height: 12, depth: 4, pivot: [4, 12, 2], offset: [8, 12, 0] },
        leg_r: { width: 4, height: 12, depth: 4, pivot: [2, 12, 2], offset: [0, 0, 0] },
        leg_l: { width: 4, height: 12, depth: 4, pivot: [2, 12, 2], offset: [4, 0, 0] }
    };

    // 面ID定数
    // 格納順: +Y, -Y, +X, -X, +Z, -Z
    static FACE = { PY: 0, NY: 1, PX: 2, NX: 3, PZ: 4, NZ: 5 };

    constructor() {
        // パーツごとに全6面分のUint32Arrayを作成
        this.parts = {};
        for (const partId of Object.keys(CharacterData.PARTS)) {
            const totalCells = this._getTotalCells(partId);
            this.parts[partId] = new Uint32Array(totalCells);
        }
    }

    /**
     * パーツの全セル数を計算
     */
    _getTotalCells(partId) {
        let total = 0;
        for (let faceId = 0; faceId < 6; faceId++) {
            const size = this.getFaceSize(partId, faceId);
            total += size.rows * size.cols;
        }
        return total;
    }

    /**
     * 面のグリッドサイズを返す
     * @param {string} partId - パーツID
     * @param {number} faceId - 面ID (0-5)
     * @returns {{rows: number, cols: number}}
     */
    getFaceSize(partId, faceId) {
        const p = CharacterData.PARTS[partId];
        switch (faceId) {
            case 0: // +Y 上面: W × D
            case 1: // -Y 底面: W × D
                return { rows: p.depth, cols: p.width };
            case 2: // +X 右面: D × H
            case 3: // -X 左面: D × H
                return { rows: p.height, cols: p.depth };
            case 4: // +Z 前面: W × H
            case 5: // -Z 背面: W × H
                return { rows: p.height, cols: p.width };
            default:
                return { rows: 0, cols: 0 };
        }
    }

    /**
     * 面の先頭インデックスを取得（内部用）
     */
    _getFaceOffset(partId, faceId) {
        let offset = 0;
        for (let f = 0; f < faceId; f++) {
            const size = this.getFaceSize(partId, f);
            offset += size.rows * size.cols;
        }
        return offset;
    }

    /**
     * セルの色を取得
     * @param {string} partId - パーツID
     * @param {number} faceId - 面ID (0-5)
     * @param {number} row - 行
     * @param {number} col - 列
     * @returns {number} 色値（0=デフォルト）
     */
    getCell(partId, faceId, row, col) {
        const size = this.getFaceSize(partId, faceId);
        const offset = this._getFaceOffset(partId, faceId);
        const index = offset + row * size.cols + col;
        return this.parts[partId][index];
    }

    /**
     * セルの色を設定
     * @param {string} partId - パーツID
     * @param {number} faceId - 面ID (0-5)
     * @param {number} row - 行
     * @param {number} col - 列
     * @param {number} color - 色値（0=デフォルト色に戻す）
     */
    setCell(partId, faceId, row, col, color) {
        const size = this.getFaceSize(partId, faceId);
        const offset = this._getFaceOffset(partId, faceId);
        const index = offset + row * size.cols + col;
        this.parts[partId][index] = color;
    }

    /**
     * パーツの全面を消去
     * @param {string} partId - パーツID
     */
    clearPart(partId) {
        this.parts[partId].fill(0);
    }

    /**
     * パーツデータをBase64文字列にエンコード
     * @param {string} partId - パーツID
     * @returns {string} Base64文字列
     */
    encodePart(partId) {
        const data = this.parts[partId];
        // Uint32Array → Uint8Arrayに変換
        const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        // pako.deflateで圧縮
        const compressed = pako.deflate(uint8);
        // Base64エンコード
        return this._uint8ArrayToBase64(compressed);
    }

    /**
     * Base64文字列からパーツデータを復元
     * @param {string} partId - パーツID
     * @param {string} base64 - Base64文字列
     */
    decodePart(partId, base64) {
        // Base64デコード
        const compressed = this._base64ToUint8Array(base64);
        // pako.inflateで解凍
        const decompressed = pako.inflate(compressed);
        // Uint32Arrayとして復元
        const totalCells = this._getTotalCells(partId);
        const uint32 = new Uint32Array(decompressed.buffer, decompressed.byteOffset, totalCells);
        this.parts[partId] = new Uint32Array(uint32);
    }

    /**
     * 全パーツデータをJSON形式で返す
     * @returns {Object}
     */
    toJSON() {
        const json = {};
        for (const partId of Object.keys(CharacterData.PARTS)) {
            json['part_' + partId] = this.encodePart(partId);
        }
        return json;
    }

    /**
     * JSONからCharacterDataを復元
     * @param {Object} json - toJSON()の戻り値
     * @returns {CharacterData}
     */
    static fromJSON(json) {
        const data = new CharacterData();
        for (const partId of Object.keys(CharacterData.PARTS)) {
            const key = 'part_' + partId;
            if (json[key]) {
                data.decodePart(partId, json[key]);
            }
        }
        return data;
    }

    /**
     * Uint8ArrayをBase64文字列に変換
     */
    _uint8ArrayToBase64(uint8Array) {
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }

    /**
     * Base64文字列をUint8Arrayに変換
     */
    _base64ToUint8Array(base64) {
        const binary = atob(base64);
        const uint8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            uint8[i] = binary.charCodeAt(i);
        }
        return uint8;
    }
}

if (typeof window !== 'undefined') {
    window.CharacterData = CharacterData;
}
