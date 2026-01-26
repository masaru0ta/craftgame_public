/**
 * CustomBlockEditor
 * カスタムブロック（8x8x8ボクセル）編集のコアクラス
 * Three.jsシーン管理、カメラ操作、ボクセル編集を担当
 */
class CustomBlockEditor {
  // 定数
  static GRID_SIZE = 8;           // グリッドサイズ（8x8x8）
  static VOXEL_SIZE = 0.125;      // 各ボクセルのサイズ（1/8）
  static COLLISION_GRID_SIZE = 4; // 当たり判定グリッドサイズ（4x4x4）

  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Three.jsをマウントするDOM要素
   * @param {Object} options.THREE - Three.jsライブラリ
   * @param {Function} options.onVoxelChange - ボクセル変更時コールバック (optional)
   * @param {Function} options.onMaterialSelect - マテリアル選択変更時コールバック (optional)
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
    this.onVoxelChange = options.onVoxelChange || null;
    this.onMaterialSelect = options.onMaterialSelect || null;

    // Three.js オブジェクト
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.meshBuilder = null;

    // ボクセルデータ
    this.voxelLookData = null;
    this.voxelCollisionData = null;

    // マテリアル（3スロット）
    this.materials = [null, null, null];
    this.materialTextures = ['', '', ''];
    this.currentMaterial = 1; // 1-3

    // 編集設定
    this.brushSize = 2; // 1, 2, 4（初期値は2）
    this.editMode = 'look'; // 'look' or 'collision'

    // カメラ設定
    this.horizontalAngle = 0;  // 水平角度（度）
    this.verticalAngle = 20;   // 垂直角度（度）
    this.cameraDistance = 3;   // カメラ距離

    // 背景色
    this.bgColors = ['#000000', '#1a237e', '#1b5e20'];
    this.bgColorIndex = 0;

    // ボクセルメッシュグループ
    this.voxelGroup = null;
    this.lookMesh = null;        // 見た目メッシュ
    this.collisionMesh = null;   // 当たり判定メッシュ

    // グリッドとラベル
    this.gridHelper = null;
    this.labels = [];

    // ハイライト用オブジェクト
    this.highlightFace = null;
    this.highlightEdges = null;
    this.gridHighlight = null;

    // マウス操作
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragThreshold = 5; // ドラッグ判定のしきい値（ピクセル）
    this.raycaster = null;
    this.mouse = null;

    // アニメーション
    this.animationId = null;

    // テクスチャ画像データ
    this.textureImages = {};

    // 計算済み定数（キャッシュ）
    this._voxelOffset = (CustomBlockEditor.GRID_SIZE * CustomBlockEditor.VOXEL_SIZE) / 2 - CustomBlockEditor.VOXEL_SIZE / 2;

    // パーティクルシステム
    this.particleSystem = null;
    this.lastFrameTime = null;

    // ミニプレビュー用オブジェクト
    this.miniPreviewContainer = null;
    this.miniPreviewScene = null;
    this.miniPreviewCamera = null;
    this.miniPreviewRenderer = null;
    this.miniPreviewMesh = null;

    // 連続設置用状態
    this.continuousPlacement = {
      active: false,
      direction: null,
      lastCoord: null,
      intervalId: null
    };
  }

  /**
   * シーン・カメラ・レンダラーを初期化
   */
  init() {
    this._setupScene();
    this._setupCamera();
    this._setupRenderer();
    this._setupLights();
    this._setupGrid();
    this._setupLabels();
    this._setupHighlight();
    this._setupRaycaster();
    this._attachEvents();
    this._initMaterials();
    this._initVoxelData();
    this._initParticleSystem();
    this._startRenderLoop();
  }

  /**
   * パーティクルシステムを初期化
   * @private
   */
  _initParticleSystem() {
    this.particleSystem = new VoxelParticleSystem({
      scene: this.scene,
      THREE: this.THREE
    });
  }

  /**
   * ブロックデータをロードして表示
   * @param {Object} blockData - ブロックデータ
   */
  loadBlock(blockData) {
    // ボクセルデータをロード
    this.voxelLookData = VoxelData.decode(blockData.voxel_look || '');
    // 当たり判定データは4x4x4形式（CustomCollision）
    this.voxelCollisionData = CustomCollision.decode(blockData.voxel_collision || '');

    // マテリアルテクスチャをロード
    if (blockData.material_1) {
      this.setMaterial(1, blockData.material_1);
    }
    if (blockData.material_2) {
      this.setMaterial(2, blockData.material_2);
    }
    if (blockData.material_3) {
      this.setMaterial(3, blockData.material_3);
    }

    // メッシュを再構築
    this._rebuildVoxelMesh();

    // ミニプレビューも更新
    this._rebuildMiniPreviewMesh();
  }

  /**
   * テクスチャ画像データを設定
   * @param {Object} textureImages - { textureName: base64Data, ... }
   */
  setTextureImages(textureImages) {
    this.textureImages = textureImages;
  }

  /**
   * 指定マテリアルスロットにテクスチャを設定
   * @param {number} slot - スロット番号 (1-3)
   * @param {string} textureName - テクスチャ名
   */
  setMaterial(slot, textureName) {
    if (slot < 1 || slot > 3) return;

    const index = slot - 1;
    this.materialTextures[index] = textureName || '';

    // マテリアルを更新
    if (textureName && this.textureImages[textureName]) {
      this.materials[index] = this.meshBuilder.createMaterialFromTexture(this.textureImages[textureName]);
    } else {
      this.materials[index] = this.meshBuilder.createColorMaterial(0x808080);
    }

    // メッシュを再構築
    this._rebuildVoxelMesh();
  }

  /**
   * 現在のマテリアル設定を取得
   * @returns {Array} マテリアルテクスチャ名の配列
   */
  getMaterials() {
    return {
      material_1: this.materialTextures[0],
      material_2: this.materialTextures[1],
      material_3: this.materialTextures[2]
    };
  }

  /**
   * 配置時に使用するマテリアル番号を設定
   * @param {number} num - マテリアル番号 (1-3)
   */
  setCurrentMaterial(num) {
    if (num >= 1 && num <= 3) {
      this.currentMaterial = num;
      if (this.onMaterialSelect) {
        this.onMaterialSelect(num);
      }
    }
  }

  /**
   * 現在選択中のマテリアル番号を取得
   * @returns {number} マテリアル番号 (1-3)
   */
  getCurrentMaterial() {
    return this.currentMaterial;
  }

  /**
   * ブラシサイズを設定
   * @param {number} size - ブラシサイズ (1, 2, 4)
   */
  setBrushSize(size) {
    if ([1, 2, 4].includes(size)) {
      this.brushSize = size;
      this._updateHighlightGeometry();
    }
  }

  /**
   * 現在のブラシサイズを取得
   * @returns {number} ブラシサイズ
   */
  getBrushSize() {
    return this.brushSize;
  }

  /**
   * 現在のハイライトサイズを取得（ブラシサイズと連動）
   * @returns {number} ハイライトサイズ
   */
  getHighlightSize() {
    return this.brushSize;
  }

  /**
   * パーティクルシステムを取得（テスト用）
   * @returns {VoxelParticleSystem} パーティクルシステム
   */
  getParticleSystem() {
    return this.particleSystem;
  }

  /**
   * 連続設置状態を取得（テスト用）
   * @returns {Object} 連続設置状態
   */
  getContinuousPlacementState() {
    return {
      active: this.continuousPlacement.active,
      direction: this.continuousPlacement.direction,
      lastCoord: this.continuousPlacement.lastCoord
    };
  }

  /**
   * 編集モードを設定
   * @param {string} mode - 'look' または 'collision'
   */
  setEditMode(mode) {
    if (['look', 'collision'].includes(mode)) {
      this.editMode = mode;

      // 当たり判定モードではブラシサイズを2に固定
      if (mode === 'collision') {
        this.brushSize = 2;
      }

      this._rebuildVoxelMesh();

      // ミニプレビューも更新
      this._rebuildMiniPreviewMesh();
    }
  }

  /**
   * 現在の編集モードを取得
   * @returns {string} 編集モード
   */
  getEditMode() {
    return this.editMode;
  }

  /**
   * 見た目ボクセルデータを取得（Base64）
   * @returns {string} Base64エンコードされたデータ
   */
  getVoxelLookData() {
    return VoxelData.encode(this.voxelLookData);
  }

  /**
   * 当たり判定ボクセルデータを取得（Base64）
   * 4x4x4形式（8バイト）
   * @returns {string} Base64エンコードされたデータ（12文字）
   */
  getVoxelCollisionData() {
    return CustomCollision.encode(this.voxelCollisionData);
  }

  /**
   * 見た目から当たり判定を自動生成
   * 見た目の2x2x2領域に1つでもボクセルがあれば、当たり判定の1ボクセルを1に設定
   */
  autoCreateCollision() {
    // 新しい当たり判定データを作成
    this.voxelCollisionData = CustomCollision.createEmpty();

    // 4x4x4の当たり判定グリッドを走査
    for (let cy = 0; cy < 4; cy++) {
      for (let cz = 0; cz < 4; cz++) {
        for (let cx = 0; cx < 4; cx++) {
          // 対応する見た目の2x2x2領域をチェック
          let hasVoxel = false;
          for (let dy = 0; dy < 2 && !hasVoxel; dy++) {
            for (let dz = 0; dz < 2 && !hasVoxel; dz++) {
              for (let dx = 0; dx < 2 && !hasVoxel; dx++) {
                const lx = cx * 2 + dx;
                const ly = cy * 2 + dy;
                const lz = cz * 2 + dz;
                if (VoxelData.getVoxel(this.voxelLookData, lx, ly, lz) > 0) {
                  hasVoxel = true;
                }
              }
            }
          }
          // 1つでもボクセルがあれば当たり判定を1に
          CustomCollision.setVoxel(this.voxelCollisionData, cx, cy, cz, hasVoxel ? 1 : 0);
        }
      }
    }

    if (this.editMode === 'collision') {
      this._rebuildVoxelMesh();
    }
  }

  /**
   * 背景色を設定
   * @param {string} color - 色コード
   */
  setBackgroundColor(color) {
    this.renderer.setClearColor(new this.THREE.Color(color));
  }

  /**
   * 背景色を切り替え
   * @returns {string} 新しい背景色
   */
  toggleBackgroundColor() {
    this.bgColorIndex = (this.bgColorIndex + 1) % this.bgColors.length;
    const color = this.bgColors[this.bgColorIndex];
    this.setBackgroundColor(color);
    return color;
  }

  /**
   * Three.jsシーンを取得
   * @returns {THREE.Scene}
   */
  getScene() {
    return this.scene;
  }

  /**
   * Three.jsカメラを取得
   * @returns {THREE.PerspectiveCamera}
   */
  getCamera() {
    return this.camera;
  }

  /**
   * 見た目メッシュを取得
   * @returns {THREE.Group}
   */
  getLookMesh() {
    return this.lookMesh;
  }

  /**
   * 当たり判定メッシュを取得
   * @returns {THREE.Group}
   */
  getCollisionMesh() {
    return this.collisionMesh;
  }

  /**
   * リサイズ処理
   */
  resize() {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * リソース解放
   */
  dispose() {
    // 連続設置を停止
    this._stopContinuousPlacement();

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this._detachEvents();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    // ミニプレビューリソース解放
    if (this.miniPreviewRenderer) {
      this.miniPreviewRenderer.dispose();
    }

    // パーティクルシステム解放
    if (this.particleSystem) {
      this.particleSystem.dispose();
      this.particleSystem = null;
    }

    // マテリアル解放
    this.materials.forEach(mat => {
      if (mat) mat.dispose();
    });

    // ジオメトリ解放
    if (this.voxelGroup) {
      this.voxelGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
  }

  /**
   * ミニプレビューを初期化
   * @param {HTMLElement} container - ミニプレビューをマウントするコンテナ（モード切替ボタン）
   */
  initMiniPreview(container) {
    this.miniPreviewContainer = container;

    // コンテナ内をクリア
    container.innerHTML = '';

    // シーン作成
    this.miniPreviewScene = new this.THREE.Scene();

    // カメラ作成（メインカメラと同じ角度）
    this.miniPreviewCamera = new this.THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this._updateMiniPreviewCamera();

    // レンダラー作成
    this.miniPreviewRenderer = new this.THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    const size = Math.min(container.clientWidth, container.clientHeight) || 32;
    this.miniPreviewRenderer.setSize(size, size);
    this.miniPreviewRenderer.setClearColor(0x000000, 0);
    container.appendChild(this.miniPreviewRenderer.domElement);

    // ライト追加
    const ambientLight = new this.THREE.AmbientLight(0xffffff, 0.6);
    this.miniPreviewScene.add(ambientLight);
    const directionalLight = new this.THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    this.miniPreviewScene.add(directionalLight);

    // 初期メッシュを構築
    this._rebuildMiniPreviewMesh();
  }

  /**
   * ミニプレビューのカメラを更新（メインカメラと同期）
   * @private
   */
  _updateMiniPreviewCamera() {
    if (!this.miniPreviewCamera) return;

    const hRad = this.horizontalAngle * Math.PI / 180;
    const vRad = this.verticalAngle * Math.PI / 180;

    const x = this.cameraDistance * Math.sin(hRad) * Math.cos(vRad);
    const y = this.cameraDistance * Math.sin(vRad);
    const z = this.cameraDistance * Math.cos(hRad) * Math.cos(vRad);

    this.miniPreviewCamera.position.set(x, y, z);
    this.miniPreviewCamera.lookAt(0, 0, 0);
  }

  /**
   * ミニプレビューのメッシュを再構築
   * 見た目モードでは当たり判定を、当たり判定モードでは見た目を表示
   * @private
   */
  _rebuildMiniPreviewMesh() {
    if (!this.miniPreviewScene) return;

    // 既存メッシュを削除
    if (this.miniPreviewMesh) {
      this.miniPreviewScene.remove(this.miniPreviewMesh);
      this.miniPreviewMesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }

    // 現在のモードの逆のデータを表示
    if (this.editMode === 'look') {
      // 見た目モードでは当たり判定ボクセルを表示
      const collisionDisplayData = this._expandCollisionToLookSize();
      const whiteMaterial = this.meshBuilder.createColorMaterial(0xffffff);
      this.miniPreviewMesh = this.meshBuilder.build(collisionDisplayData, [whiteMaterial, whiteMaterial, whiteMaterial]);
    } else {
      // 当たり判定モードでは見た目ボクセルを表示
      this.miniPreviewMesh = this.meshBuilder.buildWithUV(this.voxelLookData, this.materials);
    }

    this.miniPreviewMesh.visible = true;
    this.miniPreviewScene.add(this.miniPreviewMesh);
  }

  /**
   * ミニプレビューをレンダリング
   * @private
   */
  _renderMiniPreview() {
    if (this.miniPreviewRenderer && this.miniPreviewScene && this.miniPreviewCamera) {
      this.miniPreviewRenderer.render(this.miniPreviewScene, this.miniPreviewCamera);
    }
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * シーンをセットアップ
   * @private
   */
  _setupScene() {
    this.scene = new this.THREE.Scene();
  }

  /**
   * カメラをセットアップ
   * @private
   */
  _setupCamera() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera = new this.THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this._updateCameraPosition();
  }

  /**
   * カメラ位置を更新
   * @private
   */
  _updateCameraPosition() {
    const hRad = this.horizontalAngle * Math.PI / 180;
    const vRad = this.verticalAngle * Math.PI / 180;

    const x = this.cameraDistance * Math.sin(hRad) * Math.cos(vRad);
    const y = this.cameraDistance * Math.sin(vRad);
    const z = this.cameraDistance * Math.cos(hRad) * Math.cos(vRad);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);

    // ミニプレビューカメラも同期
    this._updateMiniPreviewCamera();
  }

  /**
   * レンダラーをセットアップ
   * @private
   */
  _setupRenderer() {
    this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(new this.THREE.Color(this.bgColors[this.bgColorIndex]));
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * ライトをセットアップ
   * @private
   */
  _setupLights() {
    const ambientLight = new this.THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new this.THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);
  }

  /**
   * グリッドをセットアップ（床面、8x8）
   * @private
   */
  _setupGrid() {
    // 床面グリッド（8x8）
    const gridSize = 1; // 全体サイズ
    const divisions = 8;

    this.gridHelper = new this.THREE.GridHelper(gridSize, divisions, 0x444444, 0x333333);
    this.gridHelper.position.y = -0.5; // ボクセルの下端
    this.scene.add(this.gridHelper);
  }

  /**
   * 方向ラベルをセットアップ
   * @private
   */
  _setupLabels() {
    // 床面の高さ（Y=-0.5）で各方向に距離1の位置
    const labelPositions = [
      { text: 'FRONT', pos: [0, -0.5, 1] },
      { text: 'BACK', pos: [0, -0.5, -1] },
      { text: 'LEFT', pos: [-1, -0.5, 0] },
      { text: 'RIGHT', pos: [1, -0.5, 0] }
    ];

    labelPositions.forEach(label => {
      const sprite = this._createTextSprite(label.text);
      sprite.position.set(...label.pos);
      sprite.scale.set(0.5, 0.125, 1); // 1-3 StandardBlockEditorと同一仕様
      this.scene.add(sprite);
      this.labels.push(sprite);
    });
  }

  /**
   * テキストスプライトを作成
   * 1-3 StandardBlockEditorと同一仕様：フォント20px Arial、色#ffffff
   * @private
   */
  _createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 128, 32);

    ctx.font = '20px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 16);

    const texture = new this.THREE.CanvasTexture(canvas);
    const material = new this.THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });

    return new this.THREE.Sprite(material);
  }

  /**
   * ハイライト用オブジェクトをセットアップ
   * @private
   */
  _setupHighlight() {
    const voxelSize = CustomBlockEditor.VOXEL_SIZE;
    const size = voxelSize * this.brushSize;

    // 面ハイライト（緑）
    const faceGeometry = new this.THREE.PlaneGeometry(size, size);
    const faceMaterial = new this.THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: this.THREE.DoubleSide
    });
    this.highlightFace = new this.THREE.Mesh(faceGeometry, faceMaterial);
    this.highlightFace.visible = false;
    this.scene.add(this.highlightFace);

    // 辺ハイライト（赤）
    const edgesGeometry = new this.THREE.EdgesGeometry(new this.THREE.BoxGeometry(size, size, size));
    const edgesMaterial = new this.THREE.LineBasicMaterial({ color: 0xff0000 });
    this.highlightEdges = new this.THREE.LineSegments(edgesGeometry, edgesMaterial);
    this.highlightEdges.visible = false;
    this.scene.add(this.highlightEdges);

    // 床面グリッドハイライト
    const gridHighlightGeometry = new this.THREE.PlaneGeometry(size, size);
    const gridHighlightMaterial = new this.THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: this.THREE.DoubleSide
    });
    this.gridHighlight = new this.THREE.Mesh(gridHighlightGeometry, gridHighlightMaterial);
    this.gridHighlight.rotation.x = -Math.PI / 2;
    this.gridHighlight.visible = false;
    this.scene.add(this.gridHighlight);
  }

  /**
   * ハイライトジオメトリをブラシサイズに合わせて更新
   * @private
   */
  _updateHighlightGeometry() {
    if (!this.highlightFace || !this.highlightEdges || !this.gridHighlight) {
      return;
    }

    const voxelSize = CustomBlockEditor.VOXEL_SIZE;
    const size = voxelSize * this.brushSize;

    // 面ハイライトのジオメトリを更新
    this.highlightFace.geometry.dispose();
    this.highlightFace.geometry = new this.THREE.PlaneGeometry(size, size);

    // 辺ハイライトのジオメトリを更新
    this.highlightEdges.geometry.dispose();
    this.highlightEdges.geometry = new this.THREE.EdgesGeometry(
      new this.THREE.BoxGeometry(size, size, size)
    );

    // 床面グリッドハイライトのジオメトリを更新
    this.gridHighlight.geometry.dispose();
    this.gridHighlight.geometry = new this.THREE.PlaneGeometry(size, size);
  }

  /**
   * レイキャスターをセットアップ
   * @private
   */
  _setupRaycaster() {
    this.raycaster = new this.THREE.Raycaster();
    this.mouse = new this.THREE.Vector2();
    // 床面プレーンを事前作成（パフォーマンス向上）
    this._floorPlane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0.5);
    this._intersectionPoint = new this.THREE.Vector3();
  }

  /**
   * マウスイベントからレイキャスターをセットアップ
   * @private
   * @param {MouseEvent} event
   */
  _updateRaycasterFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  /**
   * メッシュ位置からボクセル座標を計算
   * @private
   * @param {THREE.Vector3} position - メッシュの位置
   * @returns {{x: number, y: number, z: number}} ボクセル座標
   */
  _positionToVoxelCoord(position) {
    const voxelSize = CustomBlockEditor.VOXEL_SIZE;
    return {
      x: Math.round((position.x + this._voxelOffset) / voxelSize),
      y: Math.round((position.y + this._voxelOffset) / voxelSize),
      z: Math.round((position.z + this._voxelOffset) / voxelSize)
    };
  }

  /**
   * ボクセル座標からワールド座標に変換
   * @private
   * @param {number} vx - ボクセルX座標
   * @param {number} vy - ボクセルY座標
   * @param {number} vz - ボクセルZ座標
   * @returns {{x: number, y: number, z: number}} ワールド座標
   */
  _voxelCoordToPosition(vx, vy, vz) {
    const voxelSize = CustomBlockEditor.VOXEL_SIZE;
    return {
      x: vx * voxelSize - this._voxelOffset,
      y: vy * voxelSize - this._voxelOffset,
      z: vz * voxelSize - this._voxelOffset
    };
  }

  /**
   * 座標が有効範囲内かチェック
   * @private
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} gridSize - グリッドサイズ（デフォルト: 8）
   * @returns {boolean}
   */
  _isValidCoord(x, y, z, gridSize = CustomBlockEditor.GRID_SIZE) {
    return x >= 0 && x < gridSize && y >= 0 && y < gridSize && z >= 0 && z < gridSize;
  }

  /**
   * マテリアルを初期化
   * @private
   */
  _initMaterials() {
    this.meshBuilder = new CustomBlockMeshBuilder(this.THREE);

    for (let i = 0; i < 3; i++) {
      this.materials[i] = this.meshBuilder.createColorMaterial(0x808080);
    }
  }

  /**
   * ボクセルデータを初期化
   * @private
   */
  _initVoxelData() {
    this.voxelLookData = VoxelData.createEmpty();
    // 当たり判定は4x4x4形式
    this.voxelCollisionData = CustomCollision.createEmpty();
  }

  /**
   * ボクセルメッシュを再構築
   * @private
   */
  _rebuildVoxelMesh() {
    // 既存のメッシュを削除
    if (this.lookMesh) {
      this.scene.remove(this.lookMesh);
      this.lookMesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
    if (this.collisionMesh) {
      this.scene.remove(this.collisionMesh);
      this.collisionMesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }

    // 見た目メッシュを構築
    this.lookMesh = this.meshBuilder.buildWithUV(this.voxelLookData, this.materials);
    this.scene.add(this.lookMesh);

    // 当たり判定メッシュを構築（4x4x4から8x8x8に展開して表示）
    const collisionDisplayData = this._expandCollisionToLookSize();
    const whiteMaterial = this.meshBuilder.createColorMaterial(0xffffff);
    this.collisionMesh = this.meshBuilder.build(collisionDisplayData, [whiteMaterial, whiteMaterial, whiteMaterial]);
    this.scene.add(this.collisionMesh);

    // モードに応じて表示切替
    if (this.editMode === 'look') {
      this.lookMesh.visible = true;
      this.collisionMesh.visible = false;
    } else {
      this.lookMesh.visible = false;
      this.collisionMesh.visible = true;
    }

    // voxelGroupは互換性のため現在のモードのメッシュを参照
    this.voxelGroup = this.editMode === 'look' ? this.lookMesh : this.collisionMesh;
  }

  /**
   * 4x4x4の当たり判定データを8x8x8の表示用データに展開
   * @private
   * @returns {Uint8Array} 8x8x8のボクセルデータ
   */
  _expandCollisionToLookSize() {
    const displayData = VoxelData.createEmpty();

    for (let cy = 0; cy < 4; cy++) {
      for (let cz = 0; cz < 4; cz++) {
        for (let cx = 0; cx < 4; cx++) {
          const value = CustomCollision.getVoxel(this.voxelCollisionData, cx, cy, cz);
          if (value) {
            // 2x2x2の領域に展開
            for (let dy = 0; dy < 2; dy++) {
              for (let dz = 0; dz < 2; dz++) {
                for (let dx = 0; dx < 2; dx++) {
                  VoxelData.setVoxel(displayData, cx * 2 + dx, cy * 2 + dy, cz * 2 + dz, 1);
                }
              }
            }
          }
        }
      }
    }

    return displayData;
  }

  /**
   * イベントをアタッチ
   * @private
   */
  _attachEvents() {
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
    this._onClick = this._handleClick.bind(this);

    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mouseup', this._onMouseUp);
    this.renderer.domElement.addEventListener('mouseleave', this._onMouseUp);
    this.renderer.domElement.addEventListener('wheel', this._onWheel);
    this.renderer.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.renderer.domElement.addEventListener('click', this._onClick);
  }

  /**
   * イベントをデタッチ
   * @private
   */
  _detachEvents() {
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown);
      this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove);
      this.renderer.domElement.removeEventListener('mouseup', this._onMouseUp);
      this.renderer.domElement.removeEventListener('mouseleave', this._onMouseUp);
      this.renderer.domElement.removeEventListener('wheel', this._onWheel);
      this.renderer.domElement.removeEventListener('contextmenu', this._onContextMenu);
      this.renderer.domElement.removeEventListener('click', this._onClick);
    }
  }

  /**
   * マウスダウンハンドラ
   * @private
   */
  _handleMouseDown(event) {
    if (event.button === 0) {
      // 左クリックでカメラドラッグ開始
      this.isDragging = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
    } else if (event.button === 2) {
      // 右クリックで連続設置を開始
      this._startContinuousPlacement(event);
    }
  }

  /**
   * マウス移動ハンドラ
   * @private
   */
  _handleMouseMove(event) {
    if (this.isDragging) {
      // カメラ回転
      const deltaX = event.clientX - this.lastMouseX;
      const deltaY = event.clientY - this.lastMouseY;

      // 右にドラッグすると horizontalAngle が減少（ブロックが右に回転）
      this.horizontalAngle -= deltaX * 0.5;
      this.verticalAngle += deltaY * 0.5;

      // 垂直角度の制限（-90 〜 90度）
      this.verticalAngle = Math.max(-90, Math.min(90, this.verticalAngle));

      this._updateCameraPosition();

      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    } else {
      // ハイライト更新
      this._updateHighlight(event);
    }
  }

  /**
   * マウスアップハンドラ
   * @private
   */
  _handleMouseUp(event) {
    if (this.isDragging && event.button === 0) {
      // ドラッグ距離をチェック
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // ドラッグ距離が小さい場合はクリックとして扱い、ボクセル削除
      if (distance < this.dragThreshold) {
        this._removeVoxel(event);
      }
    }
    this.isDragging = false;

    // 右クリック解放で連続設置を停止
    if (event.button === 2) {
      this._stopContinuousPlacement();
    }
  }

  /**
   * ホイールハンドラ（ズーム）
   * @private
   */
  _handleWheel(event) {
    event.preventDefault();

    this.cameraDistance += event.deltaY * 0.002;
    this.cameraDistance = Math.max(1, Math.min(10, this.cameraDistance));

    this._updateCameraPosition();
  }

  /**
   * コンテキストメニュー無効化
   * @private
   */
  _handleContextMenu(event) {
    event.preventDefault();
    // ボクセル配置は mousedown で処理するため、ここでは何もしない
  }

  /**
   * クリックハンドラ（現在は使用しない - ボクセル削除はマウスアップで処理）
   * @private
   */
  _handleClick(event) {
    // ボクセル削除はマウスアップで処理するため、ここでは何もしない
  }

  /**
   * ハイライトを更新
   * @private
   */
  _updateHighlight(event) {
    this._updateRaycasterFromEvent(event);

    // ボクセルメッシュとの交差チェック
    if (this.voxelGroup && this.voxelGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.voxelGroup.children);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;
        const hitFace = hit.face;

        const voxelSize = CustomBlockEditor.VOXEL_SIZE;
        const brushSize = this.brushSize;
        const brushVoxelSize = voxelSize * brushSize;
        const centerOffset = (brushSize - 1) * voxelSize / 2;

        // ヒットしたボクセルの座標を取得
        const hitCoord = this._positionToVoxelCoord(hitObject.position);

        // ブラシサイズに応じてスナップした座標を計算
        const snappedX = Math.floor(hitCoord.x / brushSize) * brushSize;
        const snappedY = Math.floor(hitCoord.y / brushSize) * brushSize;
        const snappedZ = Math.floor(hitCoord.z / brushSize) * brushSize;

        // スナップした位置のワールド座標を計算
        const snappedPos = new this.THREE.Vector3(
          snappedX * voxelSize - this._voxelOffset + centerOffset,
          snappedY * voxelSize - this._voxelOffset + centerOffset,
          snappedZ * voxelSize - this._voxelOffset + centerOffset
        );

        // 辺ハイライト
        this.highlightEdges.position.copy(snappedPos);
        this.highlightEdges.visible = true;

        // 面ハイライト - 設置可能な場合のみ表示
        const normal = hitFace.normal.clone();
        normal.transformDirection(hitObject.matrixWorld);

        // 法線方向に隣接する位置
        const targetX = snappedX + Math.round(normal.x) * brushSize;
        const targetY = snappedY + Math.round(normal.y) * brushSize;
        const targetZ = snappedZ + Math.round(normal.z) * brushSize;

        // 設置可能かチェック（8x8x8の範囲内、ブラシサイズ分の領域が必要）
        const validTarget = targetX >= 0 && targetX + brushSize <= CustomBlockEditor.GRID_SIZE &&
                           targetY >= 0 && targetY + brushSize <= CustomBlockEditor.GRID_SIZE &&
                           targetZ >= 0 && targetZ + brushSize <= CustomBlockEditor.GRID_SIZE;

        if (validTarget) {
          this.highlightFace.position.copy(snappedPos);
          this.highlightFace.position.add(normal.clone().multiplyScalar(brushVoxelSize / 2 + 0.001));
          this.highlightFace.lookAt(this.highlightFace.position.clone().add(normal));
          this.highlightFace.visible = true;
        } else {
          this.highlightFace.visible = false;
        }

        this.gridHighlight.visible = false;
        return;
      }
    }

    // 床面との交差チェック
    this.raycaster.ray.intersectPlane(this._floorPlane, this._intersectionPoint);

    if (this._intersectionPoint) {
      const voxelSize = CustomBlockEditor.VOXEL_SIZE;
      const brushSize = this.brushSize;
      const brushVoxelSize = voxelSize * brushSize;

      // ブラシサイズに応じたグリッドにスナップ
      const gridX = Math.floor((this._intersectionPoint.x + 0.5) / brushVoxelSize) * brushSize;
      const gridZ = Math.floor((this._intersectionPoint.z + 0.5) / brushVoxelSize) * brushSize;

      // ハイライトの中心位置を計算（ブラシサイズの中央）
      const centerOffset = (brushSize - 1) * voxelSize / 2;

      if (gridX >= 0 && gridX + brushSize <= CustomBlockEditor.GRID_SIZE &&
          gridZ >= 0 && gridZ + brushSize <= CustomBlockEditor.GRID_SIZE) {
        this.gridHighlight.position.set(
          gridX * voxelSize - this._voxelOffset + centerOffset,
          -0.5 + 0.001,
          gridZ * voxelSize - this._voxelOffset + centerOffset
        );
        this.gridHighlight.visible = true;
      } else {
        this.gridHighlight.visible = false;
      }
    } else {
      this.gridHighlight.visible = false;
    }

    this.highlightFace.visible = false;
    this.highlightEdges.visible = false;
  }

  /**
   * ボクセルを配置（単発、イベントから）
   * @private
   */
  _placeVoxel(event) {
    this._updateRaycasterFromEvent(event);
    const placement = this._calculatePlacementTarget();
    if (placement) {
      this._placeVoxelAt(placement.coord.x, placement.coord.y, placement.coord.z);
    }
  }

  /**
   * 指定座標にボクセルを配置
   * @private
   */
  _placeVoxelAt(x, y, z) {
    if (this.editMode === 'look') {
      // 見た目モード: 8x8x8グリッド
      const brushCoords = this._getBrushCoordinates(x, y, z);

      let changed = false;
      for (const coord of brushCoords) {
        if (this._isValidCoord(coord.x, coord.y, coord.z)) {
          VoxelData.setVoxel(this.voxelLookData, coord.x, coord.y, coord.z, this.currentMaterial);
          changed = true;
        }
      }

      if (changed) {
        this._rebuildVoxelMesh();
        if (this.onVoxelChange) this.onVoxelChange();
      }
    } else {
      // 当たり判定モード: 4x4x4グリッド
      // 8x8x8座標を4x4x4座標に変換
      const cx = Math.floor(x / 2);
      const cy = Math.floor(y / 2);
      const cz = Math.floor(z / 2);

      if (this._isValidCoord(cx, cy, cz, CustomBlockEditor.COLLISION_GRID_SIZE)) {
        CustomCollision.setVoxel(this.voxelCollisionData, cx, cy, cz, 1);
        this._rebuildVoxelMesh();
        if (this.onVoxelChange) {
          this.onVoxelChange();
        }
      }
    }
  }

  /**
   * ボクセルを削除
   * @private
   */
  _removeVoxel(event) {
    this._updateRaycasterFromEvent(event);

    if (this.voxelGroup && this.voxelGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.voxelGroup.children);

      if (intersects.length > 0) {
        const hitCoord = this._positionToVoxelCoord(intersects[0].object.position);
        this._removeVoxelAt(hitCoord.x, hitCoord.y, hitCoord.z);
      }
    }
  }

  /**
   * 指定座標のボクセルを削除
   * @private
   */
  _removeVoxelAt(x, y, z) {
    if (this.editMode === 'look') {
      // 見た目モード: 8x8x8グリッド
      const brushCoords = this._getBrushCoordinates(x, y, z);

      let changed = false;
      for (const coord of brushCoords) {
        if (this._isValidCoord(coord.x, coord.y, coord.z)) {
          const material = VoxelData.getVoxel(this.voxelLookData, coord.x, coord.y, coord.z);
          if (material !== 0) {
            // パーティクルを発生させる
            this._emitVoxelParticle(coord.x, coord.y, coord.z, material);
            VoxelData.setVoxel(this.voxelLookData, coord.x, coord.y, coord.z, 0);
            changed = true;
          }
        }
      }

      if (changed) {
        this._rebuildVoxelMesh();
        if (this.onVoxelChange) this.onVoxelChange();
      }
    } else {
      // 当たり判定モード: 4x4x4グリッド
      // 8x8x8座標を4x4x4座標に変換
      const cx = Math.floor(x / 2);
      const cy = Math.floor(y / 2);
      const cz = Math.floor(z / 2);

      if (this._isValidCoord(cx, cy, cz, CustomBlockEditor.COLLISION_GRID_SIZE)) {
        if (CustomCollision.getVoxel(this.voxelCollisionData, cx, cy, cz) !== 0) {
          CustomCollision.setVoxel(this.voxelCollisionData, cx, cy, cz, 0);
          this._rebuildVoxelMesh();
          if (this.onVoxelChange) this.onVoxelChange();
        }
      }
    }
  }

  /**
   * ボクセル削除パーティクルを発生させる
   * @param {number} vx - ボクセルX座標
   * @param {number} vy - ボクセルY座標
   * @param {number} vz - ボクセルZ座標
   * @param {number} material - マテリアル番号 (1-3)
   * @private
   */
  _emitVoxelParticle(vx, vy, vz, material) {
    if (!this.particleSystem) return;

    // ボクセル座標をワールド座標に変換
    const worldPos = this._voxelCoordToPosition(vx, vy, vz);

    // マテリアルの色を取得（白フォールバック）
    let color = 0xffffff;
    const materialIndex = material - 1;
    if (materialIndex >= 0 && materialIndex < this.materials.length && this.materials[materialIndex].color) {
      color = this.materials[materialIndex].color.getHex();
    }

    // パーティクルを発生
    this.particleSystem.emit(worldPos.x, worldPos.y, worldPos.z, color);
  }

  /**
   * ブラシサイズに応じた座標配列を取得
   * @private
   */
  _getBrushCoordinates(x, y, z) {
    const coords = [];

    if (this.brushSize === 1) {
      coords.push({ x, y, z });
    } else if (this.brushSize === 2) {
      // 2x2x2、グリッド座標(0,2,4,6)にスナップ
      const snapX = Math.floor(x / 2) * 2;
      const snapY = Math.floor(y / 2) * 2;
      const snapZ = Math.floor(z / 2) * 2;

      for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
          for (let dx = 0; dx < 2; dx++) {
            coords.push({ x: snapX + dx, y: snapY + dy, z: snapZ + dz });
          }
        }
      }
    } else if (this.brushSize === 4) {
      // 4x4x4、グリッド座標(0,4)にスナップ
      const snapX = Math.floor(x / 4) * 4;
      const snapY = Math.floor(y / 4) * 4;
      const snapZ = Math.floor(z / 4) * 4;

      for (let dy = 0; dy < 4; dy++) {
        for (let dz = 0; dz < 4; dz++) {
          for (let dx = 0; dx < 4; dx++) {
            coords.push({ x: snapX + dx, y: snapY + dy, z: snapZ + dz });
          }
        }
      }
    }

    return coords;
  }

  /**
   * 連続設置を開始
   * @private
   * @param {MouseEvent} event
   */
  _startContinuousPlacement(event) {
    this._updateRaycasterFromEvent(event);

    // 最初の設置位置と方向を計算
    const placement = this._calculatePlacementTarget();
    if (!placement) return;

    // 最初のボクセルを即座に設置
    this._placeVoxelAt(placement.coord.x, placement.coord.y, placement.coord.z);

    // 連続設置状態を開始
    this.continuousPlacement.active = true;
    this.continuousPlacement.direction = placement.direction;
    this.continuousPlacement.lastCoord = placement.coord;

    // 0.3秒後から連続設置を開始
    this.continuousPlacement.intervalId = setInterval(() => {
      this._continuePlacement();
    }, 300);
  }

  /**
   * 連続設置を停止
   * @private
   */
  _stopContinuousPlacement() {
    if (this.continuousPlacement.intervalId) {
      clearInterval(this.continuousPlacement.intervalId);
      this.continuousPlacement.intervalId = null;
    }
    this.continuousPlacement.active = false;
    this.continuousPlacement.direction = null;
    this.continuousPlacement.lastCoord = null;
  }

  /**
   * 連続設置を継続（1回分の設置）
   * @private
   */
  _continuePlacement() {
    if (!this.continuousPlacement.active) return;

    const lastCoord = this.continuousPlacement.lastCoord;
    const direction = this.continuousPlacement.direction;
    if (!lastCoord || !direction) return;

    // 次の設置位置を計算
    const brushSize = this.brushSize;
    const nextCoord = {
      x: lastCoord.x + Math.round(direction.x) * brushSize,
      y: lastCoord.y + Math.round(direction.y) * brushSize,
      z: lastCoord.z + Math.round(direction.z) * brushSize
    };

    // 範囲外チェック
    const gridSize = this.editMode === 'look' ?
      CustomBlockEditor.GRID_SIZE : CustomBlockEditor.COLLISION_GRID_SIZE;
    const maxCoord = this.editMode === 'look' ?
      CustomBlockEditor.GRID_SIZE - brushSize :
      CustomBlockEditor.COLLISION_GRID_SIZE - 1;

    if (nextCoord.x < 0 || nextCoord.x > maxCoord ||
        nextCoord.y < 0 || nextCoord.y > maxCoord ||
        nextCoord.z < 0 || nextCoord.z > maxCoord) {
      // 範囲外に到達したら停止
      this._stopContinuousPlacement();
      return;
    }

    // ボクセルを設置
    this._placeVoxelAt(nextCoord.x, nextCoord.y, nextCoord.z);
    this.continuousPlacement.lastCoord = nextCoord;
  }

  /**
   * 設置対象の位置と方向を計算
   * @private
   * @returns {{coord: {x,y,z}, direction: {x,y,z}} | null}
   */
  _calculatePlacementTarget() {
    let targetCoord = null;
    let direction = { x: 0, y: 1, z: 0 }; // デフォルトは上方向

    // ボクセルメッシュとの交差チェック
    if (this.voxelGroup && this.voxelGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.voxelGroup.children);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitCoord = this._positionToVoxelCoord(hit.object.position);

        // 法線方向を取得
        const normal = hit.face.normal.clone();
        normal.transformDirection(hit.object.matrixWorld);
        direction = { x: normal.x, y: normal.y, z: normal.z };

        // ブラシサイズに応じたスナップ
        const snapX = Math.floor(hitCoord.x / this.brushSize) * this.brushSize;
        const snapY = Math.floor(hitCoord.y / this.brushSize) * this.brushSize;
        const snapZ = Math.floor(hitCoord.z / this.brushSize) * this.brushSize;

        targetCoord = {
          x: snapX + Math.round(normal.x) * this.brushSize,
          y: snapY + Math.round(normal.y) * this.brushSize,
          z: snapZ + Math.round(normal.z) * this.brushSize
        };
      }
    }

    // 床面との交差チェック（ボクセルがない場合）
    if (!targetCoord) {
      this.raycaster.ray.intersectPlane(this._floorPlane, this._intersectionPoint);

      if (this._intersectionPoint) {
        const voxelSize = CustomBlockEditor.VOXEL_SIZE;
        const brushVoxelSize = voxelSize * this.brushSize;
        const gridX = Math.floor((this._intersectionPoint.x + 0.5) / brushVoxelSize) * this.brushSize;
        const gridZ = Math.floor((this._intersectionPoint.z + 0.5) / brushVoxelSize) * this.brushSize;

        if (gridX >= 0 && gridX + this.brushSize <= CustomBlockEditor.GRID_SIZE &&
            gridZ >= 0 && gridZ + this.brushSize <= CustomBlockEditor.GRID_SIZE) {
          targetCoord = { x: gridX, y: 0, z: gridZ };
          direction = { x: 0, y: 1, z: 0 }; // 床面からは上方向
        }
      }
    }

    if (!targetCoord) return null;

    return { coord: targetCoord, direction: direction };
  }

  /**
   * レンダーループを開始
   * @private
   */
  _startRenderLoop() {
    const render = (currentTime) => {
      this.animationId = requestAnimationFrame(render);

      // デルタタイムを計算（パーティクル更新用）
      if (this.lastFrameTime !== null) {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        // パーティクルシステムを更新
        if (this.particleSystem) {
          this.particleSystem.update(deltaTime);
        }
      }
      this.lastFrameTime = currentTime;

      this.renderer.render(this.scene, this.camera);
      // ミニプレビューもレンダリング
      this._renderMiniPreview();
    };
    render(performance.now());
  }
}
