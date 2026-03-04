/**
 * PlacementPreview.js
 * 設置予測表示 - ブロック設置前に半透明ゴーストメッシュを表示
 */
class PlacementPreview {
    static OpacityCanPlace = 0.4;
    static OpacityCannotPlace = 0.3;
    static TintNormal = new THREE.Vector3(1.0, 1.0, 1.0);
    static TintInvalid = new THREE.Vector3(1.0, 0.3, 0.3);
    static WireColorNormal = 0xffffff;
    static WireColorInvalid = 0xff4444;
    static WireOpacity = 0.6;
    static BrightnessBoost = 0.15;

    // カスタムブロック6方向面コンフィグ（static定数で毎回の配列生成を回避）
    static _FaceConfigs = [
        { n: [1,0,0],  axis: 0, u: 2, v: 1, offset: 1 },  // right  (+X)
        { n: [-1,0,0], axis: 0, u: 2, v: 1, offset: 0 },  // left   (-X)
        { n: [0,1,0],  axis: 1, u: 0, v: 2, offset: 1 },  // top    (+Y)
        { n: [0,-1,0], axis: 1, u: 0, v: 2, offset: 0 },  // bottom (-Y)
        { n: [0,0,1],  axis: 2, u: 0, v: 1, offset: 1 },  // back   (+Z)
        { n: [0,0,-1], axis: 2, u: 0, v: 1, offset: 0 },  // front  (-Z)
    ];

    /**
     * @param {THREE.Scene} scene
     * @param {TextureLoader} textureLoader
     */
    constructor(scene, textureLoader) {
        this._scene = scene;
        this._textureLoader = textureLoader;
        this._currentMesh = null;   // ゴーストメッシュ (THREE.Group)
        this._cacheKey = '';
        this._canPlace = true;
        this._material = this._createMaterial();
        this._wireMaterial = new THREE.LineBasicMaterial({
            color: PlacementPreview.WireColorNormal,
            transparent: true,
            opacity: PlacementPreview.WireOpacity,
            depthTest: true,
            depthWrite: false,
        });
    }

    /**
     * ゴースト表示用シェーダーマテリアルを生成
     */
    _createMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                atlasTexture: { value: this._textureLoader._atlasTexture },
                opacity: { value: PlacementPreview.OpacityCanPlace },
                tintColor: { value: PlacementPreview.TintNormal.clone() },
            },
            vertexShader: `
                attribute vec4 atlasInfo;
                varying vec2 vUv;
                varying vec4 vAtlasInfo;
                void main() {
                    vUv = uv;
                    vAtlasInfo = atlasInfo;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D atlasTexture;
                uniform float opacity;
                uniform vec3 tintColor;
                varying vec2 vUv;
                varying vec4 vAtlasInfo;
                void main() {
                    vec2 tiledUv = fract(vUv);
                    vec2 atlasUv = tiledUv * vAtlasInfo.zw + vAtlasInfo.xy;
                    vec4 texColor = texture2D(atlasTexture, atlasUv);
                    if (texColor.a < 0.5) discard;
                    vec3 boosted = texColor.rgb + ${PlacementPreview.BrightnessBoost.toFixed(2)};
                    gl_FragColor = vec4(boosted * tintColor, opacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
    }

    /**
     * プレビューを更新
     * @param {Object|null} raycastResult - レイキャスト結果
     * @param {Object|null} selectedBlock - 選択中のブロック定義
     * @param {number} orientation - orientation値
     * @param {boolean} canPlace - 設置可能か
     */
    update(raycastResult, selectedBlock, orientation, canPlace) {
        if (!raycastResult || !raycastResult.hit || !selectedBlock) {
            this.hide();
            return;
        }

        const newKey = `${selectedBlock.block_str_id}:${orientation}`;

        // キャッシュキーが異なる場合のみメッシュ再生成
        if (newKey !== this._cacheKey) {
            this._removeMesh();
            this._currentMesh = this._buildMesh(selectedBlock, orientation);
            this._scene.add(this._currentMesh);
            this._cacheKey = newKey;
        }

        // 設置可否による色・透明度更新
        this._canPlace = canPlace;
        const u = this._material.uniforms;
        if (canPlace) {
            u.tintColor.value.copy(PlacementPreview.TintNormal);
            u.opacity.value = PlacementPreview.OpacityCanPlace;
            this._wireMaterial.color.setHex(PlacementPreview.WireColorNormal);
        } else {
            u.tintColor.value.copy(PlacementPreview.TintInvalid);
            u.opacity.value = PlacementPreview.OpacityCannotPlace;
            this._wireMaterial.color.setHex(PlacementPreview.WireColorInvalid);
        }

        // 位置更新（ゲーム座標系→Three.js座標系: Z反転）
        this._currentMesh.position.set(
            raycastResult.adjacentX,
            raycastResult.adjacentY,
            -raycastResult.adjacentZ
        );
        this._currentMesh.visible = true;
    }

    /** プレビューを非表示にする */
    hide() {
        if (this._currentMesh) {
            this._currentMesh.visible = false;
        }
    }

    /** リソースを解放 */
    dispose() {
        this._removeMesh();
        if (this._material) this._material.dispose();
        if (this._wireMaterial) this._wireMaterial.dispose();
    }

    /**
     * メッシュを生成（THREE.Group: テクスチャメッシュ + ワイヤーフレーム）
     * @param {Object} blockDef - ブロック定義
     * @param {number} orientation - orientation値
     * @returns {THREE.Group}
     */
    _buildMesh(blockDef, orientation) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = [];
        const indices = [];
        let vertexOffset = 0;

        if (blockDef.shape_type === 'custom' && blockDef.voxel_look) {
            vertexOffset = this._buildCustomMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
        } else if (blockDef.half_placeable && (orientation === 1 || orientation === 2)) {
            vertexOffset = this._buildHalfMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
        } else {
            vertexOffset = this._buildFullMesh(blockDef, positions, normals, uvs, atlasInfos, indices, vertexOffset);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('atlasInfo', new THREE.Float32BufferAttribute(atlasInfos, 4));
        geometry.setIndex(indices);

        // テクスチャ付きゴーストメッシュ
        const ghostMesh = new THREE.Mesh(geometry, this._material);
        ghostMesh.renderOrder = 999;

        // 輪郭線（EdgesGeometry で辺を抽出）
        const edgesGeometry = new THREE.EdgesGeometry(geometry, 30);
        const wireframe = new THREE.LineSegments(edgesGeometry, this._wireMaterial);
        wireframe.renderOrder = 1000;

        // グループにまとめて返す
        const group = new THREE.Group();
        group.add(ghostMesh);
        group.add(wireframe);
        return group;
    }

    /**
     * ボックス形状の面定義を取得（Three.js座標系: Z反転済み）
     * @param {number} yMin - Y最小値
     * @param {number} yMax - Y最大値
     */
    static _BoxFaces(yMin, yMax) {
        return [
            { name: 'top',    n: [0,1,0],  corners: [[0,yMax,-1],[1,yMax,-1],[1,yMax,0],[0,yMax,0]] },
            { name: 'bottom', n: [0,-1,0], corners: [[0,yMin,0],[1,yMin,0],[1,yMin,-1],[0,yMin,-1]] },
            { name: 'front',  n: [0,0,1],  corners: [[1,yMin,0],[0,yMin,0],[0,yMax,0],[1,yMax,0]] },
            { name: 'back',   n: [0,0,-1], corners: [[0,yMin,-1],[1,yMin,-1],[1,yMax,-1],[0,yMax,-1]] },
            { name: 'right',  n: [1,0,0],  corners: [[1,yMin,-1],[1,yMin,0],[1,yMax,0],[1,yMax,-1]] },
            { name: 'left',   n: [-1,0,0], corners: [[0,yMin,0],[0,yMin,-1],[0,yMax,-1],[0,yMax,0]] },
        ];
    }

    /**
     * フルブロック（1×1×1）のジオメトリを生成
     */
    _buildFullMesh(blockDef, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        return this._buildBoxFaces(blockDef, PlacementPreview._BoxFaces(0, 1), 0, positions, normals, uvs, atlasInfos, indices, vertexOffset);
    }

    /**
     * ハーフブロック（1×0.5×1）のジオメトリを生成
     * orientation=1: 下ハーフ (Y=0〜0.5), orientation=2: 上ハーフ (Y=0.5〜1)
     */
    _buildHalfMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const yMin = orientation === 2 ? 0.5 : 0;
        const yMax = orientation === 2 ? 1.0 : 0.5;
        return this._buildBoxFaces(blockDef, PlacementPreview._BoxFaces(yMin, yMax), orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
    }

    /**
     * ボックス面定義配列から頂点を生成する共通処理
     */
    _buildBoxFaces(blockDef, faces, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        for (const face of faces) {
            const atlasUV = this._textureLoader.getAtlasUV(blockDef.block_str_id, face.name);
            for (const c of face.corners) {
                positions.push(c[0], c[1], c[2]);
                normals.push(face.n[0], face.n[1], face.n[2]);
                atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
            }
            // ハーフブロック側面はテクスチャ切り出し
            const isHalfSide = orientation > 0 && face.name !== 'top' && face.name !== 'bottom';
            if (isHalfSide) {
                const vLo = orientation === 1 ? 0.0 : 0.5;
                const vHi = orientation === 1 ? 0.5 : 1.0;
                uvs.push(1, vLo, 0, vLo, 0, vHi, 1, vHi);
            } else {
                this._addFaceUVs(uvs, face.name);
            }
            this._addQuadIndices(indices, vertexOffset);
            vertexOffset += 4;
        }
        return vertexOffset;
    }

    /**
     * カスタムブロック（8×8×8ボクセル）のジオメトリを生成
     */
    _buildCustomMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const voxelData = VoxelData.decode(blockDef.voxel_look);
        const matAtlasUVs = this._getCustomMaterials(blockDef);
        const gs = 8;
        const vs = 1.0 / gs;

        const startVertexCount = positions.length / 3;
        // ループ内で再利用する配列（GC削減）
        const coord = [0, 0, 0];
        const nc = [0, 0, 0];
        const pos = [0, 0, 0];

        for (const cfg of PlacementPreview._FaceConfigs) {
            const nDir = cfg.offset === 1 ? 1 : -1;
            const nFlipX = cfg.n[0], nFlipY = cfg.n[1], nFlipZ = -cfg.n[2];
            for (let d = 0; d < gs; d++) {
                for (let cv = 0; cv < gs; cv++) {
                    for (let cu = 0; cu < gs; cu++) {
                        coord[cfg.axis] = d; coord[cfg.u] = cu; coord[cfg.v] = cv;
                        const matVal = VoxelData.getVoxel(voxelData, coord[0], coord[1], coord[2]);
                        if (matVal === 0) continue;

                        const nd = d + nDir;
                        if (nd >= 0 && nd < gs) {
                            nc[cfg.axis] = nd; nc[cfg.u] = cu; nc[cfg.v] = cv;
                            if (VoxelData.getVoxel(voxelData, nc[0], nc[1], nc[2]) !== 0) continue;
                        }

                        const faceD = (d + cfg.offset) * vs;
                        const atlasUV = matAtlasUVs[matVal - 1];
                        const cuVs = cu * vs, cvVs = cv * vs;
                        const cu1Vs = cuVs + vs, cv1Vs = cvVs + vs;

                        // 4コーナーをインライン展開（配列アロケーション回避）
                        // (cu,cv), (cu+1,cv), (cu+1,cv+1), (cu,cv+1)
                        pos[cfg.axis] = faceD;
                        pos[cfg.u] = cuVs;  pos[cfg.v] = cvVs;
                        positions.push(pos[0], pos[1], -pos[2]);
                        pos[cfg.u] = cu1Vs; pos[cfg.v] = cvVs;
                        positions.push(pos[0], pos[1], -pos[2]);
                        pos[cfg.u] = cu1Vs; pos[cfg.v] = cv1Vs;
                        positions.push(pos[0], pos[1], -pos[2]);
                        pos[cfg.u] = cuVs;  pos[cfg.v] = cv1Vs;
                        positions.push(pos[0], pos[1], -pos[2]);
                        for (let ci = 0; ci < 4; ci++) {
                            normals.push(nFlipX, nFlipY, nFlipZ);
                            atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
                        }
                        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                        this._addQuadIndices(indices, vertexOffset);
                        vertexOffset += 4;
                    }
                }
            }
        }

        // orientation回転適用（0以外の場合）
        if (orientation !== 0 && typeof ChunkMeshBuilder !== 'undefined') {
            const m = ChunkMeshBuilder.ORIENTATION_MATRICES[orientation];
            if (m) {
                const endVertexCount = positions.length / 3;
                const cx = 0.5, cy = 0.5, cz = -0.5;
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
     * カスタムブロックのマテリアルアトラスUV配列を取得
     * @returns {Array<{offsetX,offsetY,scaleX,scaleY}>} [material_1, material_2, material_3]
     */
    _getCustomMaterials(blockDef) {
        const tl = this._textureLoader;
        const def = blockDef.tex_default || '';
        return [
            tl.getAtlasUVByTexName(blockDef.material_1 || def),
            tl.getAtlasUVByTexName(blockDef.material_2 || def),
            tl.getAtlasUVByTexName(blockDef.material_3 || def),
        ];
    }

    /**
     * 面のUV座標を追加（top/bottom/側面の標準パターン）
     */
    _addFaceUVs(uvs, faceName) {
        if (faceName === 'top' || faceName === 'bottom') {
            uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
        } else {
            uvs.push(1, 0, 0, 0, 0, 1, 1, 1);
        }
    }

    /**
     * クワッドのインデックスを追加（時計回り2三角形）
     */
    _addQuadIndices(indices, offset) {
        indices.push(
            offset, offset + 1, offset + 2,
            offset, offset + 2, offset + 3
        );
    }

    /** 現在のメッシュをシーンから除去して破棄 */
    _removeMesh() {
        if (this._currentMesh) {
            this._scene.remove(this._currentMesh);
            // グループ内の子メッシュのジオメトリを破棄
            this._currentMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
            });
            this._currentMesh = null;
            this._cacheKey = '';
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PlacementPreview = PlacementPreview;
}
