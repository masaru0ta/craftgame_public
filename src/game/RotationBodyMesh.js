/**
 * RotationBodyMesh.js
 * 回転体のメッシュ生成・回転描画
 */
class RotationBodyMesh {
    // 面の頂点オフセット [dx,dy,dz] × 4頂点（ChunkMeshBuilderと同じ座標系）
    static _FACE_CORNER_OFFSETS = {
        top:    [[0,1,1],[1,1,1],[1,1,0],[0,1,0]],
        bottom: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
        front:  [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
        back:   [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
        right:  [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
        left:   [[0,0,0],[0,0,1],[0,1,1],[0,1,0]]
    };

    static _FACE_NORMALS = {
        top:    [0, 1, 0],
        bottom: [0, -1, 0],
        front:  [0, 0, -1],
        back:   [0, 0, 1],
        right:  [1, 0, 0],
        left:   [-1, 0, 0]
    };

    // 隣接オフセット（面カリング用）
    static _FACE_OFFSETS = {
        top:    { dx: 0, dy: 1, dz: 0 },
        bottom: { dx: 0, dy: -1, dz: 0 },
        front:  { dx: 0, dy: 0, dz: -1 },
        back:   { dx: 0, dy: 0, dz: 1 },
        right:  { dx: 1, dy: 0, dz: 0 },
        left:   { dx: -1, dy: 0, dz: 0 }
    };

    static _UV = [1, 0, 0, 0, 0, 1, 1, 1]; // u,v ペアをフラット配列で保持

    static _FACE_NAMES = ['top', 'bottom', 'front', 'back', 'right', 'left'];

    /**
     * @param {RotationBody} body
     * @param {TextureLoader} textureLoader
     * @param {ChunkManager} chunkManager
     */
    constructor(body, textureLoader, chunkManager) {
        this._body = body;
        this._textureLoader = textureLoader;
        this._chunkManager = chunkManager;
        this._group = new THREE.Group();

        // ゲーム座標系での回転軸ブロック中心位置（worldContainer内なのでZ反転不要）
        const ax = body._axisX + 0.5;
        const ay = body._axisY + 0.5;
        const az = body._axisZ + 0.5;
        this._group.position.set(ax, ay, az);
    }

    // カスタムブロックのボクセル面設定（ChunkMeshBuilderと同じ）
    static _VOXEL_FACE_CONFIGS = [
        { faceName: 'right',  axis: 0, u: 2, v: 1, offset: 1, normal: [1, 0, 0] },
        { faceName: 'left',   axis: 0, u: 2, v: 1, offset: 0, normal: [-1, 0, 0] },
        { faceName: 'top',    axis: 1, u: 0, v: 2, offset: 1, normal: [0, 1, 0] },
        { faceName: 'bottom', axis: 1, u: 0, v: 2, offset: 0, normal: [0, -1, 0] },
        { faceName: 'back',   axis: 2, u: 0, v: 1, offset: 1, normal: [0, 0, 1] },
        { faceName: 'front',  axis: 2, u: 0, v: 1, offset: 0, normal: [0, 0, -1] }
    ];

    /**
     * メッシュを構築
     */
    Build() {
        const body = this._body;
        const blocks = body._blocks;

        // ブロック座標をセットで管理（面カリング用）
        const blockSet = new Set();
        for (const b of blocks) {
            blockSet.add(`${b.rx},${b.ry},${b.rz}`);
        }

        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = [];
        const lightLevels = [];
        const aoLevels = [];
        const indices = [];
        let vertexOffset = 0;

        for (const b of blocks) {
            const blockDef = this._textureLoader.getBlockDef(b.blockId);

            if (blockDef && blockDef.shape_type === 'custom') {
                // カスタムブロック: ボクセルメッシュ生成
                vertexOffset = this._buildCustomBlockVoxels(
                    blockDef, b.rx, b.ry, b.rz, b.orientation || 0,
                    positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset
                );
                continue;
            }

            // 通常ブロック: 立方体メッシュ生成
            for (const faceName of RotationBodyMesh._FACE_NAMES) {
                const off = RotationBodyMesh._FACE_OFFSETS[faceName];
                if (blockSet.has(`${b.rx + off.dx},${b.ry + off.dy},${b.rz + off.dz}`)) continue;

                const cornerOffsets = RotationBodyMesh._FACE_CORNER_OFFSETS[faceName];
                const normal = RotationBodyMesh._FACE_NORMALS[faceName];
                const atlasUV = this._textureLoader.getAtlasUV(b.blockId, faceName);
                const bx = b.rx - 0.5, by = b.ry - 0.5, bz = b.rz - 0.5;

                for (let vi = 0; vi < 4; vi++) {
                    const co = cornerOffsets[vi];
                    positions.push(bx + co[0], by + co[1], bz + co[2]);
                    normals.push(normal[0], normal[1], normal[2]);
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    lightLevels.push(1.0);
                    aoLevels.push(1.0);
                    uvs.push(RotationBodyMesh._UV[vi * 2], RotationBodyMesh._UV[vi * 2 + 1]);
                }

                indices.push(
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset, vertexOffset + 2, vertexOffset + 3
                );
                vertexOffset += 4;
            }
        }

        if (positions.length === 0) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('atlasInfo', new THREE.Float32BufferAttribute(atlasInfos, 4));
        geometry.setAttribute('lightLevel', new THREE.Float32BufferAttribute(lightLevels, 1));
        geometry.setAttribute('aoLevel', new THREE.Float32BufferAttribute(aoLevels, 1));
        geometry.setIndex(indices);

        const material = this._textureLoader.getAtlasMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        this._group.add(mesh);
    }

    /**
     * カスタムブロックのボクセルメッシュ生成（回転体用・簡易版）
     * ChunkMeshBuilder._buildCustomBlockVoxels と同等だがライト固定1.0
     */
    _buildCustomBlockVoxels(blockDef, rx, ry, rz, orientation, positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset) {
        const voxelDataBase64 = blockDef.voxel_look;
        if (!voxelDataBase64) return vertexOffset;

        const voxelData = VoxelData.decode(voxelDataBase64);
        const matAtlasUVs = this._prepareCustomBlockMaterials(blockDef);

        const gs = 8;
        const vs = 1 / gs;
        // ブロック基点（軸中心原点からの相対座標）
        const blockBase = [rx - 0.5, ry - 0.5, rz - 0.5];
        const startVertexCount = positions.length / 3;

        for (const config of RotationBodyMesh._VOXEL_FACE_CONFIGS) {
            const { faceName, axis, u, v, offset, normal } = config;

            for (let d = 0; d < gs; d++) {
                // 面マスク構築
                const mask = new Uint8Array(gs * gs);
                for (let vPos = 0; vPos < gs; vPos++) {
                    for (let uPos = 0; uPos < gs; uPos++) {
                        const coord = [0, 0, 0];
                        coord[axis] = d;
                        coord[u] = uPos;
                        coord[v] = vPos;
                        const value = VoxelData.getVoxel(voxelData, coord[0], coord[1], coord[2]);
                        if (value === 0) continue;
                        const neighborD = offset === 1 ? d + 1 : d - 1;
                        let hasNeighbor = false;
                        if (neighborD >= 0 && neighborD < gs) {
                            const nc = [coord[0], coord[1], coord[2]];
                            nc[axis] = neighborD;
                            hasNeighbor = VoxelData.getVoxel(voxelData, nc[0], nc[1], nc[2]) !== 0;
                        }
                        if (!hasNeighbor) mask[vPos * gs + uPos] = value;
                    }
                }

                // グリーディマージ＆クアッド出力
                for (let vPos = 0; vPos < gs; vPos++) {
                    for (let uPos = 0; uPos < gs; uPos++) {
                        const matValue = mask[vPos * gs + uPos];
                        if (matValue === 0) continue;
                        const atlasUV = matAtlasUVs[matValue - 1];

                        let width = 1;
                        while (uPos + width < gs && mask[vPos * gs + uPos + width] === matValue) width++;
                        let height = 1;
                        let canExpand = true;
                        while (vPos + height < gs && canExpand) {
                            for (let i = 0; i < width; i++) {
                                if (mask[(vPos + height) * gs + uPos + i] !== matValue) { canExpand = false; break; }
                            }
                            if (canExpand) height++;
                        }
                        for (let dv = 0; dv < height; dv++) {
                            for (let du = 0; du < width; du++) {
                                mask[(vPos + dv) * gs + uPos + du] = 0;
                            }
                        }

                        const facePos = d + offset;
                        const u0 = uPos, u1 = uPos + width;
                        const v0 = vPos, v1 = vPos + height;
                        const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];

                        for (const [cu, cv] of corners) {
                            const pos = [0, 0, 0];
                            pos[axis] = blockBase[axis] + facePos * vs;
                            pos[u] = blockBase[u] + cu * vs;
                            pos[v] = blockBase[v] + cv * vs;
                            positions.push(pos[0], pos[1], pos[2]);
                            normals.push(normal[0], normal[1], normal[2]);
                            atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                            lightLevels.push(1.0);
                            aoLevels.push(1.0);
                        }

                        const cellSize = 1 / gs;
                        uvs.push(0, 0, width * cellSize, 0, 0, height * cellSize, width * cellSize, height * cellSize);

                        const vb = vertexOffset;
                        if (faceName === 'right' || faceName === 'top' || faceName === 'front') {
                            indices.push(vb, vb + 2, vb + 1, vb + 2, vb + 3, vb + 1);
                        } else {
                            indices.push(vb, vb + 1, vb + 2, vb + 2, vb + 1, vb + 3);
                        }
                        vertexOffset += 4;
                    }
                }
            }
        }

        // orientation回転適用（0以外の場合のみ）
        if (orientation !== 0 && typeof ChunkMeshBuilder !== 'undefined' && ChunkMeshBuilder.ORIENTATION_MATRICES) {
            const m = ChunkMeshBuilder.ORIENTATION_MATRICES[orientation];
            if (m) {
                const cx = rx, cy = ry, cz = rz;
                const endVertexCount = positions.length / 3;
                for (let i = startVertexCount; i < endVertexCount; i++) {
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
        }

        return vertexOffset;
    }

    /**
     * カスタムブロックのマテリアルアトラスUV準備
     */
    _prepareCustomBlockMaterials(blockDef) {
        const matAtlasUVs = [null, null, null];
        for (let i = 0; i < 3; i++) {
            const texName = blockDef[`material_${i + 1}`];
            if (texName) matAtlasUVs[i] = this._textureLoader.getAtlasUVByTexName(texName);
        }
        const defaultUV = (blockDef.tex_default && this._textureLoader.getAtlasUVByTexName(blockDef.tex_default))
            || { offsetX: 0, offsetY: 0, scaleX: 1 / (this._textureLoader._atlasSize || 1), scaleY: 1 / (this._textureLoader._atlasSize || 1) };
        for (let i = 0; i < 3; i++) {
            if (!matAtlasUVs[i]) matAtlasUVs[i] = defaultUV;
        }
        return matAtlasUVs;
    }

    /**
     * 回転角度を更新
     * @param {number} angle - ラジアン
     */
    UpdateRotation(angle) {
        const front = this._body.GetFrontDirection();
        // worldContainer(scale.z=-1)内での回転:
        // Y軸: scale.z反転で回転方向が反転されるため、そのまま適用
        // X軸/Z軸: scale.z反転で符号が逆転するため、-1を掛ける
        if (front.dy !== 0) {
            this._group.rotation.set(0, angle * front.dy, 0);
        } else if (front.dz !== 0) {
            this._group.rotation.set(0, 0, -angle * front.dz);
        } else {
            this._group.rotation.set(-angle * front.dx, 0, 0);
        }
    }

    /**
     * Three.js Groupを返す
     * @returns {THREE.Group}
     */
    GetGroup() {
        return this._group;
    }

    /**
     * リソース解放
     */
    Dispose() {
        for (const child of this._group.children) {
            if (child.geometry) child.geometry.dispose();
        }
        this._group.children.length = 0;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.RotationBodyMesh = RotationBodyMesh;
}
