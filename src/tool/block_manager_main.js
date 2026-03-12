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
  dataFiles: [],
  activeDataFileId: null,
  selectedDataFileId: null,
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
  elements.tabSelect = document.getElementById('tabSelect');
  elements.mains = document.querySelectorAll('.main');
  elements.blockGrid = document.getElementById('blockGrid');
  elements.textureGrid = document.getElementById('textureGrid');
  elements.blockStrId = document.getElementById('blockStrId');
  elements.blockName = document.getElementById('blockName');
  elements.blockTypeSelect = document.getElementById('blockTypeSelect');
  elements.dropItem = document.getElementById('dropItem');
  elements.lightLevel = document.getElementById('lightLevel');
  elements.isTransparent = document.getElementById('isTransparent');
  elements.halfPlaceable = document.getElementById('halfPlaceable');
  elements.halfPlaceableGroup = document.getElementById('halfPlaceableGroup');
  elements.stairPlaceable = document.getElementById('stairPlaceable');
  elements.stairPlaceableGroup = document.getElementById('stairPlaceableGroup');
  elements.rotatable = document.getElementById('rotatable');
  elements.rotatableGroup = document.getElementById('rotatableGroup');
  elements.sidePlaceable = document.getElementById('sidePlaceable');
  elements.sidePlaceableGroup = document.getElementById('sidePlaceableGroup');
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
  elements.avgColorBtn = document.getElementById('avgColorBtn');
  elements.modeColorBtn = document.getElementById('modeColorBtn');
  elements.pickerOverlay = document.getElementById('pickerOverlay');
  elements.pickerGrid = document.getElementById('pickerGrid');
  elements.textureFileInput = document.getElementById('textureFileInput');

  // データ選択画面
  elements.dataFileList = document.getElementById('dataFileList');
  elements.addDataFileBtn = document.getElementById('addDataFileBtn');
  elements.detailPanel = document.getElementById('detailPanel');
  elements.addPanel = document.getElementById('addPanel');
  elements.detailName = document.getElementById('detailName');
  elements.detailSpreadsheetId = document.getElementById('detailSpreadsheetId');
  elements.detailCreatedAt = document.getElementById('detailCreatedAt');
  elements.deleteBtn = document.getElementById('deleteBtn');
  elements.copyBtn = document.getElementById('copyBtn');
  elements.useBtn = document.getElementById('useBtn');
  elements.saveBtn = document.getElementById('saveBtn');
  elements.newName = document.getElementById('newName');
  elements.newSpreadsheetId = document.getElementById('newSpreadsheetId');
  elements.cancelAddBtn = document.getElementById('cancelAddBtn');
  elements.confirmAddBtn = document.getElementById('confirmAddBtn');
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // タブ切り替え（プルダウン）
  elements.tabSelect.addEventListener('change', (e) => switchTab(e.target.value));

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
  elements.halfPlaceable.addEventListener('change', () => { state.isModified = true; });
  elements.stairPlaceable.addEventListener('change', () => { state.isModified = true; });
  elements.rotatable.addEventListener('change', () => { state.isModified = true; });
  elements.sidePlaceable.addEventListener('change', () => { state.isModified = true; });

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

  // 代表色自動算出
  elements.avgColorBtn.addEventListener('click', async () => {
    const texture = state.textures.find(t => t.texture_id === state.selectedTextureId);
    if (!texture?.image_base64) return;
    const pixels = await getPixelsFromBase64(texture.image_base64);
    const hex = calcAverageColor(pixels);
    elements.textureColor.value = hex;
    elements.textureColorHex.value = hex;
  });
  elements.modeColorBtn.addEventListener('click', async () => {
    const texture = state.textures.find(t => t.texture_id === state.selectedTextureId);
    if (!texture?.image_base64) return;
    const pixels = await getPixelsFromBase64(texture.image_base64);
    const hex = calcModeColor(pixels);
    elements.textureColor.value = hex;
    elements.textureColorHex.value = hex;
  });

  // ピッカー閉じる
  elements.pickerOverlay.querySelector('.picker-close').addEventListener('click', closePicker);
  elements.pickerOverlay.addEventListener('click', (e) => {
    if (e.target === elements.pickerOverlay) closePicker();
  });

  // テクスチャファイル選択
  elements.textureFileInput.addEventListener('change', handleTextureFileSelect);

  // データ選択画面
  elements.addDataFileBtn.addEventListener('click', showAddDataFileMode);
  elements.cancelAddBtn.addEventListener('click', cancelAddDataFile);
  elements.confirmAddBtn.addEventListener('click', confirmAddDataFile);
  elements.deleteBtn.addEventListener('click', deleteDataFile);
  elements.copyBtn.addEventListener('click', copyDataFile);
  elements.useBtn.addEventListener('click', useDataFile);
  elements.saveBtn.addEventListener('click', saveDataFile);
}

/**
 * データ読み込み
 */
async function loadData() {
  try {
    // データファイル一覧を読み込み
    await loadDataFiles();

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
 * データファイル一覧を読み込み
 */
async function loadDataFiles() {
  try {
    const result = await state.api.getDataFiles();
    state.dataFiles = result.files || [];
    state.activeDataFileId = result.activeId || null;

    renderDataFileList();

    // 先頭を選択
    if (state.dataFiles.length > 0) {
      selectDataFile(state.dataFiles[0].id);
    }
  } catch (error) {
    console.error('データファイル読み込みエラー:', error);
    // データファイルAPIがない場合は空で初期化
    state.dataFiles = [];
    state.activeDataFileId = null;
  }
}

/**
 * タブ切り替え
 */
function switchTab(tabName) {
  document.getElementById('dataSelect').classList.toggle('active', tabName === 'data');
  document.getElementById('blockList').classList.toggle('active', tabName === 'blocks');
  document.getElementById('textureList').classList.toggle('active', tabName === 'textures');
  document.getElementById('chunkTest').classList.toggle('active', tabName === 'chunkTest');
  document.getElementById('chunkManagerTest').classList.toggle('active', tabName === 'chunkManagerTest');
  document.getElementById('lodTest').classList.toggle('active', tabName === 'lodTest');
  document.getElementById('movementTest').classList.toggle('active', tabName === 'movementTest');
  document.getElementById('blockTest').classList.toggle('active', tabName === 'blockTest');
  document.getElementById('realmapTest').classList.toggle('active', tabName === 'realmapTest');
  document.getElementById('structureEditor').classList.toggle('active', tabName === 'structureEditor');

  // iframeの遅延読み込み: 選択されたタブのiframeのみロード
  const activeDiv = document.getElementById(tabName);
  if (activeDiv) {
    const iframe = activeDiv.querySelector('iframe[data-src]');
    if (iframe && !iframe.src) {
      iframe.src = iframe.dataset.src;
    }
  }

  // 構造物エディタタブ: 表示後にCanvasリサイズ
  if (tabName === 'structureEditor') {
    setTimeout(() => {
      const iframe = document.getElementById('structureEditorFrame');
      if (iframe && iframe.contentWindow && iframe.contentWindow.editor) {
        iframe.contentWindow.editor.resize();
      }
    }, 100);
  }
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
    elements.halfPlaceable.checked = block.half_placeable || false;
    elements.stairPlaceable.checked = block.stair_placeable || false;
    elements.rotatable.checked = block.rotatable || false;
    elements.sidePlaceable.checked = block.sidePlaceable || false;

    // ハーフ設置・方角可変・側面設置はcustom以外で表示（カスタムは暗黙的にすべて有効）
    const isNormal = (block.shape_type || 'normal') === 'normal';
    const isCustom = (block.shape_type || 'normal') === 'custom';
    elements.halfPlaceableGroup.style.display = isNormal ? '' : 'none';
    elements.stairPlaceableGroup.style.display = isNormal ? '' : 'none';
    elements.rotatableGroup.style.display = isCustom ? 'none' : '';
    elements.sidePlaceableGroup.style.display = isCustom ? 'none' : '';

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

    // チェックボックスの表示切り替え
    elements.halfPlaceableGroup.style.display = newType === 'normal' ? '' : 'none';
    elements.stairPlaceableGroup.style.display = newType === 'normal' ? '' : 'none';
    elements.rotatableGroup.style.display = newType === 'custom' ? 'none' : '';
    elements.sidePlaceableGroup.style.display = newType === 'custom' ? 'none' : '';

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
    ...(elements.blockTypeSelect.value === 'normal' && { half_placeable: elements.halfPlaceable.checked }),
    ...(elements.blockTypeSelect.value === 'normal' && { stair_placeable: elements.stairPlaceable.checked }),
    ...(elements.blockTypeSelect.value !== 'custom' && { rotatable: elements.rotatable.checked }),
    ...(elements.blockTypeSelect.value !== 'custom' && { sidePlaceable: elements.sidePlaceable.checked }),
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

  // 既存データを維持しつつ、変更された値のみ更新
  const updatedTexture = {
    texture_id: texture.texture_id,
    file_name: texture.file_name || '',
    image_base64: texture.image_base64 || '',
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

/**
 * Base64画像からピクセルデータを取得
 */
function getPixelsFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height).data);
    };
    img.onerror = reject;
    img.src = base64;
  });
}

/**
 * ピクセルデータからRGB平均色を算出
 */
function calcAverageColor(pixels) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    count++;
  }
  if (count === 0) return '#808080';
  return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
}

/**
 * ピクセルデータから最頻色を算出（上位4bitに量子化）
 */
function calcModeColor(pixels) {
  const colorCount = {};
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i] & 0xF0;
    const g = pixels[i + 1] & 0xF0;
    const b = pixels[i + 2] & 0xF0;
    const key = `${r},${g},${b}`;
    colorCount[key] = (colorCount[key] || 0) + 1;
  }
  let maxKey = null, maxCount = 0;
  for (const [key, count] of Object.entries(colorCount)) {
    if (count > maxCount) { maxCount = count; maxKey = key; }
  }
  if (!maxKey) return '#808080';
  const [r, g, b] = maxKey.split(',').map(Number);
  return rgbToHex(r, g, b);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ========================================
// データファイル管理
// ========================================

/**
 * データファイル一覧を描画
 */
function renderDataFileList() {
  if (!elements.dataFileList) return;
  elements.dataFileList.innerHTML = '';

  state.dataFiles.forEach(file => {
    const item = createDataFileItem(file);
    elements.dataFileList.appendChild(item);
  });
}

/**
 * データファイル項目を作成
 */
function createDataFileItem(file) {
  const item = document.createElement('div');
  item.className = 'data-file-item';
  item.dataset.fileId = file.id;

  if (file.id === state.selectedDataFileId) {
    item.classList.add('selected');
  }

  const createdDate = file.createdAt
    ? new Date(file.createdAt).toLocaleDateString('ja-JP')
    : '';

  item.innerHTML = `
    <div class="data-file-icon">📊</div>
    <div class="data-file-info">
      <div class="data-file-name">${escapeHtml(file.name)}</div>
      <div class="data-file-spreadsheet-id">${escapeHtml(file.spreadsheetId)}</div>
      <div class="data-file-meta">作成: ${createdDate}</div>
    </div>
    ${file.id === state.activeDataFileId ? '<div class="data-file-status">使用中</div>' : ''}
  `;

  item.addEventListener('click', () => selectDataFile(file.id));
  return item;
}

/**
 * データファイルを選択
 */
function selectDataFile(fileId) {
  state.selectedDataFileId = fileId;

  // 一覧の選択状態を更新
  elements.dataFileList.querySelectorAll('.data-file-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.fileId === fileId);
  });

  // 詳細パネルを表示
  showDetailPanel(fileId);
}

/**
 * 詳細パネルを表示
 */
function showDetailPanel(fileId) {
  const file = state.dataFiles.find(f => f.id === fileId);
  if (!file) return;

  elements.detailPanel.style.display = 'block';
  elements.addPanel.style.display = 'none';

  elements.detailName.value = file.name || '';
  elements.detailSpreadsheetId.value = file.spreadsheetId || '';
  elements.detailCreatedAt.value = file.createdAt
    ? new Date(file.createdAt).toLocaleString('ja-JP')
    : '';

  // 使用中ファイルの場合
  const isActive = file.id === state.activeDataFileId;
  elements.useBtn.style.display = isActive ? 'none' : 'inline-block';
  elements.deleteBtn.disabled = isActive;
  elements.deleteBtn.style.opacity = isActive ? '0.5' : '1';

  // エラーメッセージをクリア
  hideDataFileErrors();
}

/**
 * 新規追加モードを表示
 */
function showAddDataFileMode() {
  // 選択状態をクリア
  elements.dataFileList.querySelectorAll('.data-file-item').forEach(item => {
    item.classList.remove('selected');
  });
  state.selectedDataFileId = null;

  elements.detailPanel.style.display = 'none';
  elements.addPanel.style.display = 'block';

  elements.newName.value = '';
  elements.newSpreadsheetId.value = '';
  elements.newName.focus();

  // エラーメッセージをクリア
  hideDataFileErrors();
}

/**
 * 新規追加をキャンセル
 */
function cancelAddDataFile() {
  elements.addPanel.style.display = 'none';
  elements.detailPanel.style.display = 'block';

  // 最初のファイルを選択
  if (state.dataFiles.length > 0) {
    selectDataFile(state.dataFiles[0].id);
  }
}

/**
 * 新規追加を確定
 */
async function confirmAddDataFile() {
  const name = elements.newName.value.trim();
  const spreadsheetId = elements.newSpreadsheetId.value.trim();

  // バリデーション
  let valid = true;
  if (!name) {
    document.getElementById('newNameError').classList.add('show');
    valid = false;
  } else {
    document.getElementById('newNameError').classList.remove('show');
  }

  if (!spreadsheetId) {
    document.getElementById('newIdError').classList.add('show');
    valid = false;
  } else {
    document.getElementById('newIdError').classList.remove('show');
  }

  if (!valid) return;

  try {
    const result = await state.api.createDataFile({ name, spreadsheetId });

    // ローカル状態に追加
    state.dataFiles.push(result);
    renderDataFileList();
    selectDataFile(result.id);
  } catch (error) {
    console.error('データファイル作成エラー:', error);
    alert('データファイルの作成に失敗しました。');
  }
}

/**
 * データファイルを保存（更新）
 */
async function saveDataFile() {
  const file = state.dataFiles.find(f => f.id === state.selectedDataFileId);
  if (!file) return;

  const name = elements.detailName.value.trim();
  const spreadsheetId = elements.detailSpreadsheetId.value.trim();

  // バリデーション
  let valid = true;
  if (!name) {
    document.getElementById('nameError').classList.add('show');
    valid = false;
  } else {
    document.getElementById('nameError').classList.remove('show');
  }

  if (!spreadsheetId) {
    document.getElementById('idError').classList.add('show');
    valid = false;
  } else {
    document.getElementById('idError').classList.remove('show');
  }

  if (!valid) return;

  try {
    await state.api.updateDataFile({
      id: file.id,
      name,
      spreadsheetId
    });

    // ローカル状態を更新
    file.name = name;
    file.spreadsheetId = spreadsheetId;

    renderDataFileList();
    selectDataFile(file.id);
    alert('保存しました');
  } catch (error) {
    console.error('データファイル更新エラー:', error);
    alert('保存に失敗しました。');
  }
}

/**
 * データファイルを削除
 */
async function deleteDataFile() {
  const file = state.dataFiles.find(f => f.id === state.selectedDataFileId);
  if (!file) return;

  if (file.id === state.activeDataFileId) {
    alert('使用中のデータファイルは削除できません。');
    return;
  }

  if (!confirm(`データファイル「${file.name}」を削除しますか？`)) {
    return;
  }

  try {
    await state.api.deleteDataFile({ id: file.id });

    // ローカル状態から削除
    const index = state.dataFiles.findIndex(f => f.id === file.id);
    if (index >= 0) {
      state.dataFiles.splice(index, 1);
    }

    renderDataFileList();

    // 先頭のファイルを選択
    if (state.dataFiles.length > 0) {
      selectDataFile(state.dataFiles[0].id);
    }
  } catch (error) {
    console.error('データファイル削除エラー:', error);
    alert('削除に失敗しました。');
  }
}

/**
 * データファイルをコピー
 */
async function copyDataFile() {
  const file = state.dataFiles.find(f => f.id === state.selectedDataFileId);
  if (!file) return;

  try {
    const result = await state.api.copyDataFile({ id: file.id });

    // ローカル状態に追加
    state.dataFiles.push(result);
    renderDataFileList();
    selectDataFile(result.id);
  } catch (error) {
    console.error('データファイルコピーエラー:', error);
    alert('コピーに失敗しました。');
  }
}

/**
 * データファイルを使用中に設定
 */
async function useDataFile() {
  const file = state.dataFiles.find(f => f.id === state.selectedDataFileId);
  if (!file) return;

  if (!confirm(`データファイル「${file.name}」を使用しますか？\n※ブロック一覧・テクスチャ一覧のデータが切り替わります`)) {
    return;
  }

  try {
    await state.api.setActiveDataFile({ id: file.id });

    // ローカル状態を更新
    state.activeDataFileId = file.id;

    renderDataFileList();
    selectDataFile(file.id);

    // ブロック・テクスチャを再読み込み
    const data = await state.api.getAll();
    state.blocks = data.blocks.sort((a, b) => a.block_id - b.block_id);
    state.textures = data.textures.sort((a, b) => a.texture_id - b.texture_id);

    // サムネイルキャッシュをクリア
    state.thumbnailCache = {};

    renderBlockGrid();
    renderTextureGrid();

    if (state.blocks.length > 0) {
      selectBlock(state.blocks[0].block_id);
    }
    if (state.textures.length > 0) {
      selectTexture(state.textures[0].texture_id);
    }

    alert('データファイルを切り替えました');
  } catch (error) {
    console.error('データファイル切替エラー:', error);
    alert('切り替えに失敗しました。');
  }
}

/**
 * データファイル関連のエラーメッセージを非表示
 */
function hideDataFileErrors() {
  ['nameError', 'idError', 'newNameError', 'newIdError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
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
