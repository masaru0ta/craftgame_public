/**
 * GAS API クライアントライブラリ
 * スプレッドシートのデータを読み書きするためのAPI通信を行う
 */

class GasApi {
  /**
   * コンストラクタ
   * @param {string} deployUrl - GASデプロイURL
   */
  constructor(deployUrl) {
    this.deployUrl = deployUrl;
  }

  /**
   * GETリクエストを送信
   * @param {string} action - アクション名
   * @param {Object} data - データ（書き込み系の場合）
   * @returns {Promise<Object>} レスポンスデータ
   */
  async get(action, data = null) {
    let url = `${this.deployUrl}?action=${action}`;
    if (data) {
      url += `&data=${encodeURIComponent(JSON.stringify(data))}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '不明なエラー');
    }
    return result.data;
  }

  /**
   * ブロック一覧を取得
   * @returns {Promise<Array>} ブロック配列
   */
  async getBlocks() {
    return this.get('getBlocks');
  }

  /**
   * テクスチャ一覧を取得
   * @returns {Promise<Array>} テクスチャ配列
   */
  async getTextures() {
    return this.get('getTextures');
  }

  /**
   * 全データを取得
   * @returns {Promise<Object>} ブロックとテクスチャのデータ
   */
  async getAll() {
    return this.get('getAll');
  }

  /**
   * ブロックを新規作成
   * @param {Object} blockData - ブロックデータ（block_str_id, name, shape_type）
   * @returns {Promise<Object>} 結果（block_id を含む）
   */
  async createBlock(blockData) {
    return this.get('createBlock', blockData);
  }

  /**
   * ブロックを保存
   * @param {Object} blockData - ブロックデータ
   * @returns {Promise<Object>} 結果
   */
  async saveBlock(blockData) {
    return this.get('saveBlock', blockData);
  }

  /**
   * ブロックを削除
   * @param {number} blockId - ブロックID
   * @returns {Promise<Object>} 結果
   */
  async deleteBlock(blockId) {
    return this.get('deleteBlock', { block_id: blockId });
  }

  /**
   * テクスチャを保存
   * @param {Object} textureData - テクスチャデータ
   * @returns {Promise<Object>} 結果
   */
  async saveTexture(textureData) {
    return this.get('saveTexture', textureData);
  }

  /**
   * テクスチャを削除
   * @param {number} textureId - テクスチャID
   * @returns {Promise<Object>} 結果
   */
  async deleteTexture(textureId) {
    return this.get('deleteTexture', { texture_id: textureId });
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.GasApi = GasApi;
}
