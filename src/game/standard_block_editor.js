/**
 * StandardBlockEditor
 * Three.jsシーン・メッシュ・カメラ操作を担当するコアクラス
 */
class StandardBlockEditor {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Three.jsをマウントするDOM要素
   * @param {Object} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.blockMesh = null;
    this.meshBuilder = null;

    // テクスチャ設定
    this.textures = {};
    this.textureImages = {};

    // カメラ制御
    this.cameraDistance = 3;
    this.horizontalAngle = 0;
    this.verticalAngle = 20;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // タッチ制御
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.initialPinchDistance = 0;
    this.isPinching = false;

    // 背景色
    this.backgroundColors = ['#000000', '#1a237e', '#1b5e20'];
    this.currentBgIndex = 0;

    // バインド
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._animate = this._animate.bind(this);
  }

  /**
   * シーン・カメラ・レンダラーを初期化
   */
  init() {
    const THREE = this.THREE;

    // シーン作成
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.backgroundColors[0]);

    // カメラ作成
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this._updateCameraPosition();

    // レンダラー作成
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // メッシュビルダー初期化
    this.meshBuilder = new StandardBlockMeshBuilder(THREE);

    // 床面の枠線を作成
    this._createFloorGuide();

    // 方向ラベルを作成
    this._createDirectionLabels();

    // イベントリスナー
    this.container.addEventListener('mousedown', this._onMouseDown);
    this.container.addEventListener('wheel', this._onWheel);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);

    // タッチイベントリスナー
    this.container.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this._onTouchEnd);

    // アニメーションループ開始
    this._animate();
  }

  /**
   * ブロックデータをロードして表示
   * @param {Object} blockData - ブロックデータ
   */
  loadBlock(blockData) {
    // 既存のメッシュを削除
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      this.meshBuilder.disposeMesh(this.blockMesh);
      this.blockMesh = null;
    }

    // テクスチャ設定を抽出
    this.textures = {};
    if (blockData.tex_default) this.textures.default = blockData.tex_default;
    if (blockData.tex_front) this.textures.front = blockData.tex_front;
    if (blockData.tex_top) this.textures.top = blockData.tex_top;
    if (blockData.tex_bottom) this.textures.bottom = blockData.tex_bottom;
    if (blockData.tex_left) this.textures.left = blockData.tex_left;
    if (blockData.tex_right) this.textures.right = blockData.tex_right;
    if (blockData.tex_back) this.textures.back = blockData.tex_back;

    // メッシュを作成
    this.blockMesh = this.meshBuilder.createBlockMesh(this.textures, this.textureImages);
    this.blockMesh.position.set(0, 0.5, 0);
    this.scene.add(this.blockMesh);
  }

  /**
   * テクスチャ画像データを設定
   * @param {Object} textureImages - { textureName: imageBase64 }
   */
  setTextureImages(textureImages) {
    this.textureImages = textureImages;
    // 既存のメッシュがある場合は更新
    if (this.blockMesh) {
      this.meshBuilder.updateAllTextures(this.blockMesh, this.textures, this.textureImages);
    }
  }

  /**
   * 指定スロットにテクスチャを設定
   * @param {string} slot - スロット名 (default, front, top, bottom, left, right, back)
   * @param {string|null} textureName - テクスチャ名（nullの場合は解除）
   */
  setTexture(slot, textureName) {
    if (textureName) {
      this.textures[slot] = textureName;
    } else {
      delete this.textures[slot];
    }

    // メッシュのテクスチャを更新
    if (this.blockMesh) {
      if (slot === 'default') {
        // defaultが変更された場合は全面を更新
        this.meshBuilder.updateAllTextures(this.blockMesh, this.textures, this.textureImages);
      } else {
        // 個別の面を更新
        this.meshBuilder.updateFaceTexture(this.blockMesh, slot, textureName, this.textures, this.textureImages);
      }
    }
  }

  /**
   * 現在のテクスチャ設定を取得
   * @returns {Object} テクスチャ設定
   */
  getTextures() {
    return { ...this.textures };
  }

  /**
   * 背景色を設定
   * @param {string} color - 色コード（#000000形式）
   */
  setBackgroundColor(color) {
    const THREE = this.THREE;
    this.scene.background = new THREE.Color(color);
    // インデックスを更新
    const index = this.backgroundColors.indexOf(color);
    if (index !== -1) {
      this.currentBgIndex = index;
    }
  }

  /**
   * 背景色を切り替え
   * @returns {string} 新しい背景色
   */
  toggleBackgroundColor() {
    this.currentBgIndex = (this.currentBgIndex + 1) % this.backgroundColors.length;
    const color = this.backgroundColors[this.currentBgIndex];
    this.setBackgroundColor(color);
    return color;
  }

  /**
   * 現在の背景色を取得
   * @returns {string} 背景色コード
   */
  getCurrentBackgroundColor() {
    return this.backgroundColors[this.currentBgIndex];
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
   * @returns {THREE.Camera}
   */
  getCamera() {
    return this.camera;
  }

  /**
   * リサイズ処理
   */
  resize() {
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
    // イベントリスナーを削除
    this.container.removeEventListener('mousedown', this._onMouseDown);
    this.container.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);

    // タッチイベントリスナーを削除
    this.container.removeEventListener('touchstart', this._onTouchStart);
    this.container.removeEventListener('touchmove', this._onTouchMove);
    this.container.removeEventListener('touchend', this._onTouchEnd);

    // メッシュを破棄
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      this.meshBuilder.disposeMesh(this.blockMesh);
    }

    // シーン内のすべてのオブジェクトを破棄
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }

    // レンダラーを破棄
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  /**
   * 床面の枠線を作成
   * @private
   */
  _createFloorGuide() {
    const THREE = this.THREE;
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.5, 0,  0.5,
      -0.5, 0,  0.5,
      -0.5, 0, -0.5
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
  }

  /**
   * 方向ラベルを作成
   * @private
   */
  _createDirectionLabels() {
    const THREE = this.THREE;
    const labels = [
      { text: 'FRONT', position: [0, 0, 1] },
      { text: 'BACK', position: [0, 0, -1] },
      { text: 'LEFT', position: [-1, 0, 0] },
      { text: 'RIGHT', position: [1, 0, 0] }
    ];

    labels.forEach(label => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.text, 64, 16);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(label.position[0], 0, label.position[2]);
      sprite.scale.set(0.5, 0.125, 1);
      this.scene.add(sprite);
    });
  }

  /**
   * カメラ位置を更新
   * @private
   */
  _updateCameraPosition() {
    const THREE = this.THREE;
    const hRad = THREE.MathUtils.degToRad(this.horizontalAngle);
    const vRad = THREE.MathUtils.degToRad(this.verticalAngle);

    const x = this.cameraDistance * Math.cos(vRad) * Math.sin(hRad);
    const y = this.cameraDistance * Math.sin(vRad) + 0.5;
    const z = this.cameraDistance * Math.cos(vRad) * Math.cos(hRad);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0.5, 0);
  }

  /**
   * マウスダウンイベント
   * @private
   */
  _onMouseDown(e) {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  /**
   * マウス移動イベント
   * @private
   */
  _onMouseMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    // 水平回転（右にドラッグするとブロックが右に回転 = カメラが左に移動）
    this.horizontalAngle -= deltaX * 0.5;

    // 垂直回転（上下90度まで）
    this.verticalAngle += deltaY * 0.5;
    this.verticalAngle = Math.max(-90, Math.min(90, this.verticalAngle));

    this._updateCameraPosition();

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  /**
   * マウスアップイベント
   * @private
   */
  _onMouseUp() {
    this.isDragging = false;
  }

  /**
   * ホイールイベント
   * @private
   */
  _onWheel(e) {
    e.preventDefault();
    this.cameraDistance += e.deltaY * 0.01;
    this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance));
    this._updateCameraPosition();
  }

  /**
   * タッチ開始イベント
   * @private
   */
  _onTouchStart(e) {
    e.preventDefault();

    if (e.touches.length === 1) {
      // 1本指: 回転用
      this.isDragging = true;
      this.isPinching = false;
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      // 2本指: ピンチズーム用
      this.isDragging = false;
      this.isPinching = true;
      this.initialPinchDistance = this._getPinchDistance(e.touches);
    }
  }

  /**
   * タッチ移動イベント
   * @private
   */
  _onTouchMove(e) {
    e.preventDefault();

    if (e.touches.length === 1 && this.isDragging) {
      // 1本指スワイプ: 視点回転
      const deltaX = e.touches[0].clientX - this.lastTouchX;
      const deltaY = e.touches[0].clientY - this.lastTouchY;

      this.horizontalAngle -= deltaX * 0.5;
      this.verticalAngle += deltaY * 0.5;
      this.verticalAngle = Math.max(-90, Math.min(90, this.verticalAngle));

      this._updateCameraPosition();

      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2 && this.isPinching) {
      // 2本指ピンチ: ズーム
      const currentDistance = this._getPinchDistance(e.touches);
      const scale = this.initialPinchDistance / currentDistance;

      // ピンチイン（指を近づける）でズームアウト、ピンチアウトでズームイン
      this.cameraDistance = Math.max(1.5, Math.min(10, this.cameraDistance * scale));
      this._updateCameraPosition();

      this.initialPinchDistance = currentDistance;
    }
  }

  /**
   * タッチ終了イベント
   * @private
   */
  _onTouchEnd(e) {
    if (e.touches.length === 0) {
      this.isDragging = false;
      this.isPinching = false;
    } else if (e.touches.length === 1) {
      // 2本指から1本指に戻った場合
      this.isPinching = false;
      this.isDragging = true;
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
    }
  }

  /**
   * 2本指の距離を計算
   * @private
   */
  _getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * アニメーションループ
   * @private
   */
  _animate() {
    if (!this.renderer) return;
    requestAnimationFrame(this._animate);
    this.renderer.render(this.scene, this.camera);
  }
}
