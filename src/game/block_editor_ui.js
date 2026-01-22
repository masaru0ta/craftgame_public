/**
 * BlockEditorUI
 * UI生成・イベントハンドリングを担当するクラス
 * shape_typeに応じてStandardBlockEditorまたはCustomBlockEditorを切り替え
 * 1-4, 1-5で拡張され、最終的にblock_manager（1-6）で使用される
 */
class BlockEditorUI {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - UIをマウントするDOM要素
   * @param {Object} options.THREE - Three.jsライブラリ
   * @param {Function} options.onTextureAdd - 「追加」選択時コールバック (optional)
   * @param {Function} options.onBlockChange - ブロックデータ変更時コールバック (optional)
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
    this.onTextureAdd = options.onTextureAdd || null;
    this.onBlockChange = options.onBlockChange || null;

    // エディタ
    this.standardBlockEditor = null;
    this.customBlockEditor = null;
    this.currentEditor = null;
    this.currentShapeType = 'normal'; // 'normal' or 'custom'

    this.textures = [];
    this.currentBlockData = null;
    this.currentSlot = null;

    // UI要素
    this.editorContainer = null;
    this.previewContainer = null;
    this.preview3d = null;
    this.toolbar = null;
    this.controlPanel = null;
    this.modalOverlay = null;
    this.bgIndicator = null;

    // 標準ブロック用スロット
    this.normalSlots = ['default', 'front', 'top', 'bottom', 'left', 'right', 'back'];
    this.slotElements = {};

    // カスタムブロック用スロット
    this.customSlots = [1, 2, 3];
    this.materialSlotElements = {};

    // カスタムブロック用UI要素
    this.modeToggleBtn = null;
    this.brushSizeButtons = [];
    this.currentMaterialSlot = 1;
  }

  /**
   * UIを生成し、エディタを初期化
   */
  init() {
    this._createUI();
    this._createModal();
    this._attachEvents();
  }

  /**
   * ブロックデータをロードして表示
   * @param {Object} blockData - ブロックデータ
   * @param {Array} textures - テクスチャ一覧（オプション、setTexturesで事前に設定可能）
   */
  loadBlock(blockData, textures) {
    this.currentBlockData = { ...blockData };

    if (textures) {
      this.setTextures(textures);
    }

    // shape_typeに応じてエディタを切り替え
    const shapeType = blockData.shape_type || 'normal';
    this._switchEditor(shapeType);

    // テクスチャ画像データを設定
    const textureImages = {};
    this.textures.forEach(tex => {
      textureImages[tex.file_name] = tex.image_base64;
    });

    if (shapeType === 'custom') {
      this.customBlockEditor.setTextureImages(textureImages);
      this.customBlockEditor.loadBlock(blockData);
      this._updateMaterialSlotUI();
      this._updateBrushSizeButtons();
    } else {
      this.standardBlockEditor.setTextureImages(textureImages);
      this.standardBlockEditor.loadBlock(blockData);
      this._updateSlotUI();
    }
  }

  /**
   * テクスチャ一覧を設定
   * @param {Array} textures - テクスチャ一覧
   */
  setTextures(textures) {
    this.textures = textures;
    const textureImages = {};
    this.textures.forEach(tex => {
      textureImages[tex.file_name] = tex.image_base64;
    });

    if (this.standardBlockEditor) {
      this.standardBlockEditor.setTextureImages(textureImages);
    }
    if (this.customBlockEditor) {
      this.customBlockEditor.setTextureImages(textureImages);
    }
  }

  /**
   * 指定スロットにテクスチャを設定（標準ブロック用）
   * @param {string} slot - スロット名
   * @param {string|null} textureName - テクスチャ名（nullの場合は解除）
   */
  setTexture(slot, textureName) {
    if (this.currentShapeType !== 'normal') return;

    this.standardBlockEditor.setTexture(slot, textureName);

    const texKey = slot === 'default' ? 'tex_default' : `tex_${slot}`;
    if (textureName) {
      this.currentBlockData[texKey] = textureName;
    } else {
      delete this.currentBlockData[texKey];
    }

    this._updateSlotUI();

    if (this.onBlockChange) {
      this.onBlockChange(this.getBlockData());
    }
  }

  /**
   * 指定マテリアルスロットにテクスチャを設定（カスタムブロック用）
   * @param {number} slot - スロット番号 (1-3)
   * @param {string|null} textureName - テクスチャ名
   */
  setMaterial(slot, textureName) {
    if (this.currentShapeType !== 'custom') return;

    this.customBlockEditor.setMaterial(slot, textureName);

    const matKey = `material_${slot}`;
    if (textureName) {
      this.currentBlockData[matKey] = textureName;
    } else {
      delete this.currentBlockData[matKey];
    }

    this._updateMaterialSlotUI();

    if (this.onBlockChange) {
      this.onBlockChange(this.getBlockData());
    }
  }

  /**
   * 配置時に使用するマテリアル番号を設定（カスタムブロック用）
   * @param {number} num - マテリアル番号 (1-3)
   */
  setCurrentMaterial(num) {
    if (this.currentShapeType !== 'custom') return;

    this.customBlockEditor.setCurrentMaterial(num);
    this.currentMaterialSlot = num;
    this._updateMaterialSlotSelection();
  }

  /**
   * ブラシサイズを設定（カスタムブロック用）
   * @param {number} size - ブラシサイズ (1, 2, 4)
   */
  setBrushSize(size) {
    if (this.currentShapeType !== 'custom') return;

    this.customBlockEditor.setBrushSize(size);
    this._updateBrushSizeButtons();
  }

  /**
   * 編集モードを設定（カスタムブロック用）
   * @param {string} mode - 'look' または 'collision'
   */
  setEditMode(mode) {
    if (this.currentShapeType !== 'custom') return;

    this.customBlockEditor.setEditMode(mode);
    this._updateModeToggleButton();
  }

  /**
   * 現在のブロックデータを取得
   * @returns {Object} ブロックデータ
   */
  getBlockData() {
    const blockData = { ...this.currentBlockData };

    if (this.currentShapeType === 'custom') {
      const materials = this.customBlockEditor.getMaterials();
      blockData.material_1 = materials.material_1 || '';
      blockData.material_2 = materials.material_2 || '';
      blockData.material_3 = materials.material_3 || '';
      blockData.voxel_look = this.customBlockEditor.getVoxelLookData();
      blockData.voxel_collision = this.customBlockEditor.getVoxelCollisionData();
    } else {
      const textures = this.standardBlockEditor.getTextures();
      blockData.tex_default = textures.default || '';
      blockData.tex_front = textures.front || '';
      blockData.tex_top = textures.top || '';
      blockData.tex_bottom = textures.bottom || '';
      blockData.tex_left = textures.left || '';
      blockData.tex_right = textures.right || '';
      blockData.tex_back = textures.back || '';
    }

    return blockData;
  }

  /**
   * リサイズ処理
   */
  resize() {
    if (this.currentShapeType === 'custom' && this.customBlockEditor) {
      this.customBlockEditor.resize();
    } else if (this.standardBlockEditor) {
      this.standardBlockEditor.resize();
    }
  }

  /**
   * リソース解放
   */
  dispose() {
    if (this.standardBlockEditor) {
      this.standardBlockEditor.dispose();
    }
    if (this.customBlockEditor) {
      this.customBlockEditor.dispose();
    }

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    if (this.modalOverlay && this.modalOverlay.parentNode) {
      this.modalOverlay.parentNode.removeChild(this.modalOverlay);
    }
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * UIを生成
   * @private
   */
  _createUI() {
    // エディタコンテナ
    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'editor-container';

    // プレビューコンテナ
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview-container';

    // ツールバー
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'preview-toolbar';

    // ツールバー3カラム
    const leftGroup = document.createElement('div');
    leftGroup.className = 'left-group';

    const centerGroup = document.createElement('div');
    centerGroup.className = 'center-group';

    const rightGroup = document.createElement('div');
    rightGroup.className = 'right-group';

    // モード切替ボタン（カスタムブロック用、初期非表示）
    this.modeToggleBtn = document.createElement('button');
    this.modeToggleBtn.className = 'mode-toggle-btn';
    this.modeToggleBtn.textContent = 'look';
    this.modeToggleBtn.style.display = 'none';
    leftGroup.appendChild(this.modeToggleBtn);

    // ブラシサイズボタン（カスタムブロック用、初期非表示）
    [4, 2, 1].forEach(size => {
      const btn = document.createElement('button');
      btn.className = 'brush-size-btn';
      btn.textContent = `${size}`;
      btn.dataset.size = size;
      btn.style.display = 'none';
      if (size === 2) btn.classList.add('active');
      centerGroup.appendChild(btn);
      this.brushSizeButtons.push(btn);
    });

    // BGボタン
    const bgBtn = document.createElement('button');
    bgBtn.className = 'bg-btn';
    bgBtn.innerHTML = `
      <span class="bg-color-indicator" style="background: #000;"></span>
      <span class="bg-label">BG</span>
    `;
    this.bgIndicator = bgBtn.querySelector('.bg-color-indicator');
    rightGroup.appendChild(bgBtn);

    this.toolbar.appendChild(leftGroup);
    this.toolbar.appendChild(centerGroup);
    this.toolbar.appendChild(rightGroup);

    // 3Dプレビュー領域
    this.preview3d = document.createElement('div');
    this.preview3d.className = 'preview-3d';

    // コントロールパネル
    this.controlPanel = document.createElement('div');
    this.controlPanel.className = 'control-panel';

    // スロットコンテナ（標準ブロック用）
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'slots-container normal-slots';

    this.normalSlots.forEach(slot => {
      const item = document.createElement('div');
      item.className = 'material-item';
      item.dataset.slot = slot;
      item.innerHTML = `
        <div class="slot-image"></div>
        <span>${slot}</span>
      `;
      this.slotElements[slot] = item;
      slotsContainer.appendChild(item);
    });

    // マテリアルスロットコンテナ（カスタムブロック用）
    const materialSlotsContainer = document.createElement('div');
    materialSlotsContainer.className = 'slots-container custom-slots';
    materialSlotsContainer.style.display = 'none';

    this.customSlots.forEach(slot => {
      const item = document.createElement('div');
      item.className = 'material-item';
      item.dataset.materialSlot = slot;
      item.innerHTML = `
        <div class="slot-image"></div>
        <span>${slot}</span>
      `;
      this.materialSlotElements[slot] = item;
      materialSlotsContainer.appendChild(item);
    });

    this.controlPanel.appendChild(slotsContainer);
    this.controlPanel.appendChild(materialSlotsContainer);

    // 組み立て
    this.previewContainer.appendChild(this.toolbar);
    this.previewContainer.appendChild(this.preview3d);
    this.previewContainer.appendChild(this.controlPanel);
    this.editorContainer.appendChild(this.previewContainer);
    this.container.appendChild(this.editorContainer);
  }

  /**
   * テクスチャ選択モーダルを作成
   * @private
   */
  _createModal() {
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.className = 'texture-modal-overlay';
    this.modalOverlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'texture-modal';

    const header = document.createElement('div');
    header.className = 'texture-modal-header';

    const title = document.createElement('span');
    title.className = 'texture-modal-title';
    title.textContent = 'テクスチャを選択';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'texture-modal-close';
    closeBtn.textContent = '×';

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'texture-modal-body';

    const grid = document.createElement('div');
    grid.className = 'texture-grid';

    body.appendChild(grid);
    modal.appendChild(header);
    modal.appendChild(body);
    this.modalOverlay.appendChild(modal);
    document.body.appendChild(this.modalOverlay);
  }

  /**
   * エディタを切り替え
   * @private
   */
  _switchEditor(shapeType) {
    this.currentShapeType = shapeType;

    // 既存エディタを破棄
    if (this.standardBlockEditor) {
      this.standardBlockEditor.dispose();
      this.standardBlockEditor = null;
    }
    if (this.customBlockEditor) {
      this.customBlockEditor.dispose();
      this.customBlockEditor = null;
    }

    // 3Dプレビュー領域をクリア
    while (this.preview3d.firstChild) {
      this.preview3d.removeChild(this.preview3d.firstChild);
    }

    // UIを切り替え
    this._updateUIForShapeType(shapeType);

    // エディタを初期化
    if (shapeType === 'custom') {
      this.customBlockEditor = new CustomBlockEditor({
        container: this.preview3d,
        THREE: this.THREE,
        onVoxelChange: () => {
          if (this.onBlockChange) {
            this.onBlockChange(this.getBlockData());
          }
        }
      });
      this.customBlockEditor.init();
      this.currentEditor = this.customBlockEditor;
    } else {
      this.standardBlockEditor = new StandardBlockEditor({
        container: this.preview3d,
        THREE: this.THREE
      });
      this.standardBlockEditor.init();
      this.currentEditor = this.standardBlockEditor;
    }
  }

  /**
   * shape_typeに応じてUIを更新
   * @private
   */
  _updateUIForShapeType(shapeType) {
    const normalSlots = this.controlPanel.querySelector('.normal-slots');
    const customSlots = this.controlPanel.querySelector('.custom-slots');

    if (shapeType === 'custom') {
      // カスタムブロック用UI
      normalSlots.style.display = 'none';
      customSlots.style.display = 'flex';

      this.modeToggleBtn.style.display = 'block';
      this.brushSizeButtons.forEach(btn => {
        btn.style.display = 'block';
      });
    } else {
      // 標準ブロック用UI
      normalSlots.style.display = 'flex';
      customSlots.style.display = 'none';

      this.modeToggleBtn.style.display = 'none';
      this.brushSizeButtons.forEach(btn => {
        btn.style.display = 'none';
      });
    }
  }

  /**
   * イベントを設定
   * @private
   */
  _attachEvents() {
    // 標準ブロック用スロットクリック
    this.normalSlots.forEach(slot => {
      this.slotElements[slot].addEventListener('click', () => {
        this._openModal(slot, 'normal');
      });
    });

    // カスタムブロック用マテリアルスロットクリック
    this.customSlots.forEach(slot => {
      this.materialSlotElements[slot].addEventListener('click', () => {
        this._openModal(slot, 'custom');
        // マテリアル選択も切り替え
        this.setCurrentMaterial(slot);
      });
    });

    // BGボタンクリック
    const bgBtn = this.container.querySelector('.bg-btn');
    bgBtn.addEventListener('click', () => {
      let color;
      if (this.currentShapeType === 'custom' && this.customBlockEditor) {
        color = this.customBlockEditor.toggleBackgroundColor();
      } else if (this.standardBlockEditor) {
        color = this.standardBlockEditor.toggleBackgroundColor();
      }
      if (color) {
        this.bgIndicator.style.background = color;
      }
    });

    // モード切替ボタン
    this.modeToggleBtn.addEventListener('click', () => {
      if (this.customBlockEditor) {
        const currentMode = this.customBlockEditor.getEditMode();
        const newMode = currentMode === 'look' ? 'collision' : 'look';
        this.setEditMode(newMode);
      }
    });

    // ブラシサイズボタン
    this.brushSizeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.size, 10);
        this.setBrushSize(size);
      });
    });

    // モーダル閉じる
    const closeBtn = this.modalOverlay.querySelector('.texture-modal-close');
    closeBtn.addEventListener('click', () => {
      this._closeModal();
    });

    // オーバーレイクリックで閉じる
    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this._closeModal();
      }
    });

    // ウィンドウリサイズ
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  /**
   * テクスチャ選択モーダルを開く
   * @private
   */
  _openModal(slot, type) {
    this.currentSlot = slot;
    this.currentSlotType = type;

    const grid = this.modalOverlay.querySelector('.texture-grid');
    grid.innerHTML = '';

    // 現在のテクスチャ名を取得
    let currentTextureName = '';
    if (type === 'custom' && this.customBlockEditor) {
      const materials = this.customBlockEditor.getMaterials();
      currentTextureName = materials[`material_${slot}`] || '';
    } else if (this.standardBlockEditor) {
      const textures = this.standardBlockEditor.getTextures();
      currentTextureName = textures[slot] || '';
    }

    // 「なし」オプション
    const noneItem = document.createElement('div');
    noneItem.className = 'texture-item';
    if (!currentTextureName) {
      noneItem.classList.add('selected');
    }
    noneItem.innerHTML = `
      <div class="texture-item-image" style="display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px;">−</div>
      <span class="texture-item-name">なし</span>
    `;
    noneItem.addEventListener('click', () => {
      if (type === 'custom') {
        this.setMaterial(slot, null);
      } else {
        this.setTexture(slot, null);
      }
      this._closeModal();
    });
    grid.appendChild(noneItem);

    // テクスチャ一覧
    this.textures.forEach(tex => {
      const item = document.createElement('div');
      item.className = 'texture-item';
      if (currentTextureName === tex.file_name) {
        item.classList.add('selected');
      }
      const img = document.createElement('div');
      img.className = 'texture-item-image';
      if (tex.image_base64) {
        img.style.backgroundImage = `url(${tex.image_base64})`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
      }
      const name = document.createElement('span');
      name.className = 'texture-item-name';
      name.textContent = tex.file_name;
      item.appendChild(img);
      item.appendChild(name);
      item.addEventListener('click', () => {
        if (type === 'custom') {
          this.setMaterial(slot, tex.file_name);
        } else {
          this.setTexture(slot, tex.file_name);
        }
        this._closeModal();
      });
      grid.appendChild(item);
    });

    // 「追加」オプション
    const addItem = document.createElement('div');
    addItem.className = 'texture-item add-new';
    addItem.innerHTML = `
      <div class="texture-item-image" style="display: flex; align-items: center; justify-content: center; color: #666; font-size: 14px; border-style: dashed;">＋</div>
      <span class="texture-item-name">追加</span>
    `;
    addItem.addEventListener('click', () => {
      if (this.onTextureAdd) {
        this.onTextureAdd(slot);
      }
      this._closeModal();
    });
    grid.appendChild(addItem);

    this.modalOverlay.style.display = 'flex';
  }

  /**
   * モーダルを閉じる
   * @private
   */
  _closeModal() {
    this.modalOverlay.style.display = 'none';
    this.currentSlot = null;
    this.currentSlotType = null;
  }

  /**
   * 標準ブロック用スロットUIを更新
   * @private
   */
  _updateSlotUI() {
    if (!this.standardBlockEditor) return;

    const textures = this.standardBlockEditor.getTextures();

    this.normalSlots.forEach(slot => {
      const slotEl = this.slotElements[slot];
      const slotImage = slotEl.querySelector('.slot-image');
      const textureName = textures[slot];

      if (textureName) {
        const tex = this.textures.find(t => t.file_name === textureName);
        if (tex && tex.image_base64) {
          slotImage.style.backgroundImage = `url(${tex.image_base64})`;
          slotImage.style.backgroundSize = 'cover';
          slotImage.style.backgroundPosition = 'center';
        } else {
          slotImage.style.backgroundImage = '';
        }
      } else {
        slotImage.style.backgroundImage = '';
      }
    });
  }

  /**
   * カスタムブロック用マテリアルスロットUIを更新
   * @private
   */
  _updateMaterialSlotUI() {
    if (!this.customBlockEditor) return;

    const materials = this.customBlockEditor.getMaterials();

    this.customSlots.forEach(slot => {
      const slotEl = this.materialSlotElements[slot];
      const slotImage = slotEl.querySelector('.slot-image');
      const textureName = materials[`material_${slot}`];

      if (textureName) {
        const tex = this.textures.find(t => t.file_name === textureName);
        if (tex && tex.image_base64) {
          slotImage.style.backgroundImage = `url(${tex.image_base64})`;
          slotImage.style.backgroundSize = 'cover';
          slotImage.style.backgroundPosition = 'center';
        } else {
          slotImage.style.backgroundImage = '';
          slotImage.style.backgroundColor = '#808080';
        }
      } else {
        slotImage.style.backgroundImage = '';
        slotImage.style.backgroundColor = '#808080';
      }
    });

    this._updateMaterialSlotSelection();
  }

  /**
   * マテリアルスロット選択状態を更新
   * @private
   */
  _updateMaterialSlotSelection() {
    this.customSlots.forEach(slot => {
      const slotEl = this.materialSlotElements[slot];
      if (slot === this.currentMaterialSlot) {
        slotEl.classList.add('selected');
      } else {
        slotEl.classList.remove('selected');
      }
    });
  }

  /**
   * モード切替ボタンを更新
   * @private
   */
  _updateModeToggleButton() {
    if (!this.customBlockEditor) return;
    this.modeToggleBtn.textContent = this.customBlockEditor.getEditMode();
  }

  /**
   * ブラシサイズボタンを更新
   * @private
   */
  _updateBrushSizeButtons() {
    if (!this.customBlockEditor) return;

    const currentSize = this.customBlockEditor.getBrushSize();
    this.brushSizeButtons.forEach(btn => {
      const size = parseInt(btn.dataset.size, 10);
      if (size === currentSize) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}
