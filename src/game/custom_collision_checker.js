/**
 * CollisionChecker
 * カスタムブロックの当たり判定を可視化するためのボール物理シミュレーション
 * 30個の球体を落下させ、当たり判定ボクセルとの衝突・反射を行う
 */
class CollisionChecker {
  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene - Three.jsシーン
   * @param {Object} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.scene = options.scene;
    this.THREE = options.THREE;

    // ボール設定
    this.ballCount = 30;
    this.ballDiameter = 0.1;
    this.ballRadius = this.ballDiameter / 2;

    // 物理演算設定
    this.fixedTimestep = 1 / 60; // 60fps
    this.gravity = -9.8 * 0.1; // スケール調整された重力
    this.restitution = 0.7; // 反発係数

    // ボール配列
    this.balls = [];
    this.ballMeshes = [];

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

    const geometry = new this.THREE.SphereGeometry(this.ballRadius, 16, 16);
    const material = new this.THREE.MeshStandardMaterial({
      color: 0xff6600,
      metalness: 0.3,
      roughness: 0.7
    });

    for (let i = 0; i < this.ballCount; i++) {
      // ランダムな初期位置（ブロック上部）
      const x = (Math.random() - 0.5) * 0.8;
      const y = 0.8 + Math.random() * 0.3;
      const z = (Math.random() - 0.5) * 0.8;

      const mesh = new this.THREE.Mesh(geometry, material);
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
    this.ballMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
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
    this.balls.forEach(ball => {
      // 重力を適用
      ball.velocity.y += this.gravity * dt;

      // 位置を更新
      const newPos = ball.position.clone().add(
        ball.velocity.clone().multiplyScalar(dt)
      );

      // 当たり判定チェック
      this._checkCollision(ball, newPos);

      // 床面との衝突
      if (newPos.y - this.ballRadius < -0.5) {
        newPos.y = -0.5 + this.ballRadius;
        ball.velocity.y = -ball.velocity.y * this.restitution;
      }

      // 壁面との衝突（ブロック境界）
      const boundary = 0.5;
      if (newPos.x - this.ballRadius < -boundary) {
        newPos.x = -boundary + this.ballRadius;
        ball.velocity.x = -ball.velocity.x * this.restitution;
      }
      if (newPos.x + this.ballRadius > boundary) {
        newPos.x = boundary - this.ballRadius;
        ball.velocity.x = -ball.velocity.x * this.restitution;
      }
      if (newPos.z - this.ballRadius < -boundary) {
        newPos.z = -boundary + this.ballRadius;
        ball.velocity.z = -ball.velocity.z * this.restitution;
      }
      if (newPos.z + this.ballRadius > boundary) {
        newPos.z = boundary - this.ballRadius;
        ball.velocity.z = -ball.velocity.z * this.restitution;
      }

      // 上部境界
      if (newPos.y + this.ballRadius > 1.5) {
        newPos.y = 1.5 - this.ballRadius;
        ball.velocity.y = -ball.velocity.y * this.restitution;
      }

      ball.position.copy(newPos);
    });
  }

  /**
   * 当たり判定ボクセルとの衝突チェック
   * @private
   */
  _checkCollision(ball, newPos) {
    if (!this.collisionData) return;

    // ボール位置をボクセル座標に変換（4x4x4グリッド）
    // ワールド座標 (-0.5, -0.5, -0.5) 〜 (0.5, 0.5, 0.5) を
    // グリッド座標 (0, 0, 0) 〜 (3, 3, 3) に変換
    const voxelSize = 1.0 / 4; // 4x4x4なので1ボクセル = 0.25

    const checkVoxel = (wx, wy, wz) => {
      const vx = Math.floor((wx + 0.5) / voxelSize);
      const vy = Math.floor((wy + 0.5) / voxelSize);
      const vz = Math.floor((wz + 0.5) / voxelSize);

      if (vx >= 0 && vx < 4 && vy >= 0 && vy < 4 && vz >= 0 && vz < 4) {
        return CustomCollision.getVoxel(this.collisionData, vx, vy, vz) === 1;
      }
      return false;
    };

    // 6方向のチェックポイント
    const r = this.ballRadius;
    const directions = [
      { axis: 'x', sign: 1, point: new this.THREE.Vector3(newPos.x + r, newPos.y, newPos.z) },
      { axis: 'x', sign: -1, point: new this.THREE.Vector3(newPos.x - r, newPos.y, newPos.z) },
      { axis: 'y', sign: 1, point: new this.THREE.Vector3(newPos.x, newPos.y + r, newPos.z) },
      { axis: 'y', sign: -1, point: new this.THREE.Vector3(newPos.x, newPos.y - r, newPos.z) },
      { axis: 'z', sign: 1, point: new this.THREE.Vector3(newPos.x, newPos.y, newPos.z + r) },
      { axis: 'z', sign: -1, point: new this.THREE.Vector3(newPos.x, newPos.y, newPos.z - r) }
    ];

    directions.forEach(dir => {
      if (checkVoxel(dir.point.x, dir.point.y, dir.point.z)) {
        // 衝突検出、反射
        if (dir.axis === 'x') {
          newPos.x = ball.position.x;
          ball.velocity.x = -ball.velocity.x * this.restitution;
        } else if (dir.axis === 'y') {
          newPos.y = ball.position.y;
          ball.velocity.y = -ball.velocity.y * this.restitution;
        } else if (dir.axis === 'z') {
          newPos.z = ball.position.z;
          ball.velocity.z = -ball.velocity.z * this.restitution;
        }
      }
    });
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CollisionChecker = CollisionChecker;
}
