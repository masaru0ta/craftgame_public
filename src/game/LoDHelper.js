/**
 * LoDHelper - LoD計算ヘルパークラス
 *
 * LoD 0: ゲームチャンク（テクスチャ、最優先生成）
 * LoD 1: 風景チャンク（頂点カラー、余裕時に生成）
 */
class LoDHelper {
    /**
     * 16進数カラーをRGBに変換
     * @param {string} hex - 16進数カラー（例: "#4CAF50"）
     * @returns {{r: number, g: number, b: number}} 0-1範囲のRGB
     */
    static _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255
            };
        }
        return { r: 0.5, g: 0.5, b: 0.5 }; // デフォルトはグレー
    }

    /**
     * LoD色分け表示用の色を取得
     * @param {number} lodLevel - LoDレベル（0または1）
     * @returns {string} 16進数カラー
     */
    static getDebugColor(lodLevel) {
        const colors = {
            0: '#00FF00', // 緑
            1: '#FFFF00'  // 黄
        };
        return colors[lodLevel] || '#FFFFFF';
    }
}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
    window.LoDHelper = LoDHelper;
}
