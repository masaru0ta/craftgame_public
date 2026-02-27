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
  static GRAVITY = -9.8 * 0.2;
  static RESTITUTION = 0.7;
  static VOXEL_SIZE = 0.25; // 4x4x4グリッドで1ボクセル = 0.25
  static FALL_THRESHOLD = -2; // 奈落判定のY座標閾値
  static BALL_COLLISION = true; // ボール同士の衝突を有効化

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
      const mesh = new this.THREE.Mesh(this._sharedGeometry, this._sharedMaterial);
      this.scene.add(mesh);
      this.ballMeshes.push(mesh);

      // 物理状態
      const ball = {
        position: new this.THREE.Vector3(),
        velocity: new this.THREE.Vector3(),
        mesh: mesh
      };
      this._setRandomSpawnPosition(ball);
      this.balls.push(ball);
    }
  }

  /**
   * ボールにランダムな初期位置・速度を設定
   * @private
   */
  _setRandomSpawnPosition(ball) {
    const x = (Math.random() - 0.5) * 0.8;
    const y = 0.8 + Math.random() * 0.3;
    const z = (Math.random() - 0.5) * 0.8;
    ball.position.set(x, y, z);
    ball.velocity.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    ball.mesh.position.copy(ball.position);
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
    const fallThreshold = CollisionChecker.FALL_THRESHOLD;

    for (const ball of this.balls) {
      // 重力を適用
      ball.velocity.y += this.gravity * dt;

      // 位置を更新
      const newPos = ball.position.clone().addScaledVector(ball.velocity, dt);

      // 当たり判定ボクセルとのみ衝突チェック（床面/壁面衝突なし）
      this._checkCollision(ball, newPos);

      ball.position.copy(newPos);

      // 奈落に落ちたら初期位置に再生成
      if (ball.position.y < fallThreshold) {
        this._respawnBall(ball);
      }
    }

    // ボール同士の衝突チェック
    if (CollisionChecker.BALL_COLLISION) {
      this._checkBallCollisions();
    }
  }

  /**
   * ボール同士の衝突チェック
   * @private
   */
  _checkBallCollisions() {
    const balls = this.balls;
    const count = balls.length;
    const diameter = this.ballDiameter;
    const restitution = this.restitution;

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const ball1 = balls[i];
        const ball2 = balls[j];

        // 距離を計算
        const dx = ball2.position.x - ball1.position.x;
        const dy = ball2.position.y - ball1.position.y;
        const dz = ball2.position.z - ball1.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        // 衝突判定（直径の2乗と比較）
        if (distSq < diameter * diameter && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);

          // 衝突法線（ball1からball2への方向）
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          // 相対速度
          const dvx = ball1.velocity.x - ball2.velocity.x;
          const dvy = ball1.velocity.y - ball2.velocity.y;
          const dvz = ball1.velocity.z - ball2.velocity.z;

          // 法線方向の相対速度
          const dvn = dvx * nx + dvy * ny + dvz * nz;

          // 離れていく場合はスキップ
          if (dvn <= 0) continue;

          // 衝撃量（同じ質量として計算）
          const impulse = dvn * restitution;

          // 速度を更新
          ball1.velocity.x -= impulse * nx;
          ball1.velocity.y -= impulse * ny;
          ball1.velocity.z -= impulse * nz;
          ball2.velocity.x += impulse * nx;
          ball2.velocity.y += impulse * ny;
          ball2.velocity.z += impulse * nz;

          // 位置を押し出し（めり込み解消）
          const overlap = diameter - dist;
          const pushDist = overlap * 0.5;
          ball1.position.x -= pushDist * nx;
          ball1.position.y -= pushDist * ny;
          ball1.position.z -= pushDist * nz;
          ball2.position.x += pushDist * nx;
          ball2.position.y += pushDist * ny;
          ball2.position.z += pushDist * nz;
        }
      }
    }
  }

  /**
   * ボールを初期位置に再生成
   * @private
   */
  _respawnBall(ball) {
    this._setRandomSpawnPosition(ball);
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
