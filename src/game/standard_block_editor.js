/**
 * 標準ブロックエディタ UI
 * 3Dプレビュー、視点操作、テクスチャ選択を管理
 */

class StandardBlockEditor {
  /**
   * コンストラクタ
   * @param {Object} options - オプション
   * @param {HTMLElement} options.container - 3Dプレビューのコンテナ要素
   * @param {THREE} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
    this.meshBuilder = new StandardBlockMeshBuilder(this.THREE);

    // 状態
    this.currentBlock = null;
    this.textureMap = {};
    this.textureList = [];
    this.blockMesh = null;

    // カメラ制御
    this.cameraDistance = 3;
    this.cameraTheta = 0;  // 水平角度
    this.cameraPhi = Math.PI / 9; // 垂直角度（約20度）
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // イベントコールバック
    this.onTextureChange = null;

    // Three.js初期化
    this.initThree();
    this.initEventListeners();
    this.animate();
  }

  /**
   * Three.js を初期化
   */
  initThree() {
    const THREE = this.THREE;
    const width = this.container.clientWidth;
    // 高さが0の場合は幅と同じ値を使用（1:1アスペクト比）
    const height = this.container.clientHeight || width;

    // シーン
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x808080);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.updateCameraPosition();

    // レンダラー
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);

    // 床面の枠線
    this.floorOutline = this.meshBuilder.createFloorOutline(1);
    this.floorOutline.position.y = -0.5;
    this.scene.add(this.floorOutline);

    // 方向ラベル
    this.directionLabels = this.meshBuilder.createAllDirectionLabels(1);
    this.directionLabels.position.y = -0.5;
    this.scene.add(this.directionLabels);
  }

  /**
   * イベントリスナーを初期化
   */
  initEventListeners() {
    const canvas = this.renderer.domElement;

    // マウスドラッグで視点回転
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      // 水平回転（右にドラッグでブロックが右に回転）
      this.cameraTheta -= deltaX * 0.01;

      // 垂直回転（上下90度まで制限）
      this.cameraPhi += deltaY * 0.01;
      this.cameraPhi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPhi));

      this.updateCameraPosition();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // マウスホイールで拡大縮小
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance += e.deltaY * 0.005;
      this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance));
      this.updateCameraPosition();
    });

    // リサイズ対応
    window.addEventListener('resize', () => {
      this.handleResize();
    });

    // ResizeObserverでコンテナサイズ変更を検知
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  /**
   * カメラ位置を更新
   */
  updateCameraPosition() {
    const x = this.cameraDistance * Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi);
    const y = this.cameraDistance * Math.sin(this.cameraPhi);
    const z = this.cameraDistance * Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * リサイズ処理
   */
  handleResize() {
    const width = this.container.clientWidth;
    // 高さが0の場合は幅と同じ値を使用（1:1アスペクト比）
    const height = this.container.clientHeight || width;

    if (width === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * アニメーションループ
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * テクスチャリストを設定
   * @param {Array} textures - テクスチャ配列
   */
  setTextures(textures) {
    this.textureList = textures;
    this.textureMap = {};

    textures.forEach(tex => {
      if (tex.file_name && tex.image_base64) {
        this.textureMap[tex.file_name] = tex.image_base64;
      }
    });
  }

  /**
   * ブロックをロード
   * @param {Object} blockData - ブロックデータ
   */
  loadBlock(blockData) {
    this.currentBlock = { ...blockData };

    // 既存のメッシュを削除
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      if (this.blockMesh.geometry) this.blockMesh.geometry.dispose();
      if (Array.isArray(this.blockMesh.material)) {
        this.blockMesh.material.forEach(m => m.dispose());
      }
    }

    // 新しいメッシュを作成
    this.blockMesh = this.meshBuilder.buildMesh(this.currentBlock, this.textureMap);
    this.scene.add(this.blockMesh);
  }

  /**
   * 特定の面のテクスチャを更新
   * @param {string} face - 面の名前 (default, top, bottom, front, back, left, right)
   * @param {string} textureName - テクスチャ名（nullで未設定）
   */
  setFaceTexture(face, textureName) {
    if (!this.currentBlock) return;

    const key = `tex_${face}`;
    if (textureName) {
      this.currentBlock[key] = textureName;
    } else {
      delete this.currentBlock[key];
    }

    // メッシュを更新
    if (this.blockMesh) {
      this.meshBuilder.updateMesh(this.blockMesh, this.currentBlock, this.textureMap);
    }

    // コールバック
    if (this.onTextureChange) {
      this.onTextureChange(face, textureName);
    }
  }

  /**
   * 現在のブロックデータを取得
   * @returns {Object} ブロックデータ
   */
  getBlockData() {
    return this.currentBlock;
  }

  /**
   * 特定の面のテクスチャ名を取得
   * @param {string} face - 面の名前
   * @returns {string|null} テクスチャ名
   */
  getFaceTexture(face) {
    if (!this.currentBlock) return null;
    return this.currentBlock[`tex_${face}`] || null;
  }

  /**
   * テクスチャのBase64データを取得
   * @param {string} textureName - テクスチャ名
   * @returns {string|null} Base64データ
   */
  getTextureData(textureName) {
    return this.textureMap[textureName] || null;
  }

  /**
   * リソースを解放
   */
  dispose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      if (this.blockMesh.geometry) this.blockMesh.geometry.dispose();
      if (Array.isArray(this.blockMesh.material)) {
        this.blockMesh.material.forEach(m => m.dispose());
      }
    }

    this.meshBuilder.clearTextureCache();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

// グローバルにエクスポート
if (typeof window !== 'undefined') {
  window.StandardBlockEditor = StandardBlockEditor;
}
