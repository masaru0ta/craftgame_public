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
  thumbnailGenerator: null, // BlockThumbnail インスタンス
  thumbnailCache: {}, // サムネイルキャッシュ { block_id: dataUrl }
};

// DOM要素キャッシュ
const elements = {};

// テクスチャ追加時のスロット情報を保持
let pendingTextureSlot = null;
let pendingTextureSlotType = null;

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

  // BlockThumbnail 初期化（サムネイル生成用）
  state.thumbnailGenerator = new BlockThumbnail({
    THREE: THREE,
    size: 128,
    backgroundColor: '#ffffff'
  });

  // イベントリスナー設定
  setupEventListeners();

  // データ読み込み
  await loadData();

  // テスト用にstateをグローバルに公開
  window.state = state;
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
      openTextureFileDialog(slot);
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
  elements.textureFileInput = document.getElementById('textureFileInput');
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

  // テクスチャ削除
  elements.deleteTextureBtn.addEventListener('click', deleteTexture);

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

  // テクスチャファイル選択
  elements.textureFileInput.addEventListener('change', handleTextureFileSelect);
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

  // サムネイル色を取得（フォールバック用）
  const texture = state.textures.find(t => t.texture_id === block.texture_id);
  const color = texture ? texture.color_hex : '#9e9e9e';

  tile.innerHTML = `
    <div class="tile-img" style="background:${color};"></div>
    <div class="tile-name">${escapeHtml(block.name)}</div>
  `;

  tile.addEventListener('click', () => handleBlockClick(block.block_id));

  // サムネイル生成（非同期）
  generateThumbnailForTile(tile, block);

  return tile;
}

/**
 * タイルのサムネイルを生成
 * @param {HTMLElement} tile - タイル要素
 * @param {Object} block - ブロックデータ
 */
async function generateThumbnailForTile(tile, block) {
  if (!state.thumbnailGenerator) return;

  // キャッシュにあればそれを使用
  if (state.thumbnailCache[block.block_id]) {
    applyThumbnailToTile(tile, state.thumbnailCache[block.block_id]);
    return;
  }

  try {
    const dataUrl = await state.thumbnailGenerator.generate(block, state.textures);
    state.thumbnailCache[block.block_id] = dataUrl;
    applyThumbnailToTile(tile, dataUrl);
  } catch (error) {
    console.error('サムネイル生成エラー:', error);
  }
}

/**
 * サムネイル画像をタイルに適用
 * @param {HTMLElement} tile - タイル要素
 * @param {string} dataUrl - Data URL
 */
function applyThumbnailToTile(tile, dataUrl) {
  const tileImg = tile.querySelector('.tile-img');
  if (!tileImg) return;

  // 背景スタイルをクリア
  tileImg.style.background = '';

  // img要素を作成
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';

  // 既存の内容をクリアして画像を追加
  tileImg.innerHTML = '';
  tileImg.appendChild(img);

  // サムネイル生成済みフラグを設定
  tile.dataset.hasThumbnail = 'true';
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

  // 基本情報
  const updatedBlock = {
    block_id: block.block_id,
    block_str_id: elements.blockStrId.value,
    name: elements.blockName.value,
    shape_type: elements.blockTypeSelect.value,
    drop_item: elements.dropItem.value,
    light_level: parseInt(elements.lightLevel.value) || 0,
    is_transparent: elements.isTransparent.checked,
  };

  // BlockEditorUIから形状データを取得してマージ
  if (state.editorUI) {
    const shapeData = state.editorUI.getBlockData();
    if (updatedBlock.shape_type === 'custom') {
      // カスタムブロック用データ
      updatedBlock.material_1 = shapeData.material_1 || '';
      updatedBlock.material_2 = shapeData.material_2 || '';
      updatedBlock.material_3 = shapeData.material_3 || '';
      updatedBlock.voxel_look = shapeData.voxel_look || '';
      updatedBlock.voxel_collision = shapeData.voxel_collision || '';
    } else {
      // 標準ブロック用データ
      updatedBlock.tex_default = shapeData.tex_default || '';
      updatedBlock.tex_front = shapeData.tex_front || '';
      updatedBlock.tex_top = shapeData.tex_top || '';
      updatedBlock.tex_bottom = shapeData.tex_bottom || '';
      updatedBlock.tex_left = shapeData.tex_left || '';
      updatedBlock.tex_right = shapeData.tex_right || '';
      updatedBlock.tex_back = shapeData.tex_back || '';
    }
  }

  try {
    await state.api.saveBlock(updatedBlock);

    // ローカル状態を更新
    Object.assign(block, updatedBlock);
    state.isModified = false;

    // サムネイルキャッシュを無効化
    delete state.thumbnailCache[block.block_id];

    renderBlockGrid();
    selectBlock(block.block_id);

    // 成功フィードバック
    showSaveResult(true);
  } catch (error) {
    console.error('保存エラー:', error);
    // 失敗フィードバック
    showSaveResult(false);
  }
}

/**
 * 保存結果のフィードバックを表示
 * @param {boolean} success - 成功かどうか
 */
function showSaveResult(success) {
  const btn = elements.saveBlockBtn;
  const originalText = btn.textContent;

  if (success) {
    btn.classList.add('save-success');
    btn.textContent = '保存完了';
  } else {
    btn.classList.add('save-error');
    btn.textContent = '保存失敗';
  }

  // 1.5秒後に元に戻す
  setTimeout(() => {
    btn.classList.remove('save-success', 'save-error');
    btn.textContent = '保存';
  }, 1500);
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

  // テクスチャ画像があれば表示、なければ代表色
  const imgStyle = texture.image_base64
    ? `background-image:url(${texture.image_base64});background-size:cover;background-position:center;`
    : `background:${texture.color_hex || '#9e9e9e'};`;

  tile.innerHTML = `
    <div class="tile-img" style="${imgStyle}"></div>
    <div class="tile-id">ID: ${texture.texture_id}</div>
    <div class="tile-name">${escapeHtml(texture.file_name || '')}</div>
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
    elements.textureFilename.value = texture.file_name || '';
    elements.textureColor.value = texture.color_hex || '#9e9e9e';
    elements.textureColorHex.value = texture.color_hex || '#9e9e9e';

    // プレビュー：テクスチャ画像があれば表示、なければ代表色
    if (texture.image_base64) {
      elements.texturePreview.style.backgroundImage = `url(${texture.image_base64})`;
      elements.texturePreview.style.backgroundSize = 'cover';
      elements.texturePreview.style.backgroundPosition = 'center';
      elements.texturePreview.style.backgroundColor = '';
    } else {
      elements.texturePreview.style.backgroundImage = '';
      elements.texturePreview.style.backgroundColor = texture.color_hex || '#9e9e9e';
    }
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

/**
 * テクスチャ削除
 */
async function deleteTexture() {
  const texture = state.textures.find(t => t.texture_id === state.selectedTextureId);
  if (!texture) return;

  if (!confirm(`テクスチャ「${texture.file_name || texture.texture_id}」を削除しますか？`)) {
    return;
  }

  try {
    await state.api.deleteTexture(texture.texture_id);

    // ローカル状態から削除
    const idx = state.textures.findIndex(t => t.texture_id === texture.texture_id);
    if (idx >= 0) {
      state.textures.splice(idx, 1);
    }

    renderTextureGrid();

    // 先頭のテクスチャを選択（あれば）
    if (state.textures.length > 0) {
      selectTexture(state.textures[0].texture_id);
    }
  } catch (error) {
    console.error('削除エラー:', error);
    alert('削除に失敗しました。');
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
      <div class="tex-label">${escapeHtml(texture.file_name || '')}</div>
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
// テクスチャアップロード
// ========================================

/**
 * テクスチャファイル選択ダイアログを開く
 * @param {string|number} slot - スロット名または番号
 */
function openTextureFileDialog(slot) {
  // 現在のスロットタイプを判定
  const slotType = state.editorUI && state.editorUI.currentShapeType === 'custom' ? 'custom' : 'normal';
  pendingTextureSlot = slot;
  pendingTextureSlotType = slotType;

  // ファイル選択ダイアログを開く
  elements.textureFileInput.click();
}

/**
 * テクスチャファイル選択ハンドラ
 * @param {Event} e - changeイベント
 */
async function handleTextureFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // ファイル入力をリセット（同じファイルを再選択可能に）
  e.target.value = '';

  try {
    // ファイルをBase64に変換
    const base64 = await fileToBase64(file);

    // GAS APIでアップロード（saveTextureでtexture_id省略時は新規追加）
    const result = await state.api.saveTexture({
      file_name: file.name,
      image_base64: base64,
      color_hex: '#808080' // デフォルトの代表色
    });

    // ローカル状態に追加
    const newTexture = {
      texture_id: result.texture_id,
      file_name: file.name,
      image_base64: base64,
      color_hex: '#808080'
    };
    state.textures.push(newTexture);
    state.textures.sort((a, b) => a.texture_id - b.texture_id);

    // テクスチャ一覧を更新
    renderTextureGrid();

    // BlockEditorUIのテクスチャを更新
    if (state.editorUI) {
      state.editorUI.setTextures(state.textures);

      // アップロードしたテクスチャをスロットに設定
      if (pendingTextureSlot !== null) {
        if (pendingTextureSlotType === 'custom') {
          state.editorUI.setMaterial(pendingTextureSlot, file.name);
        } else {
          state.editorUI.setTexture(pendingTextureSlot, file.name);
        }
      }
    }

    // 保留中のスロット情報をクリア
    pendingTextureSlot = null;
    pendingTextureSlotType = null;

  } catch (error) {
    console.error('テクスチャアップロードエラー:', error);
    alert('テクスチャのアップロードに失敗しました。');
  }
}

/**
 * ファイルをBase64に変換
 * @param {File} file - ファイル
 * @returns {Promise<string>} Base64データURL
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
