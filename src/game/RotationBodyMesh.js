/**
 * RotationBodyMesh.js
 * 回転体のメッシュ生成・回転描画
 */
class RotationBodyMesh {
    // 面の頂点定義（ChunkMeshBuilderと同じ座標系）
    static _FACE_CORNERS = {
        top:    (x, y, z) => [
            { x: x, y: y + 1, z: z + 1 }, { x: x + 1, y: y + 1, z: z + 1 },
            { x: x + 1, y: y + 1, z: z }, { x: x, y: y + 1, z: z }
        ],
        bottom: (x, y, z) => [
            { x: x, y: y, z: z }, { x: x + 1, y: y, z: z },
            { x: x + 1, y: y, z: z + 1 }, { x: x, y: y, z: z + 1 }
        ],
        front:  (x, y, z) => [
            { x: x + 1, y: y, z: z }, { x: x, y: y, z: z },
            { x: x, y: y + 1, z: z }, { x: x + 1, y: y + 1, z: z }
        ],
        back:   (x, y, z) => [
            { x: x, y: y, z: z + 1 }, { x: x + 1, y: y, z: z + 1 },
            { x: x + 1, y: y + 1, z: z + 1 }, { x: x, y: y + 1, z: z + 1 }
        ],
        right:  (x, y, z) => [
            { x: x + 1, y: y, z: z + 1 }, { x: x + 1, y: y, z: z },
            { x: x + 1, y: y + 1, z: z }, { x: x + 1, y: y + 1, z: z + 1 }
        ],
        left:   (x, y, z) => [
            { x: x, y: y, z: z }, { x: x, y: y, z: z + 1 },
            { x: x, y: y + 1, z: z + 1 }, { x: x, y: y + 1, z: z }
        ]
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

    static _UV = [
        [1, 0], [0, 0], [0, 1], [1, 1]
    ];

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

        // Three.js座標系での回転軸ブロック中心位置
        const ax = body._axisX + 0.5;
        const ay = body._axisY + 0.5;
        const az = -(body._axisZ + 0.5);
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
            const faceNames = ['top', 'bottom', 'front', 'back', 'right', 'left'];
            for (const faceName of faceNames) {
                // 隣接ブロックが回転体内にあればカリング
                const off = RotationBodyMesh._FACE_OFFSETS[faceName];
                const nKey = `${b.rx + off.dx},${b.ry + off.dy},${b.rz + off.dz}`;
                if (blockSet.has(nKey)) continue;

                // 頂点（回転軸中心を原点とした相対座標）
                const corners = RotationBodyMesh._FACE_CORNERS[faceName](b.rx, b.ry, b.rz);
                const normal = RotationBodyMesh._FACE_NORMALS[faceName];

                // アトラスUV
                const atlasUV = this._textureLoader.getAtlasUV(b.blockId, faceName);

                for (let vi = 0; vi < 4; vi++) {
                    const c = corners[vi];
                    // 軸ブロック中心(0.5, 0.5, 0.5)を原点にした相対座標
                    // Three.js座標系: Z反転
                    positions.push(c.x - 0.5, c.y - 0.5, -(c.z - 0.5));
                    normals.push(normal[0], normal[1], -normal[2]);
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    lightLevels.push(1.0);
                    aoLevels.push(1.0);
                }

                // UV
                for (const [u, v] of RotationBodyMesh._UV) {
                    uvs.push(u, v);
                }

                // インデックス
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
        if (front.dy !== 0) {
            // Y軸回転（座標系変換: Three.jsは右手系なので符号反転）
            this._group.rotation.set(0, -angle * front.dy, 0);
        } else if (front.dz !== 0) {
            // Z軸回転（Three.jsのZ軸は反転しているので符号反転）
            this._group.rotation.set(0, 0, angle * front.dz);
        } else {
            // X軸回転
            this._group.rotation.set(angle * front.dx, 0, 0);
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
