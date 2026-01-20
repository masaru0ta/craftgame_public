/**
 * 標準ブロック用エディターUI
 * Three.jsを使用した3Dプレビューとテクスチャ編集機能を提供
 */

class StandardBlockEditor {
  /**
   * コンストラクタ
   * @param {Object} options - 設定オプション
   * @param {HTMLElement} options.previewContainer - 3Dプレビューを描画するコンテナ
   * @param {HTMLElement} options.textureContainer - テクスチャ枠を表示するコンテナ
   * @param {THREE} options.THREE - Three.jsライブラリ
   * @param {StandardBlockMeshBuilder} options.meshBuilder - メッシュビルダー
   */
  constructor(options) {
    this.previewContainer = options.previewContainer;
    this.textureContainer = options.textureContainer;
    this.THREE = options.THREE;
    this.meshBuilder = options.meshBuilder;

    // テクスチャ一覧（外部から設定）
    this.textures = [];

    // 現在のテクスチャ設定
    this.currentTextures = {
      default: null,
      top: null,
      bottom: null,
      front: null,
      left: null,
      right: null,
      back: null
    };

    // テクスチャ選択モーダル
    this.textureModal = null;
    this.currentEditingFace = null;

    // Three.js関連
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.blockMesh = null;
    this.floorOutline = null;
    this.labels = [];

    // カメラ制御
    this.cameraDistance = 3;
    this.cameraAngleH = 45;  // 水平角度（度）
    this.cameraAngleV = 30;  // 垂直角度（度）
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // イベントコールバック
    this.onTextureChange = null;

    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.initThreeJS();
    this.initTextureSlots();
    this.initEventListeners();
    this.animate();
  }

  /**
   * Three.jsの初期化
   */
  initThreeJS() {
    const container = this.previewContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // シーン
    this.scene = new this.THREE.Scene();
    this.scene.background = new this.THREE.Color(0x333333);

    // カメラ
    this.camera = new this.THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.updateCameraPosition();

    // レンダラー
    this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    // 床の枠線を作成
    this.createFloorOutline();

    // ラベルを作成
    this.createLabels();

    // 初期ブロックメッシュを作成
    this.updateBlockMesh();
  }

  /**
   * 床の枠線を作成
   */
  createFloorOutline() {
    const geometry = new this.THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,   0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
      -0.5, -0.5,  0.5,  -0.5, -0.5, -0.5
    ]);
    geometry.setAttribute('position', new this.THREE.BufferAttribute(vertices, 3));

    const material = new this.THREE.LineBasicMaterial({ color: 0xffffff });
    this.floorOutline = new this.THREE.LineSegments(geometry, material);
    this.scene.add(this.floorOutline);
  }

  /**
   * 方向ラベルを作成
   */
  createLabels() {
    const labelData = [
      { text: 'FRONT', position: [0, -0.5, 1.0] },
      { text: 'BACK', position: [0, -0.5, -1.0] },
      { text: 'LEFT', position: [-1.0, -0.5, 0] },
      { text: 'RIGHT', position: [1.0, -0.5, 0] }
    ];

    labelData.forEach(data => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.text, 64, 16);

      const texture = new this.THREE.CanvasTexture(canvas);
      const material = new this.THREE.SpriteMaterial({ map: texture });
      const sprite = new this.THREE.Sprite(material);
      sprite.position.set(data.position[0], data.position[1], data.position[2]);
      sprite.scale.set(0.8, 0.2, 1);
      this.scene.add(sprite);
      this.labels.push(sprite);
    });
  }

  /**
   * カメラ位置を更新
   */
  updateCameraPosition() {
    const hRad = this.cameraAngleH * Math.PI / 180;
    const vRad = this.cameraAngleV * Math.PI / 180;

    this.camera.position.x = this.cameraDistance * Math.cos(vRad) * Math.sin(hRad);
    this.camera.position.y = this.cameraDistance * Math.sin(vRad);
    this.camera.position.z = this.cameraDistance * Math.cos(vRad) * Math.cos(hRad);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * テクスチャスロットの初期化
   */
  initTextureSlots() {
    const faces = ['default', 'top', 'bottom', 'front', 'left', 'right', 'back'];

    this.textureContainer.innerHTML = '';

    faces.forEach(face => {
      const slot = document.createElement('div');
      slot.className = 'texture-slot';
      slot.dataset.face = face;

      const preview = document.createElement('div');
      preview.className = 'texture-preview';

      const label = document.createElement('div');
      label.className = 'texture-label';
      label.textContent = face;

      slot.appendChild(preview);
      slot.appendChild(label);
      this.textureContainer.appendChild(slot);

      slot.addEventListener('click', () => this.openTextureSelector(face));
    });
  }

  /**
   * イベントリスナーの初期化
   */
  initEventListeners() {
    const canvas = this.renderer.domElement;

    // マウスドラッグで視点回転
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      // 右にドラッグすると右に回転（水平角度を減少）
      this.cameraAngleH -= deltaX * 0.5;
      this.cameraAngleV += deltaY * 0.5;

      // 垂直角度の制限（-90度〜90度）
      this.cameraAngleV = Math.max(-90, Math.min(90, this.cameraAngleV));

      this.updateCameraPosition();

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // マウスホイールで拡大縮小
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance += e.deltaY * 0.01;
      this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance));
      this.updateCameraPosition();
    });

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => this.onResize());
  }

  /**
   * リサイズ処理
   */
  onResize() {
    const container = this.previewContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // アスペクト比を1:1に保つ
    const size = Math.min(width, height);

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * テクスチャ選択モーダルを開く
   * @param {string} face - 面名
   */
  openTextureSelector(face) {
    this.currentEditingFace = face;

    // 既存のモーダルを削除
    if (this.textureModal) {
      this.textureModal.remove();
    }

    // モーダル作成
    this.textureModal = document.createElement('div');
    this.textureModal.className = 'texture-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'texture-modal-content';

    const title = document.createElement('h3');
    title.textContent = `${face} テクスチャを選択`;
    modalContent.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'texture-grid';

    // 「テクスチャなし」オプション
    const noTexture = document.createElement('div');
    noTexture.className = 'texture-tile no-texture';
    noTexture.textContent = 'なし';
    noTexture.addEventListener('click', () => this.selectTexture(face, null));
    grid.appendChild(noTexture);

    // テクスチャ一覧
    this.textures.forEach(tex => {
      const tile = document.createElement('div');
      tile.className = 'texture-tile';
      if (tex.image_base64) {
        tile.style.backgroundImage = `url(${tex.image_base64})`;
      }
      tile.title = tex.file_name;
      tile.addEventListener('click', () => this.selectTexture(face, tex));
      grid.appendChild(tile);
    });

    // 「テクスチャ追加」オプション
    const addTexture = document.createElement('div');
    addTexture.className = 'texture-tile add-texture';
    addTexture.textContent = '+追加';
    addTexture.addEventListener('click', () => this.uploadTexture());
    grid.appendChild(addTexture);

    modalContent.appendChild(grid);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.textContent = '閉じる';
    closeBtn.addEventListener('click', () => this.closeTextureSelector());
    modalContent.appendChild(closeBtn);

    this.textureModal.appendChild(modalContent);
    document.body.appendChild(this.textureModal);

    // モーダル外クリックで閉じる
    this.textureModal.addEventListener('click', (e) => {
      if (e.target === this.textureModal) {
        this.closeTextureSelector();
      }
    });
  }

  /**
   * テクスチャ選択モーダルを閉じる
   */
  closeTextureSelector() {
    if (this.textureModal) {
      this.textureModal.remove();
      this.textureModal = null;
    }
    this.currentEditingFace = null;
  }

  /**
   * テクスチャを選択
   * @param {string} face - 面名
   * @param {Object|null} texture - テクスチャデータ
   */
  selectTexture(face, texture) {
    this.currentTextures[face] = texture;
    this.updateTextureSlot(face);
    this.updateBlockMesh();
    this.closeTextureSelector();

    if (this.onTextureChange) {
      this.onTextureChange(face, texture);
    }
  }

  /**
   * テクスチャスロットの表示を更新
   * @param {string} face - 面名
   */
  updateTextureSlot(face) {
    const slot = this.textureContainer.querySelector(`[data-face="${face}"]`);
    if (!slot) return;

    const preview = slot.querySelector('.texture-preview');
    const texture = this.currentTextures[face];

    if (texture && texture.image_base64) {
      preview.style.backgroundImage = `url(${texture.image_base64})`;
      preview.style.backgroundColor = '';
    } else {
      preview.style.backgroundImage = '';
      preview.style.backgroundColor = '#000';
    }
  }

  /**
   * 全テクスチャスロットの表示を更新
   */
  updateAllTextureSlots() {
    Object.keys(this.currentTextures).forEach(face => {
      this.updateTextureSlot(face);
    });
  }

  /**
   * ブロックメッシュを更新
   */
  updateBlockMesh() {
    // 既存のメッシュを削除
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      this.blockMesh.geometry.dispose();
      if (Array.isArray(this.blockMesh.material)) {
        this.blockMesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    }

    // テクスチャデータを準備
    const getBase64 = (tex) => tex && tex.image_base64 ? tex.image_base64 : null;
    const defaultBase64 = getBase64(this.currentTextures.default);

    const textureData = {
      default: defaultBase64,
      top: getBase64(this.currentTextures.top) || defaultBase64,
      bottom: getBase64(this.currentTextures.bottom) || defaultBase64,
      front: getBase64(this.currentTextures.front) || defaultBase64,
      back: getBase64(this.currentTextures.back) || defaultBase64,
      left: getBase64(this.currentTextures.left) || defaultBase64,
      right: getBase64(this.currentTextures.right) || defaultBase64
    };

    // 新しいメッシュを作成
    this.blockMesh = this.meshBuilder.createMeshFromTextures(textureData, 1);
    this.scene.add(this.blockMesh);
  }

  /**
   * テクスチャをアップロード
   */
  uploadTexture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const fileName = file.name.replace(/\.[^/.]+$/, ''); // 拡張子を除去

        // 新しいテクスチャIDを生成
        const maxId = this.textures.reduce((max, t) => Math.max(max, t.texture_id || 0), 0);
        const newId = maxId + 1;

        const newTexture = {
          texture_id: newId,
          file_name: fileName,
          color_hex: '',
          image_base64: base64
        };

        // アップロードイベントを発火
        if (this.onTextureUpload) {
          await this.onTextureUpload(newTexture);
        }

        // 一覧に追加
        this.textures.push(newTexture);

        // モーダルを再表示
        if (this.currentEditingFace) {
          this.openTextureSelector(this.currentEditingFace);
        }
      };
      reader.readAsDataURL(file);
    });

    input.click();
  }

  /**
   * ブロックデータを設定
   * @param {Object} blockData - ブロックデータ
   */
  setBlockData(blockData) {
    // テクスチャ名からテクスチャデータを検索
    const findTexture = (fileName) => {
      if (!fileName) return null;
      return this.textures.find(t => t.file_name === fileName) || null;
    };

    this.currentTextures = {
      default: findTexture(blockData.tex_default),
      top: findTexture(blockData.tex_top),
      bottom: findTexture(blockData.tex_bottom),
      front: findTexture(blockData.tex_front),
      left: findTexture(blockData.tex_left),
      right: findTexture(blockData.tex_right),
      back: findTexture(blockData.tex_back)
    };

    this.updateAllTextureSlots();
    this.updateBlockMesh();
  }

  /**
   * 現在のテクスチャ設定を取得
   * @returns {Object} テクスチャ設定（ファイル名形式）
   */
  getTextureSettings() {
    return {
      tex_default: this.currentTextures.default?.file_name || '',
      tex_top: this.currentTextures.top?.file_name || '',
      tex_bottom: this.currentTextures.bottom?.file_name || '',
      tex_front: this.currentTextures.front?.file_name || '',
      tex_left: this.currentTextures.left?.file_name || '',
      tex_right: this.currentTextures.right?.file_name || '',
      tex_back: this.currentTextures.back?.file_name || ''
    };
  }

  /**
   * アニメーションループ
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * リソースを破棄
   */
  dispose() {
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      this.blockMesh.geometry.dispose();
      if (Array.isArray(this.blockMesh.material)) {
        this.blockMesh.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.textureModal) {
      this.textureModal.remove();
    }

    this.meshBuilder.clearCache();
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.StandardBlockEditor = StandardBlockEditor;
}
