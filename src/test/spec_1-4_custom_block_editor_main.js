/**
 * spec_1-4_custom_block_editor テストページ用スクリプト
 */

// GAS APIのベースURL
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// グローバル変数
let api = null;
let editorUI = null;
let blocks = [];
let textures = [];
let currentBlock = null;

/**
 * 初期化
 */
async function init() {
  // API初期化
  api = new GasApi(GAS_API_URL);

  // UI要素取得
  const blockSelect = document.getElementById('block-select');
  const blockStrId = document.getElementById('block-str-id');
  const blockName = document.getElementById('block-name');
  const saveBtn = document.getElementById('save-btn');
  const statusMessage = document.getElementById('status-message');
  const editorContainer = document.getElementById('editor-container');

  // エディタUI初期化
  editorUI = new BlockEditorUI({
    container: editorContainer,
    THREE: THREE,
    onTextureAdd: handleTextureAdd,
    onBlockChange: handleBlockChange
  });
  editorUI.init();

  // テスト用にグローバル公開
  window.editorUI = editorUI;

  // データ読み込み
  await loadData();

  // イベント設定
  blockSelect.addEventListener('change', handleBlockSelect);
  saveBtn.addEventListener('click', handleSave);
}

/**
 * データ読み込み
 */
async function loadData() {
  const statusMessage = document.getElementById('status-message');
  const blockSelect = document.getElementById('block-select');

  try {
    showStatus('loading', 'データを読み込み中...');

    // 全データ取得
    const data = await api.getAll();
    blocks = data.blocks || [];
    textures = data.textures || [];

    // テクスチャをエディタに設定
    editorUI.setTextures(textures);

    // ブロック選択プルダウンを更新
    blockSelect.innerHTML = '<option value="">ブロックを選択</option>';

    // customタイプのブロックのみ表示
    const customBlocks = blocks.filter(b => b.shape_type === 'custom');
    customBlocks.forEach(block => {
      const option = document.createElement('option');
      option.value = block.block_id;
      option.textContent = `${block.block_id}: ${block.block_str_id}`;
      blockSelect.appendChild(option);
    });

    showStatus('success', 'データを読み込みました');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    showStatus('error', 'データの読み込みに失敗しました: ' + error.message);
  }
}

/**
 * ブロック選択時の処理
 */
function handleBlockSelect(e) {
  const blockId = parseInt(e.target.value);
  if (!blockId) {
    currentBlock = null;
    document.getElementById('block-str-id').textContent = '-';
    document.getElementById('block-name').textContent = '-';
    return;
  }

  currentBlock = blocks.find(b => b.block_id === blockId);
  if (!currentBlock) return;

  // 表示更新
  document.getElementById('block-str-id').textContent = currentBlock.block_str_id;
  document.getElementById('block-name').textContent = currentBlock.name;

  // エディタにロード
  editorUI.loadBlock(currentBlock, textures);
}

/**
 * テクスチャ追加ボタン押下時の処理
 */
function handleTextureAdd(slot) {
  alert(`テクスチャ追加が選択されました (スロット: ${slot})\nこの機能はblock_managerで実装されます。`);
}

/**
 * ブロックデータ変更時の処理
 */
function handleBlockChange(blockData) {
  console.log('ブロックデータ変更:', blockData);
}

/**
 * 保存ボタン押下時の処理
 */
async function handleSave() {
  if (!currentBlock) {
    showStatus('error', 'ブロックが選択されていません');
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;

  try {
    showStatus('loading', '保存中...');

    // 現在のブロックデータを取得
    const blockData = editorUI.getBlockData();

    // API送信
    await api.saveBlock(blockData);

    // ローカルデータも更新
    const index = blocks.findIndex(b => b.block_id === currentBlock.block_id);
    if (index !== -1) {
      blocks[index] = blockData;
    }
    currentBlock = blockData;

    showStatus('success', '保存しました');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('保存エラー:', error);
    showStatus('error', '保存に失敗しました: ' + error.message);
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * ステータスメッセージを表示
 */
function showStatus(type, message) {
  const statusMessage = document.getElementById('status-message');
  statusMessage.className = `status-message ${type}`;
  statusMessage.textContent = message;
}

/**
 * ステータスメッセージを非表示
 */
function hideStatus() {
  const statusMessage = document.getElementById('status-message');
  statusMessage.className = 'status-message';
  statusMessage.textContent = '';
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', init);
