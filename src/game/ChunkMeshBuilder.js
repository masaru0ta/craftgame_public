/**
 * ChunkMeshBuilder - チャンクメッシュ生成クラス
 * 左手座標系対応、面カリング、グリーディー・メッシング機能を持つ
 */
class ChunkMeshBuilder {
    // 面の方向定義（左手座標系）。dx/dy/dz は隣接ブロックへのオフセット
    static FACES = {
        right:  { axis: 'x', dir:  1, normal: [ 1,  0,  0], dx:  1, dy:  0, dz:  0 }, // 東（X+）
        left:   { axis: 'x', dir: -1, normal: [-1,  0,  0], dx: -1, dy:  0, dz:  0 }, // 西（X-）
        top:    { axis: 'y', dir:  1, normal: [ 0,  1,  0], dx:  0, dy:  1, dz:  0 }, // 上（Y+）
        bottom: { axis: 'y', dir: -1, normal: [ 0, -1,  0], dx:  0, dy: -1, dz:  0 }, // 下（Y-）
        front:  { axis: 'z', dir: -1, normal: [ 0,  0, -1], dx:  0, dy:  0, dz: -1 }, // 南（Z-）
        back:   { axis: 'z', dir:  1, normal: [ 0,  0,  1], dx:  0, dy:  0, dz:  1 }  // 北（Z+）
    };

    /**
     * @param {TextureLoader} textureLoader - テクスチャローダー
     */
    constructor(textureLoader) {
        this.textureLoader = textureLoader;
        this.aoEnabled = true;
        // LoD1品質設定
        this.lod1AoEnabled = true;
        this.lod1LightEnabled = true;
        // カスタムブロックIDキャッシュ（遅延初期化）
        this._customBlockIds = null;
    }

    // AOレベル → 乗算係数
    static AO_TABLE = [1.0, 0.75, 0.55, 0.35];

    /** 横フロー最大距離（Minecraft準拠） */
    static WaterMaxDist = 7;

    /**
     * 水の段差面コーナー定義テーブル
     * 各エントリは4コーナーの [xOffset, yFlag, zOffset]。yFlag=0→botY, 1→topY
     */
    static _WATER_STEP_CORNERS = {
        front: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
        back:  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
        right: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]],
        left:  [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    };

    /** 段差面方向テーブル */
    static _WATER_SIDE_DIRS = [
        { name: 'front', dx: 0, dz: -1, normal: [0, 0, -1] },
        { name: 'back',  dx: 0, dz:  1, normal: [0, 0,  1] },
        { name: 'right', dx: 1, dz:  0, normal: [1, 0,  0] },
        { name: 'left',  dx:-1, dz:  0, normal:[-1, 0,  0] },
    ];

    /**
     * orientation(0〜23)に対応する3x3回転行列テーブル
     * orientation = face * 4 + rotation
     * face: ブロック+Y面の向き（0:+Y, 1:-Y, 2:+Z, 3:-Z, 4:+X, 5:-X）
     * rotation: Y軸周りの回転（0:0°, 1:90°, 2:180°, 3:270°）
     * 行列は [m00,m01,m02, m10,m11,m12, m20,m21,m22] のフラット配列
     */
    static ORIENTATION_MATRICES = (() => {
        const matrices = new Array(24);
        const PI = Math.PI;
        const HP = PI / 2;

        // 3x3回転行列を軸-角度から生成
        const fromAxisAngle = (ax, ay, az, angle) => {
            const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
            return [
                t*ax*ax + c,    t*ax*ay - s*az, t*ax*az + s*ay,
                t*ax*ay + s*az, t*ay*ay + c,    t*ay*az - s*ax,
                t*ax*az - s*ay, t*ay*az + s*ax, t*az*az + c
            ];
        };

        // 3x3行列の積
        const mul = (a, b) => [
            a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
            a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
            a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8]
        ];

        const identity = [1,0,0, 0,1,0, 0,0,1];

        // face回転行列（StructureEditor._applyOrientationと同一ロジック）
        const faceMatrices = [
            identity,                           // face 0: +Y（デフォルト）
            fromAxisAngle(1, 0, 0, PI),         // face 1: -Y（X軸π回転）
            fromAxisAngle(1, 0, 0, HP),         // face 2: +Z（X軸+π/2回転）
            fromAxisAngle(1, 0, 0, -HP),        // face 3: -Z（X軸-π/2回転）
            fromAxisAngle(0, 0, 1, -HP),        // face 4: +X（Z軸-π/2回転）
            fromAxisAngle(0, 0, 1, HP)          // face 5: -X（Z軸+π/2回転）
        ];

        for (let face = 0; face < 6; face++) {
            for (let rot = 0; rot < 4; rot++) {
                const rotM = (rot === 0) ? identity : fromAxisAngle(0, 1, 0, rot * HP);
                // StructureEditorと同じ合成順: faceQ * rotQ
                matrices[face * 4 + rot] = mul(faceMatrices[face], rotM);
            }
        }

        // 浮動小数点誤差を除去（-1, 0, 1 にスナップ）
        for (let i = 0; i < 24; i++) {
            for (let j = 0; j < 9; j++) {
                const v = matrices[i][j];
                if (Math.abs(v) < 1e-10) matrices[i][j] = 0;
                else if (Math.abs(v - 1) < 1e-10) matrices[i][j] = 1;
                else if (Math.abs(v + 1) < 1e-10) matrices[i][j] = -1;
            }
        }

        return matrices;
    })();

    // LoD0シェーダーと同じライティングパラメータ（方向性ライティング）
    static LIGHT_AMBIENT = 0.4;
    static LIGHT_DIRECTIONAL = 1.0;
    static LIGHT_DIR = (() => {
        const x = 0.5, y = 1.0, z = 0.3;
        const len = Math.sqrt(x * x + y * y + z * z);
        return [x / len, y / len, z / len];
    })();

    /**
     * 面法線から方向性ライティング係数を算出（LoD0シェーダーと同じ計算）
     * irradiance = ambient + directional * max(dot(normal, lightDir), 0)
     */
    static _faceLightingFactor(faceNormal) {
        const dir = ChunkMeshBuilder.LIGHT_DIR;
        const dotNL = Math.max(faceNormal[0] * dir[0] + faceNormal[1] * dir[1] + faceNormal[2] * dir[2], 0.0);
        return ChunkMeshBuilder.LIGHT_AMBIENT + ChunkMeshBuilder.LIGHT_DIRECTIONAL * dotNL;
    }

    /**
     * ライトレベル(0〜15)をライトファクター(0.1〜1.0)に変換
     */
    static _lightFactor(light) {
        return light !== undefined ? (0.1 + light / 15.0 * 0.9) : 1.0;
    }

    /**
     * クワッド(4頂点)のインデックスを追加（AO対角線フリップ対応）
     * @param {number[]} indices - インデックス配列
     * @param {number} v - 頂点オフセット
     * @param {number[]} ao - 各頂点のAOレベル [ao0, ao1, ao2, ao3]
     */
    static _addQuadIndices(indices, v, ao) {
        if (ao[0] + ao[2] > ao[1] + ao[3]) {
            // 対角線1-3で分割（フリップ）
            indices.push(v, v + 1, v + 3, v + 1, v + 2, v + 3);
        } else {
            // 対角線0-2で分割（通常）
            indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
        }
    }

    /**
     * 隣接チャンクを解決して座標をローカル化
     * @param {ChunkData} chunkData - 元チャンク
     * @param {number} nx - ワールドローカルX座標（チャンク外の可能性あり）
     * @param {number} nz - ワールドローカルZ座標（チャンク外の可能性あり）
     * @param {Map<string, ChunkData>} neighborChunks
     * @returns {{chunk: ChunkData, localX: number, localZ: number}|null}
     */
    static _resolveNeighborChunk(chunkData, nx, nz, neighborChunks) {
        if (!neighborChunks) return null;

        let targetChunk = null;
        let localX = nx, localZ = nz;

        if (nx < 0) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX - 1},${chunkData.chunkZ}`);
            localX = ChunkData.SIZE_X + nx;
        } else if (nx >= ChunkData.SIZE_X) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX + 1},${chunkData.chunkZ}`);
            localX = nx - ChunkData.SIZE_X;
        } else if (nz < 0) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ - 1}`);
            localZ = ChunkData.SIZE_Z + nz;
        } else if (nz >= ChunkData.SIZE_Z) {
            targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ + 1}`);
            localZ = nz - ChunkData.SIZE_Z;
        }

        if (!targetChunk) return null;
        return { chunk: targetChunk, localX, localZ };
    }

    /**
     * 指定座標のブロック位置を解決（チャンク境界を跨ぐ場合も対応）
     * Y範囲のチェックは呼び出し元で行うこと
     * @param {ChunkData} chunkData - 元チャンク
     * @param {number} x - ローカルX座標（チャンク外の可能性あり）
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標（チャンク外の可能性あり）
     * @param {Map<string, ChunkData>} neighborChunks
     * @returns {{chunk: ChunkData, localX: number, localY: number, localZ: number}|null}
     */
    static _resolveBlockLocation(chunkData, x, y, z, neighborChunks) {
        // チャンク範囲内
        if (x >= 0 && x < ChunkData.SIZE_X && z >= 0 && z < ChunkData.SIZE_Z) {
            return { chunk: chunkData, localX: x, localY: y, localZ: z };
        }
        // 隣接チャンクを解決
        const resolved = ChunkMeshBuilder._resolveNeighborChunk(chunkData, x, z, neighborChunks);
        if (!resolved) return null;
        // baseY差分を考慮したY座標変換
        const localY = y + (chunkData.baseY - resolved.chunk.baseY);
        return { chunk: resolved.chunk, localX: resolved.localX, localY, localZ: resolved.localZ };
    }

    /**
     * 面座標をグリッド座標(depth, u, v)に変換
     * @param {string} faceName
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {{depth: number, u: number, v: number}}
     */
    static _faceToGridCoords(faceName, x, y, z) {
        switch (faceName) {
            case 'top':
            case 'bottom':
                return { depth: y, u: x, v: z };
            case 'front':
            case 'back':
                return { depth: z, u: x, v: y };
            case 'left':
            case 'right':
                return { depth: x, u: y, v: z };
        }
    }

    /**
     * グリッド座標(depth, u, v)をメッシュ座標に変換
     * @param {string} faceName
     * @param {number} u
     * @param {number} v
     * @param {number} depth
     * @param {number} width
     * @param {number} height
     * @returns {{x: number, y: number, z: number, meshWidth: number, meshHeight: number}}
     */
    static _gridToMeshCoords(faceName, u, v, depth, width, height) {
        switch (faceName) {
            case 'top':
            case 'bottom':
                return { x: u, y: depth, z: v, meshWidth: width, meshHeight: height };
            case 'front':
            case 'back':
                return { x: u, y: v, z: depth, meshWidth: width, meshHeight: height };
            case 'left':
            case 'right':
                return { x: depth, y: u, z: v, meshWidth: width, meshHeight: height };
        }
    }

    // 面ごと × 頂点ごとのAO参照オフセット [side1, side2, corner]
    // _getFaceCorners の頂点順序に対応
    static AO_OFFSETS = {
        top: [
            // V0 (x, y+1, z+1) 後左
            [[-1,1,0], [0,1,1], [-1,1,1]],
            // V1 (x+1, y+1, z+1) 後右
            [[1,1,0], [0,1,1], [1,1,1]],
            // V2 (x+1, y+1, z) 前右
            [[1,1,0], [0,1,-1], [1,1,-1]],
            // V3 (x, y+1, z) 前左
            [[-1,1,0], [0,1,-1], [-1,1,-1]]
        ],
        bottom: [
            // V0 (x, y, z) 前左
            [[-1,-1,0], [0,-1,-1], [-1,-1,-1]],
            // V1 (x+1, y, z) 前右
            [[1,-1,0], [0,-1,-1], [1,-1,-1]],
            // V2 (x+1, y, z+1) 後右
            [[1,-1,0], [0,-1,1], [1,-1,1]],
            // V3 (x, y, z+1) 後左
            [[-1,-1,0], [0,-1,1], [-1,-1,1]]
        ],
        front: [
            // V0 (x+1, y, z) 右下
            [[1,0,-1], [0,-1,-1], [1,-1,-1]],
            // V1 (x, y, z) 左下
            [[-1,0,-1], [0,-1,-1], [-1,-1,-1]],
            // V2 (x, y+1, z) 左上
            [[-1,0,-1], [0,1,-1], [-1,1,-1]],
            // V3 (x+1, y+1, z) 右上
            [[1,0,-1], [0,1,-1], [1,1,-1]]
        ],
        back: [
            // V0 (x, y, z+1) 左下
            [[-1,0,1], [0,-1,1], [-1,-1,1]],
            // V1 (x+1, y, z+1) 右下
            [[1,0,1], [0,-1,1], [1,-1,1]],
            // V2 (x+1, y+1, z+1) 右上
            [[1,0,1], [0,1,1], [1,1,1]],
            // V3 (x, y+1, z+1) 左上
            [[-1,0,1], [0,1,1], [-1,1,1]]
        ],
        right: [
            // V0 (x+1, y, z+1) 後下
            [[1,0,1], [1,-1,0], [1,-1,1]],
            // V1 (x+1, y, z) 前下
            [[1,0,-1], [1,-1,0], [1,-1,-1]],
            // V2 (x+1, y+1, z) 前上
            [[1,0,-1], [1,1,0], [1,1,-1]],
            // V3 (x+1, y+1, z+1) 後上
            [[1,0,1], [1,1,0], [1,1,1]]
        ],
        left: [
            // V0 (x, y, z) 前下
            [[-1,0,-1], [-1,-1,0], [-1,-1,-1]],
            // V1 (x, y, z+1) 後下
            [[-1,0,1], [-1,-1,0], [-1,-1,1]],
            // V2 (x, y+1, z+1) 後上
            [[-1,0,1], [-1,1,0], [-1,1,1]],
            // V3 (x, y+1, z) 前上
            [[-1,0,-1], [-1,1,0], [-1,1,-1]]
        ]
    };

    // 面名からマテリアルインデックスへのマッピング
    static FACE_INDEX = {
        'right': 0,
        'left': 1,
        'top': 2,
        'bottom': 3,
        'front': 4,
        'back': 5
    };

    /**
     * チャンクからメッシュを生成
     * @param {ChunkData} chunkData - チャンクデータ
     * @param {string} mode - 描画モード ('FULL' | 'CULLED')
     * @param {boolean} greedy - グリーディー・メッシング有効 (デフォルト: false)
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク (オプション)
     * @returns {THREE.Mesh}
     */
    build(chunkData, mode = 'CULLED', greedy = false, neighborChunks = null) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = []; // 頂点属性: vec4(offsetX, offsetY, scaleX, scaleY)
        const lightLevels = []; // 頂点属性: ライトファクター（0.1〜1.0）
        const aoLevels = []; // 頂点属性: AO係数（0.35〜1.0）
        const indices = [];

        // ブロックID + 面名ごとにグループ化（グリーディーメッシング用）
        const blockFacesMap = new Map(); // "blockStrId:faceName" -> faces[]
        // カスタムブロック情報を収集
        const customBlocks = [];
        // ハーフブロック情報を収集（グリーディーメッシング除外）
        const halfBlocks = [];

        // 全ブロックを走査（水ブロックは別メッシュで処理）
        chunkData.forEachBlock((x, y, z, blockStrId) => {
            if (blockStrId === 'air' || blockStrId === 'water') return;

            // 回転体に含まれるブロックはチャンクメッシュから除外
            if (typeof RotationAxisManager !== 'undefined' && window.testApp && window.testApp.rotationAxisManager) {
                const mgr = window.testApp.rotationAxisManager;
                if (typeof mgr.IsBlockInAnyBody === 'function') {
                    const wx = chunkData.chunkX * 16 + x;
                    const wy = chunkData.baseY + y;
                    const wz = chunkData.chunkZ * 16 + z;
                    if (mgr.IsBlockInAnyBody(wx, wy, wz)) return;
                }
            }

            const blockDef = this.textureLoader.getBlockDef(blockStrId);

            // カスタムブロック: ボクセルメッシュ用に収集（orientation付き）
            if (blockDef && blockDef.shape_type === 'custom') {
                const orientation = chunkData.getOrientation(x, y, z);
                customBlocks.push({ blockDef, x, y, z, orientation });
                return;
            }

            // ハーフブロック: shape='half' ならグリーディーメッシングから除外して個別描画
            if (blockDef && blockDef.half_placeable) {
                const shape = typeof chunkData.getShape === 'function'
                    ? chunkData.getShape(x, y, z)
                    : 'normal';
                if (shape === 'half') {
                    const orient = chunkData.getOrientation(x, y, z);
                    const topDir = Math.floor(orient / 4);
                    // topDir → _buildHalfBlockAtlas用のorientation(1-6)に変換
                    // topDir: 0=top,1=bottom,2=north,3=south,4=east,5=west
                    // ハーフはクリック面側に寄る（topDirの反対側）
                    const topDirToHalfOri = [1, 2, 3, 4, 5, 6];
                    halfBlocks.push({ blockStrId, x, y, z, orientation: topDirToHalfOri[topDir] || 1 });
                    return;
                }
            }

            // rotatable/sidePlaceable ブロックのテクスチャリマップ取得
            let texRemap = null;
            if (blockDef && (blockDef.rotatable || blockDef.sidePlaceable)) {
                const ori = chunkData.getOrientation(x, y, z);
                texRemap = ChunkMeshBuilder._OrientableTexRemap[ori] || null;
            }

            // 各面をチェック
            for (const [faceName, faceInfo] of Object.entries(ChunkMeshBuilder.FACES)) {
                // チャンク最下(y=0)の底面は常にカリング
                if (faceName === 'bottom' && y === 0) continue;

                // カリング判定
                if (mode === 'CULLED') {
                    if (this._shouldCullFace(chunkData, x, y, z, faceName, neighborChunks)) {
                        continue;
                    }
                }

                // 面の法線方向の隣接座標からライトレベルを取得
                const light = this._getFaceLightLevel(chunkData, x, y, z, faceName, neighborChunks);

                // AO計算（TOP面のみ）
                const ao = (this.aoEnabled && faceName === 'top')
                    ? this._getVertexAO(chunkData, x, y, z, faceName, neighborChunks)
                    : [0, 0, 0, 0];

                // orientable: テクスチャ面をリマップ（物理面はそのまま）
                const texFace = texRemap ? texRemap[faceName] : faceName;
                // UV回転: rotatable/sidePlaceableブロックのtop/bottom面はrotation分回転
                const ori = (texRemap) ? chunkData.getOrientation(x, y, z) : 0;
                const uvRot = ori % 4;
                const key = `${blockStrId}:${faceName}:${texFace}:${uvRot}`;
                if (!blockFacesMap.has(key)) {
                    blockFacesMap.set(key, { blockStrId, faceName, texFace, uvRot, faces: [] });
                }
                blockFacesMap.get(key).faces.push({ x, y, z, faceName, light, ao });
            }
        });

        // 通常ブロックのメッシュ生成
        let vertexOffset = 0;

        for (const [key, groupData] of blockFacesMap) {
            const { blockStrId, faceName, texFace, uvRot, faces } = groupData;
            const textureFace = texFace || faceName;

            if (greedy) {
                // グリーディー・メッシング（アトラスUV対応、タイリングシェーダー使用）
                vertexOffset = this._greedyMeshDirectionAtlas(
                    faces, faceName, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset, lightLevels, aoLevels, textureFace, uvRot
                );
            } else {
                // 通常のメッシュ生成（アトラスUV対応）
                vertexOffset = this._buildSimpleMeshAtlas(
                    faces, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset, lightLevels, aoLevels, textureFace, uvRot
                );
            }
        }

        // カスタムブロックのボクセルメッシュ生成（アトラス統合、orientation回転対応）
        for (const { blockDef, x, y, z, orientation } of customBlocks) {
            vertexOffset = this._buildCustomBlockVoxels(
                blockDef, x, y, z, chunkData,
                positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices,
                vertexOffset, neighborChunks, orientation
            );
        }

        // ハーフブロックの個別描画
        for (const { blockStrId, x, y, z, orientation } of halfBlocks) {
            vertexOffset = this._buildHalfBlockAtlas(
                x, y, z, orientation, blockStrId, chunkData, neighborChunks,
                positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset
            );
        }

        // ジオメトリ作成
        const geometry = new THREE.BufferGeometry();

        if (positions.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setAttribute('atlasInfo', new THREE.Float32BufferAttribute(atlasInfos, 4));
            geometry.setAttribute('lightLevel', new THREE.Float32BufferAttribute(lightLevels, 1));
            geometry.setAttribute('aoLevel', new THREE.Float32BufferAttribute(aoLevels, 1));
            geometry.setIndex(indices);
        }

        // アトラスマテリアルを使用（1マテリアル）
        const atlasMaterial = this.textureLoader.getAtlasMaterial();
        const fallbackMaterial = new THREE.MeshLambertMaterial({
            vertexColors: false,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, atlasMaterial || fallbackMaterial);
        mesh.name = `chunk_${chunkData.chunkX}_${chunkData.chunkZ}`;

        return mesh;
    }

    /**
     * 水ブロック専用メッシュを生成
     * 水ブロックのみ対象、隣接が空気の面のみ描画
     * LoD0/LoD1共通：頂点カラー＋MeshBasicMaterial（テクスチャなし）
     * @param {ChunkData} chunkData
     * @param {Map<string, ChunkData>} neighborChunks
     * @param {Object} [options] - オプション
     * @param {string} [options.waterColor] - 水の色（blockColorsから取得）
     * @returns {THREE.Mesh|null} 水がなければnull
     */
    buildWaterMesh(chunkData, neighborChunks = null, options = {}) {
        const waterColor = options.waterColor;
        if (!waterColor) return null;

        const positions = [];
        const normals = [];
        const indices = [];
        let vertexOffset = 0;

        // 頂点カラー（LoD0/LoD1共通：テクスチャなし、方向性ライティング×ライトマップ×AO焼き込み）
        const colors = [];

        // 水位計算ヘルパー（以下のforEachBlockより前に定義する必要がある）
        const WaterMaxDist = ChunkMeshBuilder.WaterMaxDist;
        const SurfaceH = WaterMaxDist / (WaterMaxDist + 1); // 7/8
        const waterLevelH = (lvl, surface = false) => {
            // 満水ブロック（水源/落下水）: 水面なら 7/8、水没なら 1.0
            if (lvl === 0 || lvl > WaterMaxDist) return surface ? SurfaceH : 1.0;
            // 横フロー（dist 1〜7）: 水源（7/8）と区別するため1段階ずらして計算
            // dist=1→6/8, dist=2→5/8, …, dist=6→1/8, dist=7→最小(1/16)
            return Math.max(1 / 16, (WaterMaxDist - lvl) / (WaterMaxDist + 1));
        };

        // 面名 + ライトレベル + AOパターンでグループ化（グリーディメッシング用）
        const waterFacesMap = new Map();

        chunkData.forEachBlock((x, y, z, blockStrId) => {
            if (blockStrId !== 'water') return;

            // dist（水源からの距離）を orientation に保存している
            const level = chunkData.getOrientation(x, y, z); // 0〜7 or 8(WaterFalling)

            // 水面判定: 満水ブロック（level=0 or WaterFalling）のみ上ブロックをチェック
            // 上が water でなければ「水面」→ 高さ 7/8、water なら「水没」→ 高さ 1.0
            const isFullWater = level === 0 || level > WaterMaxDist;
            const blockAbove = isFullWater && y + 1 < 128 ? chunkData.getBlock(x, y + 1, z) : null;
            const isSurface = isFullWater && blockAbove !== 'water';

            for (const [faceName, faceInfo] of Object.entries(ChunkMeshBuilder.FACES)) {
                if (faceName === 'bottom' && y === 0) continue;

                // 水専用カリング: 隣接が空気の場合のみ描画
                if (!this._isWaterFaceVisible(chunkData, x, y, z, faceName, neighborChunks)) {
                    continue;
                }

                // ライトレベル取得
                const light = this._getFaceLightLevel(chunkData, x, y, z, faceName, neighborChunks);

                // AO計算
                const ao = this.aoEnabled
                    ? this._getVertexAO(chunkData, x, y, z, faceName, neighborChunks)
                    : [0, 0, 0, 0];
                const aoKey = ao.join(',');

                // グループ化キー: 面名 + ライトレベル + AOパターン + 水位 + 水面フラグ
                // 満水ブロックは水面/水没で高さが異なるため別グループにする
                const levelKey = faceName === 'bottom' ? '' : `:${level}`;
                const surfaceKey = isFullWater && faceName !== 'bottom' ? `:${isSurface ? 's' : 'u'}` : '';
                const key = `${faceName}:${light}:${aoKey}${levelKey}${surfaceKey}`;
                if (!waterFacesMap.has(key)) {
                    waterFacesMap.set(key, { faceName, light, ao, level, isSurface, faces: [] });
                }
                waterFacesMap.get(key).faces.push({ x, y, z });
            }
        });

        // グリーディメッシングで各グループを処理
        const rgb = this._hexToRgb(waterColor);

        for (const [, groupData] of waterFacesMap) {
            const { faceName, light, ao, level, isSurface, faces } = groupData;
            const faceInfo = ChunkMeshBuilder.FACES[faceName];
            const lf = ChunkMeshBuilder._lightFactor(light);
            const dl = ChunkMeshBuilder._faceLightingFactor(faceInfo.normal);

            // 水位に応じた高さ（満水水面=7/8、水没=1.0、横フロー=距離計算）
            const waterH = faceName === 'bottom' ? 1.0 : waterLevelH(level, isSurface);

            // グリーディメッシング: 面をグリッドに変換→矩形検出
            const grid = this._facesToGrid(faces, faceName);
            const rectangles = this._findRectangles(grid, faces);

            for (const rect of rectangles) {
                const { x: meshX, y: meshY, z: meshZ, meshWidth, meshHeight } =
                    ChunkMeshBuilder._gridToMeshCoords(faceName, rect.x, rect.y, rect.depth, rect.width, rect.height);

                const corners = this._getFaceCorners(meshX, meshY, meshZ, faceName, meshWidth, meshHeight, waterH);
                for (let vi = 0; vi < corners.length; vi++) {
                    const corner = corners[vi];
                    const af = ChunkMeshBuilder.AO_TABLE[ao[vi]] ?? 1.0;
                    positions.push(corner.x, corner.y, corner.z);
                    normals.push(...faceInfo.normal);
                    colors.push(rgb.r * lf * af * dl, rgb.g * lf * af * dl, rgb.b * lf * af * dl);
                }

                ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, ao);
                vertexOffset += 4;
            }
        }

        // 段差面: 隣接する水ブロックとの水位差がある場合に垂直面を追加
        const sideDirs = ChunkMeshBuilder._WATER_SIDE_DIRS;
        const stepCorners = ChunkMeshBuilder._WATER_STEP_CORNERS;

        chunkData.forEachBlock((x, y, z, blockStrId) => {
            if (blockStrId !== 'water') return;
            const level = chunkData.getOrientation(x, y, z);
            // 水面判定（満水ブロックのみ上ブロックをチェック）
            const isFullW = level === 0 || level > WaterMaxDist;
            const aboveBlock = isFullW && y + 1 < 128 ? chunkData.getBlock(x, y + 1, z) : null;
            const thisH = waterLevelH(level, isFullW && aboveBlock !== 'water');

            for (const { name, dx, dz, normal } of sideDirs) {
                const nx = x + dx, nz = z + dz;
                const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, y, nz, neighborChunks);
                if (!loc) continue;
                if (loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ) !== 'water') continue;

                const neighborLevel = loc.chunk.getOrientation(loc.localX, loc.localY, loc.localZ);
                // 隣接ブロックの水面判定
                const isFullN = neighborLevel === 0 || neighborLevel > WaterMaxDist;
                const locAbove = isFullN
                    ? ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, y + 1, nz, neighborChunks)
                    : null;
                const aboveNeighbor = locAbove
                    ? locAbove.chunk.getBlock(locAbove.localX, locAbove.localY, locAbove.localZ)
                    : null;
                const neighborH = waterLevelH(neighborLevel, isFullN && aboveNeighbor !== 'water');
                if (thisH <= neighborH) continue; // 隣が同じか高いなら不要

                const botY = y + neighborH;
                const topY = y + thisH;
                const lf = ChunkMeshBuilder._lightFactor(
                    this._getFaceLightLevel(chunkData, x, y, z, name, neighborChunks)
                );
                const dl = ChunkMeshBuilder._faceLightingFactor(normal);
                const cr = rgb.r * lf * dl, cg = rgb.g * lf * dl, cb = rgb.b * lf * dl;

                for (const [xo, yf, zo] of stepCorners[name]) {
                    positions.push(x + xo, yf ? topY : botY, z + zo);
                    normals.push(...normal);
                    colors.push(cr, cg, cb);
                }
                ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, [0, 0, 0, 0]);
                vertexOffset += 4;
            }
        });

        if (positions.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `water_${chunkData.chunkX}_${chunkData.chunkZ}`;
        return mesh;
    }

    /**
     * 水面の面が描画されるか判定（隣接が空気の場合のみ描画）
     * @private
     */
    _isWaterFaceVisible(chunkData, x, y, z, faceName, neighborChunks) {
        const { dx, dy, dz } = ChunkMeshBuilder.FACES[faceName];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0) return false;
        if (ny >= ChunkData.SIZE_Y) return true;
        const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, ny, nz, neighborChunks);
        if (!loc) return false;
        const neighbor = loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ);
        return neighbor === 'air' || neighbor === null;
    }

    /**
     * カスタムブロックかどうか判定（キャッシュ付き）
     * @param {string} blockStrId
     * @returns {boolean}
     */
    _isCustomBlock(blockStrId) {
        if (!this._customBlockIds) {
            this._customBlockIds = new Set();
            if (this.textureLoader && this.textureLoader.blocks) {
                for (const block of this.textureLoader.blocks) {
                    if (block.shape_type === 'custom') {
                        this._customBlockIds.add(block.block_str_id);
                    }
                }
            }
        }
        return this._customBlockIds.has(blockStrId);
    }

    /**
     * 面をカリングすべきか判定
     */
    _shouldCullFace(chunkData, x, y, z, faceName, neighborChunks) {
        const { dx, dy, dz } = ChunkMeshBuilder.FACES[faceName];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= ChunkData.SIZE_Y) return false;
        const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, ny, nz, neighborChunks);
        if (!loc) return false;
        const neighbor = loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ);
        // 水ブロック・カスタムブロックは透過扱い（面をカリングしない）
        if (neighbor === 'air' || neighbor === 'water' || neighbor === null) return false;
        if (this._isCustomBlock(neighbor)) return false;
        // ハーフブロック（shape='half'）は面を隠しきれないのでカリングしない
        if (typeof loc.chunk.getShape === 'function') {
            const nShape = loc.chunk.getShape(loc.localX, loc.localY, loc.localZ);
            if (nShape === 'half') {
                const neighborDef = this.textureLoader.getBlockDef(neighbor);
                if (neighborDef && neighborDef.half_placeable) return false;
            }
        }
        return true;
    }

    /**
     * 側面ハーフのテクスチャ面リマップ（物理面→テクスチャ面）
     * ブロックの底面が設置面に向く回転に対応
     */
    // orient(0-23) のテクスチャ面リマップ（ORIENTATION_MATRICES から自動生成）
    // orient = topDir × 4 + rotation
    // 物理面 → テクスチャ面（回転後の物理面にどの元テクスチャを表示するか）
    static _OrientableTexRemap = (() => {
        const faceNames = ['top', 'bottom', 'front', 'back', 'right', 'left'];
        const faceNormals = {
            top: [0, 1, 0], bottom: [0, -1, 0],
            front: [0, 0, -1], back: [0, 0, 1],
            right: [1, 0, 0], left: [-1, 0, 0],
        };
        const remap = {};
        const matrices = ChunkMeshBuilder.ORIENTATION_MATRICES;
        for (let orient = 1; orient < 24; orient++) {
            const m = matrices[orient];
            if (!m) continue;
            const mapping = {};
            for (const origFace of faceNames) {
                const n = faceNormals[origFace];
                const rx = Math.round(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]);
                const ry = Math.round(m[3] * n[0] + m[4] * n[1] + m[5] * n[2]);
                const rz = Math.round(m[6] * n[0] + m[7] * n[1] + m[8] * n[2]);
                for (const physFace of faceNames) {
                    const pn = faceNormals[physFace];
                    if (pn[0] === rx && pn[1] === ry && pn[2] === rz) {
                        mapping[physFace] = origFace;
                        break;
                    }
                }
            }
            remap[orient] = mapping;
        }
        return remap;
    })();

    static _SideHalfTexRemap = {
        // orientation 3: 南付き(-Z) Rx(+90°)
        3: { top: 'front', bottom: 'back', front: 'bottom', back: 'top', left: 'left', right: 'right' },
        // orientation 4: 北付き(+Z) Rx(-90°)
        4: { top: 'back', bottom: 'front', front: 'top', back: 'bottom', left: 'left', right: 'right' },
        // orientation 5: 西付き(-X) Rz(-90°)
        5: { top: 'left', bottom: 'right', front: 'front', back: 'back', left: 'bottom', right: 'top' },
        // orientation 6: 東付き(+X) Rz(+90°)
        6: { top: 'right', bottom: 'left', front: 'front', back: 'back', left: 'top', right: 'bottom' },
    };

    /**
     * ハーフブロック（orientation 1-6）の個別メッシュ生成
     */
    _buildHalfBlockAtlas(bx, by, bz, orientation, blockStrId, chunkData, neighborChunks, positions, normals, uvs, atlasInfos, lightLevels, aoLevelsArr, indices, vertexOffset) {
        // orientation に応じた AABB 範囲
        let xMin = bx, xMax = bx + 1, yMin = by, yMax = by + 1, zMin = bz, zMax = bz + 1;
        switch (orientation) {
            case 1: yMax = by + 0.5; break;      // 下ハーフ
            case 2: yMin = by + 0.5; break;      // 上ハーフ
            case 3: zMax = bz + 0.5; break;      // 南付き(-Z)
            case 4: zMin = bz + 0.5; break;      // 北付き(+Z)
            case 5: xMax = bx + 0.5; break;      // 西付き(-X)
            case 6: xMin = bx + 0.5; break;      // 東付き(+X)
        }

        // 6面の定義（外向き法線・頂点順: 時計回り）
        const halfFacesDef = [
            { name: 'top',    normal: [ 0, 1, 0], corners: [
                { x: xMin, y: yMax, z: zMax }, { x: xMax, y: yMax, z: zMax },
                { x: xMax, y: yMax, z: zMin }, { x: xMin, y: yMax, z: zMin }
            ]},
            { name: 'bottom', normal: [ 0,-1, 0], corners: [
                { x: xMin, y: yMin, z: zMin }, { x: xMax, y: yMin, z: zMin },
                { x: xMax, y: yMin, z: zMax }, { x: xMin, y: yMin, z: zMax }
            ]},
            { name: 'front',  normal: [ 0, 0,-1], corners: [
                { x: xMax, y: yMin, z: zMin }, { x: xMin, y: yMin, z: zMin },
                { x: xMin, y: yMax, z: zMin }, { x: xMax, y: yMax, z: zMin }
            ]},
            { name: 'back',   normal: [ 0, 0, 1], corners: [
                { x: xMin, y: yMin, z: zMax }, { x: xMax, y: yMin, z: zMax },
                { x: xMax, y: yMax, z: zMax }, { x: xMin, y: yMax, z: zMax }
            ]},
            { name: 'right',  normal: [ 1, 0, 0], corners: [
                { x: xMax, y: yMin, z: zMax }, { x: xMax, y: yMin, z: zMin },
                { x: xMax, y: yMax, z: zMin }, { x: xMax, y: yMax, z: zMax }
            ]},
            { name: 'left',   normal: [-1, 0, 0], corners: [
                { x: xMin, y: yMin, z: zMin }, { x: xMin, y: yMin, z: zMax },
                { x: xMin, y: yMax, z: zMax }, { x: xMin, y: yMax, z: zMin }
            ]},
        ];

        const texRemap = ChunkMeshBuilder._SideHalfTexRemap[orientation];
        for (const face of halfFacesDef) {
            if (this._shouldCullHalfFace(chunkData, bx, by, bz, face.name, neighborChunks)) continue;

            const texFace = texRemap ? texRemap[face.name] : face.name;
            const atlasUV = this.textureLoader.getAtlasUV(blockStrId, texFace);
            const light = this._getFaceLightLevel(chunkData, bx, by, bz, face.name, neighborChunks);
            const lf = ChunkMeshBuilder._lightFactor(light);

            for (const corner of face.corners) {
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...face.normal);
                atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                if (lightLevels) lightLevels.push(lf);
                if (aoLevelsArr) aoLevelsArr.push(1.0); // AOなし（初期実装）
            }

            // 薄い面（ハーフ方向に直交する面）はテクスチャの対応部分を切り出す
            let isThinFace = false;
            if (orientation <= 2) {
                isThinFace = face.name !== 'top' && face.name !== 'bottom';
            } else if (orientation <= 4) {
                isThinFace = face.name !== 'front' && face.name !== 'back';
            } else {
                isThinFace = face.name !== 'left' && face.name !== 'right';
            }
            if (isThinFace) {
                const vLo = orientation === 2 ? 0.5 : 0.0;
                const vHi = orientation === 2 ? 1.0 : 0.5;
                if (face.name === 'top' || face.name === 'bottom') {
                    uvs.push(0, vHi, 1, vHi, 1, vLo, 0, vLo);
                } else {
                    uvs.push(1, vLo, 0, vLo, 0, vHi, 1, vHi);
                }
            } else {
                this._addTilingUVs(uvs, face.name, 1, 1);
            }
            ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, [0, 0, 0, 0]);
            vertexOffset += 4;
        }

        return vertexOffset;
    }

    /**
     * ハーフブロックの面カリング判定
     * 完全な固体ブロック（half_placeable=false）に隣接する面のみカリング
     */
    _shouldCullHalfFace(chunkData, x, y, z, faceName, neighborChunks) {
        const { dx, dy, dz } = ChunkMeshBuilder.FACES[faceName];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= ChunkData.SIZE_Y) return false;
        const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, ny, nz, neighborChunks);
        if (!loc) return false;
        const neighbor = loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ);
        if (neighbor === 'air' || neighbor === 'water' || neighbor === null) return false;
        if (this._isCustomBlock(neighbor)) return false;
        // ハーフブロック同士はカリングしない（初期実装）
        const neighborDef = this.textureLoader.getBlockDef(neighbor);
        if (neighborDef && neighborDef.half_placeable) return false;
        return true;
    }

    /**
     * アトラスUV対応の通常メッシュ生成
     */
    _buildSimpleMeshAtlas(faces, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset, lightLevels, aoLevelsArr, textureFace, uvRot = 0) {
        for (const face of faces) {
            const corners = this._getFaceCorners(face.x, face.y, face.z, face.faceName, 1, 1);
            const faceInfo = ChunkMeshBuilder.FACES[face.faceName];

            // アトラスUV情報を取得（textureFace でリマップ対応）
            const atlasUV = this.textureLoader.getAtlasUV(blockStrId, textureFace || face.faceName);

            // ライトファクター
            const lf = ChunkMeshBuilder._lightFactor(face.light);

            // AO値
            const ao = face.ao || [0, 0, 0, 0];

            // 頂点追加
            for (let vi = 0; vi < corners.length; vi++) {
                const corner = corners[vi];
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...faceInfo.normal);
                atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                if (lightLevels) lightLevels.push(lf);
                if (aoLevelsArr) aoLevelsArr.push(ChunkMeshBuilder.AO_TABLE[ao[vi]]);
            }

            // UV追加（0-1の範囲、タイリングなし）
            this._addTilingUVs(uvs, face.faceName, 1, 1, uvRot);

            // インデックス追加（AO対角線フリップ対応）
            ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, ao);

            vertexOffset += 4;
        }

        return vertexOffset;
    }

    /**
     * 面の4頂点を取得（時計回り順、Z軸反転対応）
     * @param {number} x - ブロックX座標
     * @param {number} y - ブロックY座標
     * @param {number} z - ブロックZ座標
     * @param {string} faceName - 面名
     * @param {number} width - 幅
     * @param {number} height - 高さ
     * @returns {Array<{x: number, y: number, z: number}>} 4頂点の配列
     */
    _getFaceCorners(x, y, z, faceName, width, height, waterH = 1.0) {
        // 全ての面を時計回り（CW）で定義（Z軸反転対応）
        // waterH: 水位による上端高さ係数（1.0=満水、<1.0=減少）
        switch (faceName) {
            case 'front': { // 南（Z-）
                const topY = y + height - 1 + waterH;
                return [
                    { x: x + width, y: y, z: z },    // 右下
                    { x: x, y: y, z: z },             // 左下
                    { x: x, y: topY, z: z },          // 左上
                    { x: x + width, y: topY, z: z }   // 右上
                ];
            }
            case 'back': { // 北（Z+）
                const topY = y + height - 1 + waterH;
                return [
                    { x: x, y: y, z: z + 1 },               // 左下
                    { x: x + width, y: y, z: z + 1 },       // 右下
                    { x: x + width, y: topY, z: z + 1 },    // 右上
                    { x: x, y: topY, z: z + 1 }             // 左上
                ];
            }
            case 'top': // 上（Y+）
                return [
                    { x: x, y: y + waterH, z: z + height },         // 後左
                    { x: x + width, y: y + waterH, z: z + height }, // 後右
                    { x: x + width, y: y + waterH, z: z },          // 前右
                    { x: x, y: y + waterH, z: z }                   // 前左
                ];

            case 'bottom': // 下（Y-）
                return [
                    { x: x, y: y, z: z },                           // 前左
                    { x: x + width, y: y, z: z },                   // 前右
                    { x: x + width, y: y, z: z + height },          // 後右
                    { x: x, y: y, z: z + height }                   // 後左
                ];

            case 'right': { // 東（X+）
                const topY = y + width - 1 + waterH;
                return [
                    { x: x + 1, y: y, z: z + height },     // 後下
                    { x: x + 1, y: y, z: z },              // 前下
                    { x: x + 1, y: topY, z: z },           // 前上
                    { x: x + 1, y: topY, z: z + height }   // 後上
                ];
            }
            case 'left': { // 西（X-）
                const topY = y + width - 1 + waterH;
                return [
                    { x: x, y: y, z: z },               // 前下
                    { x: x, y: y, z: z + height },      // 後下
                    { x: x, y: topY, z: z + height },   // 後上
                    { x: x, y: topY, z: z }             // 前上
                ];
            }
        }
    }

    /**
     * アトラスUV対応のグリーディー・メッシング（単一方向）
     * カスタムシェーダーでfract()を使ってタイリングを実現
     * マージした面を1つのクワッドとして描画（頂点数削減）
     */
    _greedyMeshDirectionAtlas(faces, faceName, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset, lightLevels, aoLevelsArr, textureFace, uvRot = 0) {
        const faceInfo = ChunkMeshBuilder.FACES[faceName];

        // アトラスUV情報を取得（textureFace でリマップ対応）
        const atlasUV = this.textureLoader.getAtlasUV(blockStrId, textureFace || faceName);

        // 面の座標をスライスごとにグループ化
        const slices = new Map(); // depth -> Map of "u,v" -> cell

        for (const face of faces) {
            const { depth, u, v } = ChunkMeshBuilder._faceToGridCoords(faceName, face.x, face.y, face.z);

            if (!slices.has(depth)) {
                slices.set(depth, new Map());
            }
            const ao = face.ao || [0, 0, 0, 0];
            slices.get(depth).set(`${u},${v}`, {
                u, v, merged: false, light: face.light,
                ao, aoKey: ao.join(',')
            });
        }

        // 各スライスでグリーディー・メッシング
        for (const [depth, cells] of slices) {
            // 矩形を検出してマージ
            for (const [key, cell] of cells) {
                if (cell.merged) continue;

                // この点から始まる最大の矩形を見つける
                let width = 1;
                let height = 1;

                // 横方向に拡張（同じライトレベル・同じAOパターンのみマージ）
                while (cells.has(`${cell.u + width},${cell.v}`)) {
                    const next = cells.get(`${cell.u + width},${cell.v}`);
                    if (next.merged || next.light !== cell.light || next.aoKey !== cell.aoKey) break;
                    width++;
                }

                // 縦方向に拡張（同じライトレベル・同じAOパターンのみマージ）
                outer: while (true) {
                    for (let w = 0; w < width; w++) {
                        const checkKey = `${cell.u + w},${cell.v + height}`;
                        if (!cells.has(checkKey)) { break outer; }
                        const checkCell = cells.get(checkKey);
                        if (checkCell.merged || checkCell.light !== cell.light || checkCell.aoKey !== cell.aoKey) { break outer; }
                    }
                    height++;
                }

                // 矩形内のセルをマージ済みにする
                for (let dv = 0; dv < height; dv++) {
                    for (let du = 0; du < width; du++) {
                        const mergeKey = `${cell.u + du},${cell.v + dv}`;
                        if (cells.has(mergeKey)) {
                            cells.get(mergeKey).merged = true;
                        }
                    }
                }

                // メッシュを生成（1つのクワッドとして）
                const { x, y, z, meshWidth, meshHeight } = ChunkMeshBuilder._gridToMeshCoords(faceName, cell.u, cell.v, depth, width, height);

                // ライトファクター
                const lf = ChunkMeshBuilder._lightFactor(cell.light);

                // AO値
                const ao = cell.ao;

                // 頂点を追加（マージした面全体で1クワッド）
                const corners = this._getFaceCorners(x, y, z, faceName, meshWidth, meshHeight);
                for (let vi = 0; vi < corners.length; vi++) {
                    const corner = corners[vi];
                    positions.push(corner.x, corner.y, corner.z);
                    normals.push(...faceInfo.normal);
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    if (lightLevels) lightLevels.push(lf);
                    if (aoLevelsArr) aoLevelsArr.push(ChunkMeshBuilder.AO_TABLE[ao[vi]]);
                }

                // タイリングUV追加（タイル数分のUV座標: 0-width, 0-height）
                if (faceName === 'left' || faceName === 'right') {
                    this._addTilingUVs(uvs, faceName, meshHeight, meshWidth, uvRot);
                } else {
                    this._addTilingUVs(uvs, faceName, meshWidth, meshHeight, uvRot);
                }

                // インデックス追加（AO対角線フリップ対応）
                ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, ao);

                vertexOffset += 4;
            }
        }

        return vertexOffset;
    }

    /**
     * タイリング用UV座標を追加（0-N の範囲でシェーダーが fract() でタイリング）
     */
    _addTilingUVs(uvs, faceName, uScale, vScale, uvRot = 0) {
        if (faceName === 'top' || faceName === 'bottom') {
            const baseUVs = [[0, vScale], [uScale, vScale], [uScale, 0], [0, 0]];
            // top: front側をテクスチャ下端(v=0)に合わせるため+2のベースライン補正
            // bottom: デフォルトで既にfront=v=0なので補正不要
            const shift = faceName === 'top'
                ? (uvRot + 2) % 4
                : (4 - uvRot) % 4;
            for (let i = 0; i < 4; i++) {
                const uv = baseUVs[(i + shift) % 4];
                uvs.push(uv[0], uv[1]);
            }
        } else {
            // front, back, right, left はすべて同じUVパターン
            uvs.push(
                uScale, 0,
                0, 0,
                0, vScale,
                uScale, vScale
            );
        }
    }

    /**
     * LoD 1用メッシュを生成（頂点カラー、カスタムブロック→標準形状）
     * @param {ChunkData} chunkData - チャンクデータ
     * @param {Object} blockColors - ブロックID→色のマップ {"stone": "#808080", ...}
     * @param {Object} blockShapes - ブロックID→shape_typeのマップ {"stone": "normal", "custom1": "custom", ...}
     * @param {boolean} greedy - グリーディーメッシング有効化
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク (オプション)
     * @returns {THREE.Mesh} 生成されたメッシュ
     */
    buildLoD1(chunkData, blockColors, blockShapes, greedy = true, neighborChunks = null) {
        const positions = [];
        const normals = [];
        const colors = [];
        const indices = [];

        // ブロックID + 面名 + 色ごとにグループ化（グリーディーメッシング用）
        const blockFacesMap = new Map();

        // 全ブロックを走査
        chunkData.forEachBlock((x, y, z, blockStrId) => {
            if (blockStrId === 'air' || blockStrId === 'water') return;

            // ブロックの色を取得（面ごとの色に対応）
            const blockColorData = blockColors[blockStrId];
            const defaultColor = '#808080';

            // 各面をチェック
            for (const [faceName, faceInfo] of Object.entries(ChunkMeshBuilder.FACES)) {
                // チャンク最下(y=0)の底面は常にカリング
                if (faceName === 'bottom' && y === 0) continue;

                // カリング判定
                if (this._shouldCullFace(chunkData, x, y, z, faceName, neighborChunks)) {
                    continue;
                }

                // 面ごとの色を取得（オブジェクト形式または文字列形式に対応）
                let color;
                if (typeof blockColorData === 'object' && blockColorData !== null) {
                    color = blockColorData[faceName] || defaultColor;
                } else {
                    color = blockColorData || defaultColor;
                }

                // 代表色 #000001 の面はLoD1でメッシュ生成しない
                if (color === '#000001') continue;

                // AO計算（設定に応じて）
                const ao = this.lod1AoEnabled
                    ? this._getVertexAO(chunkData, x, y, z, faceName, neighborChunks)
                    : [0, 0, 0, 0];
                const aoKey = this.lod1AoEnabled ? ao.join(',') : '';

                // ライトマップ（設定に応じて）
                const light = this.lod1LightEnabled
                    ? this._getFaceLightLevel(chunkData, x, y, z, faceName, neighborChunks)
                    : undefined;
                const lightFactor = ChunkMeshBuilder._lightFactor(light);

                // 面を追加（色 + 面名 + ライト + AOでグループ化）
                const key = `${color}:${faceName}:${light !== undefined ? light : ''}:${aoKey}`;
                if (!blockFacesMap.has(key)) {
                    blockFacesMap.set(key, { color, faceName, lightFactor, ao, faces: [] });
                }
                blockFacesMap.get(key).faces.push({ x, y, z, faceName });
            }
        });

        // メッシュ生成
        let vertexOffset = 0;

        for (const [key, groupData] of blockFacesMap) {
            const { color, faceName, lightFactor, faces } = groupData;
            const faceInfo = ChunkMeshBuilder.FACES[faceName];

            if (greedy) {
                // グリーディー・メッシング（色別）
                vertexOffset = this._buildGreedyMeshLoD1(
                    faces, color, faceName, faceInfo, positions, normals, colors, indices, vertexOffset, lightFactor, groupData.ao
                );
            } else {
                // 通常のメッシュ生成
                const ao = groupData.ao || [0, 0, 0, 0];
                const dl = ChunkMeshBuilder._faceLightingFactor(faceInfo.normal);
                for (const face of faces) {
                    const corners = this._getFaceCorners(face.x, face.y, face.z, face.faceName, 1, 1);
                    const rgb = this._hexToRgb(color);
                    const lf = lightFactor || 1.0;

                    for (let vi = 0; vi < corners.length; vi++) {
                        const corner = corners[vi];
                        const af = ChunkMeshBuilder.AO_TABLE[ao[vi]] ?? 1.0;
                        positions.push(corner.x, corner.y, corner.z);
                        normals.push(...faceInfo.normal);
                        colors.push(rgb.r * lf * af * dl, rgb.g * lf * af * dl, rgb.b * lf * af * dl);
                    }

                    ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, ao);
                    vertexOffset += 4;
                }
            }
        }

        // ジオメトリ生成
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);

        // マテリアル（頂点カラー使用、ライトマップ・AOは頂点カラーに焼き込み済み）
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `chunk_${chunkData.chunkX}_${chunkData.chunkZ}`;

        return mesh;
    }

    /**
     * LoD 1用グリーディーメッシング
     */
    _buildGreedyMeshLoD1(faces, color, faceName, faceInfo, positions, normals, colors, indices, vertexOffset, lightFactor, ao) {
        // 面を2Dグリッドに変換
        const grid = this._facesToGrid(faces, faceName);

        // グリッドから矩形を検出してマージ
        const rectangles = this._findRectangles(grid, faces);

        const rgb = this._hexToRgb(color);
        const lf = lightFactor || 1.0;
        const faceAO = ao || [0, 0, 0, 0];

        // 各矩形をメッシュ化
        for (const rect of rectangles) {
            const { x, y, z, width, height, depth } = rect;

            // 面ごとの座標変換
            const { x: meshX, y: meshY, z: meshZ, meshWidth, meshHeight } = ChunkMeshBuilder._gridToMeshCoords(faceName, x, y, depth, width, height);

            // 頂点を追加（方向性ライティング×ライトファクター×AOを頂点カラーに乗算）
            const corners = this._getFaceCorners(meshX, meshY, meshZ, faceName, meshWidth, meshHeight);
            const dl = ChunkMeshBuilder._faceLightingFactor(faceInfo.normal);
            for (let vi = 0; vi < corners.length; vi++) {
                const corner = corners[vi];
                const af = ChunkMeshBuilder.AO_TABLE[faceAO[vi]] ?? 1.0;
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...faceInfo.normal);
                colors.push(rgb.r * lf * af * dl, rgb.g * lf * af * dl, rgb.b * lf * af * dl);
            }

            ChunkMeshBuilder._addQuadIndices(indices, vertexOffset, faceAO);
            vertexOffset += 4;
        }

        return vertexOffset;
    }

    /**
     * 面リストをグリッドに変換（グリーディーメッシング用）
     */
    _facesToGrid(faces, faceName) {
        const grid = new Map();

        for (const face of faces) {
            const { depth, u, v } = ChunkMeshBuilder._faceToGridCoords(faceName, face.x, face.y, face.z);

            const key = `${depth}`;
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push({ u, v, depth });
        }

        return grid;
    }

    /**
     * グリッドから矩形を検出
     */
    _findRectangles(grid, faces) {
        const rectangles = [];

        for (const [depthKey, cells] of grid) {
            const depth = parseInt(depthKey);

            // セルをマップ化
            const cellSet = new Set(cells.map(c => `${c.u},${c.v}`));
            const visited = new Set();

            for (const cell of cells) {
                const key = `${cell.u},${cell.v}`;
                if (visited.has(key)) continue;

                // 最大矩形を探索
                let maxWidth = 1;
                let maxHeight = 1;

                // 横方向に拡張（visited済みセルは含めない）
                while (true) {
                    const nextKey = `${cell.u + maxWidth},${cell.v}`;
                    if (!cellSet.has(nextKey) || visited.has(nextKey)) break;
                    maxWidth++;
                }

                // 縦方向に拡張（全幅で拡張可能、かつvisited済みでない場合のみ）
                outer: while (true) {
                    for (let dx = 0; dx < maxWidth; dx++) {
                        const checkKey = `${cell.u + dx},${cell.v + maxHeight}`;
                        if (!cellSet.has(checkKey) || visited.has(checkKey)) {
                            break outer;
                        }
                    }
                    maxHeight++;
                }

                // 矩形内のセルを訪問済みにする
                for (let dx = 0; dx < maxWidth; dx++) {
                    for (let dy = 0; dy < maxHeight; dy++) {
                        visited.add(`${cell.u + dx},${cell.v + dy}`);
                    }
                }

                rectangles.push({
                    x: cell.u,
                    y: cell.v,
                    z: depth,
                    width: maxWidth,
                    height: maxHeight,
                    depth: depth
                });
            }
        }

        return rectangles;
    }

    /**
     * 面の法線方向の隣接ブロックからライトレベルを取得
     * @param {ChunkData} chunkData
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @param {string} faceName - 面名
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク
     * @returns {number} ライトレベル（0〜15）
     */
    _getFaceLightLevel(chunkData, x, y, z, faceName, neighborChunks) {
        const { dx, dy, dz } = ChunkMeshBuilder.FACES[faceName];
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0) return 0;
        if (ny >= ChunkData.SIZE_Y) return 15;
        const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, ny, nz, neighborChunks);
        if (!loc) return 15;
        const light = loc.chunk.getLight(loc.localX, loc.localY, loc.localZ);

        // ハーフブロック（shape='half'）は固体扱いで光レベルが 0 になるため、
        // 上のブロックの光レベルとの最大値を使って面が真っ黒になるのを防ぐ。
        if (typeof loc.chunk.getShape === 'function' && ny + 1 < ChunkData.SIZE_Y) {
            const nShape = loc.chunk.getShape(loc.localX, loc.localY, loc.localZ);
            if (nShape === 'half') {
                const block = loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ);
                const blockDef = block ? this.textureLoader.getBlockDef(block) : null;
                if (blockDef && blockDef.half_placeable) {
                    const aboveLoc = ChunkMeshBuilder._resolveBlockLocation(chunkData, nx, ny + 1, nz, neighborChunks);
                    if (aboveLoc) {
                        return Math.max(light, aboveLoc.chunk.getLight(aboveLoc.localX, aboveLoc.localY, aboveLoc.localZ));
                    }
                }
            }
        }

        return light;
    }

    /**
     * 指定座標が不透過ブロックか判定
     * air, water 以外は不透過とみなす
     * @param {ChunkData} chunkData
     * @param {number} x - ローカルX座標
     * @param {number} y - Y座標
     * @param {number} z - ローカルZ座標
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク
     * @returns {boolean}
     */
    _isOpaqueAt(chunkData, x, y, z, neighborChunks) {
        if (y < 0) return true;
        if (y >= ChunkData.SIZE_Y) return false;
        const loc = ChunkMeshBuilder._resolveBlockLocation(chunkData, x, y, z, neighborChunks);
        if (!loc) return false;
        const block = loc.chunk.getBlock(loc.localX, loc.localY, loc.localZ);
        if (block === null || block === 'air' || block === 'water') return false;
        if (this._isCustomBlock(block)) return false;
        return true;
    }

    /**
     * 面の各頂点のAOレベルを計算
     * @param {ChunkData} chunkData
     * @param {number} x - ブロックX座標
     * @param {number} y - ブロックY座標
     * @param {number} z - ブロックZ座標
     * @param {string} faceName - 面名
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク
     * @returns {number[]} 各頂点のAOレベル（0〜3）の配列 [ao0, ao1, ao2, ao3]
     */
    _getVertexAO(chunkData, x, y, z, faceName, neighborChunks) {
        const offsets = ChunkMeshBuilder.AO_OFFSETS[faceName];
        const result = [];

        for (let vi = 0; vi < 4; vi++) {
            const [s1Off, s2Off, cOff] = offsets[vi];
            const side1 = this._isOpaqueAt(chunkData, x + s1Off[0], y + s1Off[1], z + s1Off[2], neighborChunks);
            const side2 = this._isOpaqueAt(chunkData, x + s2Off[0], y + s2Off[1], z + s2Off[2], neighborChunks);
            const corner = this._isOpaqueAt(chunkData, x + cOff[0], y + cOff[1], z + cOff[2], neighborChunks);

            if (side1 && side2) {
                result.push(3);
            } else {
                result.push((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
            }
        }

        return result;
    }

    /**
     * カスタムブロックの8x8x8ボクセルメッシュをアトラス属性付きで生成
     * グリーディメッシングで同一マテリアルの隣接ボクセル面をマージ
     * @param {Object} blockDef - ブロック定義
     * @param {number} bx - ブロックX座標（チャンクローカル）
     * @param {number} by - ブロックY座標
     * @param {number} bz - ブロックZ座標
     * @param {ChunkData} chunkData - チャンクデータ
     * @param {number[]} positions - 頂点座標配列
     * @param {number[]} normals - 法線配列
     * @param {number[]} uvs - UV座標配列
     * @param {number[]} atlasInfos - アトラス情報配列
     * @param {number[]} lightLevels - ライトレベル配列
     * @param {number[]} aoLevels - AOレベル配列
     * @param {number[]} indices - インデックス配列
     * @param {number} vertexOffset - 現在の頂点オフセット
     * @param {Map<string, ChunkData>} neighborChunks - 隣接チャンク
     * @returns {number} 更新された頂点オフセット
     */
    /**
     * カスタムブロックのマテリアル(1-3)のアトラスUV配列を準備
     * @param {Object} blockDef - ブロック定義
     * @returns {Array} 3要素のアトラスUV配列
     */
    _prepareCustomBlockMaterials(blockDef) {
        const matAtlasUVs = [null, null, null];
        for (let i = 0; i < 3; i++) {
            const texName = blockDef[`material_${i + 1}`];
            if (texName) {
                matAtlasUVs[i] = this.textureLoader.getAtlasUVByTexName(texName);
            }
        }
        const defaultUV = (blockDef.tex_default && this.textureLoader.getAtlasUVByTexName(blockDef.tex_default))
            || { offsetX: 0, offsetY: 0, scaleX: 1 / (this.textureLoader._atlasSize || 1), scaleY: 1 / (this.textureLoader._atlasSize || 1) };
        for (let i = 0; i < 3; i++) {
            if (!matAtlasUVs[i]) matAtlasUVs[i] = defaultUV;
        }
        return matAtlasUVs;
    }

    _buildCustomBlockVoxels(blockDef, bx, by, bz, chunkData, positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset, neighborChunks, orientation = 0) {
        const voxelDataBase64 = blockDef.voxel_look;
        if (!voxelDataBase64) return vertexOffset;

        const voxelData = VoxelData.decode(voxelDataBase64);
        const matAtlasUVs = this._prepareCustomBlockMaterials(blockDef);

        // 各面方向のライトレベルを取得（ブロックレベル）
        const faceLightFactors = {};
        for (const faceName of Object.keys(ChunkMeshBuilder.FACES)) {
            const light = this._getFaceLightLevel(chunkData, bx, by, bz, faceName, neighborChunks);
            faceLightFactors[faceName] = ChunkMeshBuilder._lightFactor(light);
        }

        const gs = 8;
        const faceConfigs = [
            { faceName: 'right',  axis: 0, u: 2, v: 1, offset: 1, normal: [1, 0, 0] },
            { faceName: 'left',   axis: 0, u: 2, v: 1, offset: 0, normal: [-1, 0, 0] },
            { faceName: 'top',    axis: 1, u: 0, v: 2, offset: 1, normal: [0, 1, 0] },
            { faceName: 'bottom', axis: 1, u: 0, v: 2, offset: 0, normal: [0, -1, 0] },
            { faceName: 'back',   axis: 2, u: 0, v: 1, offset: 1, normal: [0, 0, 1] },
            { faceName: 'front',  axis: 2, u: 0, v: 1, offset: 0, normal: [0, 0, -1] }
        ];
        const blockBase = [bx, by, bz];

        // orientation回転適用のため、メッシュ生成前の頂点数を記録
        const startVertexCount = positions.length / 3;

        for (const config of faceConfigs) {
            const lf = faceLightFactors[config.faceName];
            for (let d = 0; d < gs; d++) {
                const mask = this._buildVoxelFaceMask(voxelData, config, d, gs);
                vertexOffset = this._emitVoxelGreedyQuads(
                    mask, gs, matAtlasUVs, config, d, blockBase, lf,
                    positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset
                );
            }
        }

        // orientation回転適用（0以外の場合のみ）
        if (orientation !== 0) {
            const endVertexCount = positions.length / 3;
            this._applyOrientationToVertices(
                positions, normals, startVertexCount, endVertexCount,
                bx + 0.5, by + 0.5, bz + 0.5, orientation
            );
        }

        return vertexOffset;
    }

    /**
     * 生成済み頂点座標と法線にorientation回転を適用
     * @param {Array} positions - 頂点座標配列（フラット、xyz×N）
     * @param {Array} normals - 法線配列（フラット、xyz×N）
     * @param {number} startIdx - 開始頂点インデックス
     * @param {number} endIdx - 終了頂点インデックス（排他的）
     * @param {number} cx - 回転中心X（ブロック中心）
     * @param {number} cy - 回転中心Y（ブロック中心）
     * @param {number} cz - 回転中心Z（ブロック中心）
     * @param {number} orientation - 向き値（0〜23）
     */
    _applyOrientationToVertices(positions, normals, startIdx, endIdx, cx, cy, cz, orientation) {
        const m = ChunkMeshBuilder.ORIENTATION_MATRICES[orientation];
        if (!m) return;

        for (let i = startIdx; i < endIdx; i++) {
            const pi = i * 3;

            // 頂点座標: ブロック中心を原点として回転
            const dx = positions[pi]     - cx;
            const dy = positions[pi + 1] - cy;
            const dz = positions[pi + 2] - cz;
            positions[pi]     = cx + m[0] * dx + m[1] * dy + m[2] * dz;
            positions[pi + 1] = cy + m[3] * dx + m[4] * dy + m[5] * dz;
            positions[pi + 2] = cz + m[6] * dx + m[7] * dy + m[8] * dz;

            // 法線: 回転のみ（平行移動なし）
            const nx = normals[pi];
            const ny = normals[pi + 1];
            const nz = normals[pi + 2];
            normals[pi]     = m[0] * nx + m[1] * ny + m[2] * nz;
            normals[pi + 1] = m[3] * nx + m[4] * ny + m[5] * nz;
            normals[pi + 2] = m[6] * nx + m[7] * ny + m[8] * nz;
        }
    }

    /**
     * ボクセルの可視面マスクを構築
     * @param {Uint8Array} voxelData - デコード済みボクセルデータ
     * @param {Object} config - 面設定 {axis, u, v, offset}
     * @param {number} d - スライス深度
     * @param {number} gs - グリッドサイズ
     * @returns {Uint8Array} マテリアルインデックス+1を格納したマスク (0=面なし)
     */
    _buildVoxelFaceMask(voxelData, config, d, gs) {
        const { axis, u, v, offset } = config;
        const mask = new Uint8Array(gs * gs);

        for (let vPos = 0; vPos < gs; vPos++) {
            for (let uPos = 0; uPos < gs; uPos++) {
                const coord = [0, 0, 0];
                coord[axis] = d;
                coord[u] = uPos;
                coord[v] = vPos;

                const value = VoxelData.getVoxel(voxelData, coord[0], coord[1], coord[2]);
                if (value === 0) continue;

                // 隣接ボクセルチェック（グリッド内部のみ）
                const neighborD = offset === 1 ? d + 1 : d - 1;
                const hasNeighbor = neighborD >= 0 && neighborD < gs && (() => {
                    const nc = [...coord];
                    nc[axis] = neighborD;
                    return VoxelData.getVoxel(voxelData, nc[0], nc[1], nc[2]) !== 0;
                })();

                if (!hasNeighbor) {
                    mask[vPos * gs + uPos] = value;
                }
            }
        }

        return mask;
    }

    /**
     * マスクからグリーディマージしてクアッドを出力
     * @returns {number} 更新後の vertexOffset
     */
    _emitVoxelGreedyQuads(mask, gs, matAtlasUVs, config, d, blockBase, lf, positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices, vertexOffset) {
        const { faceName, axis, u, v, offset, normal } = config;
        const vs = 1 / gs;

        for (let vPos = 0; vPos < gs; vPos++) {
            for (let uPos = 0; uPos < gs; uPos++) {
                const matValue = mask[vPos * gs + uPos];
                if (matValue === 0) continue;

                const atlasUV = matAtlasUVs[matValue - 1];

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

                // 面の位置（ボクセルグリッド座標）
                const facePos = d + offset;
                const u0 = uPos, u1 = uPos + width;
                const v0 = vPos, v1 = vPos + height;

                // 4頂点をワールドローカル座標に変換
                const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];

                for (const [cu, cv] of corners) {
                    const pos = [0, 0, 0];
                    pos[axis] = blockBase[axis] + facePos * vs;
                    pos[u] = blockBase[u] + cu * vs;
                    pos[v] = blockBase[v] + cv * vs;

                    positions.push(pos[0], pos[1], pos[2]);
                    normals.push(normal[0], normal[1], normal[2]);
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                    lightLevels.push(lf);
                    aoLevels.push(1.0);
                }

                // UV座標
                const cellSize = 1 / gs;
                const uSize = width * cellSize;
                const vSize = height * cellSize;
                uvs.push(0, 0, uSize, 0, 0, vSize, uSize, vSize);

                // インデックス（面方向に応じたワインディング）
                const vb = vertexOffset;
                if (faceName === 'right' || faceName === 'top') {
                    indices.push(vb, vb + 2, vb + 1, vb + 2, vb + 3, vb + 1);
                } else if (faceName === 'left' || faceName === 'bottom') {
                    indices.push(vb, vb + 1, vb + 2, vb + 2, vb + 1, vb + 3);
                } else if (faceName === 'back') {
                    indices.push(vb, vb + 1, vb + 2, vb + 2, vb + 1, vb + 3);
                } else {
                    indices.push(vb, vb + 2, vb + 1, vb + 2, vb + 3, vb + 1);
                }

                vertexOffset += 4;
            }
        }

        return vertexOffset;
    }

    /**
     * 16進数カラーをRGBに変換
     */
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255
            };
        }
        return { r: 0.5, g: 0.5, b: 0.5 };
    }
}

// グローバルスコープに公開
window.ChunkMeshBuilder = ChunkMeshBuilder;
