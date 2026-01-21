/**
 * custom_collision_checker.js
 * 当たり判定の簡易チェック機能
 * ボールを落下させて衝突判定を視覚的に確認する
 */

class CollisionChecker {
  /**
   * コンストラクタ
   * @param {Object} options - オプション
   * @param {THREE} options.THREE - Three.jsライブラリ
   * @param {THREE.Scene} options.scene - Three.jsシーン
   * @param {THREE.Camera} options.camera - Three.jsカメラ（視点に応じた重力用）
   */
  constructor(options) {
    this.THREE = options.THREE;
    this.scene = options.scene;
    this.camera = options.camera;
    this.collisionData = null;

    // ボール設定
    this.BALL_COUNT = 30;
    this.BALL_RADIUS = 0.05; // 直径0.1ブロック相当
    this.GRAVITY_STRENGTH = 4.0; // 重力の強さ
    this.BOUNCE_FACTOR = 0.7; // 反発係数
    this.MIN_Y = -1.5; // この高さより下に落ちたら再生成

    // ボール配列
    this.balls = [];
    this.ballMeshes = [];

    // 状態
    this.isRunning = false;
    this.animationId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.FIXED_TIMESTEP = 1 / 60; // 60fps固定

    // ボールのマテリアル（共有）
    this.ballMaterial = new this.THREE.MeshStandardMaterial({
      color: 0x00ffff,
      metalness: 0.3,
      roughness: 0.4
    });

    // ボールのジオメトリ（共有）
    this.ballGeometry = new this.THREE.SphereGeometry(this.BALL_RADIUS, 16, 12);
  }

  /**
   * 当たり判定データを設定
   * @param {number[][][]} data - 4x4x4の当たり判定データ
   */
  setCollisionData(data) {
    this.collisionData = data;
  }

  /**
   * チェックを開始
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    // ボールを生成
    this.createBalls();

    // アニメーション開始
    this.animate();
  }

  /**
   * チェックを停止
   */
  stop() {
    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // ボールを削除
    this.removeBalls();
  }

  /**
   * ボールを生成
   */
  createBalls() {
    for (let i = 0; i < this.BALL_COUNT; i++) {
      this.spawnBall();
    }
  }

  /**
   * 重力の反対方向にスポーン位置を計算
   * @returns {THREE.Vector3} スポーン位置
   */
  getSpawnPosition() {
    const THREE = this.THREE;

    // 重力の反対方向（カメラの上方向）
    const upDirection = new THREE.Vector3(0, 1, 0);
    if (this.camera) {
      upDirection.applyQuaternion(this.camera.quaternion);
    }

    // ブロックの中心(0,0,0)から上方向に0.8〜1.3の距離
    const distance = 0.8 + Math.random() * 0.5;
    const spawnPos = upDirection.clone().multiplyScalar(distance);

    // 上方向に垂直な面でランダムなオフセットを追加
    const right = new THREE.Vector3(1, 0, 0);
    if (this.camera) {
      right.applyQuaternion(this.camera.quaternion);
    }
    const forward = new THREE.Vector3(0, 0, -1);
    if (this.camera) {
      forward.applyQuaternion(this.camera.quaternion);
    }

    spawnPos.add(right.multiplyScalar((Math.random() - 0.5) * 0.8));
    spawnPos.add(forward.multiplyScalar((Math.random() - 0.5) * 0.8));

    return spawnPos;
  }

  /**
   * 新しいボールを生成
   */
  spawnBall() {
    const THREE = this.THREE;

    // 重力の反対方向にスポーン
    const spawnPos = this.getSpawnPosition();

    // ボールデータ
    const ball = {
      position: spawnPos,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      )
    };

    // メッシュ作成
    const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
    mesh.position.copy(ball.position);
    this.scene.add(mesh);

    this.balls.push(ball);
    this.ballMeshes.push(mesh);
  }

  /**
   * ボールを削除
   */
  removeBalls() {
    for (const mesh of this.ballMeshes) {
      this.scene.remove(mesh);
    }
    this.balls = [];
    this.ballMeshes = [];
  }

  /**
   * アニメーションループ
   * 固定タイムステップ（60fps）で物理演算を実行
   */
  animate() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    const currentTime = performance.now();
    const frameTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // 最大100ms
    this.lastTime = currentTime;

    // 経過時間を蓄積
    this.accumulator += frameTime;

    // 固定タイムステップで物理演算を実行
    while (this.accumulator >= this.FIXED_TIMESTEP) {
      this.update(this.FIXED_TIMESTEP);
      this.accumulator -= this.FIXED_TIMESTEP;
    }
  }

  /**
   * 更新処理
   * @param {number} dt - デルタタイム（秒）
   */
  update(dt) {
    const THREE = this.THREE;

    // カメラの画面下方向をワールド座標で取得
    const gravityDirection = new THREE.Vector3(0, -1, 0);
    if (this.camera) {
      gravityDirection.applyQuaternion(this.camera.quaternion);
    }

    // ボール同士の衝突判定と反射
    this.checkBallCollisions();

    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      const mesh = this.ballMeshes[i];

      // 重力適用（カメラの画面下方向）
      ball.velocity.add(gravityDirection.clone().multiplyScalar(this.GRAVITY_STRENGTH * dt));

      // 次の位置を計算
      const nextPos = ball.position.clone().add(ball.velocity.clone().multiplyScalar(dt));

      // 衝突判定
      const collision = this.checkCollision(ball.position, nextPos, ball.velocity);

      if (collision.hit) {
        // 反射
        ball.velocity.reflect(collision.normal);
        ball.velocity.multiplyScalar(this.BOUNCE_FACTOR);

        // 衝突面に沿って移動
        ball.position.copy(collision.point);
        ball.position.add(collision.normal.clone().multiplyScalar(this.BALL_RADIUS + 0.001));
      } else {
        ball.position.copy(nextPos);
      }

      // メッシュ位置を更新
      mesh.position.copy(ball.position);

      // ブロック範囲外に落ちたら再生成
      if (ball.position.length() > 2.0) {
        this.respawnBall(i);
      }
    }
  }

  /**
   * ボール同士の衝突判定と反射
   */
  checkBallCollisions() {
    const THREE = this.THREE;
    const minDist = this.BALL_RADIUS * 2;

    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const ballA = this.balls[i];
        const ballB = this.balls[j];

        // 2つのボール間の距離
        const diff = ballA.position.clone().sub(ballB.position);
        const dist = diff.length();

        if (dist < minDist && dist > 0) {
          // 衝突している
          const normal = diff.normalize();

          // 相対速度
          const relVel = ballA.velocity.clone().sub(ballB.velocity);
          const velAlongNormal = relVel.dot(normal);

          // 離れていく方向なら処理しない
          if (velAlongNormal > 0) continue;

          // 反射（両方のボールに適用）
          const impulse = normal.clone().multiplyScalar(velAlongNormal * this.BOUNCE_FACTOR);
          ballA.velocity.sub(impulse);
          ballB.velocity.add(impulse);

          // めり込み解消
          const overlap = minDist - dist;
          const separation = normal.clone().multiplyScalar(overlap / 2);
          ballA.position.add(separation);
          ballB.position.sub(separation);
        }
      }
    }
  }

  /**
   * 衝突判定
   * @param {THREE.Vector3} from - 開始位置
   * @param {THREE.Vector3} to - 終了位置
   * @param {THREE.Vector3} velocity - 速度
   * @returns {Object} 衝突情報
   */
  checkCollision(from, to, velocity) {
    if (!this.collisionData) {
      return { hit: false };
    }

    const THREE = this.THREE;
    const gridSize = VoxelCollision.GRID_SIZE;
    const voxelSize = 1 / gridSize; // 0.25

    // 終了位置から当たり判定グリッド座標を計算
    const checkPoints = [
      to,
      to.clone().add(new THREE.Vector3(this.BALL_RADIUS, 0, 0)),
      to.clone().add(new THREE.Vector3(-this.BALL_RADIUS, 0, 0)),
      to.clone().add(new THREE.Vector3(0, this.BALL_RADIUS, 0)),
      to.clone().add(new THREE.Vector3(0, -this.BALL_RADIUS, 0)),
      to.clone().add(new THREE.Vector3(0, 0, this.BALL_RADIUS)),
      to.clone().add(new THREE.Vector3(0, 0, -this.BALL_RADIUS))
    ];

    for (const point of checkPoints) {
      // ワールド座標をグリッド座標に変換
      const gx = Math.floor((point.x + 0.5) * gridSize);
      const gy = Math.floor((point.y + 0.5) * gridSize);
      const gz = Math.floor((point.z + 0.5) * gridSize);

      // 範囲外は判定しない
      if (gx < 0 || gx >= gridSize || gy < 0 || gy >= gridSize || gz < 0 || gz >= gridSize) {
        continue;
      }

      // 当たり判定があるか
      if (VoxelCollision.get(this.collisionData, gx, gy, gz) === 1) {
        // 衝突したボクセルの中心と面の法線を計算
        const voxelCenterX = (gx + 0.5) * voxelSize - 0.5;
        const voxelCenterY = (gy + 0.5) * voxelSize - 0.5;
        const voxelCenterZ = (gz + 0.5) * voxelSize - 0.5;

        // ボールの中心からボクセル中心へのベクトル
        const diff = new THREE.Vector3(
          to.x - voxelCenterX,
          to.y - voxelCenterY,
          to.z - voxelCenterZ
        );

        // 最も近い面の法線を決定
        const absX = Math.abs(diff.x);
        const absY = Math.abs(diff.y);
        const absZ = Math.abs(diff.z);

        let normal;
        if (absX > absY && absX > absZ) {
          normal = new THREE.Vector3(Math.sign(diff.x), 0, 0);
        } else if (absY > absZ) {
          normal = new THREE.Vector3(0, Math.sign(diff.y), 0);
        } else {
          normal = new THREE.Vector3(0, 0, Math.sign(diff.z));
        }

        return {
          hit: true,
          point: from.clone(),
          normal: normal
        };
      }
    }

    // 当たり判定ボクセル以外では反射しない（奈落に落ちる）
    return { hit: false };
  }

  /**
   * ボールを再生成
   * @param {number} index - ボールのインデックス
   */
  respawnBall(index) {
    const ball = this.balls[index];
    const mesh = this.ballMeshes[index];

    // 重力の反対方向にスポーン
    const spawnPos = this.getSpawnPosition();
    ball.position.copy(spawnPos);

    // 速度をリセット
    ball.velocity.set(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2
    );

    mesh.position.copy(ball.position);
  }

  /**
   * リソースを解放
   */
  dispose() {
    this.stop();
    this.ballGeometry.dispose();
    this.ballMaterial.dispose();
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CollisionChecker = CollisionChecker;
}
