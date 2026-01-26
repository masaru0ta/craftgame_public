/**
 * ブロック形状管理ツール メインスクリプト
 * 仕様書 1-6 の処理ロジックを実装
 */

// GAS API URL (グローバル変数 window.GAS_API_URL で上書き可能)
const GAS_API_URL = window.GAS_API_URL || 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// アプリケーション状態
const state = {
  blocks: [],
  textures: [],
  selectedBlockId: null,
  selectedTextureId: null,
  isModified: false,
  api: null,
  editorUI: null, // BlockEditorUI インスタンス
};

// DOM要素キャッシュ
const elements = {};

/**
 * 初期化
 */
async function init() {
  // DOM要素をキャッシュ
  cacheElements();

  // GAS APIクライアント初期化
  state.api = new GasApi(GAS_API_URL);

  // BlockEditorUI 初期化
  initBlockEditorUI();

  // イベントリスナー設定
  setupEventListeners();

  // データ読み込み
  await loadData();
}

/**
 * BlockEditorUI を初期化
 */
function initBlockEditorUI() {
  const container = document.querySelector('.col-right');
  if (!container) return;

  // 既存のプレビューコンテナを削除
  const existingPreview = container.querySelector('.preview-container');
  if (existingPreview) {
    existingPreview.remove();
  }

  // BlockEditorUI を初期化
  state.editorUI = new BlockEditorUI({
    container: container,
    THREE: THREE,
    onTextureAdd: (slot) => {
      // テクスチャ追加ダイアログを開く（将来の拡張用）
      console.log('テクスチャ追加:', slot);
    },
    onBlockChange: (blockData) => {
      state.isModified = true;
    }
  });
  state.editorUI.init();
}

/**
 * DOM要素をキャッシュ
 */
function cacheElements() {
  elements.tabs = document.querySelectorAll('.tab');
  elements.mains = document.querySelectorAll('.main');
  elements.blockGrid = document.getElementById('blockGrid');
  elements.textureGrid = document.getElementById('textureGrid');
  elements.blockStrId = document.getElementById('blockStrId');
  elements.blockName = document.getElementById('blockName');
  elements.blockTypeSelect = document.getElementById('blockTypeSelect');
  elements.dropItem = document.getElementById('dropItem');
  elements.lightLevel = document.getElementById('lightLevel');
  elements.isTransparent = document.getElementById('isTransparent');
  elements.saveBlockBtn = document.getElementById('saveBlockBtn');
  elements.deleteBlockBtn = document.getElementById('deleteBlockBtn');
  elements.createBlockModal = document.getElementById('createBlockModal');
  elements.createError = document.getElementById('createError');
  elements.createBlockSubmit = document.getElementById('createBlockSubmit');
  elements.textureId = document.getElementById('textureId');
  elements.textureFilename = document.getElementById('textureFilename');
  elements.textureColor = document.getElementById('textureColor');
  elements.textureColorHex = document.getElementById('textureColorHex');
  elements.texturePreview = document.getElementById('texturePreview');
  elements.saveTextureBtn = document.getElementById('saveTextureBtn');
  elements.deleteTextureBtn = document.getElementById('deleteTextureBtn');
  elements.pickerOverlay = document.getElementById('pickerOverlay');
  elements.pickerGrid = document.getElementById('pickerGrid');
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // タブ切り替え
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // ブロック保存
  elements.saveBlockBtn.addEventListener('click', saveBlock);

  // ブロック削除
  elements.deleteBlockBtn.addEventListener('click', deleteBlock);

  // ブロックタイプ変更
  elements.blockTypeSelect.addEventListener('change', handleBlockTypeChange);

  // フォーム変更検知
  [elements.blockName, elements.dropItem, elements.lightLevel].forEach(el => {
    el.addEventListener('input', () => { state.isModified = true; });
  });
  elements.isTransparent.addEventListener('change', () => { state.isModified = true; });

  // 新規作成モーダル
  elements.createBlockModal.querySelector('.modal-close').addEventListener('click', closeCreateModal);
  elements.createBlockModal.querySelector('.modal-cancel').addEventListener('click', closeCreateModal);
  elements.createBlockSubmit.addEventListener('click', createBlock);
  elements.createBlockModal.addEventListener('click', (e) => {
    if (e.target === elements.createBlockModal) closeCreateModal();
  });

  // テクスチャ保存
  elements.saveTextureBtn.addEventListener('click', saveTexture);

  // テクスチャカラー同期
  elements.textureColor.addEventListener('input', () => {
    elements.textureColorHex.value = elements.textureColor.value;
  });
  elements.textureColorHex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(elements.textureColorHex.value)) {
      elements.textureColor.value = elements.textureColorHex.value;
    }
  });

  // ピッカー閉じる
  elements.pickerOverlay.querySelector('.picker-close').addEventListener('click', closePicker);
  elements.pickerOverlay.addEventListener('click', (e) => {
    if (e.target === elements.pickerOverlay) closePicker();
  });
}

/**
 * データ読み込み
 */
async function loadData() {
  try {
    const data = await state.api.getAll();
    state.blocks = data.blocks.sort((a, b) => a.block_id - b.block_id);
    state.textures = data.textures.sort((a, b) => a.texture_id - b.texture_id);

    renderBlockGrid();
    renderTextureGrid();

    // 先頭を選択
    if (state.blocks.length > 0) {
      selectBlock(state.blocks[0].block_id);
    }
    if (state.textures.length > 0) {
      selectTexture(state.textures[0].texture_id);
    }
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    alert('データの読み込みに失敗しました。');
  }
}

/**
 * タブ切り替え
 */
function switchTab(tabName) {
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  document.getElementById('blockList').classList.toggle('active', tabName === 'blocks');
  document.getElementById('textureList').classList.toggle('active', tabName === 'textures');
}

// ========================================
// ブロック一覧
// ========================================

/**
 * ブロックグリッド描画
 */
function renderBlockGrid() {
  elements.blockGrid.innerHTML = '';

  state.blocks.forEach(block => {
    const tile = createBlockTile(block);
    elements.blockGrid.appendChild(tile);
  });

  // 新規追加タイル
  const addTile = document.createElement('div');
  addTile.className = 'tile add-new';
  addTile.innerHTML = '<div class="tile-img" style="font-size:24px;color:#4285f4;">+</div><div class="tile-name">新規追加</div>';
  addTile.addEventListener('click', openCreateModal);
  elements.blockGrid.appendChild(addTile);
}

/**
 * ブロックタイル作成
 */
function createBlockTile(block) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.blockId = block.block_id;

  if (block.block_id === state.selectedBlockId) {
    tile.classList.add('selected');
  }

  // サムネイル色を取得
  const texture = state.textures.find(t => t.texture_id === block.texture_id);
  const color = texture ? texture.color_hex : '#9e9e9e';

  tile.innerHTML = `
    <div class="tile-img" style="background:${color};"></div>
    <div class="tile-name">${escapeHtml(block.name)}</div>
  `;

  tile.addEventListener('click', () => handleBlockClick(block.block_id));
  return tile;
}

/**
 * ブロッククリックハンドラ
 */
async function handleBlockClick(blockId) {
  if (blockId === state.selectedBlockId) return;

  // 未保存の変更確認
  if (state.isModified) {
    const confirmed = confirm('変更が保存されていません。破棄してよろしいですか？');
    if (!confirmed) return;
  }

  selectBlock(blockId);
}

/**
 * ブロック選択
 */
function selectBlock(blockId) {
  state.selectedBlockId = blockId;
  state.isModified = false;

  // タイルの選択状態更新
  elements.blockGrid.querySelectorAll('.tile').forEach(tile => {
    tile.classList.toggle('selected', parseInt(tile.dataset.blockId) === blockId);
  });

  // フォーム更新
  const block = state.blocks.find(b => b.block_id === blockId);
  if (block) {
    elements.blockStrId.value = block.block_str_id || '';
    elements.blockName.value = block.name || '';
    elements.blockTypeSelect.value = block.shape_type || 'normal';
    elements.dropItem.value = block.drop_item || '';
    elements.lightLevel.value = block.light_level || 0;
    elements.isTransparent.checked = block.is_transparent || false;

    // BlockEditorUI にブロックをロード
    if (state.editorUI) {
      state.editorUI.loadBlock(block, state.textures);
    }
  }
}

/**
 * ブロックタイプ変更ハンドラ
 */
function handleBlockTypeChange(e) {
  const newType = e.target.value;
  const block = state.blocks.find(b => b.block_id === state.selectedBlockId);
  if (!block) return;

  if (block.shape_type !== newType) {
    const confirmed = confirm('ブロックタイプを変更すると、関連データがクリアされます。よろしいですか？');
    if (!confirmed) {
      e.target.value = block.shape_type;
      return;
    }
    state.isModified = true;

    // BlockEditorUI を再ロード
    if (state.editorUI) {
      const updatedBlock = { ...block, shape_type: newType };
      state.editorUI.loadBlock(updatedBlock, state.textures);
    }
  }
}

/**
 * ブロック保存
 */
async function saveBlock() {
  const block = state.blocks.find(b => b.block_id === state.selectedBlockId);
  if (!block) return;

  const updatedBlock = {
    block_id: block.block_id,
    block_str_id: elements.blockStrId.value,
    name: elements.blockName.value,
    shape_type: elements.blockTypeSelect.value,
    drop_item: elements.dropItem.value,
    light_level: parseInt(elements.lightLevel.value) || 0,
    is_transparent: elements.isTransparent.checked,
  };

  try {
    await state.api.saveBlock(updatedBlock);

    // ローカル状態を更新
    Object.assign(block, updatedBlock);
    state.isModified = false;

    renderBlockGrid();
    selectBlock(block.block_id);
  } catch (error) {
    console.error('保存エラー:', error);
    alert('保存に失敗しました。');
  }
}

/**
 * ブロック削除
 */
async function deleteBlock() {
  const block = state.blocks.find(b => b.block_id === state.selectedBlockId);
  if (!block) return;

  const confirmed = confirm(`「${block.name}」を削除してよろしいですか？`);
  if (!confirmed) return;

  try {
    await state.api.deleteBlock(block.block_id);

    // ローカル状態から削除
    const index = state.blocks.findIndex(b => b.block_id === block.block_id);
    if (index >= 0) {
      state.blocks.splice(index, 1);
    }

    state.isModified = false;
    renderBlockGrid();

    // 次のブロックを選択
    if (state.blocks.length > 0) {
      selectBlock(state.blocks[0].block_id);
    } else {
      state.selectedBlockId = null;
    }
  } catch (error) {
    console.error('削除エラー:', error);
    alert('削除に失敗しました。');
  }
}

// ========================================
// 新規ブロック作成
// ========================================

/**
 * 新規作成モーダルを開く
 */
function openCreateModal() {
  elements.createBlockModal.classList.add('show');
  elements.createBlockModal.querySelector('input[name="block_str_id"]').value = '';
  elements.createBlockModal.querySelector('input[name="name"]').value = '';
  elements.createBlockModal.querySelector('select[name="shape_type"]').value = 'normal';
  hideError();
}

/**
 * 新規作成モーダルを閉じる
 */
function closeCreateModal() {
  elements.createBlockModal.classList.remove('show');
}

/**
 * ブロック作成
 */
async function createBlock() {
  const blockStrId = elements.createBlockModal.querySelector('input[name="block_str_id"]').value.trim();
  const name = elements.createBlockModal.querySelector('input[name="name"]').value.trim();
  const shapeType = elements.createBlockModal.querySelector('select[name="shape_type"]').value;

  // バリデーション
  if (!blockStrId) {
    showError('ブロックIDは必須です。');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(blockStrId)) {
    showError('ブロックIDは英数字とアンダースコアのみ使用できます。');
    return;
  }

  if (state.blocks.some(b => b.block_str_id === blockStrId)) {
    showError('このブロックIDは既に使用されています。');
    return;
  }

  if (!name) {
    showError('表示名は必須です。');
    return;
  }

  try {
    const result = await state.api.createBlock({
      block_str_id: blockStrId,
      name: name,
      shape_type: shapeType,
    });

    // ローカル状態に追加
    const newBlock = {
      block_id: result.block_id,
      block_str_id: blockStrId,
      name: name,
      shape_type: shapeType,
    };
    state.blocks.push(newBlock);
    state.blocks.sort((a, b) => a.block_id - b.block_id);

    closeCreateModal();
    renderBlockGrid();
    selectBlock(newBlock.block_id);
  } catch (error) {
    console.error('作成エラー:', error);
    showError('ブロックの作成に失敗しました。');
  }
}

/**
 * エラー表示
 */
function showError(message) {
  elements.createError.textContent = message;
  elements.createError.classList.add('show');
}

/**
 * エラー非表示
 */
function hideError() {
  elements.createError.classList.remove('show');
}

// ========================================
// テクスチャ一覧
// ========================================

/**
 * テクスチャグリッド描画
 */
function renderTextureGrid() {
  elements.textureGrid.innerHTML = '';

  state.textures.forEach(texture => {
    const tile = createTextureTile(texture);
    elements.textureGrid.appendChild(tile);
  });
}

/**
 * テクスチャタイル作成
 */
function createTextureTile(texture) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.textureId = texture.texture_id;

  if (texture.texture_id === state.selectedTextureId) {
    tile.classList.add('selected');
  }

  tile.innerHTML = `
    <div class="tile-img" style="background:${texture.color_hex || '#9e9e9e'};"></div>
    <div class="tile-id">ID: ${texture.texture_id}</div>
    <div class="tile-name">${escapeHtml(texture.filename || '')}</div>
  `;

  tile.addEventListener('click', () => selectTexture(texture.texture_id));
  return tile;
}

/**
 * テクスチャ選択
 */
function selectTexture(textureId) {
  state.selectedTextureId = textureId;

  // タイルの選択状態更新
  elements.textureGrid.querySelectorAll('.tile').forEach(tile => {
    tile.classList.toggle('selected', parseInt(tile.dataset.textureId) === textureId);
  });

  // フォーム更新
  const texture = state.textures.find(t => t.texture_id === textureId);
  if (texture) {
    elements.textureId.value = texture.texture_id;
    elements.textureFilename.value = texture.filename || '';
    elements.textureColor.value = texture.color_hex || '#9e9e9e';
    elements.textureColorHex.value = texture.color_hex || '#9e9e9e';
    elements.texturePreview.style.background = texture.color_hex || '#9e9e9e';
  }
}

/**
 * テクスチャ保存
 */
async function saveTexture() {
  const texture = state.textures.find(t => t.texture_id === state.selectedTextureId);
  if (!texture) return;

  const updatedTexture = {
    texture_id: texture.texture_id,
    color_hex: elements.textureColor.value,
  };

  try {
    await state.api.saveTexture(updatedTexture);

    // ローカル状態を更新
    texture.color_hex = updatedTexture.color_hex;

    renderTextureGrid();
    selectTexture(texture.texture_id);

    // ブロック一覧も更新（サムネイル色が変わる可能性）
    renderBlockGrid();
  } catch (error) {
    console.error('保存エラー:', error);
    alert('保存に失敗しました。');
  }
}

// ========================================
// テクスチャピッカー
// ========================================

/**
 * ピッカーを開く
 */
function openPicker(callback) {
  elements.pickerGrid.innerHTML = '';

  state.textures.forEach(texture => {
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.innerHTML = `
      <div class="tex-preview" style="background:${texture.color_hex || '#9e9e9e'};"></div>
      <div class="tex-label">${escapeHtml(texture.filename || '')}</div>
    `;
    item.addEventListener('click', () => {
      callback(texture);
      closePicker();
    });
    elements.pickerGrid.appendChild(item);
  });

  elements.pickerOverlay.classList.add('show');
}

/**
 * ピッカーを閉じる
 */
function closePicker() {
  elements.pickerOverlay.classList.remove('show');
}

// ========================================
// ユーティリティ
// ========================================

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初期化実行
document.addEventListener('DOMContentLoaded', init);
