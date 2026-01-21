/**
 * 標準ブロックエディタ メインスクリプト
 * HTMLと連携してUI操作を管理
 */

// GAS デプロイURL
const GAS_DEPLOY_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// グローバル変数
let api;
let editor;
let blocks = [];
let textures = [];
let selectedFace = null;

/**
 * 初期化
 */
async function init() {
  // API初期化
  api = new GasApi(GAS_DEPLOY_URL);

  // エディタ初期化
  const container = document.getElementById('preview-3d');
  editor = new StandardBlockEditor({
    container: container,
    THREE: THREE
  });

  // テクスチャ変更時のコールバック
  editor.onTextureChange = (face, textureName) => {
    updateTextureSlotDisplay(face, textureName);
  };

  // イベントリスナー設定
  setupEventListeners();

  // データ読み込み
  await loadData();
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  // ブロック選択
  document.getElementById('block-select').addEventListener('change', onBlockSelect);

  // 保存ボタン
  document.getElementById('save-btn').addEventListener('click', onSave);

  // テクスチャスロットクリック
  document.querySelectorAll('.texture-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const face = slot.dataset.face;
      openTextureModal(face);
    });
  });

  // モーダル閉じる
  document.querySelector('.modal-close').addEventListener('click', closeTextureModal);
  document.getElementById('texture-modal').addEventListener('click', (e) => {
    if (e.target.id === 'texture-modal') {
      closeTextureModal();
    }
  });

  // 背景色切り替えボタン
  document.getElementById('bg-btn').addEventListener('click', onToggleBackground);
}

/**
 * 背景色切り替え処理
 */
function onToggleBackground() {
  if (!editor) return;
  const newColor = editor.toggleBackgroundColor();
  updateBgIndicator(newColor);
}

/**
 * BGボタンのインジケーター色を更新
 */
function updateBgIndicator(color) {
  const indicator = document.querySelector('.bg-color-indicator');
  if (indicator) {
    indicator.style.backgroundColor = color;
  }
}

/**
 * データを読み込み
 */
async function loadData() {
  showStatus('データを読み込み中...', 'loading');

  try {
    const data = await api.getAll();
    blocks = data.blocks.filter(b => b.shape_type === 'normal');
    textures = data.textures;

    // エディタにテクスチャを設定
    editor.setTextures(textures);

    // ブロック選択プルダウンを更新
    updateBlockSelect();

    showStatus('データを読み込みました', 'success');
  } catch (error) {
    showStatus('データの読み込みに失敗しました: ' + error.message, 'error');
    console.error(error);
  }
}

/**
 * ブロック選択プルダウンを更新
 */
function updateBlockSelect() {
  const select = document.getElementById('block-select');
  select.innerHTML = '<option value="">-- 選択してください --</option>';

  blocks.forEach(block => {
    const option = document.createElement('option');
    option.value = block.block_id;
    option.textContent = `${block.block_id}: ${block.name} (${block.block_str_id})`;
    select.appendChild(option);
  });
}

/**
 * ブロック選択時の処理
 */
function onBlockSelect(e) {
  const blockId = parseInt(e.target.value);
  if (!blockId) {
    document.getElementById('block-str-id').value = '';
    document.getElementById('block-name').value = '';
    clearTextureSlots();
    return;
  }

  const block = blocks.find(b => b.block_id === blockId);
  if (!block) return;

  // フォームを更新
  document.getElementById('block-str-id').value = block.block_str_id || '';
  document.getElementById('block-name').value = block.name || '';

  // エディタにブロックをロード
  editor.loadBlock(block);

  // テクスチャスロットを更新
  updateAllTextureSlots(block);
}

/**
 * 全テクスチャスロットを更新
 */
function updateAllTextureSlots(block) {
  const faces = ['default', 'top', 'bottom', 'front', 'left', 'right', 'back'];
  faces.forEach(face => {
    const textureName = block[`tex_${face}`] || null;
    updateTextureSlotDisplay(face, textureName);
  });
}

/**
 * テクスチャスロットの表示を更新
 */
function updateTextureSlotDisplay(face, textureName) {
  const slot = document.querySelector(`.texture-slot[data-face="${face}"]`);
  if (!slot) return;

  const imageDiv = slot.querySelector('.texture-image');
  if (textureName && editor.getTextureData(textureName)) {
    imageDiv.style.backgroundImage = `url(${editor.getTextureData(textureName)})`;
  } else {
    imageDiv.style.backgroundImage = '';
    imageDiv.style.backgroundColor = '#000';
  }
}

/**
 * テクスチャスロットをクリア
 */
function clearTextureSlots() {
  document.querySelectorAll('.texture-slot .texture-image').forEach(img => {
    img.style.backgroundImage = '';
    img.style.backgroundColor = '#000';
  });
}

/**
 * テクスチャ選択モーダルを開く
 */
function openTextureModal(face) {
  if (!editor.getBlockData()) {
    showStatus('先にブロックを選択してください', 'error');
    return;
  }

  selectedFace = face;
  const modal = document.getElementById('texture-modal');
  const grid = document.getElementById('texture-grid');

  // グリッドをクリア
  grid.innerHTML = '';

  // 「テクスチャなし」オプション
  const noTextureItem = document.createElement('div');
  noTextureItem.className = 'texture-item no-texture';
  noTextureItem.innerHTML = `
    <div class="preview">✕</div>
    <span class="name">テクスチャなし</span>
  `;
  noTextureItem.addEventListener('click', () => {
    editor.setFaceTexture(selectedFace, null);
    closeTextureModal();
  });
  grid.appendChild(noTextureItem);

  // テクスチャ一覧
  textures.forEach(tex => {
    const item = document.createElement('div');
    item.className = 'texture-item';
    item.innerHTML = `
      <div class="preview" style="background-image: url(${tex.image_base64})"></div>
      <span class="name">${tex.file_name}</span>
    `;
    item.addEventListener('click', () => {
      editor.setFaceTexture(selectedFace, tex.file_name);
      closeTextureModal();
    });
    grid.appendChild(item);
  });

  // 「テクスチャ追加」オプション
  const addTextureItem = document.createElement('div');
  addTextureItem.className = 'texture-item add-texture';
  addTextureItem.innerHTML = `
    <div class="preview">+</div>
    <span class="name">テクスチャ追加</span>
  `;
  addTextureItem.addEventListener('click', () => {
    uploadTexture();
  });
  grid.appendChild(addTextureItem);

  modal.classList.add('active');
}

/**
 * テクスチャ選択モーダルを閉じる
 */
function closeTextureModal() {
  const modal = document.getElementById('texture-modal');
  modal.classList.remove('active');
  selectedFace = null;
}

/**
 * テクスチャをアップロード
 */
function uploadTexture() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showStatus('テクスチャをアップロード中...', 'loading');

      // ファイルをBase64に変換
      const base64 = await fileToBase64(file);

      // ファイル名から拡張子を除去
      const fileName = file.name.replace(/\.[^/.]+$/, '');

      // APIでテクスチャを保存
      const result = await api.saveTexture({
        file_name: fileName,
        color_hex: '#808080',
        image_base64: base64
      });

      // テクスチャリストを更新
      await loadData();

      // 選択中の面にテクスチャを設定
      if (selectedFace) {
        editor.setFaceTexture(selectedFace, fileName);
        closeTextureModal();
      }

      showStatus('テクスチャをアップロードしました', 'success');
    } catch (error) {
      showStatus('テクスチャのアップロードに失敗しました: ' + error.message, 'error');
      console.error(error);
    }
  });

  input.click();
}

/**
 * ファイルをBase64に変換
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
 * 保存処理
 */
async function onSave() {
  const blockData = editor.getBlockData();
  if (!blockData) {
    showStatus('保存するブロックがありません', 'error');
    return;
  }

  try {
    showStatus('保存中...', 'loading');

    await api.saveBlock(blockData);

    // ブロックリストを更新
    await loadData();

    // 現在のブロックを再選択
    document.getElementById('block-select').value = blockData.block_id;

    showStatus('保存しました', 'success');
  } catch (error) {
    showStatus('保存に失敗しました: ' + error.message, 'error');
    console.error(error);
  }
}

/**
 * ステータスメッセージを表示
 */
function showStatus(message, type) {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = 'status-message ' + type;
}

// 初期化実行
document.addEventListener('DOMContentLoaded', init);
