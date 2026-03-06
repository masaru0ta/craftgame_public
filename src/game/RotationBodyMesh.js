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
            for (const faceName of RotationBodyMesh._FACE_NAMES) {
                // 隣接ブロックが回転体内にあればカリング
                const off = RotationBodyMesh._FACE_OFFSETS[faceName];
                if (blockSet.has(`${b.rx + off.dx},${b.ry + off.dy},${b.rz + off.dz}`)) continue;

                // 頂点（軸ブロック中心を原点とした相対座標）
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
