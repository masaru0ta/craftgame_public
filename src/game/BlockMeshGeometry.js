/**
 * BlockMeshGeometry.js
 * ブロックメッシュ生成の共通ユーティリティ
 *
 * ChunkMeshBuilder, BlockGroupMesh(旧RotationBodyMesh), PlacementPreview が
 * 共通で使う定数・ジオメトリ生成ロジックを集約する。
 */
class BlockMeshGeometry {
    // ===== 面定数 =====

    static FaceNames = ['top', 'bottom', 'front', 'back', 'right', 'left'];

    static FaceNormals = {
        top:    [0, 1, 0],
        bottom: [0, -1, 0],
        front:  [0, 0, -1],
        back:   [0, 0, 1],
        right:  [1, 0, 0],
        left:   [-1, 0, 0]
    };

    /** 隣接オフセット（面カリング用） */
    static FaceOffsets = {
        top:    { dx: 0, dy: 1, dz: 0 },
        bottom: { dx: 0, dy: -1, dz: 0 },
        front:  { dx: 0, dy: 0, dz: -1 },
        back:   { dx: 0, dy: 0, dz: 1 },
        right:  { dx: 1, dy: 0, dz: 0 },
        left:   { dx: -1, dy: 0, dz: 0 }
    };

    /** 面の頂点オフセット [dx,dy,dz] × 4頂点（ゲーム座標系） */
    static FaceCornerOffsets = {
        top:    [[0,1,1],[1,1,1],[1,1,0],[0,1,0]],
        bottom: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
        front:  [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
        back:   [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
        right:  [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
        left:   [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]
    };

    /** 標準面UV（フラット配列: u,v × 4頂点） */
    static FaceUV = [1, 0, 0, 0, 0, 1, 1, 1];

    // ===== 階段ブロック用固定VoxelData =====

    /** 底面階段の8×8×8 VoxelData（キャッシュ） */
    static _stairVoxelData = null;

    /**
     * 階段ブロック用の固定VoxelData（8×8×8）を取得
     * 下半分（Y=0〜3）全充填 + 上半分の奥側（Y=4〜7, Z=4〜7）充填のL字型パターン。
     * 他の方向は orientation 回転で対応する。
     * @returns {Uint8Array} VoxelDataフォーマット（128バイト）
     */
    static GetStairVoxelData() {
        if (BlockMeshGeometry._stairVoxelData) return BlockMeshGeometry._stairVoxelData;
        const data = VoxelData.createEmpty();
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                for (let x = 0; x < 8; x++) {
                    // 下半分は全充填、上半分はZ=4〜7のみ充填
                    if (y < 4 || z >= 4) {
                        VoxelData.setVoxel(data, x, y, z, 1);
                    }
                }
            }
        }
        BlockMeshGeometry._stairVoxelData = data;
        return data;
    }

    /** 底面階段の4×4×4 CustomCollision（キャッシュ） */
    static _stairCollisionData = null;

    /**
     * 階段ブロック用の固定CustomCollision（4×4×4）を取得
     * 下半分（Y=0〜1）全充填 + 上半分の奥側（Y=2〜3, Z=2〜3）充填のL字型パターン。
     * @returns {number[][][]} CustomCollisionフォーマット
     */
    static GetStairCollisionData() {
        if (BlockMeshGeometry._stairCollisionData) return BlockMeshGeometry._stairCollisionData;
        const data = CustomCollision.createEmpty();
        for (let y = 0; y < 4; y++) {
            for (let z = 0; z < 4; z++) {
                for (let x = 0; x < 4; x++) {
                    if (y < 2 || z >= 2) {
                        CustomCollision.setVoxel(data, x, y, z, 1);
                    }
                }
            }
        }
        BlockMeshGeometry._stairCollisionData = data;
        return data;
    }

    // ===== ボクセル面設定 =====

    static VoxelFaceConfigs = [
        { faceName: 'right',  axis: 0, u: 2, v: 1, offset: 1, normal: [1, 0, 0] },
        { faceName: 'left',   axis: 0, u: 2, v: 1, offset: 0, normal: [-1, 0, 0] },
        { faceName: 'top',    axis: 1, u: 0, v: 2, offset: 1, normal: [0, 1, 0] },
        { faceName: 'bottom', axis: 1, u: 0, v: 2, offset: 0, normal: [0, -1, 0] },
        { faceName: 'back',   axis: 2, u: 0, v: 1, offset: 1, normal: [0, 0, 1] },
        { faceName: 'front',  axis: 2, u: 0, v: 1, offset: 0, normal: [0, 0, -1] }
    ];

    // ===== ハーフブロック用固定VoxelData =====

    /** 下ハーフの8×8×8 VoxelData（キャッシュ） */
    static _halfVoxelData = null;

    /**
     * ハーフブロック用の固定VoxelData（8×8×8）を取得
     * 下半分（Y=0〜3）を material=1 で充填したパターン。
     * 他の方向は orientation 回転で対応する。
     * @returns {Uint8Array} VoxelDataフォーマット（128バイト）
     */
    static GetHalfVoxelData() {
        if (BlockMeshGeometry._halfVoxelData) return BlockMeshGeometry._halfVoxelData;
        const data = VoxelData.createEmpty();
        for (let y = 0; y < 4; y++) {
            for (let z = 0; z < 8; z++) {
                for (let x = 0; x < 8; x++) {
                    VoxelData.setVoxel(data, x, y, z, 1);
                }
            }
        }
        BlockMeshGeometry._halfVoxelData = data;
        return data;
    }

    /** 下ハーフの4×4×4 CustomCollision（キャッシュ） */
    static _halfCollisionData = null;

    /**
     * ハーフブロック用の固定CustomCollision（4×4×4）を取得
     * 下半分（Y=0〜1）を solid=1 で充填したパターン。
     * @returns {number[][][]} CustomCollisionフォーマット
     */
    static GetHalfCollisionData() {
        if (BlockMeshGeometry._halfCollisionData) return BlockMeshGeometry._halfCollisionData;
        const data = CustomCollision.createEmpty();
        for (let y = 0; y < 2; y++) {
            for (let z = 0; z < 4; z++) {
                for (let x = 0; x < 4; x++) {
                    CustomCollision.setVoxel(data, x, y, z, 1);
                }
            }
        }
        BlockMeshGeometry._halfCollisionData = data;
        return data;
    }

    /**
     * 通常ブロックの面テクスチャをボクセルパイプライン用 matAtlasUVs に変換
     * 面方向ごとに呼び出し、その面のatlasUVを matAtlasUVs[0] にセットする。
     * @param {string} blockStrId - ブロックID
     * @param {string} faceName - 面名
     * @param {Object} textureLoader - TextureLoaderインスタンス
     * @param {number} orient - orientation値
     * @returns {Array} [atlasUV] — matAtlasUVs[0]がこの面のテクスチャ
     */
    static GetFaceAtlasUV(blockStrId, faceName, textureLoader, orient) {
        // orientation によるテクスチャ面リマップ
        let texFace = faceName;
        if (orient > 0 && typeof BlockOrientation !== 'undefined' && BlockOrientation.TexRemap[orient]) {
            const remap = BlockOrientation.TexRemap[orient];
            texFace = remap[faceName] || faceName;
        }
        return [textureLoader.getAtlasUV(blockStrId, texFace)];
    }

    // ===== ボクセルメッシュ生成 =====

    /**
     * ボクセルの可視面マスクを構築
     * @param {Uint8Array} voxelData - デコード済みボクセルデータ
     * @param {Object} config - VoxelFaceConfigsの要素
     * @param {number} d - スライス深度
     * @param {number} gs - グリッドサイズ
     * @returns {Uint8Array} マテリアルインデックス+1を格納（0=面なし）
     */
    static BuildVoxelFaceMask(voxelData, config, d, gs) {
        const { axis, u, v, offset } = config;
        const mask = new Uint8Array(gs * gs);
        const neighborD = offset === 1 ? d + 1 : d - 1;
        const checkNeighbor = (neighborD >= 0 && neighborD < gs);

        for (let vPos = 0; vPos < gs; vPos++) {
            for (let uPos = 0; uPos < gs; uPos++) {
                let cx = 0, cy = 0, cz = 0;
                if (axis === 0) cx = d; else if (axis === 1) cy = d; else cz = d;
                if (u === 0) cx = uPos; else if (u === 1) cy = uPos; else cz = uPos;
                if (v === 0) cx = vPos; else if (v === 1) cy = vPos; else cz = vPos;

                const value = VoxelData.getVoxel(voxelData, cx, cy, cz);
                if (value === 0) continue;

                let hasNeighbor = false;
                if (checkNeighbor) {
                    let nx = cx, ny = cy, nz = cz;
                    if (axis === 0) nx = neighborD; else if (axis === 1) ny = neighborD; else nz = neighborD;
                    hasNeighbor = VoxelData.getVoxel(voxelData, nx, ny, nz) !== 0;
                }
                if (!hasNeighbor) mask[vPos * gs + uPos] = value;
            }
        }
        return mask;
    }

    /**
     * マスクからグリーディマージしてメッシュデータを出力
     * @param {Object} out - 出力先 { positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices }
     * @param {Uint8Array} mask - BuildVoxelFaceMaskの戻り値
     * @param {number} gs - グリッドサイズ
     * @param {Array} matAtlasUVs - マテリアルインデックス→atlasUV配列
     * @param {Object} config - VoxelFaceConfigsの要素
     * @param {number} d - スライス深度
     * @param {number[]} blockBase - ブロック基点 [x, y, z]
     * @param {number} vertexOffset - 現在の頂点オフセット
     * @param {number} [lightLevel=1.0] - ライトレベル
     * @param {number} [aoLevel=1.0] - AOレベル
     * @returns {number} 更新後のvertexOffset
     */
    static EmitVoxelGreedyQuads(out, mask, gs, matAtlasUVs, config, d, blockBase, vertexOffset, lightLevel = 1.0, aoLevel = 1.0) {
        const { faceName, axis, u, v, offset, normal } = config;
        const vs = 1 / gs;
        // ゲーム内はworldContainer.scale.z=-1でZ反転描画されるため、
        // エディタ(_setVoxelUV)とは反転対象の面が逆になる
        const flipU = faceName === 'left' || faceName === 'back';
        const flipV = faceName === 'bottom';
        const cwWinding = (faceName === 'right' || faceName === 'top' || faceName === 'front');

        for (let vPos = 0; vPos < gs; vPos++) {
            for (let uPos = 0; uPos < gs; uPos++) {
                const matValue = mask[vPos * gs + uPos];
                if (matValue === 0) continue;

                const atlasUV = matAtlasUVs[matValue - 1];

                // u方向に拡張
                let width = 1;
                while (uPos + width < gs && mask[vPos * gs + uPos + width] === matValue) width++;

                // v方向に拡張
                let height = 1;
                let canExpand = true;
                while (vPos + height < gs && canExpand) {
                    for (let i = 0; i < width; i++) {
                        if (mask[(vPos + height) * gs + uPos + i] !== matValue) { canExpand = false; break; }
                    }
                    if (canExpand) height++;
                }

                // マージした領域をクリア
                for (let dv = 0; dv < height; dv++) {
                    for (let du = 0; du < width; du++) {
                        mask[(vPos + dv) * gs + uPos + du] = 0;
                    }
                }

                // 4頂点を出力
                const facePos = (d + offset) * vs;
                const u0 = uPos, u1 = uPos + width;
                const v0 = vPos, v1 = vPos + height;
                const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];

                for (const [cu, cv] of corners) {
                    const pos = [0, 0, 0];
                    pos[axis] = blockBase[axis] + facePos;
                    pos[u] = blockBase[u] + cu * vs;
                    pos[v] = blockBase[v] + cv * vs;
                    out.positions.push(pos[0], pos[1], pos[2]);
                    out.normals.push(normal[0], normal[1], normal[2]);
                    out.atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    out.lightLevels.push(lightLevel);
                    out.aoLevels.push(aoLevel);
                }

                // UV座標（面方向に応じた反転 — _setVoxelUV準拠）
                const cellSize = vs;
                const u0uv = flipU ? (gs - uPos) * cellSize : uPos * cellSize;
                const u1uv = flipU ? (gs - uPos - width) * cellSize : (uPos + width) * cellSize;
                const v0uv = flipV ? (gs - vPos) * cellSize : vPos * cellSize;
                const v1uv = flipV ? (gs - vPos - height) * cellSize : (vPos + height) * cellSize;
                out.uvs.push(u0uv, v0uv, u1uv, v0uv, u0uv, v1uv, u1uv, v1uv);

                // インデックス（面方向に応じたワインディング）
                const vb = vertexOffset;
                if (cwWinding) {
                    out.indices.push(vb, vb + 2, vb + 1, vb + 2, vb + 3, vb + 1);
                } else {
                    out.indices.push(vb, vb + 1, vb + 2, vb + 2, vb + 1, vb + 3);
                }
                vertexOffset += 4;
            }
        }
        return vertexOffset;
    }

    // ===== orientation回転 =====

    /**
     * 生成済み頂点にorientation回転を適用（ゲーム座標系）
     * @param {Array} positions - 頂点座標配列（フラット）
     * @param {Array} normals - 法線配列（フラット）
     * @param {number} startIdx - 開始頂点インデックス
     * @param {number} endIdx - 終了頂点インデックス（排他的）
     * @param {number} cx - 回転中心X
     * @param {number} cy - 回転中心Y
     * @param {number} cz - 回転中心Z
     * @param {number} orientation - 向き値（0〜23）
     */
    static ApplyOrientation(positions, normals, startIdx, endIdx, cx, cy, cz, orientation) {
        if (orientation === 0) return;
        const m = BlockOrientation.Matrices[orientation];
        if (!m) return;

        for (let i = startIdx; i < endIdx; i++) {
            const pi = i * 3;
            const dx = positions[pi] - cx, dy = positions[pi + 1] - cy, dz = positions[pi + 2] - cz;
            positions[pi]     = cx + m[0] * dx + m[1] * dy + m[2] * dz;
            positions[pi + 1] = cy + m[3] * dx + m[4] * dy + m[5] * dz;
            positions[pi + 2] = cz + m[6] * dx + m[7] * dy + m[8] * dz;

            const nx = normals[pi], ny = normals[pi + 1], nz = normals[pi + 2];
            normals[pi]     = m[0] * nx + m[1] * ny + m[2] * nz;
            normals[pi + 1] = m[3] * nx + m[4] * ny + m[5] * nz;
            normals[pi + 2] = m[6] * nx + m[7] * ny + m[8] * nz;
        }
    }

    /**
     * 生成済み頂点にorientation回転 + Z反転を適用（Three.js座標系変換用）
     * PlacementPreviewなどシーン直接配置で使用
     */
    static ApplyOrientationWithZFlip(positions, normals, startIdx, endIdx, cx, cy, cz, orientation) {
        const m = (orientation !== 0 && typeof BlockOrientation !== 'undefined')
            ? BlockOrientation.Matrices[orientation] : null;

        if (m) {
            for (let i = startIdx; i < endIdx; i++) {
                const pi = i * 3;
                const dx = positions[pi] - cx, dy = positions[pi + 1] - cy, dz = positions[pi + 2] - cz;
                positions[pi]     =  (cx + m[0] * dx + m[1] * dy + m[2] * dz);
                positions[pi + 1] =  (cy + m[3] * dx + m[4] * dy + m[5] * dz);
                positions[pi + 2] = -(cz + m[6] * dx + m[7] * dy + m[8] * dz);
                const nx = normals[pi], ny = normals[pi + 1], nz = normals[pi + 2];
                normals[pi]     =  (m[0] * nx + m[1] * ny + m[2] * nz);
                normals[pi + 1] =  (m[3] * nx + m[4] * ny + m[5] * nz);
                normals[pi + 2] = -(m[6] * nx + m[7] * ny + m[8] * nz);
            }
        } else {
            for (let i = startIdx; i < endIdx; i++) {
                const pi = i * 3;
                positions[pi + 2] = -positions[pi + 2];
                normals[pi + 2] = -normals[pi + 2];
            }
        }
    }

    // ===== カスタムブロックマテリアル =====

    /**
     * カスタムブロックのマテリアルatlasUV配列を取得
     * @param {Object} blockDef - ブロック定義
     * @param {Object} textureLoader - TextureLoaderインスタンス
     * @returns {Array<{offsetX,offsetY,scaleX,scaleY}>} [material_1, material_2, material_3]
     */
    static GetCustomBlockMaterials(blockDef, textureLoader) {
        const matAtlasUVs = [null, null, null];
        for (let i = 0; i < 3; i++) {
            const texName = blockDef[`material_${i + 1}`];
            if (texName) matAtlasUVs[i] = textureLoader.getAtlasUVByTexName(texName);
        }
        const defaultUV = (blockDef.tex_default && textureLoader.getAtlasUVByTexName(blockDef.tex_default))
            || { offsetX: 0, offsetY: 0, scaleX: 1 / (textureLoader._atlasSize || 1), scaleY: 1 / (textureLoader._atlasSize || 1) };
        for (let i = 0; i < 3; i++) {
            if (!matAtlasUVs[i]) matAtlasUVs[i] = defaultUV;
        }
        return matAtlasUVs;
    }

    // ===== インデックスユーティリティ =====

    /** 標準クアッドインデックス（0,1,2 / 0,2,3） */
    static AddQuadIndices(indices, offset) {
        indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BlockMeshGeometry = BlockMeshGeometry;
}
