/**
 * CustomBlockMeshBuilder
 * カスタムブロック用メッシュ生成ライブラリ
 * 8x8x8ボクセルデータからThree.jsメッシュを生成
 */
class CustomBlockMeshBuilder {
  // 定数
  static GRID_SIZE = 8;
  static DEFAULT_VOXEL_SIZE = 0.125;

  // 面ごとの明るさ
  static FACE_BRIGHTNESS = {
    TOP: 1.0,      // +Y (上面)
    BOTTOM: 0.5,   // -Y (底面)
    FRONT: 0.85,   // +Z (前)
    BACK: 0.85,    // -Z (後)
    LEFT: 0.75,    // -X (左)
    RIGHT: 0.75    // +X (右)
  };

  /**
   * @param {Object} THREE - Three.jsライブラリ
   */
  constructor(THREE) {
    this.THREE = THREE;
  }

  /**
   * ボクセルデータからメッシュを生成
   * @param {Uint8Array} voxelData - ボクセルデータ（128バイト）
   * @param {Array} materials - マテリアル配列（THREE.Material x 3）
   * @param {number} voxelSize - 各ボクセルのサイズ（デフォルト: 1/8 = 0.125）
   * @returns {THREE.Group} ボクセルメッシュグループ
   */
  build(voxelData, materials, voxelSize = 0.125) {
    const group = new this.THREE.Group();

    // ボクセルを走査してメッシュを作成
    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = VoxelData.getVoxel(voxelData, x, y, z);
          if (value === 0) continue; // 空気はスキップ

          const materialIndex = value - 1; // 1-3 → 0-2
          const material = materials[materialIndex] || materials[0];

          const voxelMesh = this._createVoxelMesh(x, y, z, voxelSize, material);
          group.add(voxelMesh);
        }
      }
    }

    return group;
  }

  /**
   * ボクセルデータからUVマッピング付きメッシュを生成
   * 1枚のテクスチャを8x8分割して各ボクセルに適用
   * @param {Uint8Array} voxelData - ボクセルデータ
   * @param {Array} materials - マテリアル配列（THREE.Material x 3）
   * @param {number} voxelSize - 各ボクセルのサイズ
   * @returns {THREE.Group} ボクセルメッシュグループ
   */
  buildWithUV(voxelData, materials, voxelSize = 0.125) {
    const group = new this.THREE.Group();

    for (let y = 0; y < 8; y++) {
      for (let z = 0; z < 8; z++) {
        for (let x = 0; x < 8; x++) {
          const value = VoxelData.getVoxel(voxelData, x, y, z);
          if (value === 0) continue;

          const materialIndex = value - 1;
          const material = materials[materialIndex] || materials[0];

          const voxelMesh = this._createVoxelMeshWithUV(x, y, z, voxelSize, material);
          group.add(voxelMesh);
        }
      }
    }

    return group;
  }

  /**
   * 単一ボクセルメッシュを作成
   * @private
   */
  _createVoxelMesh(x, y, z, size, material) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);
    this._setVertexColors(geometry);
    return this._createMeshWithPosition(geometry, x, y, z, size, material);
  }

  /**
   * UVマッピング付き単一ボクセルメッシュを作成
   * @private
   */
  _createVoxelMeshWithUV(x, y, z, size, material) {
    const geometry = new this.THREE.BoxGeometry(size, size, size);
    this._setVoxelUV(geometry, x, y, z);
    this._setVertexColors(geometry);
    return this._createMeshWithPosition(geometry, x, y, z, size, material);
  }

  /**
   * ジオメトリからメッシュを作成し位置を設定
   * @private
   */
  _createMeshWithPosition(geometry, x, y, z, size, material) {
    const mesh = new this.THREE.Mesh(geometry, material);
    // 8x8x8の中心が(0,0,0)になるように配置
    const offset = (CustomBlockMeshBuilder.GRID_SIZE * size) / 2 - size / 2;
    mesh.position.set(
      x * size - offset,
      y * size - offset,
      z * size - offset
    );
    return mesh;
  }

  /**
   * 頂点カラーを設定（面ごとの明るさ）
   * @private
   */
  _setVertexColors(geometry) {
    const brightness = CustomBlockMeshBuilder.FACE_BRIGHTNESS;

    // BoxGeometryの面順序: +X, -X, +Y, -Y, +Z, -Z
    // 各面4頂点、計24頂点
    const faceBrightness = [
      brightness.RIGHT,  // +X (0-3)
      brightness.LEFT,   // -X (4-7)
      brightness.TOP,    // +Y (8-11)
      brightness.BOTTOM, // -Y (12-15)
      brightness.FRONT,  // +Z (16-19)
      brightness.BACK    // -Z (20-23)
    ];

    const colors = new Float32Array(24 * 3);
    for (let face = 0; face < 6; face++) {
      const b = faceBrightness[face];
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
   * ボクセルのUV座標を設定
   * 仕様書 9.3 に基づくUV座標計算
   * @private
   */
  _setVoxelUV(geometry, x, y, z) {
    const uvAttribute = geometry.attributes.uv;
    const uvArray = uvAttribute.array;

    // テクスチャの1セル分のサイズ（8x8分割）
    const cellSize = 1 / 8;

    // 各面のUV計算（仕様書 9.3 に基づく）
    // BoxGeometryの面順序:
    // 0-3: +X (right), 4-7: -X (left), 8-11: +Y (top), 12-15: -Y (bottom), 16-19: +Z (front), 20-23: -Z (back)
    const faces = [
      { start: 0, u: 7 - z, v: y },   // +X (right)
      { start: 4, u: z, v: y },       // -X (left)
      { start: 8, u: x, v: 7 - z },   // +Y (top)
      { start: 12, u: x, v: z },      // -Y (bottom)
      { start: 16, u: x, v: y },      // +Z (front)
      { start: 20, u: 7 - x, v: y }   // -Z (back)
    ];

    faces.forEach(face => {
      const baseU = face.u * cellSize;
      const baseV = face.v * cellSize;

      // 4頂点のUV座標（BoxGeometryの頂点順序に合わせる）
      // Three.js BoxGeometryの頂点順序: [左上, 右上, 左下, 右下]
      const uvCoords = [
        [baseU, baseV + cellSize],            // 左上
        [baseU + cellSize, baseV + cellSize], // 右上
        [baseU, baseV],                       // 左下
        [baseU + cellSize, baseV]             // 右下
      ];

      for (let i = 0; i < 4; i++) {
        const idx = (face.start + i) * 2;
        uvArray[idx] = uvCoords[i][0];
        uvArray[idx + 1] = uvCoords[i][1];
      }
    });

    uvAttribute.needsUpdate = true;
  }

  /**
   * グリーディメッシングでボクセルデータからメッシュを生成
   * 同じマテリアルの隣接ボクセル面をマージしてポリゴン数を削減
   * @param {Uint8Array} voxelData - ボクセルデータ
   * @param {Array} materials - マテリアル配列
   * @param {number} voxelSize - ボクセルサイズ
   * @returns {THREE.Mesh} マージされた単一メッシュ
   */
  buildWithUVGreedy(voxelData, materials, voxelSize = 0.125) {
    const positions = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const materialGroups = [];

    const gs = CustomBlockMeshBuilder.GRID_SIZE;
    const off = (gs * voxelSize) / 2;
    const vs = voxelSize;
    const br = CustomBlockMeshBuilder.FACE_BRIGHTNESS;

    // 6方向の面定義: [法線軸, u軸, v軸, 面の位置オフセット, 明るさ]
    const faceConfigs = [
      { name: '+X', axis: 0, u: 2, v: 1, offset: 1, brightness: br.RIGHT },
      { name: '-X', axis: 0, u: 2, v: 1, offset: 0, brightness: br.LEFT },
      { name: '+Y', axis: 1, u: 0, v: 2, offset: 1, brightness: br.TOP },
      { name: '-Y', axis: 1, u: 0, v: 2, offset: 0, brightness: br.BOTTOM },
      { name: '+Z', axis: 2, u: 0, v: 1, offset: 1, brightness: br.FRONT },
      { name: '-Z', axis: 2, u: 0, v: 1, offset: 0, brightness: br.BACK }
    ];

    // 各マテリアル用のインデックス開始位置を追跡
    const matStartIndices = [0, 0, 0];
    const matIndices = [[], [], []];

    // 各面方向ごとにグリーディメッシング
    for (const config of faceConfigs) {
      const { axis, u, v, offset, brightness, name } = config;

      // 軸に沿った各スライスを処理
      for (let d = 0; d < gs; d++) {
        // このスライスの可視面マスク（マテリアルインデックス+1を格納、0=面なし）
        const mask = new Uint8Array(gs * gs);

        // マスクを構築
        for (let vPos = 0; vPos < gs; vPos++) {
          for (let uPos = 0; uPos < gs; uPos++) {
            // 3D座標に変換
            const coord = [0, 0, 0];
            coord[axis] = d;
            coord[u] = uPos;
            coord[v] = vPos;

            const value = VoxelData.getVoxel(voxelData, coord[0], coord[1], coord[2]);
            if (value === 0) continue;

            // 隣接チェック
            const neighborCoord = [...coord];
            if (offset === 1) {
              neighborCoord[axis] = d + 1;
            } else {
              neighborCoord[axis] = d - 1;
            }

            const hasNeighbor = neighborCoord[axis] >= 0 && neighborCoord[axis] < gs &&
              VoxelData.getVoxel(voxelData, neighborCoord[0], neighborCoord[1], neighborCoord[2]) !== 0;

            if (!hasNeighbor) {
              mask[vPos * gs + uPos] = value; // マテリアルインデックス+1
            }
          }
        }

        // グリーディマージ
        for (let vPos = 0; vPos < gs; vPos++) {
          for (let uPos = 0; uPos < gs; uPos++) {
            const matValue = mask[vPos * gs + uPos];
            if (matValue === 0) continue;

            const matIdx = matValue - 1;

            // u方向に拡張
            let width = 1;
            while (uPos + width < gs && mask[vPos * gs + uPos + width] === matValue) {
              width++;
            }

            // v方向に拡張
            let height = 1;
            let canExpand = true;
            while (vPos + height < gs && canExpand) {
              for (let i = 0; i < width; i++) {
                if (mask[(vPos + height) * gs + uPos + i] !== matValue) {
                  canExpand = false;
                  break;
                }
              }
              if (canExpand) height++;
            }

            // マージした領域をクリア
            for (let dv = 0; dv < height; dv++) {
              for (let du = 0; du < width; du++) {
                mask[(vPos + dv) * gs + uPos + du] = 0;
              }
            }

            // クアッドを生成
            const vertBase = positions.length / 3;

            // 面の4頂点を計算
            const facePos = d + offset; // 面の位置
            const u0 = uPos, u1 = uPos + width;
            const v0 = vPos, v1 = vPos + height;

            // 頂点座標を3D空間に変換
            const verts = [];
            const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];

            for (const [cu, cv] of corners) {
              const coord = [0, 0, 0];
              coord[axis] = facePos;
              coord[u] = cu;
              coord[v] = cv;
              verts.push(coord);
            }

            // 頂点を追加（ワールド座標に変換）
            for (const vert of verts) {
              positions.push(
                vert[0] * vs - off,
                vert[1] * vs - off,
                vert[2] * vs - off
              );
              colors.push(brightness, brightness, brightness);
            }

            // UV座標（マージされたサイズに対応）
            const cellSize = 1 / gs;
            const uSize = width * cellSize;
            const vSize = height * cellSize;
            uvs.push(0, 0);
            uvs.push(uSize, 0);
            uvs.push(0, vSize);
            uvs.push(uSize, vSize);

            // インデックス（面の向きによってワインディングを調整）
            // 頂点配置: 0=(u0,v0), 1=(u1,v0), 2=(u0,v1), 3=(u1,v1)
            // 各面の法線方向に基づいてクロス積で計算した正しい順序
            if (name === '+X' || name === '+Y') {
              // +X: axis=X, u=Z, v=Y → 法線+X
              // +Y: axis=Y, u=X, v=Z → 法線+Y
              matIndices[matIdx].push(
                vertBase + 0, vertBase + 2, vertBase + 1,
                vertBase + 2, vertBase + 3, vertBase + 1
              );
            } else if (name === '-X' || name === '-Y') {
              // -X: 法線-X
              // -Y: 法線-Y
              matIndices[matIdx].push(
                vertBase + 0, vertBase + 1, vertBase + 2,
                vertBase + 2, vertBase + 1, vertBase + 3
              );
            } else if (name === '+Z') {
              // +Z: axis=Z, u=X, v=Y → 法線+Z
              matIndices[matIdx].push(
                vertBase + 0, vertBase + 1, vertBase + 2,
                vertBase + 2, vertBase + 1, vertBase + 3
              );
            } else { // -Z
              // -Z: 法線-Z
              matIndices[matIdx].push(
                vertBase + 0, vertBase + 2, vertBase + 1,
                vertBase + 2, vertBase + 3, vertBase + 1
              );
            }
          }
        }
      }
    }

    // マテリアルグループを構築
    let indexOffset = 0;
    for (let matIdx = 0; matIdx < 3; matIdx++) {
      if (matIndices[matIdx].length > 0) {
        materialGroups.push({
          start: indexOffset,
          count: matIndices[matIdx].length,
          materialIndex: matIdx
        });
        indices.push(...matIndices[matIdx]);
        indexOffset += matIndices[matIdx].length;
      }
    }

    // ジオメトリ作成
    const geometry = new this.THREE.BufferGeometry();
    geometry.setAttribute('position', new this.THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new this.THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new this.THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    for (const group of materialGroups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    geometry.computeVertexNormals();

    return new this.THREE.Mesh(geometry, materials);
  }

  /**
   * 見た目用のデフォルトマテリアルを作成
   * @param {string} textureBase64 - テクスチャのBase64データ（省略時はグレー単色）
   * @returns {THREE.MeshBasicMaterial}
   */
  createDefaultMaterial(textureBase64 = null) {
    return textureBase64
      ? this.createMaterialFromTexture(textureBase64)
      : this.createColorMaterial(0x808080);
  }

  /**
   * テクスチャからマテリアルを作成
   * @param {string} textureBase64 - テクスチャのBase64データ
   * @returns {THREE.MeshBasicMaterial}
   */
  createMaterialFromTexture(textureBase64) {
    const texture = this._loadTexture(textureBase64);
    return new this.THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      vertexColors: true
    });
  }

  /**
   * 単色マテリアルを作成
   * @param {number} color - 色（16進数）
   * @returns {THREE.MeshBasicMaterial}
   */
  createColorMaterial(color) {
    return new this.THREE.MeshBasicMaterial({ color, vertexColors: true });
  }

  /**
   * テクスチャをロード（共通処理）
   * @private
   */
  _loadTexture(textureBase64) {
    const loader = new this.THREE.TextureLoader();
    const texture = loader.load(textureBase64);
    texture.magFilter = this.THREE.NearestFilter;
    texture.minFilter = this.THREE.NearestFilter;
    return texture;
  }
}
