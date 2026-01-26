/**
 * CollisionChecker
 * カスタムブロックの当たり判定を可視化するためのボール物理シミュレーション
 * 30個の球体を落下させ、当たり判定ボクセルとの衝突・反射を行う
 */
class CollisionChecker {
  // 定数
  static BALL_COUNT = 30;
  static BALL_DIAMETER = 0.1;
  static FIXED_TIMESTEP = 1 / 60;
  static GRAVITY = -9.8 * 0.1;
  static RESTITUTION = 0.7;
  static BOUNDARY = 0.5;
  static UPPER_BOUNDARY = 1.5;
  static VOXEL_SIZE = 0.25; // 4x4x4グリッドで1ボクセル = 0.25

  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene - Three.jsシーン
   * @param {Object} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.scene = options.scene;
    this.THREE = options.THREE;

    // ボール設定（定数への参照）
    this.ballCount = CollisionChecker.BALL_COUNT;
    this.ballDiameter = CollisionChecker.BALL_DIAMETER;
    this.ballRadius = this.ballDiameter / 2;

    // 物理演算設定（定数への参照）
    this.fixedTimestep = CollisionChecker.FIXED_TIMESTEP;
    this.gravity = CollisionChecker.GRAVITY;
    this.restitution = CollisionChecker.RESTITUTION;

    // ボール配列
    this.balls = [];
    this.ballMeshes = [];

    // 共有リソース（パフォーマンス向上）
    this._sharedGeometry = null;
    this._sharedMaterial = null;

    // 当たり判定データ（4x4x4）
    this.collisionData = null;

    // アニメーションループ用
    this.isRunning = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.animationId = null;
  }

  /**
   * 当たり判定データを設定
   * @param {number[][][]} data - 4x4x4の当たり判定配列 [y][z][x]
   */
  setCollisionData(data) {
    this.collisionData = data;
  }

  /**
   * シミュレーションを開始
   */
  start() {
    if (this.isRunning) return;

    this._createBalls();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this._animate();
  }

  /**
   * シミュレーションを停止
   */
  stop() {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this._removeBalls();
  }

  /**
   * リソースを解放
   */
  dispose() {
    this.stop();
    this.collisionData = null;
  }

  /**
   * ボール配列を取得
   * @returns {Array} ボールオブジェクトの配列
   */
  getBalls() {
    return this.balls;
  }

  // ========================================
  // プライベートメソッド
  // ========================================

  /**
   * ボールを生成
   * @private
   */
  _createBalls() {
    this._removeBalls();

    // ジオメトリとマテリアルを共有（パフォーマンス向上）
    if (!this._sharedGeometry) {
      this._sharedGeometry = new this.THREE.SphereGeometry(this.ballRadius, 16, 16);
    }
    if (!this._sharedMaterial) {
      this._sharedMaterial = new this.THREE.MeshStandardMaterial({
        color: 0xff6600,
        metalness: 0.3,
        roughness: 0.7
      });
    }

    for (let i = 0; i < this.ballCount; i++) {
      // ランダムな初期位置（ブロック上部）
      const x = (Math.random() - 0.5) * 0.8;
      const y = 0.8 + Math.random() * 0.3;
      const z = (Math.random() - 0.5) * 0.8;

      const mesh = new this.THREE.Mesh(this._sharedGeometry, this._sharedMaterial);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.ballMeshes.push(mesh);

      // 物理状態
      this.balls.push({
        position: new this.THREE.Vector3(x, y, z),
        velocity: new this.THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          0,
          (Math.random() - 0.5) * 0.5
        ),
        mesh: mesh
      });
    }
  }

  /**
   * ボールを削除
   * @private
   */
  _removeBalls() {
    for (const mesh of this.ballMeshes) {
      this.scene.remove(mesh);
    }
    this.balls = [];
    this.ballMeshes = [];
  }

  /**
   * アニメーションループ
   * @private
   */
  _animate() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this._animate());

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // 固定タイムステップで物理演算
    this.accumulator += deltaTime;
    while (this.accumulator >= this.fixedTimestep) {
      this._update(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
    }

    // メッシュ位置を更新
    this.balls.forEach(ball => {
      ball.mesh.position.copy(ball.position);
    });
  }

  /**
   * 物理演算更新
   * @private
   */
  _update(dt) {
    const r = this.ballRadius;
    const boundary = CollisionChecker.BOUNDARY;
    const upperBoundary = CollisionChecker.UPPER_BOUNDARY;

    for (const ball of this.balls) {
      // 重力を適用
      ball.velocity.y += this.gravity * dt;

      // 位置を更新
      const newPos = ball.position.clone().addScaledVector(ball.velocity, dt);

      // 当たり判定チェック
      this._checkCollision(ball, newPos);

      // 境界衝突チェック（共通化）
      this._clampAxis(ball, newPos, 'y', -boundary, upperBoundary, r);
      this._clampAxis(ball, newPos, 'x', -boundary, boundary, r);
      this._clampAxis(ball, newPos, 'z', -boundary, boundary, r);

      ball.position.copy(newPos);
    }
  }

  /**
   * 軸方向の境界チェックと反射
   * @private
   */
  _clampAxis(ball, newPos, axis, min, max, radius) {
    if (newPos[axis] - radius < min) {
      newPos[axis] = min + radius;
      ball.velocity[axis] = -ball.velocity[axis] * this.restitution;
    } else if (newPos[axis] + radius > max) {
      newPos[axis] = max - radius;
      ball.velocity[axis] = -ball.velocity[axis] * this.restitution;
    }
  }

  /**
   * 当たり判定ボクセルとの衝突チェック
   * @private
   */
  _checkCollision(ball, newPos) {
    if (!this.collisionData) return;

    const r = this.ballRadius;
    const voxelSize = CollisionChecker.VOXEL_SIZE;

    // 6方向を直接チェック（オブジェクト生成を回避）
    // +X方向
    if (this._checkVoxelAt(newPos.x + r, newPos.y, newPos.z, voxelSize)) {
      this._reflectAxis(ball, newPos, 'x');
    }
    // -X方向
    if (this._checkVoxelAt(newPos.x - r, newPos.y, newPos.z, voxelSize)) {
      this._reflectAxis(ball, newPos, 'x');
    }
    // +Y方向
    if (this._checkVoxelAt(newPos.x, newPos.y + r, newPos.z, voxelSize)) {
      this._reflectAxis(ball, newPos, 'y');
    }
    // -Y方向
    if (this._checkVoxelAt(newPos.x, newPos.y - r, newPos.z, voxelSize)) {
      this._reflectAxis(ball, newPos, 'y');
    }
    // +Z方向
    if (this._checkVoxelAt(newPos.x, newPos.y, newPos.z + r, voxelSize)) {
      this._reflectAxis(ball, newPos, 'z');
    }
    // -Z方向
    if (this._checkVoxelAt(newPos.x, newPos.y, newPos.z - r, voxelSize)) {
      this._reflectAxis(ball, newPos, 'z');
    }
  }

  /**
   * ワールド座標でボクセル衝突をチェック
   * @private
   */
  _checkVoxelAt(wx, wy, wz, voxelSize) {
    const vx = Math.floor((wx + 0.5) / voxelSize);
    const vy = Math.floor((wy + 0.5) / voxelSize);
    const vz = Math.floor((wz + 0.5) / voxelSize);

    if (vx >= 0 && vx < 4 && vy >= 0 && vy < 4 && vz >= 0 && vz < 4) {
      return CustomCollision.getVoxel(this.collisionData, vx, vy, vz) === 1;
    }
    return false;
  }

  /**
   * 軸方向の反射処理
   * @private
   */
  _reflectAxis(ball, newPos, axis) {
    newPos[axis] = ball.position[axis];
    ball.velocity[axis] = -ball.velocity[axis] * this.restitution;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CollisionChecker = CollisionChecker;
}
