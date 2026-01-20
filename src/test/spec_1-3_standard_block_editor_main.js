/**
 * 標準ブロックエディタ メインスクリプト
 */

// GASデプロイURL
const GAS_DEPLOY_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// グローバル変数
let api = null;
let editor = null;
let blocks = [];
let textures = [];
let currentBlock = null;

// DOM要素
const blockSelect = document.getElementById('block-select');
const blockStrIdField = document.getElementById('block-str-id');
const blockNameField = document.getElementById('block-name');
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');
const previewContainer = document.getElementById('preview-container');
const textureContainer = document.getElementById('texture-container');

/**
 * ステータスメッセージを表示
 * @param {string} message - メッセージ
 * @param {string} type - タイプ（success, error, loading）
 */
function showStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;
}

/**
 * ブロック選択プルダウンを更新
 */
function updateBlockSelect() {
  blockSelect.innerHTML = '';

  if (blocks.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '-- ブロックがありません --';
    blockSelect.appendChild(option);
    return;
  }

  // 通常ブロック（shape_type="normal"）のみフィルタリング
  const normalBlocks = blocks.filter(b => b.shape_type === 'normal');

  if (normalBlocks.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '-- 通常ブロックがありません --';
    blockSelect.appendChild(option);
    return;
  }

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- 選択してください --';
  blockSelect.appendChild(defaultOption);

  normalBlocks.forEach(block => {
    const option = document.createElement('option');
    option.value = block.block_id;
    option.textContent = `${block.block_id}: ${block.name}`;
    blockSelect.appendChild(option);
  });
}

/**
 * ブロック選択時の処理
 */
function onBlockSelect() {
  const blockId = parseInt(blockSelect.value, 10);

  if (isNaN(blockId)) {
    currentBlock = null;
    blockStrIdField.textContent = '-';
    blockNameField.textContent = '-';
    saveBtn.disabled = true;
    return;
  }

  currentBlock = blocks.find(b => b.block_id === blockId);

  if (!currentBlock) {
    blockStrIdField.textContent = '-';
    blockNameField.textContent = '-';
    saveBtn.disabled = true;
    return;
  }

  blockStrIdField.textContent = currentBlock.block_str_id || '-';
  blockNameField.textContent = currentBlock.name || '-';
  saveBtn.disabled = false;

  // エディタにブロックデータを設定
  editor.setBlockData(currentBlock);
}

/**
 * 保存ボタンの処理
 */
async function onSave() {
  if (!currentBlock) return;

  saveBtn.disabled = true;
  showStatus('保存中...', 'loading');

  try {
    // 現在のテクスチャ設定を取得
    const textureSettings = editor.getTextureSettings();

    // ブロックデータを更新
    const updatedBlock = {
      ...currentBlock,
      ...textureSettings
    };

    // APIで保存
    await api.saveBlock(updatedBlock);

    // ブロック一覧を再取得
    blocks = await api.getBlocks();
    updateBlockSelect();

    // 現在のブロックを更新
    currentBlock = blocks.find(b => b.block_id === updatedBlock.block_id);

    showStatus('保存しました', 'success');
  } catch (error) {
    console.error('保存エラー:', error);
    showStatus('保存に失敗しました: ' + error.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * テクスチャアップロード時の処理
 * @param {Object} textureData - テクスチャデータ
 */
async function onTextureUpload(textureData) {
  showStatus('テクスチャをアップロード中...', 'loading');

  try {
    await api.saveTexture(textureData);

    // テクスチャ一覧を再取得
    textures = await api.getTextures();
    editor.textures = textures;

    showStatus('テクスチャをアップロードしました', 'success');
  } catch (error) {
    console.error('テクスチャアップロードエラー:', error);
    showStatus('アップロードに失敗しました: ' + error.message, 'error');
    throw error;
  }
}

/**
 * 初期化
 */
async function init() {
  showStatus('データを読み込み中...', 'loading');

  // API初期化
  api = new GasApi(GAS_DEPLOY_URL);

  // メッシュビルダー初期化
  const meshBuilder = new StandardBlockMeshBuilder(THREE);

  // エディタ初期化
  editor = new StandardBlockEditor({
    previewContainer: previewContainer,
    textureContainer: textureContainer,
    THREE: THREE,
    meshBuilder: meshBuilder
  });

  // テクスチャアップロードコールバックを設定
  editor.onTextureUpload = onTextureUpload;

  try {
    // 全データを取得
    const data = await api.getAll();
    blocks = data.blocks || [];
    textures = data.textures || [];

    // エディタにテクスチャ一覧を設定
    editor.textures = textures;

    // プルダウンを更新
    updateBlockSelect();

    // イベントリスナーを設定
    blockSelect.addEventListener('change', onBlockSelect);
    saveBtn.addEventListener('click', onSave);

    showStatus('読み込み完了', 'success');

    // 1秒後にメッセージをクリア
    setTimeout(() => {
      showStatus('');
    }, 1000);

  } catch (error) {
    console.error('初期化エラー:', error);
    showStatus('データの読み込みに失敗しました: ' + error.message, 'error');
  }
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', init);
