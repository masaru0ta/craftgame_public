/**
 * GAS API通信ライブラリ
 * スプレッドシートのデータを読み書きするためのAPIクライアント
 */
class GasApi {
  /**
   * @param {string} baseUrl - GAS APIのベースURL
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * GETリクエストを送信
   * @param {string} action - APIアクション名
   * @returns {Promise<Object>} レスポンスデータ
   */
  async get(action) {
    const url = `${this.baseUrl}?action=${action}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }
    return data.data;
  }

  /**
   * POSTリクエストを送信
   * @param {string} action - APIアクション名
   * @param {Object} body - リクエストボディ
   * @returns {Promise<Object>} レスポンスデータ
   */
  async post(action, body) {
    const url = `${this.baseUrl}?action=${action}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }
    return data.data;
  }

  /**
   * ブロック一覧を取得
   * @returns {Promise<Array>} ブロック一覧
   */
  async getBlocks() {
    return this.get('getBlocks');
  }

  /**
   * テクスチャ一覧を取得
   * @returns {Promise<Array>} テクスチャ一覧
   */
  async getTextures() {
    return this.get('getTextures');
  }

  /**
   * 全データを取得
   * @returns {Promise<Object>} { blocks, textures }
   */
  async getAll() {
    return this.get('getAll');
  }

  /**
   * ブロックを新規作成
   * @param {Object} blockData - { block_str_id, name, shape_type }
   * @returns {Promise<Object>} { block_id }
   */
  async createBlock(blockData) {
    return this.post('createBlock', blockData);
  }

  /**
   * ブロックを更新
   * @param {Object} blockData - ブロックデータ（block_id必須）
   * @returns {Promise<Object>} { block_id }
   */
  async saveBlock(blockData) {
    return this.post('saveBlock', blockData);
  }

  /**
   * ブロックを削除
   * @param {number} blockId - 削除するブロックのID
   * @returns {Promise<Object>} { deleted: true }
   */
  async deleteBlock(blockId) {
    return this.post('deleteBlock', { block_id: blockId });
  }

  /**
   * テクスチャを追加/更新
   * @param {Object} textureData - テクスチャデータ
   * @returns {Promise<Object>} { texture_id }
   */
  async saveTexture(textureData) {
    return this.post('saveTexture', textureData);
  }

  /**
   * テクスチャを削除
   * @param {number} textureId - 削除するテクスチャのID
   * @returns {Promise<Object>} { deleted: true }
   */
  async deleteTexture(textureId) {
    return this.post('deleteTexture', { texture_id: textureId });
  }
}
