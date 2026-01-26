/**
 * craftgame5 GAS API
 * スプレッドシートのデータを読み書きするAPI
 */

// スプレッドシートID
const SPREADSHEET_ID = '1opkXxb8BRxQKGD7WKwbEvElWfd9UvIvx8wIDdm36GiM';

// シート名
const SHEET_BLOCKS = 'ブロック状態';
const SHEET_TEXTURES = 'テクスチャ';

// キャッシュ設定
const CACHE_KEY_BLOCKS = 'blocks';
const CACHE_KEY_TEXTURES = 'textures';
const CACHE_EXPIRATION_SECONDS = 300; // 5分

/**
 * キャッシュからデータを取得
 * @param {string} key - キャッシュキー
 * @returns {*} キャッシュデータ（なければnull）
 */
function getFromCache(key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  return cached ? JSON.parse(cached) : null;
}

/**
 * キャッシュにデータを保存（失敗しても処理を続行）
 * @param {string} key - キャッシュキー
 * @param {*} data - 保存するデータ
 */
function saveToCache(key, data) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(key, JSON.stringify(data), CACHE_EXPIRATION_SECONDS);
  } catch (e) {
    // キャッシュ保存失敗（100KB超過など）は無視して続行
    console.log('Cache save failed: ' + key + ' - ' + e.message);
  }
}

/**
 * キャッシュを削除
 * @param {string} key - キャッシュキー
 */
function clearCache(key) {
  const cache = CacheService.getScriptCache();
  cache.remove(key);
}

/**
 * GETリクエストのハンドラ
 * 読み取り・書き込み両方をGETで処理（CORS対策）
 * @param {Object} e - リクエストイベント
 * @returns {TextOutput} JSONレスポンス
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const dataParam = e.parameter.data;
    const data = dataParam ? JSON.parse(decodeURIComponent(dataParam)) : null;

    let result;
    switch (action) {
      // 読み取り系
      case 'getBlocks':
        result = getBlocks();
        break;
      case 'getTextures':
        result = getTextures();
        break;
      case 'getAll':
        result = getAll();
        break;
      // 書き込み系
      case 'createBlock':
        result = createBlock(data);
        break;
      case 'saveBlock':
        result = saveBlock(data);
        break;
      case 'deleteBlock':
        result = deleteBlock(data);
        break;
      case 'saveTexture':
        result = saveTexture(data);
        break;
      case 'deleteTexture':
        result = deleteTexture(data);
        break;
      default:
        return createErrorResponse('不正なアクション: ' + action);
    }

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error.message);
  }
}

/**
 * POSTリクエストのハンドラ
 * @param {Object} e - リクエストイベント
 * @returns {TextOutput} JSONレスポンス
 */
function doPost(e) {
  try {
    const action = e.parameter.action;
    const body = JSON.parse(e.postData.contents);

    let result;
    switch (action) {
      case 'createBlock':
        result = createBlock(body);
        break;
      case 'saveBlock':
        result = saveBlock(body);
        break;
      case 'deleteBlock':
        result = deleteBlock(body);
        break;
      case 'saveTexture':
        result = saveTexture(body);
        break;
      case 'deleteTexture':
        result = deleteTexture(body);
        break;
      default:
        return createErrorResponse('不正なアクション: ' + action);
    }

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error.message);
  }
}

/**
 * ブロック状態リストを取得（キャッシュ対応）
 * @returns {Array} ブロック状態の配列
 */
function getBlocks() {
  // キャッシュを確認
  const cached = getFromCache(CACHE_KEY_BLOCKS);
  if (cached) {
    return cached;
  }

  // スプレッドシートから取得
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const blocks = getBlocksFromSheet(ss.getSheetByName(SHEET_BLOCKS));

  // キャッシュに保存
  saveToCache(CACHE_KEY_BLOCKS, blocks);

  return blocks;
}

/**
 * シートからブロック状態リストを取得（内部関数）
 * @param {Sheet} sheet - ブロックシート
 * @returns {Array} ブロック状態の配列
 */
function getBlocksFromSheet(sheet) {
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers = data[0];
  const blocks = [];

  // 省略可能な項目（空の場合は省略）
  const optionalFields = [
    'drop_item', 'tex_top', 'tex_bottom', 'tex_front', 'tex_back', 'tex_left', 'tex_right',
    'voxel_look', 'voxel_collision', 'material_1', 'material_2', 'material_3'
  ];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // 空行をスキップ
    if (!row[0] && row[0] !== 0) continue;

    const block = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j];

      // 省略可能な項目で空の場合はスキップ
      if (optionalFields.includes(header) && (value === '' || value === null || value === undefined)) {
        continue;
      }

      // 型変換
      if (header === 'block_id' || header === 'light_level') {
        block[header] = Number(value);
      } else if (header === 'is_transparent') {
        block[header] = Boolean(value);
      } else {
        block[header] = value;
      }
    }

    blocks.push(block);
  }

  return blocks;
}

/**
 * テクスチャリストを取得（キャッシュ対応）
 * @returns {Array} テクスチャの配列
 */
function getTextures() {
  // キャッシュを確認
  const cached = getFromCache(CACHE_KEY_TEXTURES);
  if (cached) {
    return cached;
  }

  // スプレッドシートから取得
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const textures = getTexturesFromSheet(ss.getSheetByName(SHEET_TEXTURES));

  // キャッシュに保存
  saveToCache(CACHE_KEY_TEXTURES, textures);

  return textures;
}

/**
 * シートからテクスチャリストを取得（内部関数）
 * @param {Sheet} sheet - テクスチャシート
 * @returns {Array} テクスチャの配列
 */
function getTexturesFromSheet(sheet) {
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) {
    return [];
  }

  const headers = data[0];
  const textures = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // 空行をスキップ
    if (!row[0] && row[0] !== 0) continue;

    const texture = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j];

      // 型変換
      if (header === 'texture_id') {
        texture[header] = Number(value);
      } else {
        texture[header] = value;
      }
    }

    textures.push(texture);
  }

  return textures;
}

/**
 * 全データを取得（スプレッドシートを1回だけ開く）
 * @returns {Object} ブロックとテクスチャのデータ
 */
function getAll() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    blocks: getBlocksFromSheet(ss.getSheetByName(SHEET_BLOCKS)),
    textures: getTexturesFromSheet(ss.getSheetByName(SHEET_TEXTURES))
  };
}

/**
 * 成功レスポンスを作成
 * @param {*} data - レスポンスデータ
 * @returns {TextOutput} JSONレスポンス
 */
function createSuccessResponse(data) {
  const response = {
    success: true,
    data: data
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * エラーレスポンスを作成
 * @param {string} message - エラーメッセージ
 * @returns {TextOutput} JSONレスポンス
 */
function createErrorResponse(message) {
  const response = {
    success: false,
    error: message
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ブロックを新規作成
 * @param {Object} blockData - ブロックデータ
 * @returns {Object} 結果
 */
function createBlock(blockData) {
  // バリデーション: block_str_id が空でないこと
  if (!blockData.block_str_id || blockData.block_str_id.trim() === '') {
    throw new Error('block_str_id is required');
  }

  // バリデーション: block_str_id が英数字とアンダースコアのみで構成されること
  if (!/^[a-zA-Z0-9_]+$/.test(blockData.block_str_id)) {
    throw new Error('block_str_id must contain only alphanumeric characters and underscores');
  }

  // バリデーション: name が空でないこと
  if (!blockData.name || blockData.name.trim() === '') {
    throw new Error('name is required');
  }

  // バリデーション: shape_type が "normal" または "custom" であること
  if (blockData.shape_type !== 'normal' && blockData.shape_type !== 'custom') {
    throw new Error('shape_type must be "normal" or "custom"');
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // block_str_id の重複チェック
  const blockStrIdIndex = headers.indexOf('block_str_id');
  for (let i = 1; i < data.length; i++) {
    if (data[i][blockStrIdIndex] === blockData.block_str_id) {
      throw new Error('block_str_id already exists');
    }
  }

  // 新しい block_id を取得（最大値 + 1）
  const blockIdIndex = headers.indexOf('block_id');
  let maxBlockId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = data[i][blockIdIndex];
    if (id && id > maxBlockId) {
      maxBlockId = id;
    }
  }
  const newBlockId = maxBlockId + 1;

  // 行データを作成
  const rowData = headers.map(header => {
    if (header === 'block_id') {
      return newBlockId;
    }
    if (blockData.hasOwnProperty(header)) {
      return blockData[header];
    }
    // デフォルト値
    if (header === 'is_transparent') {
      return false;
    }
    if (header === 'light_level') {
      return 0;
    }
    return '';
  });

  // 新規行を追加
  sheet.appendRow(rowData);

  // キャッシュを無効化
  clearCache(CACHE_KEY_BLOCKS);

  return { block_id: newBlockId };
}

/**
 * ブロックを更新（既存ブロックのみ）
 * @param {Object} blockData - ブロックデータ
 * @returns {Object} 結果
 */
function saveBlock(blockData) {
  // バリデーション: block_id が必須
  if (blockData.block_id === undefined || blockData.block_id === null) {
    throw new Error('block_id is required');
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // block_idで既存行を検索
  const blockIdIndex = headers.indexOf('block_id');
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][blockIdIndex] === blockData.block_id) {
      rowIndex = i + 1; // シートの行番号（1始まり）
      break;
    }
  }

  // 存在しない場合はエラー
  if (rowIndex < 0) {
    throw new Error('block_id not found');
  }

  // 行データを作成
  const rowData = headers.map(header => {
    if (blockData.hasOwnProperty(header)) {
      return blockData[header];
    }
    return '';
  });

  // 既存行を更新
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);

  // キャッシュを無効化
  clearCache(CACHE_KEY_BLOCKS);

  return { block_id: blockData.block_id };
}

/**
 * ブロックを削除
 * @param {Object} params - 削除パラメータ
 * @returns {Object} 結果
 */
function deleteBlock(params) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_BLOCKS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const blockIdIndex = headers.indexOf('block_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][blockIdIndex] === params.block_id) {
      sheet.deleteRow(i + 1);
      // キャッシュを無効化
      clearCache(CACHE_KEY_BLOCKS);
      return { deleted: true };
    }
  }

  throw new Error('block_id not found');
}

/**
 * テクスチャを追加または更新
 * @param {Object} textureData - テクスチャデータ
 * @returns {Object} 結果
 */
function saveTexture(textureData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_TEXTURES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // texture_idで既存行を検索
  const textureIdIndex = headers.indexOf('texture_id');
  let rowIndex = -1;
  let maxTextureId = 0;

  for (let i = 1; i < data.length; i++) {
    const id = data[i][textureIdIndex];
    if (id && id > maxTextureId) {
      maxTextureId = id;
    }
    if (data[i][textureIdIndex] === textureData.texture_id) {
      rowIndex = i + 1;
    }
  }

  // 新規作成時はtexture_idを自動生成
  let textureId = textureData.texture_id;
  if (rowIndex < 0 && (textureId === undefined || textureId === null)) {
    textureId = maxTextureId + 1;
  }

  // 行データを作成
  const rowData = headers.map(header => {
    if (header === 'texture_id') {
      return textureId;
    }
    if (textureData.hasOwnProperty(header)) {
      return textureData[header];
    }
    return '';
  });

  if (rowIndex > 0) {
    // 既存行を更新
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]);
  } else {
    // 新規行を追加
    sheet.appendRow(rowData);
  }

  // キャッシュを無効化
  clearCache(CACHE_KEY_TEXTURES);

  return { texture_id: textureId };
}

/**
 * テクスチャを削除
 * @param {Object} params - 削除パラメータ
 * @returns {Object} 結果
 */
function deleteTexture(params) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_TEXTURES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const textureIdIndex = headers.indexOf('texture_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][textureIdIndex] === params.texture_id) {
      sheet.deleteRow(i + 1);
      // キャッシュを無効化
      clearCache(CACHE_KEY_TEXTURES);
      return { deleted: true };
    }
  }

  throw new Error('texture_id not found');
}
