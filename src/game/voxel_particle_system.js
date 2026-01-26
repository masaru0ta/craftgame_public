/**
 * VoxelParticleSystem - ボクセルエディタ用パーティクルシステム
 *
 * ボクセル削除時のパーティクルエフェクトを管理する
 */
class VoxelParticleSystem {
  // 定数
  static PARTICLE_COUNT = 1;         // 1ボクセルあたりのパーティクル数
  static PARTICLE_SIZE = 0.16;       // パーティクルサイズ（ボクセル単位）
  static PARTICLE_LIFETIME = 0.8;    // パーティクル寿命（秒）
  static PARTICLE_GRAVITY = 4.0;     // パーティクルの重力加速度
  static PARTICLE_SPREAD = 0.3;      // 初速度の拡散範囲
  static MAX_PARTICLE_GROUPS = 20;   // 最大パーティクルグループ数

  /**
   * @param {Object} options
   * @param {THREE.Scene} options.scene - パーティクルを追加するシーン
   * @param {Object} options.THREE - Three.jsライブラリ
   */
  constructor(options) {
    this.scene = options.scene;
    this.THREE = options.THREE;
    this.particleGroups = [];  // アクティブなパーティクルグループ
    this.lastTime = null;
  }

  /**
   * ボクセル削除パーティクルを生成
   * @param {number} x - ボクセルX座標（ワールド座標）
   * @param {number} y - ボクセルY座標（ワールド座標）
   * @param {number} z - ボクセルZ座標（ワールド座標）
   * @param {number} color - パーティクルの色（16進数）
   */
  emit(x, y, z, color = 0xffffff) {
    // パーティクルグループ数の上限チェック
    if (this.particleGroups.length >= VoxelParticleSystem.MAX_PARTICLE_GROUPS) {
      this._removeParticleGroup(this.particleGroups[0]);
    }

    const count = VoxelParticleSystem.PARTICLE_COUNT;

    // パーティクルデータを作成
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      // 初期位置（ボクセル中心付近にランダム配置）
      positions[i * 3] = x + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.05;

      // 初速度（放射状に飛散）
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 0.2 + Math.random() * 0.2;
      const outSpeed = 0.1 + Math.random() * VoxelParticleSystem.PARTICLE_SPREAD;

      velocities.push({
        x: Math.cos(angle) * outSpeed,
        y: upSpeed,
        z: Math.sin(angle) * outSpeed
      });
    }

    // BufferGeometryを作成
    const geometry = new this.THREE.BufferGeometry();
    geometry.setAttribute('position', new this.THREE.BufferAttribute(positions, 3));

    // マテリアルを作成
    const material = new this.THREE.PointsMaterial({
      size: VoxelParticleSystem.PARTICLE_SIZE,
      color: color,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      depthWrite: false
    });

    // Pointsオブジェクトを作成
    const points = new this.THREE.Points(geometry, material);

    // シーンに追加
    this.scene.add(points);

    // パーティクルグループを登録
    this.particleGroups.push({
      points: points,
      geometry: geometry,
      material: material,
      velocities: velocities,
      age: 0
    });
  }

  /**
   * 毎フレーム更新
   * @param {number} deltaTime - 経過時間（秒）
   */
  update(deltaTime) {
    const groupsToRemove = [];

    for (let i = 0; i < this.particleGroups.length; i++) {
      const group = this.particleGroups[i];
      group.age += deltaTime;

      // 寿命チェック
      if (group.age >= VoxelParticleSystem.PARTICLE_LIFETIME) {
        groupsToRemove.push(group);
        continue;
      }

      // 位置を更新
      const positions = group.geometry.attributes.position.array;
      const velocities = group.velocities;
      const count = VoxelParticleSystem.PARTICLE_COUNT;

      for (let j = 0; j < count; j++) {
        // 重力を適用
        velocities[j].y -= VoxelParticleSystem.PARTICLE_GRAVITY * deltaTime;

        // 位置を更新
        positions[j * 3] += velocities[j].x * deltaTime;
        positions[j * 3 + 1] += velocities[j].y * deltaTime;
        positions[j * 3 + 2] += velocities[j].z * deltaTime;
      }

      // GPU更新フラグ
      group.geometry.attributes.position.needsUpdate = true;

      // フェードアウト
      const progress = group.age / VoxelParticleSystem.PARTICLE_LIFETIME;
      group.material.opacity = 1.0 - progress;
    }

    // 寿命が切れたグループを削除
    for (let k = 0; k < groupsToRemove.length; k++) {
      this._removeParticleGroup(groupsToRemove[k]);
    }
  }

  /**
   * パーティクルグループを削除
   * @param {Object} group - パーティクルグループ
   * @private
   */
  _removeParticleGroup(group) {
    // シーンから削除
    this.scene.remove(group.points);

    // リソースを解放
    group.geometry.dispose();
    group.material.dispose();

    // 配列から削除
    const index = this.particleGroups.indexOf(group);
    if (index !== -1) {
      this.particleGroups.splice(index, 1);
    }
  }

  /**
   * 全パーティクルを削除してリソースを解放
   */
  dispose() {
    while (this.particleGroups.length > 0) {
      this._removeParticleGroup(this.particleGroups[0]);
    }
  }

  /**
   * アクティブなパーティクルグループ数を取得
   * @returns {number}
   */
  getActiveCount() {
    return this.particleGroups.length;
  }
}
