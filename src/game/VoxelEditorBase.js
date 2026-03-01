/**
 * VoxelEditorBase
 * CustomBlockEditor / StructureEditor の共通基底クラス
 * Three.jsシーン管理、カメラ操作、イベント処理の共通部分を提供
 */
class VoxelEditorBase {
  constructor(options) {
    this.container = options.container;
    this.THREE = options.THREE;
  }

  // ========================================
  // Three.js セットアップ（共通）
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

  // ========================================
  // イベントハンドラ（共通）
  // ========================================

  /**
   * マウスダウンハンドラ
   * @private
   */
  _handleMouseDown(event) {
    if (event.button === 0) {
      this.isDragging = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
    } else if (event.button === 2) {
      this._startContinuousPlacement(event);
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
   * タッチ間の距離を計算
   * @private
   */
  _getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ========================================
  // ズーム・背景色（パラメータ化共通）
  // ========================================

  /**
   * ズーム設定（子クラスでオーバーライド）
   * @returns {{ zoomSpeed: number, zoomMin: number, zoomMax: number }}
   */
  get _zoomConfig() {
    return { zoomSpeed: 0.002, zoomMin: 1, zoomMax: 10 };
  }

  /**
   * ホイールハンドラ（ズーム）
   * @private
   */
  _handleWheel(event) {
    event.preventDefault();
    const cfg = this._zoomConfig;
    this.cameraDistance += event.deltaY * cfg.zoomSpeed;
    this.cameraDistance = Math.max(cfg.zoomMin, Math.min(cfg.zoomMax, this.cameraDistance));
    this._updateCameraPosition();
  }

  /**
   * 背景色を切り替え
   * @returns {string} 新しい背景色
   */
  toggleBackgroundColor() {
    this.bgColorIndex = (this.bgColorIndex + 1) % this.bgColors.length;
    const color = this.bgColors[this.bgColorIndex];
    this.renderer.setClearColor(new this.THREE.Color(color));
    return color;
  }

  // ========================================
  // リソース解放（テンプレートメソッド）
  // ========================================

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

    this._disposeSubclass();
  }

  /**
   * 子クラス固有のリソース解放（オーバーライド用）
   * @protected
   */
  _disposeSubclass() {}

  // ========================================
  // リサイズ（共通）
  // ========================================

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
}
