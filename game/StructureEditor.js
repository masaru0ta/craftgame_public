/**
 * StructureEditor
 * 構造物（複数ブロック）の3D編集クラス
 * Three.jsシーン管理、カメラ操作、ブロック配置/削除を担当
 */
class StructureEditor {
  // 定数
  static CANVAS_SIZE = 32;     // 編集キャンバスサイズ（32x32x32）
  static VOXEL_SIZE = 1.0;     // 1ボクセル = 1.0単位
  static ORIGIN_X = 16;        // 原点X座標（グリッド中央）
  static ORIGIN_Y = 0;         // 原点Y座標（床面）
  static ORIGIN_Z = 16;        // 原点Z座標（グリッド中央）

  // 面ごとの明るさ: BoxGeometry面順(+X,-X,+Y,-Y,+Z,-Z)
  static FACE_BRIGHTNESS = [0.75, 0.75, 1.0, 0.5, 0.85, 0.85];
  // グリッド色
  static GRID_COLORS = { primary: 0x444444, secondary: 0x333333 };
  // カメラ設定
  static CAMERA_DEFAULTS = { distance: 30, hAngle: 0, vAngle: 20, zoomMin: 5, zoomMax: 100, sensitivity: 0.5, zoomSpeed: 0.02 };
  // ハイライト
  static HIGHLIGHT_COLOR = 0x00ff00;
  static HIGHLIGHT_OPACITY = 0.5;
  // 原点マーカー
  static ORIGIN_MARKER = { color: 0xff4444, opacity: 0.4 };
  // 連続配置間隔(ms)
  static CONTINUOUS_INTERVAL = 300;
  // ドラッグ判定閾値(px)
  static DRAG_THRESHOLD = 5;

  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Three.jsをマウントするDOM要素
   * @param {Object} options.THREE - Three.jsライブラリ
   * @param {Array} options.blocks - GAS登録済みブロック一覧
   * @param {Function} options.onBlockChange - ブロック変更時コールバック (optional)
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
    this.blocks = options.blocks || [];
    this.onBlockChange = options.onBlockChange || null;

    // Three.js オブジェクト
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // StructureData
    this.structureData = null;

    // 現在の配置ブロック
    this.currentBlock = null;

    // ブラシサイズ
    this.brushSize = 1;

    // カメラ設定
    this.horizontalAngle = StructureEditor.CAMERA_DEFAULTS.hAngle;
    this.verticalAngle = StructureEditor.CAMERA_DEFAULTS.vAngle;
    this.cameraDistance = StructureEditor.CAMERA_DEFAULTS.distance;

    // 背景色
    this.bgColors = ['#000000', '#1a237e', '#1b5e20'];
    this.bgColorIndex = 0;

    // ボクセルメッシュグループ
    this.voxelGroup = null;

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
    this.dragThreshold = StructureEditor.DRAG_THRESHOLD;
    this.raycaster = null;
    this.mouse = null;

    // 連続設置用状態
    this.continuousPlacement = {
      active: false,
      direction: null,
      lastCoord: null,
      intervalId: null
    };

    // アニメーション
    this.animationId = null;

    // 床面プレーン（レイキャスト用）
    this._floorPlane = null;
    this._intersectionPoint = null;

    // テクスチャ一覧（色参照用）
    this.textures = options.textures || [];

    // ブロック色マップ（blockStrId → color_hex）
    this._blockColorMap = {};
    // テクスチャキャッシュ（file_name → THREE.Texture）
    this._textureCache = {};
    // テクスチャBase64マップ（file_name → image_base64）
    this._texBase64Map = {};
    this._buildBlockColorMap();
  }

  /**
   * ブロック一覧とテクスチャ一覧からcolor_hexマップを構築
   * ブロックのtex_defaultからテクスチャを参照し、color_hexを取得
   * @private
   */
  _buildBlockColorMap() {
    // テクスチャのfile_name → color_hex マップ
    const texColorMap = {};
    this._texBase64Map = {};
    this._textureCache = {};
    this.textures.forEach(tex => {
      if (tex.file_name && tex.color_hex) {
        texColorMap[tex.file_name] = tex.color_hex;
      }
      if (tex.file_name && tex.image_base64) {
        this._texBase64Map[tex.file_name] = tex.image_base64;
      }
    });

    // ブロック情報マップ（blockStrId → block）をカスタムブロック表示用に構築
    this._blockInfoMap = {};

    this.blocks.forEach(block => {
      const strId = block.block_str_id || block.str_id;
      if (!strId) return;

      this._blockInfoMap[strId] = block;

      // block自体にcolor_hexがあればそれを優先
      if (block.color_hex) {
        this._blockColorMap[strId] = block.color_hex;
        return;
      }

      // tex_defaultからテクスチャ色を参照
      const texName = block.tex_default;
      if (texName) {
        const color = this._findTexByName(texColorMap, texName);
        if (color) {
          this._blockColorMap[strId] = color;
          return;
        }
      }

      // カスタムブロック: material_1からテクスチャ色を参照
      if (block.material_1) {
        const color = this._findTexByName(texColorMap, block.material_1);
        if (color) {
          this._blockColorMap[strId] = color;
          return;
        }
      }
    });
  }

  /**
   * マップからテクスチャ名で値を検索（完全一致 → .png付き → .png無し）
   * @private
   */
  _findTexByName(map, texName) {
    if (!texName) return null;
    return map[texName]
      || map[texName + '.png']
      || map[texName.replace('.png', '')];
  }

  /**
   * テクスチャ名からTHREE.Textureを取得（キャッシュ付き）
   * @private
   */
  _getTexture(texName) {
    if (!texName) return null;

    // キャッシュにあればそれを返す
    const key = texName.replace('.png', '');
    if (this._textureCache[key]) return this._textureCache[key];

    const base64 = this._findTexByName(this._texBase64Map, texName);
    if (!base64) return null;

    const loader = new this.THREE.TextureLoader();
    const texture = loader.load(base64);
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestFilter;

    this._textureCache[key] = texture;
    return texture;
  }

  /**
   * 通常ブロック用のテクスチャ付きマテリアル配列を生成（6面分）
   * BoxGeometryの面順: +X, -X, +Y, -Y, +Z, -Z
   * @private
   */
  _createBlockMaterials(blockStrId) {
    const blockInfo = this._blockInfoMap ? this._blockInfoMap[blockStrId] : null;
    const baseColor = this._getBlockColor(blockStrId);

    const faceBrightness = StructureEditor.FACE_BRIGHTNESS;

    // 各面のテクスチャ名を決定
    // BoxGeometry面順: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
    const texDefault = blockInfo ? blockInfo.tex_default : '';
    const faceTexNames = [
      (blockInfo && blockInfo.tex_right) || texDefault,   // +X
      (blockInfo && blockInfo.tex_left) || texDefault,    // -X
      (blockInfo && blockInfo.tex_top) || texDefault,     // +Y
      (blockInfo && blockInfo.tex_bottom) || texDefault,  // -Y
      (blockInfo && blockInfo.tex_front) || texDefault,   // +Z
      (blockInfo && blockInfo.tex_back) || texDefault     // -Z
    ];

    const materials = [];
    for (let i = 0; i < 6; i++) {
      const texture = this._getTexture(faceTexNames[i]);
      if (texture) {
        const mat = new this.THREE.MeshBasicMaterial({
          map: texture,
          vertexColors: true
        });
        materials.push({ material: mat, brightness: faceBrightness[i] });
      } else {
        const color = this._applyFaceBrightness(baseColor, faceBrightness[i]);
        materials.push({ material: new this.THREE.MeshBasicMaterial({ color }), brightness: null });
      }
    }

    return materials;
  }

  /**
   * BoxGeometryに面ごとの頂点カラー（明るさ）を設定
   * @private
   */
  _setBoxVertexColors(geometry, materialInfos) {
    const colors = new Float32Array(24 * 3);
    for (let face = 0; face < 6; face++) {
      const b = materialInfos[face].brightness != null ? materialInfos[face].brightness : 1.0;
      for (let v = 0; v < 4; v++) {
        const idx = (face * 4 + v) * 3;
        colors[idx] = b;
        colors[idx + 1] = b;
        colors[idx + 2] = b;
      }
    }
    geometry.setAttribute('color', new this.THREE.BufferAttribute(colors, 3));
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

    // 空の構造物を作成
    this.structureData = new StructureData(StructureEditor.CANVAS_SIZE);
    this._startRenderLoop();
  }

  /**
   * 構造物データをロードして表示
   * @param {Object} data - 構造物データ（from GAS API）
   */
  loadStructure(data) {
    if (data.voxel_data && data.palette) {
      const parsed = typeof data.palette === 'string' ? JSON.parse(data.palette) : data.palette;

      // パレットとオフセットを取得
      let palette, startX, startY, startZ;
      if (Array.isArray(parsed)) {
        // 旧形式: パレットが配列そのまま → (0,0,0)から配置
        palette = parsed;
        startX = 0;
        startY = 0;
        startZ = 0;
      } else {
        // 新形式: { blocks: [...], offset: [ox, oy, oz] }
        palette = parsed.blocks;
        if (parsed.offset) {
          startX = StructureEditor.ORIGIN_X + parsed.offset[0];
          startY = StructureEditor.ORIGIN_Y + parsed.offset[1];
          startZ = StructureEditor.ORIGIN_Z + parsed.offset[2];
        } else {
          startX = 0;
          startY = 0;
          startZ = 0;
        }
      }

      this.structureData = StructureData.decode(
        data.voxel_data,
        data.orientation_data || '',
        palette,
        data.size_x || 0,
        data.size_y || 0,
        data.size_z || 0,
        StructureEditor.CANVAS_SIZE,
        startX, startY, startZ
      );
    } else {
      this.structureData = new StructureData(StructureEditor.CANVAS_SIZE);
    }
    this._rebuildVoxelMesh();
  }

  /**
   * 空の構造物を作成
   */
  newStructure() {
    this.structureData = new StructureData(StructureEditor.CANVAS_SIZE);
    this._rebuildVoxelMesh();
  }

  /**
   * 配置ブロックを設定
   * @param {string} blockStrId - ブロック文字列ID
   */
  setCurrentBlock(blockStrId) {
    this.currentBlock = blockStrId;
  }

  /**
   * 現在選択中のブロックIDを取得
   * @returns {string|null}
   */
  getCurrentBlock() {
    return this.currentBlock;
  }

  /**
   * ブラシサイズを設定
   * @param {number} size - 1, 2, 4
   */
  setBrushSize(size) {
    if ([1, 2, 4].includes(size)) {
      this.brushSize = size;
      this._updateHighlightGeometry();
    }
  }

  /**
   * StructureDataを取得
   * @returns {StructureData}
   */
  getStructureData() {
    return this.structureData;
  }

  /**
   * 保存用データを取得（サイズ自動算出）
   * @returns {Object}
   */
  getExportData() {
    const encoded = this.structureData.encode();

    // パレットにオフセット情報を埋め込む
    const paletteObj = {
      blocks: encoded.palette
    };
    if (encoded.bb_min_x !== undefined) {
      paletteObj.offset = [
        encoded.bb_min_x - StructureEditor.ORIGIN_X,
        encoded.bb_min_y - StructureEditor.ORIGIN_Y,
        encoded.bb_min_z - StructureEditor.ORIGIN_Z
      ];
    }

    return {
      palette: JSON.stringify(paletteObj),
      voxel_data: encoded.voxel_data,
      orientation_data: encoded.orientation_data,
      size_x: encoded.size_x,
      size_y: encoded.size_y,
      size_z: encoded.size_z
    };
  }

  /**
   * 背景色を切り替え
   * @returns {string}
   */
  toggleBackgroundColor() {
    this.bgColorIndex = (this.bgColorIndex + 1) % this.bgColors.length;
    const color = this.bgColors[this.bgColorIndex];
    this.renderer.setClearColor(new this.THREE.Color(color));
    return color;
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
   * マテリアルを破棄
   * @private
   */
  _disposeMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach(m => m.dispose());
    } else if (material) {
      material.dispose();
    }
  }

  /**
   * リソース解放
   */
  dispose() {
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

    // メッシュ解放
    if (this.voxelGroup) {
      this.voxelGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) this._disposeMaterial(obj.material);
      });
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
   * カメラドラッグのデルタを適用
   * @private
   */
  _applyDragDelta(deltaX, deltaY) {
    const s = StructureEditor.CAMERA_DEFAULTS.sensitivity;
    this.horizontalAngle -= deltaX * s;
    this.verticalAngle += deltaY * s;
    this.verticalAngle = Math.max(-90, Math.min(90, this.verticalAngle));
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
  }

  /**
   * レンダラーをセットアップ
   * @private
   */
  _setupRenderer() {
    this.renderer = new this.THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(new this.THREE.Color(this.bgColors[this.bgColorIndex]));
    this.renderer.domElement.style.touchAction = 'none';
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
   * グリッドをセットアップ（床面）
   * @private
   */
  _setupGrid() {
    const gridSize = StructureEditor.CANVAS_SIZE;
    const gc = StructureEditor.GRID_COLORS;
    this.gridHelper = new this.THREE.GridHelper(gridSize, gridSize, gc.primary, gc.secondary);
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);

    // 原点マーカー（グリッド中央の床面に赤い十字マーカーを表示）
    this._setupOriginMarker();
  }

  /**
   * 原点マーカーをセットアップ
   * @private
   */
  _setupOriginMarker() {
    const half = StructureEditor.CANVAS_SIZE / 2;
    const ox = StructureEditor.ORIGIN_X - half + 0.5;  // ワールドX
    const oz = StructureEditor.ORIGIN_Z - half + 0.5;  // ワールドZ
    const floorY = -0.5 + 0.002;

    // 原点セルの色付き床面
    const om = StructureEditor.ORIGIN_MARKER;
    const cellGeo = new this.THREE.PlaneGeometry(1, 1);
    const cellMat = new this.THREE.MeshBasicMaterial({
      color: om.color,
      transparent: true,
      opacity: om.opacity,
      side: this.THREE.DoubleSide
    });
    const cellMesh = new this.THREE.Mesh(cellGeo, cellMat);
    cellMesh.rotation.x = -Math.PI / 2;
    cellMesh.position.set(ox, floorY, oz);
    this.scene.add(cellMesh);

  }

  /**
   * 方向ラベルをセットアップ
   * @private
   */
  _setupLabels() {
    const dist = StructureEditor.CANVAS_SIZE / 2 + 2;
    const labelPositions = [
      { text: 'FRONT', pos: [0, -0.5, dist] },
      { text: 'BACK', pos: [0, -0.5, -dist] },
      { text: 'LEFT', pos: [-dist, -0.5, 0] },
      { text: 'RIGHT', pos: [dist, -0.5, 0] }
    ];

    labelPositions.forEach(label => {
      const sprite = this._createTextSprite(label.text);
      sprite.position.set(...label.pos);
      sprite.scale.set(4, 1, 1);
      this.scene.add(sprite);
      this.labels.push(sprite);
    });
  }

  /**
   * テキストスプライトを作成
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
    const size = StructureEditor.VOXEL_SIZE * this.brushSize;

    // 面ハイライト（緑）
    const faceGeometry = new this.THREE.PlaneGeometry(size, size);
    const faceMaterial = new this.THREE.MeshBasicMaterial({
      color: StructureEditor.HIGHLIGHT_COLOR,
      transparent: true,
      opacity: StructureEditor.HIGHLIGHT_OPACITY,
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
      color: StructureEditor.HIGHLIGHT_COLOR,
      transparent: true,
      opacity: StructureEditor.HIGHLIGHT_OPACITY,
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
    if (!this.highlightFace || !this.highlightEdges || !this.gridHighlight) return;

    const size = StructureEditor.VOXEL_SIZE * this.brushSize;

    this.highlightFace.geometry.dispose();
    this.highlightFace.geometry = new this.THREE.PlaneGeometry(size, size);

    this.highlightEdges.geometry.dispose();
    this.highlightEdges.geometry = new this.THREE.EdgesGeometry(
      new this.THREE.BoxGeometry(size, size, size)
    );

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
    this._floorPlane = new this.THREE.Plane(new this.THREE.Vector3(0, 1, 0), 0.5);
    this._intersectionPoint = new this.THREE.Vector3();
  }

  /**
   * マウスイベントからレイキャスターを更新
   * @private
   */
  _updateRaycasterFromEvent(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
  }

  /**
   * ボクセルグループ内のオブジェクトとレイキャスト（再帰的）
   * @private
   * @returns {Array} intersects配列（各hitのobjectにvoxelX/Y/Zを持つ親を設定済み）
   */
  _intersectVoxels() {
    if (!this.voxelGroup || this.voxelGroup.children.length === 0) return [];
    const intersects = this.raycaster.intersectObjects(this.voxelGroup.children, true);
    // ヒットオブジェクトからvoxel座標を持つ親を辿る
    for (const hit of intersects) {
      let obj = hit.object;
      while (obj && obj.userData.voxelX === undefined) {
        obj = obj.parent;
      }
      if (obj) {
        hit._voxelParent = obj;
      }
    }
    return intersects.filter(h => h._voxelParent);
  }

  /**
   * ワールド座標からボクセル座標を計算
   * @private
   */
  _positionToVoxelCoord(position) {
    const half = StructureEditor.CANVAS_SIZE / 2;
    return {
      x: Math.round(position.x + half - 0.5),
      y: Math.round(position.y),
      z: Math.round(position.z + half - 0.5)
    };
  }

  /**
   * 座標をブラシサイズにスナップ
   * @private
   */
  _snapCoord(v) {
    return Math.floor(v / this.brushSize) * this.brushSize;
  }

  /**
   * ボクセル座標からワールド座標に変換
   * @private
   */
  _voxelCoordToPosition(vx, vy, vz) {
    const half = StructureEditor.CANVAS_SIZE / 2;
    return {
      x: vx - half + 0.5,
      y: vy,
      z: vz - half + 0.5
    };
  }

  /**
   * カメラ方向からブロックの向き(orientation)を決定
   * @private
   * @param {Object} normal - クリック面の法線 {x, y, z}
   * @returns {number} orientation (0-23)
   */
  _calculateOrientation(normal) {
    // face決定: クリック面の法線方向 → ブロックの底面がその壁に向くよう回転
    let face = 0;
    const nx = Math.round(normal.x);
    const ny = Math.round(normal.y);
    const nz = Math.round(normal.z);

    if (ny > 0) face = 0;       // +Y（上面）
    else if (ny < 0) face = 1;  // -Y（底面）
    else if (nz > 0) face = 2;  // +Z
    else if (nz < 0) face = 3;  // -Z
    else if (nx > 0) face = 4;  // +X
    else if (nx < 0) face = 5;  // -X

    // rotation決定: カメラの視線方向（プレイヤーが見ている方向）から
    const hRad = this.horizontalAngle * Math.PI / 180;
    // カメラから原点への方向（プレイヤーの視線方向）
    const camDirX = Math.sin(hRad);
    const camDirZ = Math.cos(hRad);

    // 視線方向から4方向のrotationを決定（ブロック正面がプレイヤーに向く）
    const angle = Math.atan2(camDirX, camDirZ) * 180 / Math.PI;
    let rotation;
    if (angle >= -45 && angle < 45) rotation = 0;
    else if (angle >= 45 && angle < 135) rotation = 1;
    else if (angle >= -135 && angle < -45) rotation = 3;
    else rotation = 2;

    return face * 4 + rotation;
  }

  /**
   * orientationをThree.jsオブジェクトの回転に適用
   * orientation = face * 4 + rotation
   * face: ブロックの+Y面が向く方向, rotation: その軸周りの回転
   * @private
   * @param {THREE.Object3D} obj - 回転を適用するオブジェクト
   * @param {number} orientation - 向き値 (0-23)
   */
  _applyOrientation(obj, orientation) {
    if (!orientation || orientation === 0) return;

    const face = Math.floor(orientation / 4);
    const rotation = orientation % 4;
    const PI = Math.PI;
    const HALF_PI = PI / 2;

    // face回転: ブロックの+Y面を指定方向に向ける
    const faceQ = new this.THREE.Quaternion();
    switch (face) {
      case 0: // +Y（デフォルト、回転なし）
        break;
      case 1: // -Y（上下反転）
        faceQ.setFromAxisAngle(new this.THREE.Vector3(1, 0, 0), PI);
        break;
      case 2: // +Z（底面が-Z壁側を向く）
        faceQ.setFromAxisAngle(new this.THREE.Vector3(1, 0, 0), HALF_PI);
        break;
      case 3: // -Z（底面が+Z壁側を向く）
        faceQ.setFromAxisAngle(new this.THREE.Vector3(1, 0, 0), -HALF_PI);
        break;
      case 4: // +X（右向き）
        faceQ.setFromAxisAngle(new this.THREE.Vector3(0, 0, 1), -HALF_PI);
        break;
      case 5: // -X（左向き）
        faceQ.setFromAxisAngle(new this.THREE.Vector3(0, 0, 1), HALF_PI);
        break;
    }

    // Y軸周りの回転（face回転前のローカル空間）
    const rotQ = new this.THREE.Quaternion();
    if (rotation !== 0) {
      rotQ.setFromAxisAngle(new this.THREE.Vector3(0, 1, 0), rotation * HALF_PI);
    }

    // 合成: まずY軸回転、次にface回転
    obj.quaternion.copy(faceQ).multiply(rotQ);
  }

  /**
   * ブロックの色を取得（面ごとの明るさ付き）
   * @private
   */
  _getBlockColor(blockStrId) {
    const hexStr = this._blockColorMap[blockStrId];
    if (!hexStr) return 0x808080;

    // "#RRGGBB" → 数値
    if (typeof hexStr === 'string' && hexStr.startsWith('#')) {
      return parseInt(hexStr.slice(1), 16);
    }
    return typeof hexStr === 'number' ? hexStr : 0x808080;
  }

  /**
   * カスタムブロック(8x8x8ボクセル)のメッシュを構築
   * @private
   * @param {Object} blockInfo - ブロック情報（voxel_look, material_1等を含む）
   * @param {number} baseColor - ベース色（数値）
   * @returns {THREE.Group|null} カスタムブロックメッシュ
   */
  _buildCustomBlockMesh(blockInfo, baseColor) {
    try {
      const voxelData = VoxelData.decode(blockInfo.voxel_look);
      if (!voxelData) return null;

      const builder = new CustomBlockMeshBuilder(this.THREE);

      // material_1, material_2, material_3 のテクスチャ or 色でマテリアル配列を作成
      const materialNames = [blockInfo.material_1, blockInfo.material_2, blockInfo.material_3];
      const materials = materialNames.map(matName => {
        if (matName) {
          const base64 = this._findTexByName(this._texBase64Map,matName);
          if (base64) {
            return builder.createMaterialFromTexture(base64);
          }
        }
        return builder.createColorMaterial(baseColor);
      });

      // ボクセルサイズ: 8x8x8が1x1x1ブロック内に収まるように 1/8
      const group = builder.buildWithUV(voxelData, materials, 0.125);

      return group;
    } catch (e) {
      console.warn('カスタムブロックメッシュ構築エラー:', e);
      return null;
    }
  }

  /**
   * 面ごとの明るさを適用した色を計算
   * @private
   */
  _applyFaceBrightness(baseColor, brightness) {
    const r = Math.round(((baseColor >> 16) & 0xff) * brightness);
    const g = Math.round(((baseColor >> 8) & 0xff) * brightness);
    const b = Math.round((baseColor & 0xff) * brightness);
    return (r << 16) | (g << 8) | b;
  }

  /**
   * 通常ブロックのメッシュを生成
   * @private
   */
  _createNormalBlockMesh(blockStrId) {
    const geometry = new this.THREE.BoxGeometry(1, 1, 1);
    const materialInfos = this._createBlockMaterials(blockStrId);
    const hasTexture = materialInfos.some(m => m.brightness != null);
    if (hasTexture) {
      this._setBoxVertexColors(geometry, materialInfos);
    }
    return new this.THREE.Mesh(geometry, materialInfos.map(m => m.material));
  }

  /**
   * ボクセルメッシュを再構築
   * @private
   */
  _rebuildVoxelMesh() {
    // 既存メッシュを削除
    if (this.voxelGroup) {
      this.scene.remove(this.voxelGroup);
      this.voxelGroup.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) this._disposeMaterial(obj.material);
      });
    }

    this.voxelGroup = new this.THREE.Group();
    const half = StructureEditor.CANVAS_SIZE / 2;

    this.structureData.forEachBlock((x, y, z, blockStrId, orientation) => {
      const blockInfo = this._blockInfoMap ? this._blockInfoMap[blockStrId] : null;
      let mesh;

      // カスタムブロックの形状表示
      if (blockInfo && blockInfo.shape_type === 'custom' && blockInfo.voxel_look &&
          typeof VoxelData !== 'undefined' && typeof CustomBlockMeshBuilder !== 'undefined') {
        const baseColor = this._getBlockColor(blockStrId);
        mesh = this._buildCustomBlockMesh(blockInfo, baseColor);
        if (mesh) {
          this._applyOrientation(mesh, orientation);
        }
      }

      // 通常ブロック
      if (!mesh) {
        mesh = this._createNormalBlockMesh(blockStrId);
      }

      mesh.position.set(x - half + 0.5, y, z - half + 0.5);
      mesh.userData = { voxelX: x, voxelY: y, voxelZ: z };
      this.voxelGroup.add(mesh);
    });

    this.scene.add(this.voxelGroup);
  }

  /**
   * レンダーループを開始
   * @private
   */
  _startRenderLoop() {
    const render = () => {
      this.animationId = requestAnimationFrame(render);
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    render();
  }

  // ========================================
  // イベント処理
  // ========================================

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

    // タッチイベントハンドラ
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);

    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mouseup', this._onMouseUp);
    this.renderer.domElement.addEventListener('mouseleave', this._onMouseUp);
    this.renderer.domElement.addEventListener('wheel', this._onWheel);
    this.renderer.domElement.addEventListener('contextmenu', this._onContextMenu);

    // タッチイベント
    this.renderer.domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.renderer.domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.renderer.domElement.addEventListener('touchend', this._onTouchEnd);
    this.renderer.domElement.addEventListener('touchcancel', this._onTouchEnd);
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

      this.renderer.domElement.removeEventListener('touchstart', this._onTouchStart);
      this.renderer.domElement.removeEventListener('touchmove', this._onTouchMove);
      this.renderer.domElement.removeEventListener('touchend', this._onTouchEnd);
      this.renderer.domElement.removeEventListener('touchcancel', this._onTouchEnd);
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
      // 右クリックでブロック配置＋連続設置開始
      this._startContinuousPlacement(event);
    }
  }

  /**
   * マウス移動ハンドラ
   * @private
   */
  _handleMouseMove(event) {
    if (this.isDragging) {
      this._applyDragDelta(event.clientX - this.lastMouseX, event.clientY - this.lastMouseY);
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    } else {
      this._updateHighlight(event);
    }
  }

  /**
   * マウスアップハンドラ
   * @private
   */
  _handleMouseUp(event) {
    if (this.isDragging && event.button === 0) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < this.dragThreshold) {
        this._removeVoxel(event);
      }
    }
    this.isDragging = false;

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

    const cam = StructureEditor.CAMERA_DEFAULTS;
    this.cameraDistance += event.deltaY * cam.zoomSpeed;
    this.cameraDistance = Math.max(cam.zoomMin, Math.min(cam.zoomMax, this.cameraDistance));

    this._updateCameraPosition();
  }

  /**
   * コンテキストメニュー無効化
   * @private
   */
  _handleContextMenu(event) {
    event.preventDefault();
  }

  /**
   * タッチ開始ハンドラ
   * @private
   */
  _handleTouchStart(event) {
    event.preventDefault();
    if (event.touches.length === 1) {
      this.isDragging = true;
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      this._pinchStartDist = this._getTouchDistance(event.touches);
    }
  }

  /**
   * タッチ移動ハンドラ
   * @private
   */
  _handleTouchMove(event) {
    event.preventDefault();
    if (event.touches.length === 1 && this.isDragging) {
      this._applyDragDelta(event.touches[0].clientX - this.lastMouseX, event.touches[0].clientY - this.lastMouseY);
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      const dist = this._getTouchDistance(event.touches);
      const delta = this._pinchStartDist - dist;
      const cam = StructureEditor.CAMERA_DEFAULTS;
      this.cameraDistance += delta * 0.05;
      this.cameraDistance = Math.max(cam.zoomMin, Math.min(cam.zoomMax, this.cameraDistance));
      this._updateCameraPosition();
      this._pinchStartDist = dist;
    }
  }

  /**
   * タッチ終了ハンドラ
   * @private
   */
  _handleTouchEnd(event) {
    this.isDragging = false;
  }

  /**
   * タッチ間の距離を計算
   * @private
   */
  _getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ========================================
  // ハイライト・配置・削除
  // ========================================

  /**
   * ハイライトを更新
   * @private
   */
  _updateHighlight(event) {
    this._updateRaycasterFromEvent(event);

    const intersects = this._intersectVoxels();
    if (intersects.length > 0) {
      this._updateVoxelHighlight(intersects[0]);
      return;
    }

    this._updateFloorHighlight();
  }

  /**
   * ボクセルヒット時のハイライト更新
   * @private
   */
  _updateVoxelHighlight(hit) {
    const voxelSize = StructureEditor.VOXEL_SIZE;
    const brushSize = this.brushSize;
    const brushVoxelSize = voxelSize * brushSize;
    const half = StructureEditor.CANVAS_SIZE / 2;
    const voxelParent = hit._voxelParent;

    const snappedX = this._snapCoord(voxelParent.userData.voxelX);
    const snappedY = this._snapCoord(voxelParent.userData.voxelY);
    const snappedZ = this._snapCoord(voxelParent.userData.voxelZ);

    const centerOffset = (brushSize - 1) * voxelSize / 2;
    const snappedPos = new this.THREE.Vector3(
      snappedX - half + 0.5 + centerOffset,
      snappedY + centerOffset,
      snappedZ - half + 0.5 + centerOffset
    );

    // 辺ハイライト
    this.highlightEdges.position.copy(snappedPos);
    this.highlightEdges.visible = true;

    // 面ハイライト - 設置可能面
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);

    const targetX = snappedX + Math.round(normal.x) * brushSize;
    const targetY = snappedY + Math.round(normal.y) * brushSize;
    const targetZ = snappedZ + Math.round(normal.z) * brushSize;

    const cs = StructureEditor.CANVAS_SIZE;
    const validTarget = targetX >= 0 && targetX + brushSize <= cs &&
                       targetY >= 0 && targetY + brushSize <= cs &&
                       targetZ >= 0 && targetZ + brushSize <= cs;

    if (validTarget) {
      this.highlightFace.position.copy(snappedPos);
      this.highlightFace.position.add(normal.clone().multiplyScalar(brushVoxelSize / 2 + 0.001));
      this.highlightFace.lookAt(this.highlightFace.position.clone().add(normal));
      this.highlightFace.visible = true;
    } else {
      this.highlightFace.visible = false;
    }

    this.gridHighlight.visible = false;
  }

  /**
   * 床面ハイライト更新
   * @private
   */
  _updateFloorHighlight() {
    const voxelSize = StructureEditor.VOXEL_SIZE;
    const brushSize = this.brushSize;
    const brushVoxelSize = voxelSize * brushSize;
    const half = StructureEditor.CANVAS_SIZE / 2;

    this.raycaster.ray.intersectPlane(this._floorPlane, this._intersectionPoint);

    if (this._intersectionPoint) {
      const gridX = Math.floor((this._intersectionPoint.x + half) / brushVoxelSize) * brushSize;
      const gridZ = Math.floor((this._intersectionPoint.z + half) / brushVoxelSize) * brushSize;
      const centerOffset = (brushSize - 1) * voxelSize / 2;

      if (gridX >= 0 && gridX + brushSize <= StructureEditor.CANVAS_SIZE &&
          gridZ >= 0 && gridZ + brushSize <= StructureEditor.CANVAS_SIZE) {
        this.gridHighlight.position.set(
          gridX - half + 0.5 + centerOffset,
          -0.5 + 0.001,
          gridZ - half + 0.5 + centerOffset
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
   * 配置ターゲットを計算
   * @private
   * @returns {{ coord: {x,y,z}, normal: {x,y,z} } | null}
   */
  _calculatePlacementTarget() {
    const brushSize = this.brushSize;
    const half = StructureEditor.CANVAS_SIZE / 2;

    // ボクセルメッシュとの交差（カスタムブロックGroup内も再帰的に検査）
    const intersects = this._intersectVoxels();

    if (intersects.length > 0) {
      const hit = intersects[0];
      const voxelParent = hit._voxelParent;
      const hitFace = hit.face;

      const vx = voxelParent.userData.voxelX;
      const vy = voxelParent.userData.voxelY;
      const vz = voxelParent.userData.voxelZ;

      const snappedX = this._snapCoord(vx);
      const snappedY = this._snapCoord(vy);
      const snappedZ = this._snapCoord(vz);

      const normal = hitFace.normal.clone();
      normal.transformDirection(hit.object.matrixWorld);

      const targetX = snappedX + Math.round(normal.x) * brushSize;
      const targetY = snappedY + Math.round(normal.y) * brushSize;
      const targetZ = snappedZ + Math.round(normal.z) * brushSize;

      const cs = StructureEditor.CANVAS_SIZE;
      if (targetX >= 0 && targetX + brushSize <= cs &&
          targetY >= 0 && targetY + brushSize <= cs &&
          targetZ >= 0 && targetZ + brushSize <= cs) {
        return {
          coord: { x: targetX, y: targetY, z: targetZ },
          normal: { x: Math.round(normal.x), y: Math.round(normal.y), z: Math.round(normal.z) }
        };
      }
      return null;
    }

    // 床面との交差
    this.raycaster.ray.intersectPlane(this._floorPlane, this._intersectionPoint);
    if (this._intersectionPoint) {
      const brushVoxelSize = StructureEditor.VOXEL_SIZE * brushSize;
      const gridX = Math.floor((this._intersectionPoint.x + half) / brushVoxelSize) * brushSize;
      const gridZ = Math.floor((this._intersectionPoint.z + half) / brushVoxelSize) * brushSize;

      if (gridX >= 0 && gridX + brushSize <= StructureEditor.CANVAS_SIZE &&
          gridZ >= 0 && gridZ + brushSize <= StructureEditor.CANVAS_SIZE) {
        return {
          coord: { x: gridX, y: 0, z: gridZ },
          normal: { x: 0, y: 1, z: 0 }
        };
      }
    }

    return null;
  }

  /**
   * ボクセルを配置
   * @private
   */
  _placeVoxel(event) {
    if (!this.currentBlock) return;

    this._updateRaycasterFromEvent(event);
    const placement = this._calculatePlacementTarget();
    if (placement) {
      const orientation = this._calculateOrientation(placement.normal);
      this._placeVoxelAt(placement.coord.x, placement.coord.y, placement.coord.z, orientation);
    }
  }

  /**
   * 指定座標にボクセルを配置
   * @private
   */
  _placeVoxelAt(x, y, z, orientation = 0) {
    if (!this.currentBlock) return;

    const brushSize = this.brushSize;
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dz = 0; dz < brushSize; dz++) {
        for (let dx = 0; dx < brushSize; dx++) {
          this.structureData.setBlock(x + dx, y + dy, z + dz, this.currentBlock, orientation);
        }
      }
    }

    this._rebuildVoxelMesh();

    if (this.onBlockChange) {
      this.onBlockChange();
    }
  }

  /**
   * ボクセルを削除
   * @private
   */
  _removeVoxel(event) {
    this._updateRaycasterFromEvent(event);

    const intersects = this._intersectVoxels();
    if (intersects.length > 0) {
      const voxelParent = intersects[0]._voxelParent;
      const vx = voxelParent.userData.voxelX;
      const vy = voxelParent.userData.voxelY;
      const vz = voxelParent.userData.voxelZ;

      const brushSize = this.brushSize;
      const snappedX = this._snapCoord(vx);
      const snappedY = this._snapCoord(vy);
      const snappedZ = this._snapCoord(vz);

      for (let dy = 0; dy < brushSize; dy++) {
        for (let dz = 0; dz < brushSize; dz++) {
          for (let dx = 0; dx < brushSize; dx++) {
            this.structureData.setBlock(snappedX + dx, snappedY + dy, snappedZ + dz, 'air', 0);
          }
        }
      }

      this._rebuildVoxelMesh();

      if (this.onBlockChange) {
        this.onBlockChange();
      }
    }
  }

  /**
   * 連続設置を開始
   * @private
   */
  _startContinuousPlacement(event) {
    this._placeVoxel(event);

    this.continuousPlacement.active = true;
    this.continuousPlacement.intervalId = setInterval(() => {
      if (this.continuousPlacement.active) {
        this._placeVoxel(event);
      }
    }, StructureEditor.CONTINUOUS_INTERVAL);
  }

  /**
   * 連続設置を停止
   * @private
   */
  _stopContinuousPlacement() {
    this.continuousPlacement.active = false;
    if (this.continuousPlacement.intervalId) {
      clearInterval(this.continuousPlacement.intervalId);
      this.continuousPlacement.intervalId = null;
    }
  }
}
