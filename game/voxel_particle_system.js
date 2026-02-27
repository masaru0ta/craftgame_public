/**
 * VoxelParticleSystem - パーティクルシステム
 *
 * ボクセル破壊時のパーティクルエフェクトを管理する
 * ブロック衝突判定に対応
 */
class VoxelParticleSystem {
  // 定数
  static PARTICLE_COUNT = 12;        // 1ボクセルあたりのパーティクル数
  static PARTICLE_SIZE = 0.23;       // パーティクルサイズ（ボクセル単位）
  static PARTICLE_LIFETIME = 0.8;    // パーティクル寿命（秒）
  static PARTICLE_GRAVITY = 32;      // 重力加速度（プレイヤーと同じ）
  static PARTICLE_SPREAD = 0.5;      // 初速度の拡散範囲
  static MAX_PARTICLE_GROUPS = 30;   // 最大パーティクルグループ数
  static BOUNCE_FACTOR = 0.3;        // 衝突時の反発係数
  static FRICTION = 0.6;             // 衝突時の摩擦（水平速度の減衰）

  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene - パーティクルを追加するシーン
   * @param {Object} options.THREE - Three.jsライブラリ
   * @param {Function} [options.getBlockAt] - ブロック判定関数 (x,y,z) => blockId（ワールド座標）
   * @param {boolean} [options.flipZ] - シーンのZ座標が反転しているか（worldContainer.scale.z=-1）
   */
  constructor(options) {
    this.scene = options.scene;
    this.THREE = options.THREE;
    this._getBlockAt = options.getBlockAt || null;
    this._zSign = options.flipZ ? -1 : 1;
    this.particleGroups = [];
  }

  /**
   * ボクセル破壊パーティクルを生成
   * @param {number} x - シーンX座標
   * @param {number} y - シーンY座標
   * @param {number} z - シーンZ座標
   * @param {number} color - パーティクルの色（16進数）
   */
  emit(x, y, z, color = 0xffffff) {
    if (this.particleGroups.length >= VoxelParticleSystem.MAX_PARTICLE_GROUPS) {
      this._disposeGroup(this.particleGroups[0]);
      this.particleGroups.shift();
    }

    const count = VoxelParticleSystem.PARTICLE_COUNT;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      // 初期位置（ブロック全体にランダム配置）
      const ox = (Math.random() - 0.5) * 0.8;
      const oy = (Math.random() - 0.5) * 0.8;
      const oz = (Math.random() - 0.5) * 0.8;
      positions[i * 3] = x + ox;
      positions[i * 3 + 1] = y + oy;
      positions[i * 3 + 2] = z + oz;

      // 初速度（中心から外向き、速度はランダム）
      const upSpeed = -1.0 + Math.random() * 6.0;
      const outSpeed = 0.5 + Math.random() * 2.0;
      const lenXZ = Math.sqrt(ox * ox + oz * oz) || 0.01;

      velocities.push({
        x: (ox / lenXZ) * outSpeed,
        y: upSpeed,
        z: (oz / lenXZ) * outSpeed
      });
    }

    const geometry = new this.THREE.BufferGeometry();
    geometry.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));

    const material = new this.THREE.PointsMaterial({
      size: VoxelParticleSystem.PARTICLE_SIZE,
      color: color,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      depthWrite: false
    });

    const points = new this.THREE.Points(geometry, material);
    this.scene.add(points);

    this.particleGroups.push({
      points: points,
      geometry: geometry,
      material: material,
      velocities: velocities,
      age: 0
    });
  }

  /**
   * シーン座標(nx, ny, nz)のワールド位置に固体ブロックがあるか
   */
  _isSolidAt(nx, ny, nz) {
    const block = this._getBlockAt(
      Math.floor(nx), Math.floor(ny), Math.floor(nz * this._zSign)
    );
    return block && block !== 'air' && block !== 'water';
  }

  /**
   * 毎フレーム更新
   * @param {number} deltaTime - 経過時間（秒）
   */
  update(deltaTime) {
    const gravity = VoxelParticleSystem.PARTICLE_GRAVITY;
    const bounce = VoxelParticleSystem.BOUNCE_FACTOR;
    const friction = VoxelParticleSystem.FRICTION;
    const lifetime = VoxelParticleSystem.PARTICLE_LIFETIME;
    const hasCollision = !!this._getBlockAt;

    for (let i = this.particleGroups.length - 1; i >= 0; i--) {
      const group = this.particleGroups[i];
      group.age += deltaTime;

      if (group.age >= lifetime) {
        this._disposeGroup(group);
        this.particleGroups.splice(i, 1);
        continue;
      }

      const positions = group.geometry.attributes.position.array;
      const velocities = group.velocities;
      const count = velocities.length;

      for (let j = 0; j < count; j++) {
        const j3 = j * 3;
        const vel = velocities[j];

        vel.y -= gravity * deltaTime;

        const nx = positions[j3] + vel.x * deltaTime;
        const ny = positions[j3 + 1] + vel.y * deltaTime;
        const nz = positions[j3 + 2] + vel.z * deltaTime;

        if (hasCollision && this._isSolidAt(nx, ny, nz)) {
          vel.y = -vel.y * bounce;
          vel.x *= friction;
          vel.z *= friction;
        } else {
          positions[j3] = nx;
          positions[j3 + 1] = ny;
          positions[j3 + 2] = nz;
        }
      }

      group.geometry.attributes.position.needsUpdate = true;

      // フェードアウト（寿命の前半は不透明、後半でフェードアウト）
      const progress = group.age / lifetime;
      group.material.opacity = progress < 0.5 ? 1.0 : 2.0 - progress * 2.0;
    }
  }

  /**
   * グループのリソースを解放しシーンから除去（配列操作は呼び出し元で行う）
   * @private
   */
  _disposeGroup(group) {
    this.scene.remove(group.points);
    group.geometry.dispose();
    group.material.dispose();
  }

  /**
   * 全パーティクルを削除してリソースを解放
   */
  dispose() {
    for (let i = 0; i < this.particleGroups.length; i++) {
      this._disposeGroup(this.particleGroups[i]);
    }
    this.particleGroups.length = 0;
  }

  /**
   * アクティブなパーティクルグループ数を取得
   * @returns {number}
   */
  getActiveCount() {
    return this.particleGroups.length;
  }
}
