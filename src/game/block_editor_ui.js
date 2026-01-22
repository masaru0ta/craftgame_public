/**
 * BlockEditorUI
 * UI生成・イベントハンドリングを担当するクラス
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

    this.standardBlockEditor = null;
    this.textures = [];
    this.currentBlockData = null;
    this.currentSlot = null;

    // UI要素
    this.previewContainer = null;
    this.preview3d = null;
    this.modalOverlay = null;
    this.bgIndicator = null;

    // テクスチャスロット
    this.slots = ['default', 'front', 'top', 'bottom', 'left', 'right', 'back'];
    this.slotElements = {};
  }

  /**
   * UIを生成し、エディタを初期化
   */
  init() {
    this._createUI();
    this._createModal();
    this._initEditor();
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

    // テクスチャ画像データを設定
    const textureImages = {};
    this.textures.forEach(tex => {
      textureImages[tex.file_name] = tex.image_base64;
    });
    this.standardBlockEditor.setTextureImages(textureImages);

    // ブロックをロード
    this.standardBlockEditor.loadBlock(blockData);

    // スロットUIを更新
    this._updateSlotUI();
  }

  /**
   * テクスチャ一覧を設定
   * @param {Array} textures - テクスチャ一覧
   */
  setTextures(textures) {
    this.textures = textures;
    // テクスチャ画像データを設定
    const textureImages = {};
    this.textures.forEach(tex => {
      textureImages[tex.file_name] = tex.image_base64;
    });
    if (this.standardBlockEditor) {
      this.standardBlockEditor.setTextureImages(textureImages);
    }
  }

  /**
   * 指定スロットにテクスチャを設定
   * @param {string} slot - スロット名
   * @param {string|null} textureName - テクスチャ名（nullの場合は解除）
   */
  setTexture(slot, textureName) {
    this.standardBlockEditor.setTexture(slot, textureName);

    // currentBlockDataを更新
    const texKey = slot === 'default' ? 'tex_default' : `tex_${slot}`;
    if (textureName) {
      this.currentBlockData[texKey] = textureName;
    } else {
      delete this.currentBlockData[texKey];
    }

    // スロットUIを更新
    this._updateSlotUI();

    // コールバック呼び出し
    if (this.onBlockChange) {
      this.onBlockChange(this.getBlockData());
    }
  }

  /**
   * 現在のブロックデータを取得
   * @returns {Object} ブロックデータ
   */
  getBlockData() {
    const textures = this.standardBlockEditor.getTextures();
    const blockData = { ...this.currentBlockData };

    // テクスチャ情報を更新
    blockData.tex_default = textures.default || '';
    blockData.tex_front = textures.front || '';
    blockData.tex_top = textures.top || '';
    blockData.tex_bottom = textures.bottom || '';
    blockData.tex_left = textures.left || '';
    blockData.tex_right = textures.right || '';
    blockData.tex_back = textures.back || '';

    return blockData;
  }

  /**
   * リサイズ処理
   */
  resize() {
    if (this.standardBlockEditor) {
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
    // UIを削除
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * UIを生成
   * @private
   */
  _createUI() {
    // エディタコンテナ
    const editorContainer = document.createElement('div');
    editorContainer.className = 'editor-container';

    // プレビューコンテナ
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview-container';

    // ツールバー
    const toolbar = document.createElement('div');
    toolbar.className = 'preview-toolbar';

    // ツールバー3カラム
    const leftGroup = document.createElement('div');
    leftGroup.className = 'left-group';

    const centerGroup = document.createElement('div');
    centerGroup.className = 'center-group';

    const rightGroup = document.createElement('div');
    rightGroup.className = 'right-group';

    // BGボタン
    const bgBtn = document.createElement('button');
    bgBtn.className = 'bg-btn';
    bgBtn.innerHTML = `
      <span class="bg-color-indicator" style="background: #000;"></span>
      <span class="bg-label">BG</span>
    `;
    this.bgIndicator = bgBtn.querySelector('.bg-color-indicator');
    rightGroup.appendChild(bgBtn);

    toolbar.appendChild(leftGroup);
    toolbar.appendChild(centerGroup);
    toolbar.appendChild(rightGroup);

    // 3Dプレビュー領域
    this.preview3d = document.createElement('div');
    this.preview3d.className = 'preview-3d';

    // コントロールパネル
    const controlPanel = document.createElement('div');
    controlPanel.className = 'control-panel';

    // スロットコンテナ
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'slots-container';

    // テクスチャスロットを作成
    this.slots.forEach(slot => {
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

    controlPanel.appendChild(slotsContainer);

    // 組み立て
    this.previewContainer.appendChild(toolbar);
    this.previewContainer.appendChild(this.preview3d);
    this.previewContainer.appendChild(controlPanel);
    editorContainer.appendChild(this.previewContainer);
    this.container.appendChild(editorContainer);
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
   * エディタを初期化
   * @private
   */
  _initEditor() {
    this.standardBlockEditor = new StandardBlockEditor({
      container: this.preview3d,
      THREE: this.THREE
    });
    this.standardBlockEditor.init();
  }

  /**
   * イベントを設定
   * @private
   */
  _attachEvents() {
    // スロットクリック
    this.slots.forEach(slot => {
      this.slotElements[slot].addEventListener('click', () => {
        this._openModal(slot);
      });
    });

    // BGボタンクリック
    const bgBtn = this.container.querySelector('.bg-btn');
    bgBtn.addEventListener('click', () => {
      const color = this.standardBlockEditor.toggleBackgroundColor();
      this.bgIndicator.style.background = color;
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
   * @param {string} slot - スロット名
   * @private
   */
  _openModal(slot) {
    this.currentSlot = slot;
    const grid = this.modalOverlay.querySelector('.texture-grid');
    grid.innerHTML = '';

    // 現在のスロットのテクスチャ名を取得
    const currentTextures = this.standardBlockEditor.getTextures();
    const currentTextureName = currentTextures[slot];

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
      this.setTexture(slot, null);
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
        this.setTexture(slot, tex.file_name);
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
  }

  /**
   * スロットUIを更新
   * @private
   */
  _updateSlotUI() {
    const textures = this.standardBlockEditor.getTextures();

    this.slots.forEach(slot => {
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
}
