/**
 * BlockGroupMesh.js (旧 RotationBodyMesh)
 * ブロック群のメッシュ生成・回転描画
 * 回転体・ロープウェイ移動体・ピストンヘッドで共用
 */
class BlockGroupMesh {
    /**
     * @param {Object} body - ブロック群データ (_blocks, _axisX/Y/Z等)
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

    /**
     * メッシュを構築
     */
    Build() {
        const body = this._body;
        const blocks = body._blocks;

        // ブロック座標をセットで管理（面カリング用・整数キー）
        const blockSet = new Set();
        const customBlockSet = new Set();
        for (const b of blocks) {
            blockSet.add(packBlockKey(b.rx, b.ry, b.rz));
            const def = this._textureLoader.getBlockDef(b.blockId);
            if (def && def.shape_type === 'custom') {
                customBlockSet.add(packBlockKey(b.rx, b.ry, b.rz));
            }
        }

        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = [];
        const lightLevels = [];
        const aoLevels = [];
        const indices = [];
        let vertexOffset = 0;
        const out = { positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices };

        for (const b of blocks) {
            const blockDef = this._textureLoader.getBlockDef(b.blockId);

            if (blockDef && blockDef.shape_type === 'custom') {
                vertexOffset = this._buildCustomBlockVoxels(
                    blockDef, b.rx, b.ry, b.rz, b.orientation || 0, out, vertexOffset
                );
                continue;
            }

            // ハーフブロック
            if (b.shape === 'half') {
                const topDir = Math.floor((b.orientation || 0) / 4);
                vertexOffset = this._buildHalfBlockVoxels(
                    b.blockId, b.rx, b.ry, b.rz, topDir * 4, blockSet, out, vertexOffset, 'half'
                );
                continue;
            }

            // 階段ブロック
            if (b.shape === 'stair') {
                vertexOffset = this._buildHalfBlockVoxels(
                    b.blockId, b.rx, b.ry, b.rz, b.orientation || 0, blockSet, out, vertexOffset, 'stair'
                );
                continue;
            }

            // 通常ブロック: 立方体メッシュ生成
            const isOrientable = blockDef && (blockDef.rotatable || blockDef.sidePlaceable);
            const ori = isOrientable ? (b.orientation || 0) : 0;
            const oriBase = ori * 6;

            for (const faceName of BlockMeshGeometry.FaceNames) {
                const off = BlockMeshGeometry.FaceOffsets[faceName];
                const neighborKey = packBlockKey(b.rx + off.dx, b.ry + off.dy, b.rz + off.dz);
                if (blockSet.has(neighborKey) && !customBlockSet.has(neighborKey)) continue;

                const cornerOffsets = BlockMeshGeometry.FaceCornerOffsets[faceName];
                const normal = BlockMeshGeometry.FaceNormals[faceName];
                const fi = BlockOrientation.FaceIdx[faceName];
                const texFace = isOrientable ? BlockOrientation.FaceNames[BlockOrientation.TexRemapIdx[oriBase + fi]] : faceName;
                const atlasUV = this._textureLoader.getAtlasUV(b.blockId, texFace);
                const bx = b.rx - 0.5, by = b.ry - 0.5, bz = b.rz - 0.5;
                const cmbRot = isOrientable ? BlockOrientation.UVRotIdx[oriBase + fi] : 0;

                for (let vi = 0; vi < 4; vi++) {
                    const co = cornerOffsets[vi];
                    positions.push(bx + co[0], by + co[1], bz + co[2]);
                    normals.push(normal[0], normal[1], normal[2]);
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    lightLevels.push(1.0);
                    aoLevels.push(1.0);
                    // orientationに応じたUV回転
                    // top/bottom: baseUVはCMBと180°異なるため常に+2補正
                    const isTopBottom = (faceName === 'top' || faceName === 'bottom');
                    if (isTopBottom) {
                        const shift = (cmbRot + 2) % 4;
                        const si = ((vi + shift) % 4) * 2;
                        uvs.push(BlockMeshGeometry.FaceUV[si], BlockMeshGeometry.FaceUV[si + 1]);
                    } else if (cmbRot !== 0) {
                        const si = ((vi + cmbRot) % 4) * 2;
                        uvs.push(BlockMeshGeometry.FaceUV[si], BlockMeshGeometry.FaceUV[si + 1]);
                    } else {
                        uvs.push(BlockMeshGeometry.FaceUV[vi * 2], BlockMeshGeometry.FaceUV[vi * 2 + 1]);
                    }
                }

                BlockMeshGeometry.AddQuadIndices(indices, vertexOffset);
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
     * カスタムブロックのボクセルメッシュ生成（BlockMeshGeometry共通処理に委譲）
     */
    _buildCustomBlockVoxels(blockDef, rx, ry, rz, orientation, out, vertexOffset) {
        const voxelDataBase64 = blockDef.voxel_look;
        if (!voxelDataBase64) return vertexOffset;

        const voxelData = VoxelData.decode(voxelDataBase64);
        const matAtlasUVs = BlockMeshGeometry.GetCustomBlockMaterials(blockDef, this._textureLoader);

        const gs = 8;
        const blockBase = [rx - 0.5, ry - 0.5, rz - 0.5];
        const startVertexCount = out.positions.length / 3;

        for (const config of BlockMeshGeometry.VoxelFaceConfigs) {
            for (let d = 0; d < gs; d++) {
                const mask = BlockMeshGeometry.BuildVoxelFaceMask(voxelData, config, d, gs);
                vertexOffset = BlockMeshGeometry.EmitVoxelGreedyQuads(
                    out, mask, gs, matAtlasUVs, config, d, blockBase, vertexOffset
                );
            }
        }

        if (orientation !== 0) {
            const endVertexCount = out.positions.length / 3;
            BlockMeshGeometry.ApplyOrientation(
                out.positions, out.normals, startVertexCount, endVertexCount, rx, ry, rz, orientation
            );
        }

        return vertexOffset;
    }

    /**
     * ハーフ/階段ブロックのボクセルメッシュ生成（カスタムブロックと同じパイプライン）
     */
    _buildHalfBlockVoxels(blockId, rx, ry, rz, orientation, blockSet, out, vertexOffset, shape = 'half') {
        const voxelData = shape === 'stair' ? BlockMeshGeometry.GetStairVoxelData() : BlockMeshGeometry.GetHalfVoxelData();
        const gs = 8;
        const blockBase = [rx - 0.5, ry - 0.5, rz - 0.5];
        const startVertexCount = out.positions.length / 3;

        for (const config of BlockMeshGeometry.VoxelFaceConfigs) {
            const matAtlasUVs = BlockMeshGeometry.GetFaceAtlasUV(blockId, config.faceName, this._textureLoader, orientation);
            for (let d = 0; d < gs; d++) {
                const mask = BlockMeshGeometry.BuildVoxelFaceMask(voxelData, config, d, gs);
                vertexOffset = BlockMeshGeometry.EmitVoxelGreedyQuads(
                    out, mask, gs, matAtlasUVs, config, d, blockBase, vertexOffset
                );
            }
        }

        if (orientation !== 0) {
            const endVertexCount = out.positions.length / 3;
            BlockMeshGeometry.ApplyOrientation(
                out.positions, out.normals, startVertexCount, endVertexCount, rx, ry, rz, orientation
            );
        }

        return vertexOffset;
    }

    /**
     * 回転角度を更新
     * @param {number} angle - ラジアン
     */
    UpdateRotation(angle) {
        const body = this._body;
        if (body._frontDy !== 0) {
            this._group.rotation.set(0, angle * body._frontDy, 0);
        } else if (body._frontDz !== 0) {
            this._group.rotation.set(0, 0, -angle * body._frontDz);
        } else {
            this._group.rotation.set(-angle * body._frontDx, 0, 0);
        }
    }

    /** Three.js Groupを返す */
    GetGroup() { return this._group; }

    /** リソース解放 */
    Dispose() {
        for (const child of this._group.children) {
            if (child.geometry) child.geometry.dispose();
        }
        this._group.children.length = 0;
    }
}

// 後方互換エイリアス
const RotationBodyMesh = BlockGroupMesh;

// グローバルに公開
if (typeof window !== 'undefined') {
    window.BlockGroupMesh = BlockGroupMesh;
    window.RotationBodyMesh = BlockGroupMesh;
}
