/**
 * GAS API 通信ライブラリ
 * ゲーム本体、管理ツールで利用
 */

const GasAPI = (function() {
  const API_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

  /**
   * GETリクエストを送信
   * @param {string} action - アクション名
   * @returns {Promise<any>} レスポンスデータ
   */
  async function get(action) {
    const response = await fetch(`${API_URL}?action=${action}`);
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'APIエラー');
    }
    return result.data;
  }

  /**
   * 書き込み用GETリクエストを送信（CORS対策）
   * @param {string} action - アクション名
   * @param {Object} data - 送信データ
   * @returns {Promise<any>} レスポンスデータ
   */
  async function send(action, data) {
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const response = await fetch(`${API_URL}?action=${action}&data=${encodedData}`);
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'APIエラー');
    }
    return result.data;
  }

  return {
    /**
     * 全データを取得（ブロック一覧とテクスチャ一覧）
     * @returns {Promise<{blocks: Array, textures: Array}>}
     */
    getAll: function() {
      return get('getAll');
    },

    /**
     * ブロック一覧を取得
     * @returns {Promise<Array>}
     */
    getBlocks: function() {
      return get('getBlocks');
    },

    /**
     * テクスチャ一覧を取得
     * @returns {Promise<Array>}
     */
    getTextures: function() {
      return get('getTextures');
    },

    /**
     * ブロックを保存（追加/更新）
     * @param {Object} blockData - ブロックデータ
     * @returns {Promise<{block_id: number}>}
     */
    saveBlock: function(blockData) {
      return send('saveBlock', blockData);
    },

    /**
     * ブロックを削除
     * @param {number} blockId - ブロックID
     * @returns {Promise<{deleted: boolean}>}
     */
    deleteBlock: function(blockId) {
      return send('deleteBlock', { block_id: blockId });
    },

    /**
     * テクスチャを保存（追加/更新）
     * @param {Object} textureData - テクスチャデータ
     * @returns {Promise<{texture_id: number}>}
     */
    saveTexture: function(textureData) {
      return send('saveTexture', textureData);
    },

    /**
     * テクスチャを削除
     * @param {number} textureId - テクスチャID
     * @returns {Promise<{deleted: boolean}>}
     */
    deleteTexture: function(textureId) {
      return send('deleteTexture', { texture_id: textureId });
    }
  };
})();
