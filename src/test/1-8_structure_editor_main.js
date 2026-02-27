/**
 * 1-8 構造物エディタ テストページ用スクリプト
 */

// GAS APIのベースURL
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

// グローバル変数
let api = null;
let editor = null;
let currentStructureId = null;

// テスト用グローバル公開
window._blocks = [];
window._textures = [];
window._structures = [];
window._dataLoaded = false;

/**
 * 初期化
 */
async function init() {
  api = new GasApi(GAS_API_URL);

  // エディタUIを構築
  _buildEditorUI();

  // エディタ初期化
  const previewContainer = document.querySelector('.preview-3d');
  editor = new StructureEditor({
    container: previewContainer,
    THREE: THREE,
    blocks: [],
    onBlockChange: handleBlockChange
  });
  editor.init();
  editor.newStructure();

  // テスト用にグローバル公開
  window.editor = editor;

  // データ読み込み
  await loadData();

  // イベント設定
  document.getElementById('structure-select').addEventListener('change', handleStructureSelect);
  document.getElementById('create-btn').addEventListener('click', handleCreate);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('delete-btn').addEventListener('click', handleDelete);
}

/**
 * エディタUI構築（右カラム内に動的生成）
 */
function _buildEditorUI() {
  const container = document.querySelector('.structure-editor-container');

  container.innerHTML = `
    <div class="preview-container">
      <div class="preview-toolbar">
        <div class="left-group">
          <button class="brush-size-btn active" data-size="1">1</button>
          <button class="brush-size-btn" data-size="2">2</button>
          <button class="brush-size-btn" data-size="4">4</button>
        </div>
        <div class="right-group">
          <button class="bg-btn">BG</button>
        </div>
      </div>
      <div class="preview-3d"></div>
      <div class="control-panel">
        <div class="block-palette-container">
          <div class="selected-block">ブロック未選択</div>
          <div class="palette-grid"></div>
        </div>
      </div>
    </div>
  `;

  // ブラシサイズボタンイベント
  container.querySelectorAll('.brush-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size);
      if (editor) editor.setBrushSize(size);
      container.querySelectorAll('.brush-size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // BGボタンイベント
  container.querySelector('.bg-btn').addEventListener('click', () => {
    if (editor) editor.toggleBackgroundColor();
  });
}

/**
 * データ読み込み
 */
async function loadData() {
  try {
    showStatus('loading', 'データを読み込み中...');

    const data = await api.getAll();
    window._blocks = data.blocks || [];
    window._textures = data.textures || [];
    window._structures = data.structures || [];

    // エディタにブロック・テクスチャ情報を更新
    if (editor) {
      editor.blocks = window._blocks;
      editor.textures = window._textures;
      editor._buildBlockColorMap();
    }

    // 構造物選択プルダウンを更新
    _updateStructureSelect();

    // ブロックパレットを構築
    _buildBlockPalette();

    window._dataLoaded = true;

    showStatus('success', 'データを読み込みました');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    showStatus('error', 'データの読み込みに失敗しました: ' + error.message);
  }
}

/**
 * 構造物選択プルダウンを更新
 */
function _updateStructureSelect() {
  const select = document.getElementById('structure-select');
  select.innerHTML = '<option value="">構造物を選択</option>';

  window._structures.forEach(s => {
    const option = document.createElement('option');
    option.value = s.structure_id;
    option.textContent = `${s.structure_id}: ${s.structure_str_id || ''} (${s.name || ''})`;
    select.appendChild(option);
  });
}

/**
 * ブロックパレットを構築
 */
function _buildBlockPalette() {
  const grid = document.querySelector('.palette-grid');
  if (!grid) return;

  grid.innerHTML = '';

  window._blocks.forEach(block => {
    const strId = block.block_str_id || block.str_id;
    if (!strId || strId === 'air') return;

    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.title = `${strId} (${block.name || ''})`;
    btn.dataset.blockStrId = strId;

    // エディタの色マップを参照（重複ロジック排除）
    const color = (editor && editor._blockColorMap[strId]) || block.color_hex || '#808080';
    btn.style.background = color;

    btn.addEventListener('click', () => {
      _selectBlock(strId, color, block.name || strId);
    });

    grid.appendChild(btn);
  });
}

/**
 * ブロックを選択
 */
function _selectBlock(strId, color, name) {
  if (editor) editor.setCurrentBlock(strId);

  // パレットボタンのハイライト更新
  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.blockStrId === strId);
  });

  // 選択中ブロック表示を更新
  const selectedBlock = document.querySelector('.selected-block');
  if (selectedBlock) {
    selectedBlock.innerHTML = `<span class="color-swatch" style="background:${color}"></span>${name}`;
  }
}

/**
 * 構造物選択時の処理
 */
function handleStructureSelect(e) {
  const id = parseInt(e.target.value);
  if (!id) {
    currentStructureId = null;
    document.getElementById('structure-str-id').value = '';
    document.getElementById('structure-name').value = '';
    if (editor) editor.newStructure();
    return;
  }

  const structure = window._structures.find(s => s.structure_id === id);
  if (!structure) return;

  currentStructureId = id;
  document.getElementById('structure-str-id').value = structure.structure_str_id || '';
  document.getElementById('structure-name').value = structure.name || '';

  // カテゴリ設定
  const catSelect = document.getElementById('category-select');
  if (structure.category) {
    catSelect.value = structure.category;
  }

  // エディタにロード
  if (editor) {
    editor.loadStructure(structure);
  }
}

/**
 * 新規作成
 */
async function handleCreate() {
  const strId = document.getElementById('structure-str-id').value.trim();
  const name = document.getElementById('structure-name').value.trim();

  if (!strId) {
    showStatus('error', 'structure_str_id を入力してください');
    return;
  }
  if (!name) {
    showStatus('error', 'name を入力してください');
    return;
  }

  try {
    showStatus('loading', '作成中...');
    const result = await api.createStructure({
      structure_str_id: strId,
      name: name,
      category: document.getElementById('category-select').value
    });

    currentStructureId = result.structure_id;

    // データ再読み込み
    const data = await api.getAll();
    window._structures = data.structures || [];
    _updateStructureSelect();

    // 作成した構造物を選択
    document.getElementById('structure-select').value = currentStructureId;

    if (editor) editor.newStructure();

    showStatus('success', `構造物を作成しました (ID: ${currentStructureId})`);
    setTimeout(() => hideStatus(), 3000);
  } catch (error) {
    showStatus('error', '作成に失敗: ' + error.message);
  }
}

/**
 * 保存
 */
async function handleSave() {
  if (!currentStructureId) {
    showStatus('error', '構造物を選択または作成してください');
    return;
  }

  if (!editor) return;

  const exportData = editor.getExportData();

  if (exportData.size_x === 0) {
    showStatus('error', 'ブロックが配置されていません');
    return;
  }

  try {
    showStatus('loading', '保存中...');
    await api.saveStructure({
      structure_id: currentStructureId,
      structure_str_id: document.getElementById('structure-str-id').value.trim(),
      name: document.getElementById('structure-name').value.trim(),
      category: document.getElementById('category-select').value,
      size_x: exportData.size_x,
      size_y: exportData.size_y,
      size_z: exportData.size_z,
      palette: exportData.palette,
      voxel_data: exportData.voxel_data,
      orientation_data: exportData.orientation_data
    });

    showStatus('success', '保存しました');
    setTimeout(() => hideStatus(), 3000);
  } catch (error) {
    showStatus('error', '保存に失敗: ' + error.message);
  }
}

/**
 * 削除
 */
async function handleDelete() {
  if (!currentStructureId) {
    showStatus('error', '構造物を選択してください');
    return;
  }

  if (!confirm('この構造物を削除しますか？')) return;

  try {
    showStatus('loading', '削除中...');
    await api.deleteStructure({ structure_id: currentStructureId });

    currentStructureId = null;
    document.getElementById('structure-str-id').value = '';
    document.getElementById('structure-name').value = '';

    // データ再読み込み
    const data = await api.getAll();
    window._structures = data.structures || [];
    _updateStructureSelect();

    if (editor) editor.newStructure();

    showStatus('success', '削除しました');
    setTimeout(() => hideStatus(), 3000);
  } catch (error) {
    showStatus('error', '削除に失敗: ' + error.message);
  }
}

/**
 * ブロック変更時のコールバック
 */
function handleBlockChange() {
  // 将来的にUI更新が必要な場合にここに追加
}

/**
 * ステータスメッセージを表示
 */
function showStatus(type, message) {
  const el = document.getElementById('status-message');
  el.className = 'status-message ' + type;
  el.textContent = message;
}

/**
 * ステータスメッセージを非表示
 */
function hideStatus() {
  const el = document.getElementById('status-message');
  el.className = 'status-message';
  el.textContent = '';
}

// ページロード時に初期化
window.addEventListener('DOMContentLoaded', init);
