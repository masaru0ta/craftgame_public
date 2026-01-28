/**
 * ChunkMeshBuilder - チャンクメッシュ生成クラス
 * 左手座標系対応、面カリング、グリーディー・メッシング機能を持つ
 */
class ChunkMeshBuilder {
    // 面の方向定義（左手座標系）
    static FACES = {
        right:  { axis: 'x', dir:  1, normal: [ 1,  0,  0] }, // 東（X+）
        left:   { axis: 'x', dir: -1, normal: [-1,  0,  0] }, // 西（X-）
        top:    { axis: 'y', dir:  1, normal: [ 0,  1,  0] }, // 上（Y+）
        bottom: { axis: 'y', dir: -1, normal: [ 0, -1,  0] }, // 下（Y-）
        front:  { axis: 'z', dir: -1, normal: [ 0,  0, -1] }, // 南（Z-）
        back:   { axis: 'z', dir:  1, normal: [ 0,  0,  1] }  // 北（Z+）
    };

    /**
     * @param {TextureLoader} textureLoader - テクスチャローダー
     */
    constructor(textureLoader) {
        this.textureLoader = textureLoader;
    }

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
        // アトラスモードで生成
        return this._buildWithAtlas(chunkData, mode, greedy, neighborChunks);
    }

    /**
     * アトラスを使用したメッシュ生成（1マテリアル）
     */
    _buildWithAtlas(chunkData, mode, greedy, neighborChunks) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = []; // 頂点属性: vec4(offsetX, offsetY, scaleX, scaleY)
        const indices = [];

        // ブロックID + 面名ごとにグループ化（グリーディーメッシング用）
        const blockFacesMap = new Map(); // "blockStrId:faceName" -> faces[]

        // 全ブロックを走査
        chunkData.forEachBlock((x, y, z, blockStrId) => {
            if (blockStrId === 'air') return;

            // カスタムブロックはスキップ（別途処理される）
            const blockDef = this.textureLoader.getBlockDef(blockStrId);
            if (blockDef && blockDef.shape_type === 'custom') return;

            // 各面をチェック
            for (const [faceName, faceInfo] of Object.entries(ChunkMeshBuilder.FACES)) {
                // y=0の底面は常にカリング
                if (faceName === 'bottom' && y === 0) continue;

                // カリング判定
                if (mode === 'CULLED') {
                    if (this._shouldCullFace(chunkData, x, y, z, faceName, neighborChunks)) {
                        continue;
                    }
                }

                // 面を追加（ブロックID + 面名でグループ化）
                const key = `${blockStrId}:${faceName}`;
                if (!blockFacesMap.has(key)) {
                    blockFacesMap.set(key, { blockStrId, faceName, faces: [] });
                }
                blockFacesMap.get(key).faces.push({ x, y, z, faceName });
            }
        });

        // メッシュ生成
        let vertexOffset = 0;

        for (const [key, groupData] of blockFacesMap) {
            const { blockStrId, faceName, faces } = groupData;

            if (greedy) {
                // グリーディー・メッシング（アトラスUV対応、タイリングシェーダー使用）
                vertexOffset = this._buildGreedyMeshAtlas(
                    faces, blockStrId, faceName, positions, normals, uvs, atlasInfos, indices, vertexOffset
                );
            } else {
                // 通常のメッシュ生成（アトラスUV対応）
                vertexOffset = this._buildSimpleMeshAtlas(
                    faces, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset
                );
            }
        }

        // ジオメトリ作成
        const geometry = new THREE.BufferGeometry();

        if (positions.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setAttribute('atlasInfo', new THREE.Float32BufferAttribute(atlasInfos, 4));
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
     * 面をカリングすべきか判定
     */
    _shouldCullFace(chunkData, x, y, z, faceName, neighborChunks) {
        const faceInfo = ChunkMeshBuilder.FACES[faceName];
        let nx = x, ny = y, nz = z;

        // 隣接座標を計算
        switch (faceInfo.axis) {
            case 'x': nx += faceInfo.dir; break;
            case 'y': ny += faceInfo.dir; break;
            case 'z': nz += faceInfo.dir; break;
        }

        // チャンク範囲内
        if (nx >= 0 && nx < ChunkData.SIZE_X &&
            ny >= 0 && ny < ChunkData.SIZE_Y &&
            nz >= 0 && nz < ChunkData.SIZE_Z) {
            const neighbor = chunkData.getBlock(nx, ny, nz);
            return neighbor !== 'air' && neighbor !== null;
        }

        // 隣接チャンクを参照
        if (neighborChunks) {
            let targetChunk = null;
            let localX = nx, localZ = nz;

            if (nx < 0) {
                targetChunk = neighborChunks.get(`${chunkData.chunkX - 1},${chunkData.chunkZ}`);
                localX = ChunkData.SIZE_X - 1;
            } else if (nx >= ChunkData.SIZE_X) {
                targetChunk = neighborChunks.get(`${chunkData.chunkX + 1},${chunkData.chunkZ}`);
                localX = 0;
            } else if (nz < 0) {
                targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ - 1}`);
                localZ = ChunkData.SIZE_Z - 1;
            } else if (nz >= ChunkData.SIZE_Z) {
                targetChunk = neighborChunks.get(`${chunkData.chunkX},${chunkData.chunkZ + 1}`);
                localZ = 0;
            }

            if (targetChunk) {
                const neighbor = targetChunk.getBlock(localX, ny, localZ);
                return neighbor !== 'air' && neighbor !== null;
            }
        }

        return false;
    }

    /**
     * 通常のメッシュ生成（1面1クワッド）
     */
    _buildSimpleMesh(faces, blockStrId, positions, normals, uvs, indices, vertexOffset) {
        for (const face of faces) {
            const corners = this._getFaceCorners(face.x, face.y, face.z, face.faceName, 1, 1);
            const faceInfo = ChunkMeshBuilder.FACES[face.faceName];

            // 頂点追加
            for (const corner of corners) {
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...faceInfo.normal);
            }

            // UV追加
            this._addUVs(uvs, face.faceName, 1, 1);

            // インデックス追加（2つの三角形）
            indices.push(
                vertexOffset, vertexOffset + 1, vertexOffset + 2,
                vertexOffset, vertexOffset + 2, vertexOffset + 3
            );

            vertexOffset += 4;
        }

        return vertexOffset;
    }

    /**
     * アトラスUV対応の通常メッシュ生成
     */
    _buildSimpleMeshAtlas(faces, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        for (const face of faces) {
            const corners = this._getFaceCorners(face.x, face.y, face.z, face.faceName, 1, 1);
            const faceInfo = ChunkMeshBuilder.FACES[face.faceName];

            // アトラスUV情報を取得
            const atlasUV = this.textureLoader.getAtlasUV(blockStrId, face.faceName);

            // 頂点追加
            for (const corner of corners) {
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...faceInfo.normal);
                // atlasInfo: offsetX, offsetY, scaleX, scaleY
                atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
            }

            // UV追加（0-1の範囲、タイリングなし）
            this._addTilingUVs(uvs, face.faceName, 1, 1);

            // インデックス追加（2つの三角形）
            indices.push(
                vertexOffset, vertexOffset + 1, vertexOffset + 2,
                vertexOffset, vertexOffset + 2, vertexOffset + 3
            );

            vertexOffset += 4;
        }

        return vertexOffset;
    }

    /**
     * グリーディー・メッシング
     */
    _buildGreedyMesh(faces, blockStrId, positions, normals, uvs, indices, vertexOffset) {
        // 面を方向ごとにグループ化
        const facesByDir = new Map();
        for (const face of faces) {
            if (!facesByDir.has(face.faceName)) {
                facesByDir.set(face.faceName, []);
            }
            facesByDir.get(face.faceName).push(face);
        }

        // 各方向ごとにグリーディー・メッシング
        for (const [faceName, dirFaces] of facesByDir) {
            vertexOffset = this._greedyMeshDirection(
                dirFaces, faceName, blockStrId,
                positions, normals, uvs, indices, vertexOffset
            );
        }

        return vertexOffset;
    }

    /**
     * アトラスUV対応のグリーディー・メッシング
     */
    _buildGreedyMeshAtlas(faces, blockStrId, faceName, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        return this._greedyMeshDirectionAtlas(
            faces, faceName, blockStrId,
            positions, normals, uvs, atlasInfos, indices, vertexOffset
        );
    }

    /**
     * 1方向のグリーディー・メッシング
     */
    _greedyMeshDirection(faces, faceName, blockStrId, positions, normals, uvs, indices, vertexOffset) {
        const faceInfo = ChunkMeshBuilder.FACES[faceName];

        // 面の座標をスライスごとにグループ化
        const slices = new Map(); // depth -> Set of "u,v"

        for (const face of faces) {
            let depth, u, v;

            switch (faceName) {
                case 'top':
                case 'bottom':
                    depth = face.y;
                    u = face.x;
                    v = face.z;
                    break;
                case 'front':
                case 'back':
                    depth = face.z;
                    u = face.x;
                    v = face.y;
                    break;
                case 'left':
                case 'right':
                    depth = face.x;
                    u = face.y;
                    v = face.z;
                    break;
            }

            if (!slices.has(depth)) {
                slices.set(depth, new Map());
            }
            slices.get(depth).set(`${u},${v}`, { u, v, merged: false });
        }

        // 各スライスでグリーディー・メッシング
        for (const [depth, cells] of slices) {
            // 矩形を検出してマージ
            for (const [key, cell] of cells) {
                if (cell.merged) continue;

                // この点から始まる最大の矩形を見つける
                let width = 1;
                let height = 1;

                // 横方向に拡張
                while (cells.has(`${cell.u + width},${cell.v}`)) {
                    const next = cells.get(`${cell.u + width},${cell.v}`);
                    if (next.merged) break;
                    width++;
                }

                // 縦方向に拡張
                outer: while (true) {
                    for (let w = 0; w < width; w++) {
                        const checkKey = `${cell.u + w},${cell.v + height}`;
                        if (!cells.has(checkKey) || cells.get(checkKey).merged) {
                            break outer;
                        }
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

                // メッシュを生成
                let x, y, z, meshWidth, meshHeight;

                switch (faceName) {
                    case 'top':
                    case 'bottom':
                        x = cell.u;
                        y = depth;
                        z = cell.v;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                    case 'front':
                    case 'back':
                        x = cell.u;
                        y = cell.v;
                        z = depth;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                    case 'left':
                    case 'right':
                        x = depth;
                        y = cell.u;
                        z = cell.v;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                }

                // 頂点を追加
                const corners = this._getFaceCorners(x, y, z, faceName, meshWidth, meshHeight);
                for (const corner of corners) {
                    positions.push(corner.x, corner.y, corner.z);
                    normals.push(...faceInfo.normal);
                }

                // UV追加（X面はwidth/heightを入れ替え）
                if (faceName === 'left' || faceName === 'right') {
                    this._addUVs(uvs, faceName, meshHeight, meshWidth);
                } else {
                    this._addUVs(uvs, faceName, meshWidth, meshHeight);
                }

                // インデックス追加
                indices.push(
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset, vertexOffset + 2, vertexOffset + 3
                );

                vertexOffset += 4;
            }
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
    _getFaceCorners(x, y, z, faceName, width, height) {
        // 全ての面を時計回り（CW）で定義（Z軸反転対応）
        switch (faceName) {
            case 'front': // 南（Z-）
                return [
                    { x: x + width, y: y, z: z },           // 右下
                    { x: x, y: y, z: z },                   // 左下
                    { x: x, y: y + height, z: z },          // 左上
                    { x: x + width, y: y + height, z: z }   // 右上
                ];

            case 'back': // 北（Z+）
                return [
                    { x: x, y: y, z: z + 1 },                       // 左下
                    { x: x + width, y: y, z: z + 1 },               // 右下
                    { x: x + width, y: y + height, z: z + 1 },      // 右上
                    { x: x, y: y + height, z: z + 1 }               // 左上
                ];

            case 'top': // 上（Y+）
                return [
                    { x: x, y: y + 1, z: z + height },              // 後左
                    { x: x + width, y: y + 1, z: z + height },      // 後右
                    { x: x + width, y: y + 1, z: z },               // 前右
                    { x: x, y: y + 1, z: z }                        // 前左
                ];

            case 'bottom': // 下（Y-）
                return [
                    { x: x, y: y, z: z },                           // 前左
                    { x: x + width, y: y, z: z },                   // 前右
                    { x: x + width, y: y, z: z + height },          // 後右
                    { x: x, y: y, z: z + height }                   // 後左
                ];

            case 'right': // 東（X+）
                return [
                    { x: x + 1, y: y, z: z + height },              // 後下
                    { x: x + 1, y: y, z: z },                       // 前下
                    { x: x + 1, y: y + width, z: z },               // 前上
                    { x: x + 1, y: y + width, z: z + height }       // 後上
                ];

            case 'left': // 西（X-）
                return [
                    { x: x, y: y, z: z },                           // 前下
                    { x: x, y: y, z: z + height },                  // 後下
                    { x: x, y: y + width, z: z + height },          // 後上
                    { x: x, y: y + width, z: z }                    // 前上
                ];
        }
    }

    /**
     * UV座標を追加（Z軸反転補正済み）
     * 頂点順序: _getFaceCorners で定義した 0,1,2,3 の順
     * @param {number[]} uvs - UV配列
     * @param {string} faceName - 面名
     * @param {number} uScale - Uスケール（グリーディー時のタイル数）
     * @param {number} vScale - Vスケール（グリーディー時のタイル数）
     */
    _addUVs(uvs, faceName, uScale, vScale) {
        // 左手座標系（Z軸反転）でのUV配置
        // 各面の頂点順序に合わせてUVを設定
        switch (faceName) {
            case 'front': // 頂点: 右下→左下→左上→右上
                uvs.push(
                    uScale, 0,      // 頂点0: 右下
                    0, 0,           // 頂点1: 左下
                    0, vScale,      // 頂点2: 左上
                    uScale, vScale  // 頂点3: 右上
                );
                break;
            case 'back': // 頂点: 左下→右下→右上→左上（U反転で左右反転補正）
                uvs.push(
                    uScale, 0,      // 頂点0: 左下 → U反転
                    0, 0,           // 頂点1: 右下 → U反転
                    0, vScale,      // 頂点2: 右上 → U反転
                    uScale, vScale  // 頂点3: 左上 → U反転
                );
                break;
            case 'right': // 頂点: 後下→前下→前上→後上
                uvs.push(
                    uScale, 0,      // 頂点0: 後下
                    0, 0,           // 頂点1: 前下
                    0, vScale,      // 頂点2: 前上
                    uScale, vScale  // 頂点3: 後上
                );
                break;
            case 'left': // 頂点: 前下→後下→後上→前上（U反転で左右反転補正）
                uvs.push(
                    uScale, 0,      // 頂点0: 前下 → U反転
                    0, 0,           // 頂点1: 後下 → U反転
                    0, vScale,      // 頂点2: 後上 → U反転
                    uScale, vScale  // 頂点3: 前上 → U反転
                );
                break;
            case 'top': // 頂点: 後左→後右→前右→前左（V反転で上下反転補正）
                uvs.push(
                    0, vScale,      // 頂点0: 後左 → V反転
                    uScale, vScale, // 頂点1: 後右 → V反転
                    uScale, 0,      // 頂点2: 前右 → V反転
                    0, 0            // 頂点3: 前左 → V反転
                );
                break;
            case 'bottom': // 頂点: 前左→前右→後右→後左
                uvs.push(
                    0, vScale,      // 頂点0: 前左
                    uScale, vScale, // 頂点1: 前右
                    uScale, 0,      // 頂点2: 後右
                    0, 0            // 頂点3: 後左
                );
                break;
        }
    }

    /**
     * アトラスUV座標を追加
     * @param {number[]} uvs - UV配列
     * @param {string} blockStrId - ブロックID
     * @param {string} faceName - 面名
     * @param {number} uTiles - Uタイル数（グリーディー時）
     * @param {number} vTiles - Vタイル数（グリーディー時）
     */
    _addAtlasUVs(uvs, blockStrId, faceName, uTiles, vTiles) {
        const atlasUV = this.textureLoader.getAtlasUV(blockStrId, faceName);
        const { offsetX, offsetY, scaleX, scaleY } = atlasUV;

        // アトラス内のUV座標を計算
        // scaleXとscaleYは1テクスチャ分のサイズ
        const u0 = offsetX;
        const v0 = offsetY;
        const u1 = offsetX + scaleX;
        const v1 = offsetY + scaleY;

        // 各面の頂点順序に合わせてUVを設定
        switch (faceName) {
            case 'front': // 頂点: 右下→左下→左上→右上
                uvs.push(
                    u1, v0,     // 頂点0: 右下
                    u0, v0,     // 頂点1: 左下
                    u0, v1,     // 頂点2: 左上
                    u1, v1      // 頂点3: 右上
                );
                break;
            case 'back': // 頂点: 左下→右下→右上→左上
                uvs.push(
                    u1, v0,     // 頂点0
                    u0, v0,     // 頂点1
                    u0, v1,     // 頂点2
                    u1, v1      // 頂点3
                );
                break;
            case 'right': // 頂点: 後下→前下→前上→後上
                uvs.push(
                    u1, v0,     // 頂点0
                    u0, v0,     // 頂点1
                    u0, v1,     // 頂点2
                    u1, v1      // 頂点3
                );
                break;
            case 'left': // 頂点: 前下→後下→後上→前上
                uvs.push(
                    u1, v0,     // 頂点0
                    u0, v0,     // 頂点1
                    u0, v1,     // 頂点2
                    u1, v1      // 頂点3
                );
                break;
            case 'top': // 頂点: 後左→後右→前右→前左
                uvs.push(
                    u0, v1,     // 頂点0
                    u1, v1,     // 頂点1
                    u1, v0,     // 頂点2
                    u0, v0      // 頂点3
                );
                break;
            case 'bottom': // 頂点: 前左→前右→後右→後左
                uvs.push(
                    u0, v1,     // 頂点0
                    u1, v1,     // 頂点1
                    u1, v0,     // 頂点2
                    u0, v0      // 頂点3
                );
                break;
        }
    }

    /**
     * アトラスUV対応のグリーディー・メッシング（単一方向）
     * カスタムシェーダーでfract()を使ってタイリングを実現
     * マージした面を1つのクワッドとして描画（頂点数削減）
     */
    _greedyMeshDirectionAtlas(faces, faceName, blockStrId, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const faceInfo = ChunkMeshBuilder.FACES[faceName];

        // アトラスUV情報を取得
        const atlasUV = this.textureLoader.getAtlasUV(blockStrId, faceName);

        // 面の座標をスライスごとにグループ化
        const slices = new Map(); // depth -> Set of "u,v"

        for (const face of faces) {
            let depth, u, v;

            switch (faceName) {
                case 'top':
                case 'bottom':
                    depth = face.y;
                    u = face.x;
                    v = face.z;
                    break;
                case 'front':
                case 'back':
                    depth = face.z;
                    u = face.x;
                    v = face.y;
                    break;
                case 'left':
                case 'right':
                    depth = face.x;
                    u = face.y;
                    v = face.z;
                    break;
            }

            if (!slices.has(depth)) {
                slices.set(depth, new Map());
            }
            slices.get(depth).set(`${u},${v}`, { u, v, merged: false });
        }

        // 各スライスでグリーディー・メッシング
        for (const [depth, cells] of slices) {
            // 矩形を検出してマージ
            for (const [key, cell] of cells) {
                if (cell.merged) continue;

                // この点から始まる最大の矩形を見つける
                let width = 1;
                let height = 1;

                // 横方向に拡張
                while (cells.has(`${cell.u + width},${cell.v}`)) {
                    const next = cells.get(`${cell.u + width},${cell.v}`);
                    if (next.merged) break;
                    width++;
                }

                // 縦方向に拡張
                outer: while (true) {
                    for (let w = 0; w < width; w++) {
                        const checkKey = `${cell.u + w},${cell.v + height}`;
                        if (!cells.has(checkKey) || cells.get(checkKey).merged) {
                            break outer;
                        }
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
                let x, y, z, meshWidth, meshHeight;

                switch (faceName) {
                    case 'top':
                    case 'bottom':
                        x = cell.u;
                        y = depth;
                        z = cell.v;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                    case 'front':
                    case 'back':
                        x = cell.u;
                        y = cell.v;
                        z = depth;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                    case 'left':
                    case 'right':
                        x = depth;
                        y = cell.u;
                        z = cell.v;
                        meshWidth = width;
                        meshHeight = height;
                        break;
                }

                // 頂点を追加（マージした面全体で1クワッド）
                const corners = this._getFaceCorners(x, y, z, faceName, meshWidth, meshHeight);
                for (const corner of corners) {
                    positions.push(corner.x, corner.y, corner.z);
                    normals.push(...faceInfo.normal);
                    // atlasInfo: offsetX, offsetY, scaleX, scaleY
                    atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                }

                // タイリングUV追加（タイル数分のUV座標: 0-width, 0-height）
                // シェーダーで fract() を使ってタイリング
                if (faceName === 'left' || faceName === 'right') {
                    this._addTilingUVs(uvs, faceName, meshHeight, meshWidth);
                } else {
                    this._addTilingUVs(uvs, faceName, meshWidth, meshHeight);
                }

                // インデックス追加
                indices.push(
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset, vertexOffset + 2, vertexOffset + 3
                );

                vertexOffset += 4;
            }
        }

        return vertexOffset;
    }

    /**
     * タイリング用UV座標を追加（0-N の範囲でシェーダーが fract() でタイリング）
     */
    _addTilingUVs(uvs, faceName, uScale, vScale) {
        switch (faceName) {
            case 'front':
                uvs.push(
                    uScale, 0,
                    0, 0,
                    0, vScale,
                    uScale, vScale
                );
                break;
            case 'back':
                uvs.push(
                    uScale, 0,
                    0, 0,
                    0, vScale,
                    uScale, vScale
                );
                break;
            case 'right':
                uvs.push(
                    uScale, 0,
                    0, 0,
                    0, vScale,
                    uScale, vScale
                );
                break;
            case 'left':
                uvs.push(
                    uScale, 0,
                    0, 0,
                    0, vScale,
                    uScale, vScale
                );
                break;
            case 'top':
                uvs.push(
                    0, vScale,
                    uScale, vScale,
                    uScale, 0,
                    0, 0
                );
                break;
            case 'bottom':
                uvs.push(
                    0, vScale,
                    uScale, vScale,
                    uScale, 0,
                    0, 0
                );
                break;
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
            if (blockStrId === 'air') return;

            // ブロックの色を取得（面ごとの色に対応）
            const blockColorData = blockColors[blockStrId];
            const defaultColor = '#808080';

            // 各面をチェック
            for (const [faceName, faceInfo] of Object.entries(ChunkMeshBuilder.FACES)) {
                // y=0の底面は常にカリング
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

                // 面を追加（色 + 面名でグループ化）
                const key = `${color}:${faceName}`;
                if (!blockFacesMap.has(key)) {
                    blockFacesMap.set(key, { color, faceName, faces: [] });
                }
                blockFacesMap.get(key).faces.push({ x, y, z, faceName });
            }
        });

        // メッシュ生成
        let vertexOffset = 0;

        for (const [key, groupData] of blockFacesMap) {
            const { color, faceName, faces } = groupData;
            const faceInfo = ChunkMeshBuilder.FACES[faceName];

            if (greedy) {
                // グリーディー・メッシング（色別）
                vertexOffset = this._buildGreedyMeshLoD1(
                    faces, color, faceName, faceInfo, positions, normals, colors, indices, vertexOffset
                );
            } else {
                // 通常のメッシュ生成
                for (const face of faces) {
                    const corners = this._getFaceCorners(face.x, face.y, face.z, face.faceName, 1, 1);
                    const rgb = this._hexToRgb(color);

                    for (const corner of corners) {
                        positions.push(corner.x, corner.y, corner.z);
                        normals.push(...faceInfo.normal);
                        colors.push(rgb.r, rgb.g, rgb.b);
                    }

                    indices.push(
                        vertexOffset, vertexOffset + 1, vertexOffset + 2,
                        vertexOffset, vertexOffset + 2, vertexOffset + 3
                    );
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

        // マテリアル（頂点カラー使用）
        const material = new THREE.MeshLambertMaterial({
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
    _buildGreedyMeshLoD1(faces, color, faceName, faceInfo, positions, normals, colors, indices, vertexOffset) {
        // 面を2Dグリッドに変換
        const grid = this._facesToGrid(faces, faceName);

        // グリッドから矩形を検出してマージ
        const rectangles = this._findRectangles(grid, faces);

        const rgb = this._hexToRgb(color);

        // 各矩形をメッシュ化
        for (const rect of rectangles) {
            const { x, y, z, width, height, depth } = rect;

            // 面ごとの座標変換
            let meshX, meshY, meshZ, meshWidth, meshHeight;
            switch (faceName) {
                case 'top':
                case 'bottom':
                    meshX = x;
                    meshY = depth;
                    meshZ = y;
                    meshWidth = width;
                    meshHeight = height;
                    break;
                case 'front':
                case 'back':
                    meshX = x;
                    meshY = y;
                    meshZ = depth;
                    meshWidth = width;
                    meshHeight = height;
                    break;
                case 'left':
                case 'right':
                    meshX = depth;
                    meshY = x;
                    meshZ = y;
                    meshWidth = width;
                    meshHeight = height;
                    break;
            }

            // 頂点を追加
            const corners = this._getFaceCorners(meshX, meshY, meshZ, faceName, meshWidth, meshHeight);
            for (const corner of corners) {
                positions.push(corner.x, corner.y, corner.z);
                normals.push(...faceInfo.normal);
                colors.push(rgb.r, rgb.g, rgb.b);
            }

            // インデックス追加
            indices.push(
                vertexOffset, vertexOffset + 1, vertexOffset + 2,
                vertexOffset, vertexOffset + 2, vertexOffset + 3
            );
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
            let u, v, d;

            switch (faceName) {
                case 'top':
                case 'bottom':
                    u = face.x;
                    v = face.z;
                    d = face.y;
                    break;
                case 'front':
                case 'back':
                    u = face.x;
                    v = face.y;
                    d = face.z;
                    break;
                case 'left':
                case 'right':
                    u = face.y;
                    v = face.z;
                    d = face.x;
                    break;
            }

            const key = `${d}`;
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push({ u, v, depth: d });
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

                // 横方向に拡張
                while (cellSet.has(`${cell.u + maxWidth},${cell.v}`)) {
                    maxWidth++;
                }

                // 縦方向に拡張（全幅で拡張可能な場合のみ）
                outer: while (true) {
                    for (let dx = 0; dx < maxWidth; dx++) {
                        if (!cellSet.has(`${cell.u + dx},${cell.v + maxHeight}`)) {
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
