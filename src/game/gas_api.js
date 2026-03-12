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

  // ========================================
  // データファイル管理 API
  // ========================================

  /**
   * GETリクエストでデータを送信（CORS対策）
   * @param {string} action - APIアクション名
   * @param {Object} data - リクエストデータ
   * @returns {Promise<Object>} レスポンスデータ
   */
  async getWithData(action, data) {
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const url = `${this.baseUrl}?action=${action}&data=${encodedData}`;
    const response = await fetch(url);
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }
    return result.data;
  }

  /**
   * データファイル一覧を取得
   * @returns {Promise<Object>} { files, activeId }
   */
  async getDataFiles() {
    return this.get('getDataFiles');
  }

  /**
   * 使用中データファイルを設定
   * @param {Object} params - { id }
   * @returns {Promise<Object>} 結果
   */
  async setActiveDataFile(params) {
    return this.getWithData('setActiveDataFile', params);
  }

  /**
   * データファイルを作成
   * @param {Object} params - { name, spreadsheetId }
   * @returns {Promise<Object>} 作成されたファイル
   */
  async createDataFile(params) {
    return this.getWithData('createDataFile', params);
  }

  /**
   * データファイルを更新
   * @param {Object} params - { id, name, spreadsheetId }
   * @returns {Promise<Object>} 結果
   */
  async updateDataFile(params) {
    return this.getWithData('updateDataFile', params);
  }

  /**
   * データファイルを削除
   * @param {Object} params - { id }
   * @returns {Promise<Object>} 結果
   */
  async deleteDataFile(params) {
    return this.getWithData('deleteDataFile', params);
  }

  /**
   * データファイルをコピー
   * @param {Object} params - { id }
   * @returns {Promise<Object>} 作成されたファイル
   */
  async copyDataFile(params) {
    return this.getWithData('copyDataFile', params);
  }

  // ========================================
  // アイテム API
  // ========================================

  /**
   * アイテム一覧を取得
   * @returns {Promise<Array>} アイテム一覧
   */
  async getItems() {
    return this.get('getItems');
  }

  /**
   * アイテムを保存（新規/更新）
   * @param {Object} itemData - アイテムデータ
   * @returns {Promise<Object>} { item_id }
   */
  async saveItem(itemData) {
    return this.post('saveItem', itemData);
  }

  /**
   * アイテムを削除
   * @param {string} itemStrId - 削除するアイテムの文字列ID
   * @returns {Promise<Object>} { deleted: true }
   */
  async deleteItem(itemStrId) {
    return this.post('deleteItem', { item_str_id: itemStrId });
  }

  // ========================================
  // 構造物 API
  // ========================================

  // ========================================
  // キャラクター API
  // ========================================

  /**
   * キャラクター一覧を取得
   * @returns {Promise<Array>} キャラクター一覧
   */
  async getCharacters() {
    return this.get('getCharacters');
  }

  /**
   * キャラクターを保存（新規/更新）
   * @param {Object} data - キャラクターデータ
   * @returns {Promise<Object>} { character_id }
   */
  async saveCharacter(data) {
    return this.getWithData('saveCharacter', data);
  }

  /**
   * キャラクターを削除
   * @param {string} characterStrId - 削除するキャラクターの文字列ID
   * @returns {Promise<Object>} { deleted: true }
   */
  async deleteCharacter(characterStrId) {
    return this.getWithData('deleteCharacter', { character_str_id: characterStrId });
  }

  /**
   * 構造物一覧を取得
   * @returns {Promise<Array>} 構造物一覧
   */
  async getStructures() {
    return this.get('getStructures');
  }

  /**
   * 構造物を新規作成
   * @param {Object} data - { str_id, name, category }
   * @returns {Promise<Object>} { structure_id }
   */
  async createStructure(data) {
    return this.getWithData('createStructure', data);
  }

  /**
   * 構造物を保存（更新）
   * @param {Object} data - 構造物データ（structure_id必須）
   * @returns {Promise<Object>} { structure_id }
   */
  async saveStructure(data) {
    return this.getWithData('saveStructure', data);
  }

  /**
   * 構造物を削除
   * @param {Object} params - { structure_id }
   * @returns {Promise<Object>} { deleted: true }
   */
  async deleteStructure(params) {
    return this.getWithData('deleteStructure', params);
  }
}
