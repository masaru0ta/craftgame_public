/**
 * ブロック管理ツール メインスクリプト
 */

// GAS デプロイ URL
const GAS_DEPLOY_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// グローバル変数
let api;
let blocks = [];
let textures = [];
let selectedBlockIndex = -1;
let selectedTextureIndex = -1;
let standardBlockEditor = null;
let customBlockEditor = null;
let currentEditor = null;
let hasUnsavedChanges = false;
let pendingAction = null;
let collisionChecker = null;
let isCollisionTestRunning = false;

// サムネイルキャッシュ
const thumbnailCache = new Map();

/**
 * 初期化
 */
async function init() {
  api = new GasApi(GAS_DEPLOY_URL);

  // タブ切り替え
  document.querySelectorAll('.tab').forEach((tab, i) => {
    tab.addEventListener('click', () => switchTab(i === 0 ? 'blocks' : 'textures'));
  });

  // データ読み込み
  await loadData();

  // ブロック一覧を表示
  renderBlockList();
  renderTextureList();

  // 先頭のブロックを選択
  if (blocks.length > 0) {
    selectBlock(0);
  }

  // イベントリスナー設定
  setupEventListeners();

  // ローディング非表示
  document.querySelector('.loading').classList.add('hide');
}

/**
 * データ読み込み
 */
async function loadData() {
  try {
    const data = await api.getAll();
    blocks = data.blocks || [];
    textures = data.textures || [];

    // block_id でソート
    blocks.sort((a, b) => a.block_id - b.block_id);
    textures.sort((a, b) => a.texture_id - b.texture_id);
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    alert('データの読み込みに失敗しました: ' + error.message);
  }
}

/**
 * タブ切り替え
 */
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'blocks' ? i === 0 : i === 1));
  });
  document.getElementById('blockList').classList.toggle('active', tab === 'blocks');
  document.getElementById('textureList').classList.toggle('active', tab === 'textures');

  // テクスチャタブに切り替え時、先頭を選択
  if (tab === 'textures' && selectedTextureIndex < 0 && textures.length > 0) {
    selectTexture(0);
  }
}

/**
 * ブロック一覧をレンダリング
 */
function renderBlockList() {
  const grid = document.getElementById('blockGrid');
  grid.innerHTML = '';

  blocks.forEach((block, index) => {
    const tile = document.createElement('div');
    tile.className = 'tile' + (index === selectedBlockIndex ? ' selected' : '');
    tile.dataset.index = index;

    const img = document.createElement('div');
    img.className = 'tile-img';

    // サムネイル設定
    const thumbnail = getThumbnail(block);
    if (thumbnail) {
      img.style.backgroundImage = `url(${thumbnail})`;
    } else {
      img.style.background = '#ccc';
    }

    const name = document.createElement('div');
    name.className = 'tile-name';
    name.textContent = block.name || block.block_str_id;

    tile.appendChild(img);
    tile.appendChild(name);
    tile.addEventListener('click', () => onBlockTileClick(index));
    grid.appendChild(tile);
  });

  // 新規追加タイル
  const addTile = document.createElement('div');
  addTile.className = 'tile add-new';
  addTile.innerHTML = '<div class="tile-img" style="font-size:24px;color:#4285f4;">+</div><div class="tile-name">新規追加</div>';
  addTile.addEventListener('click', openCreateModal);
  grid.appendChild(addTile);
}

/**
 * サムネイルを取得
 */
function getThumbnail(block) {
  // キャッシュから取得
  if (thumbnailCache.has(block.block_id)) {
    return thumbnailCache.get(block.block_id);
  }

  // 標準ブロックの場合
  if (block.shape_type === 'normal') {
    const texName = block.tex_default || block.tex_front;
    if (texName) {
      const tex = textures.find(t => t.file_name === texName);
      if (tex && tex.image_base64) {
        thumbnailCache.set(block.block_id, tex.image_base64);
        return tex.image_base64;
      }
    }
    // デフォルトカラー
    return null;
  }

  // カスタムブロックの場合はマテリアル1のテクスチャ
  const mat1Name = block.material_1;
  if (mat1Name) {
    const tex = textures.find(t => t.file_name === mat1Name);
    if (tex && tex.image_base64) {
      thumbnailCache.set(block.block_id, tex.image_base64);
      return tex.image_base64;
    }
  }

  return null;
}

/**
 * ブロックタイルクリック時
 */
function onBlockTileClick(index) {
  if (index === selectedBlockIndex) return;

  if (hasUnsavedChanges) {
    pendingAction = () => selectBlock(index);
    showConfirmModal('変更が保存されていません。破棄しますか？', () => {
      hasUnsavedChanges = false;
      pendingAction();
      pendingAction = null;
    });
  } else {
    selectBlock(index);
  }
}

/**
 * ブロックを選択
 */
function selectBlock(index) {
  // 衝突テスト実行中なら停止
  if (isCollisionTestRunning) {
    stopCollisionTest();
  }

  selectedBlockIndex = index;
  const block = blocks[index];

  // タイルのハイライト更新
  document.querySelectorAll('#blockGrid .tile').forEach((tile, i) => {
    tile.classList.toggle('selected', i === index);
  });

  // フォームに値を設定
  document.getElementById('blockStrId').value = block.block_str_id || '';
  document.getElementById('blockName').value = block.name || '';
  document.getElementById('shapeType').value = block.shape_type || 'normal';
  document.getElementById('dropItem').value = block.drop_item || '';
  document.getElementById('lightLevel').value = block.light_level || 0;
  document.getElementById('isTransparent').checked = !!block.is_transparent;

  // エラーメッセージをクリア
  hideAllErrors();
  hideSuccessMessage();

  // 3Dプレビューを更新
  updatePreview(block);

  hasUnsavedChanges = false;
}

/**
 * 3Dプレビューを更新
 */
function updatePreview(block) {
  const container = document.getElementById('previewCanvas');
  const normalControls = document.getElementById('normalControls');
  const customLookControls = document.getElementById('customLookControls');
  const customCollisionControls = document.getElementById('customCollisionControls');
  const modeBtn = document.getElementById('modeToggleBtn');
  const brushSizeGroup = document.getElementById('brushSizeGroup');

  // 既存のエディタを破棄
  if (currentEditor) {
    currentEditor.dispose();
    currentEditor = null;
  }
  container.innerHTML = '';

  if (block.shape_type === 'custom') {
    // カスタムブロックエディタ
    customBlockEditor = new CustomBlockEditor({
      container: container,
      THREE: THREE
    });
    customBlockEditor.setTextures(textures);
    customBlockEditor.loadBlock(block);
    currentEditor = customBlockEditor;

    // ミニプレビューを初期化
    const miniCanvas = document.getElementById('modePreviewCanvas');
    if (miniCanvas) {
      customBlockEditor.initMiniPreview(miniCanvas);
      // 初期は当たり判定（反対のモード）を表示
      customBlockEditor.updateMiniPreview('collision');
    }

    // UI切り替え（見た目モードがデフォルト）
    normalControls.style.display = 'none';
    customLookControls.style.display = 'flex';
    customCollisionControls.style.display = 'none';
    modeBtn.style.display = 'flex';
    brushSizeGroup.style.display = 'flex';

    // マテリアルスロット更新
    updateMaterialSlots(block);

    // コールバック設定
    customBlockEditor.onVoxelChange = () => {
      hasUnsavedChanges = true;
    };
    customBlockEditor.onCollisionChange = () => {
      hasUnsavedChanges = true;
    };
  } else {
    // 標準ブロックエディタ
    standardBlockEditor = new StandardBlockEditor({
      container: container,
      THREE: THREE
    });
    standardBlockEditor.setTextures(textures);
    standardBlockEditor.loadBlock(block);
    currentEditor = standardBlockEditor;

    // UI切り替え
    normalControls.style.display = 'flex';
    customLookControls.style.display = 'none';
    customCollisionControls.style.display = 'none';
    modeBtn.style.display = 'none';
    brushSizeGroup.style.display = 'none';

    // テクスチャスロット更新
    updateTextureSlots(block);

    // コールバック設定
    standardBlockEditor.onTextureChange = () => {
      hasUnsavedChanges = true;
    };
  }
}

/**
 * モード切替ボタンのミニプレビューを更新
 */
function updateModePreviewCanvas(imageData) {
  const canvas = document.getElementById('modePreviewCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (imageData) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = imageData;
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// 背景色リスト
const bgColors = ['#000000', '#808080', '#FFFFFF'];
let currentBgColorIndex = 0;

/**
 * 背景色インジケーターを更新
 */
function updateBackgroundColorIndicator() {
  currentBgColorIndex = (currentBgColorIndex + 1) % bgColors.length;
  const indicator = document.querySelector('.bg-color-indicator');
  if (indicator) {
    indicator.style.backgroundColor = bgColors[currentBgColorIndex];
  }
}

/**
 * テクスチャスロットを更新（標準ブロック用）
 */
function updateTextureSlots(block) {
  const faces = ['default', 'top', 'bottom', 'front', 'back', 'left', 'right'];
  faces.forEach(face => {
    const slot = document.getElementById(`tex_${face}`);
    if (!slot) return;

    const texName = block[`tex_${face}`];
    if (texName) {
      const tex = textures.find(t => t.file_name === texName);
      if (tex && tex.image_base64) {
        slot.style.backgroundImage = `url(${tex.image_base64})`;
      } else {
        slot.style.backgroundImage = 'none';
        slot.style.background = '#ccc';
      }
    } else {
      slot.style.backgroundImage = 'none';
      slot.style.background = '#555';
    }
  });
}

/**
 * マテリアルスロットを更新（カスタムブロック用）
 */
function updateMaterialSlots(block) {
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById(`mat_${i}`);
    if (!slot) continue;

    const texName = block[`material_${i}`];
    if (texName) {
      const tex = textures.find(t => t.file_name === texName);
      if (tex && tex.image_base64) {
        slot.style.backgroundImage = `url(${tex.image_base64})`;
      } else {
        slot.style.backgroundImage = 'none';
        slot.style.background = '#ccc';
      }
    } else {
      slot.style.backgroundImage = 'none';
      slot.style.background = '#555';
    }
  }
}

/**
 * テクスチャ一覧をレンダリング
 */
function renderTextureList() {
  const grid = document.getElementById('textureGrid');
  grid.innerHTML = '';

  textures.forEach((tex, index) => {
    const tile = document.createElement('div');
    tile.className = 'tile' + (index === selectedTextureIndex ? ' selected' : '');
    tile.dataset.index = index;

    const img = document.createElement('div');
    img.className = 'tile-img';
    if (tex.image_base64) {
      img.style.backgroundImage = `url(${tex.image_base64})`;
    } else if (tex.color_hex) {
      img.style.background = tex.color_hex;
    } else {
      img.style.background = '#ccc';
    }

    const id = document.createElement('div');
    id.className = 'tile-id';
    id.textContent = `ID: ${tex.texture_id}`;

    const name = document.createElement('div');
    name.className = 'tile-name';
    name.textContent = tex.file_name;

    tile.appendChild(img);
    tile.appendChild(id);
    tile.appendChild(name);
    tile.addEventListener('click', () => selectTexture(index));
    grid.appendChild(tile);
  });
}

/**
 * テクスチャを選択
 */
function selectTexture(index) {
  selectedTextureIndex = index;
  const tex = textures[index];

  // タイルのハイライト更新
  document.querySelectorAll('#textureGrid .tile').forEach((tile, i) => {
    tile.classList.toggle('selected', i === index);
  });

  // フォームに値を設定
  document.getElementById('textureId').value = tex.texture_id;
  document.getElementById('texFileName').value = tex.file_name;
  document.getElementById('colorHex').value = tex.color_hex || '#808080';
  document.getElementById('colorHexText').value = tex.color_hex || '#808080';

  // プレビュー更新
  const preview = document.getElementById('texturePreview');
  if (tex.image_base64) {
    preview.style.backgroundImage = `url(${tex.image_base64})`;
  } else if (tex.color_hex) {
    preview.style.backgroundImage = 'none';
    preview.style.background = tex.color_hex;
  }

  hideAllErrors();
  hideSuccessMessage();
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // フォーム変更監視
  const formInputs = ['blockStrId', 'blockName', 'dropItem', 'lightLevel', 'isTransparent'];
  formInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        hasUnsavedChanges = true;
        hideAllErrors();
      });
      el.addEventListener('change', () => {
        hasUnsavedChanges = true;
        hideAllErrors();
      });
    }
  });

  // shape_type 変更
  document.getElementById('shapeType').addEventListener('change', (e) => {
    const newType = e.target.value;
    const block = blocks[selectedBlockIndex];
    if (block.shape_type !== newType) {
      showConfirmModal('ブロックタイプを変更すると関連データがクリアされます。よろしいですか？', () => {
        changeBlockType(newType);
      }, () => {
        e.target.value = block.shape_type;
      });
    }
  });

  // 保存ボタン
  document.getElementById('saveBlockBtn').addEventListener('click', saveBlock);

  // 削除ボタン
  document.getElementById('deleteBlockBtn').addEventListener('click', () => {
    const block = blocks[selectedBlockIndex];
    showConfirmModal(`「${block.block_str_id}」を削除しますか？`, deleteBlock);
  });

  // テクスチャ保存ボタン
  document.getElementById('saveTextureBtn').addEventListener('click', saveTexture);

  // テクスチャ削除ボタン
  document.getElementById('deleteTextureBtn').addEventListener('click', () => {
    const tex = textures[selectedTextureIndex];
    showConfirmModal(`「${tex.file_name}」を削除しますか？`, deleteTexture);
  });

  // カラー入力同期
  document.getElementById('colorHex').addEventListener('input', (e) => {
    document.getElementById('colorHexText').value = e.target.value;
  });
  document.getElementById('colorHexText').addEventListener('input', (e) => {
    const val = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      document.getElementById('colorHex').value = val;
    }
  });

  // テクスチャスロットクリック
  const faces = ['default', 'top', 'bottom', 'front', 'back', 'left', 'right'];
  faces.forEach(face => {
    const slot = document.getElementById(`tex_${face}`);
    if (slot) {
      slot.addEventListener('click', () => openTexturePicker(face, 'texture'));
    }
  });

  // マテリアルスロットクリック
  for (let i = 1; i <= 3; i++) {
    const slot = document.getElementById(`mat_${i}`);
    if (slot) {
      slot.addEventListener('click', () => openTexturePicker(i, 'material'));
    }
  }

  // 背景色ボタン
  document.getElementById('bgBtn').addEventListener('click', () => {
    if (currentEditor) {
      currentEditor.toggleBackgroundColor();
      updateBackgroundColorIndicator();
    }
  });

  // モード切替ボタン
  document.getElementById('modeToggleBtn').addEventListener('click', () => {
    if (customBlockEditor) {
      const currentMode = customBlockEditor.getEditMode();
      const newMode = currentMode === 'look' ? 'collision' : 'look';
      customBlockEditor.setEditMode(newMode);

      // コントロールパネル切り替え
      const customLookControls = document.getElementById('customLookControls');
      const customCollisionControls = document.getElementById('customCollisionControls');
      customLookControls.style.display = newMode === 'look' ? 'flex' : 'none';
      customCollisionControls.style.display = newMode === 'collision' ? 'flex' : 'none';

      // ミニプレビュー更新（反対のモードを表示）
      customBlockEditor.updateMiniPreview(newMode === 'look' ? 'collision' : 'look');
    }
  });

  // 衝突テストボタン（見た目モード）
  document.getElementById('checkBtnLook').addEventListener('click', toggleCollisionTest);

  // 衝突テストボタン（当たり判定モード）
  document.getElementById('checkBtnCollision').addEventListener('click', toggleCollisionTest);

  // 自動作成ボタン
  document.getElementById('autoCreateBtn').addEventListener('click', () => {
    if (customBlockEditor) {
      customBlockEditor.autoCreateCollision();
      hasUnsavedChanges = true;
      // ミニプレビュー更新
      const currentMode = customBlockEditor.getEditMode();
      customBlockEditor.updateMiniPreview(currentMode === 'look' ? 'collision' : 'look');
    }
  });

  // ブラシサイズボタン
  document.querySelectorAll('.brush-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size);
      if (customBlockEditor) {
        customBlockEditor.setBrushSize(size);
        document.querySelectorAll('.brush-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // 新規作成モーダル
  document.getElementById('createBlockBtn').addEventListener('click', createBlock);
  document.getElementById('cancelCreateBtn').addEventListener('click', closeCreateModal);

  // 確認モーダル
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const callback = document.getElementById('confirmOkBtn').dataset.callback;
    closeConfirmModal();
    if (window[callback]) {
      window[callback]();
    } else if (pendingAction) {
      pendingAction();
      pendingAction = null;
    }
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    closeConfirmModal();
    if (pendingCancelAction) {
      pendingCancelAction();
      pendingCancelAction = null;
    }
    pendingAction = null;
  });

  // テクスチャピッカー
  document.getElementById('pickerOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTexturePicker();
  });
  document.querySelector('.picker-close').addEventListener('click', closeTexturePicker);
}

let pendingCancelAction = null;

/**
 * 確認モーダルを表示
 */
function showConfirmModal(message, onOk, onCancel = null) {
  document.getElementById('confirmMessage').textContent = message;
  document.querySelector('.confirm-modal').classList.add('show');
  pendingAction = onOk;
  pendingCancelAction = onCancel;
}

/**
 * 確認モーダルを閉じる
 */
function closeConfirmModal() {
  document.querySelector('.confirm-modal').classList.remove('show');
}

/**
 * 新規作成モーダルを開く
 */
function openCreateModal() {
  document.getElementById('newBlockStrId').value = '';
  document.getElementById('newBlockName').value = '';
  document.getElementById('newShapeNormal').checked = true;
  hideAllErrors();
  document.querySelector('.create-modal').classList.add('show');
}

/**
 * 新規作成モーダルを閉じる
 */
function closeCreateModal() {
  document.querySelector('.create-modal').classList.remove('show');
}

/**
 * ブロックを新規作成
 */
async function createBlock() {
  const blockStrId = document.getElementById('newBlockStrId').value.trim();
  const name = document.getElementById('newBlockName').value.trim();
  const shapeType = document.querySelector('input[name="newShapeType"]:checked').value;

  // バリデーション
  hideAllErrors();
  let hasError = false;

  if (!blockStrId) {
    showError('createBlockStrIdError', 'ブロックIDは必須です');
    hasError = true;
  } else if (!/^[a-zA-Z0-9_]+$/.test(blockStrId)) {
    showError('createBlockStrIdError', '英数字とアンダースコアのみ使用できます');
    hasError = true;
  } else if (blocks.some(b => b.block_str_id === blockStrId)) {
    showError('createBlockStrIdError', 'このIDは既に使用されています');
    hasError = true;
  }

  if (!name) {
    showError('createBlockNameError', '表示名は必須です');
    hasError = true;
  }

  if (hasError) return;

  try {
    const result = await api.createBlock({
      block_str_id: blockStrId,
      name: name,
      shape_type: shapeType
    });

    // データを再読み込み
    await loadData();
    renderBlockList();

    // 新規ブロックを選択
    const newIndex = blocks.findIndex(b => b.block_id === result.block_id);
    if (newIndex >= 0) {
      selectBlock(newIndex);
    }

    closeCreateModal();
  } catch (error) {
    showError('createBlockStrIdError', error.message);
  }
}

/**
 * ブロックタイプを変更
 */
function changeBlockType(newType) {
  const block = blocks[selectedBlockIndex];
  const oldType = block.shape_type;

  // 関連データをクリア
  if (oldType === 'normal' && newType === 'custom') {
    block.tex_default = '';
    block.tex_top = '';
    block.tex_bottom = '';
    block.tex_front = '';
    block.tex_back = '';
    block.tex_left = '';
    block.tex_right = '';
  } else if (oldType === 'custom' && newType === 'normal') {
    block.voxel_look = '';
    block.voxel_collision = '';
    block.material_1 = '';
    block.material_2 = '';
    block.material_3 = '';
  }

  block.shape_type = newType;
  hasUnsavedChanges = true;

  // プレビュー更新
  updatePreview(block);
}

/**
 * ブロックを保存
 */
async function saveBlock() {
  const block = blocks[selectedBlockIndex];

  // フォームから値を取得
  const blockStrId = document.getElementById('blockStrId').value.trim();
  const name = document.getElementById('blockName').value.trim();
  const dropItem = document.getElementById('dropItem').value.trim();
  const lightLevel = parseInt(document.getElementById('lightLevel').value) || 0;
  const isTransparent = document.getElementById('isTransparent').checked;

  // バリデーション
  hideAllErrors();
  let hasError = false;

  if (!blockStrId) {
    showError('blockStrIdError', 'ブロックIDは必須です');
    hasError = true;
  } else if (!/^[a-zA-Z0-9_]+$/.test(blockStrId)) {
    showError('blockStrIdError', '英数字とアンダースコアのみ使用できます');
    hasError = true;
  } else if (blocks.some((b, i) => i !== selectedBlockIndex && b.block_str_id === blockStrId)) {
    showError('blockStrIdError', 'このIDは既に使用されています');
    hasError = true;
  }

  if (!name) {
    showError('blockNameError', '表示名は必須です');
    hasError = true;
  }

  if (hasError) return;

  // ブロックデータを更新
  block.block_str_id = blockStrId;
  block.name = name;
  block.drop_item = dropItem;
  block.light_level = lightLevel;
  block.is_transparent = isTransparent;

  // エディタからデータを取得
  if (currentEditor) {
    const editorData = currentEditor.getBlockData();
    if (editorData) {
      Object.assign(block, editorData);
    }
  }

  try {
    await api.saveBlock(block);

    // キャッシュをクリア
    thumbnailCache.delete(block.block_id);

    // 一覧を更新
    renderBlockList();

    hasUnsavedChanges = false;
    showSuccessMessage('保存しました');
  } catch (error) {
    alert('保存に失敗しました: ' + error.message);
  }
}

/**
 * ブロックを削除
 */
async function deleteBlock() {
  const block = blocks[selectedBlockIndex];

  try {
    await api.deleteBlock(block.block_id);

    // データを再読み込み
    await loadData();
    renderBlockList();

    // 先頭を選択
    if (blocks.length > 0) {
      selectBlock(0);
    }

    hasUnsavedChanges = false;
  } catch (error) {
    alert('削除に失敗しました: ' + error.message);
  }
}

/**
 * テクスチャを保存
 */
async function saveTexture() {
  const tex = textures[selectedTextureIndex];
  const colorHex = document.getElementById('colorHexText').value.trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(colorHex)) {
    alert('カラーコードが不正です');
    return;
  }

  tex.color_hex = colorHex;

  try {
    await api.saveTexture(tex);
    renderTextureList();
    showSuccessMessage('保存しました');
  } catch (error) {
    alert('保存に失敗しました: ' + error.message);
  }
}

/**
 * テクスチャを削除
 */
async function deleteTexture() {
  const tex = textures[selectedTextureIndex];

  try {
    await api.deleteTexture(tex.texture_id);

    // データを再読み込み
    await loadData();
    renderTextureList();

    // 先頭を選択
    if (textures.length > 0) {
      selectTexture(0);
    }
  } catch (error) {
    alert('削除に失敗しました: ' + error.message);
  }
}

let pickerTarget = null;
let pickerType = null;

/**
 * テクスチャピッカーを開く
 */
function openTexturePicker(target, type) {
  pickerTarget = target;
  pickerType = type;

  const grid = document.getElementById('pickerGrid');
  grid.innerHTML = '';

  textures.forEach(tex => {
    const item = document.createElement('div');
    item.className = 'picker-item';

    const preview = document.createElement('div');
    preview.className = 'tex-preview';
    if (tex.image_base64) {
      preview.style.backgroundImage = `url(${tex.image_base64})`;
    } else if (tex.color_hex) {
      preview.style.background = tex.color_hex;
    }

    const label = document.createElement('div');
    label.className = 'tex-label';
    label.textContent = tex.file_name;

    item.appendChild(preview);
    item.appendChild(label);
    item.addEventListener('click', () => selectPickerTexture(tex));
    grid.appendChild(item);
  });

  document.getElementById('pickerOverlay').classList.add('show');
}

/**
 * ピッカーでテクスチャを選択
 */
function selectPickerTexture(tex) {
  if (pickerType === 'texture') {
    // 標準ブロックのテクスチャ
    const block = blocks[selectedBlockIndex];
    block[`tex_${pickerTarget}`] = tex.file_name;

    if (standardBlockEditor) {
      standardBlockEditor.setFaceTexture(pickerTarget, tex.file_name);
    }

    updateTextureSlots(block);
    hasUnsavedChanges = true;
  } else if (pickerType === 'material') {
    // カスタムブロックのマテリアル
    const block = blocks[selectedBlockIndex];
    block[`material_${pickerTarget}`] = tex.file_name;

    if (customBlockEditor) {
      customBlockEditor.setMaterialTexture(pickerTarget, tex.image_base64, tex.file_name);
    }

    updateMaterialSlots(block);
    hasUnsavedChanges = true;
  }

  closeTexturePicker();
}

/**
 * テクスチャピッカーを閉じる
 */
function closeTexturePicker() {
  document.getElementById('pickerOverlay').classList.remove('show');
  pickerTarget = null;
  pickerType = null;
}

/**
 * エラーを表示
 */
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('show');
  }
}

/**
 * 全エラーを非表示
 */
function hideAllErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.classList.remove('show');
  });
}

/**
 * 成功メッセージを表示
 */
function showSuccessMessage(message) {
  const el = document.getElementById('successMessage');
  if (el) {
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
}

/**
 * 成功メッセージを非表示
 */
function hideSuccessMessage() {
  const el = document.getElementById('successMessage');
  if (el) {
    el.classList.remove('show');
  }
}

/**
 * 衝突テストのトグル
 */
function toggleCollisionTest() {
  if (!customBlockEditor) return;

  if (isCollisionTestRunning) {
    stopCollisionTest();
  } else {
    startCollisionTest();
  }
}

/**
 * 衝突テスト開始
 */
function startCollisionTest() {
  if (!customBlockEditor) return;

  const container = document.getElementById('previewCanvas');
  if (!collisionChecker) {
    collisionChecker = new CollisionChecker({
      container: container,
      THREE: THREE
    });
  }

  collisionChecker.setCollisionData(customBlockEditor.getCollisionData());
  collisionChecker.start();
  isCollisionTestRunning = true;

  // ボタンテキスト更新
  document.getElementById('checkBtnLook').textContent = '停止';
  document.getElementById('checkBtnCollision').textContent = '停止';
}

/**
 * 衝突テスト停止
 */
function stopCollisionTest() {
  if (collisionChecker) {
    collisionChecker.stop();
  }
  isCollisionTestRunning = false;

  // ボタンテキスト更新
  document.getElementById('checkBtnLook').textContent = '衝突テスト';
  document.getElementById('checkBtnCollision').textContent = '衝突テスト';
}

// 初期化実行
window.addEventListener('DOMContentLoaded', init);
