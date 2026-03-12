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

    /**
     * @param {THREE.Scene} scene
     * @param {TextureLoader} textureLoader
     */
    static ShowDelay = 500; // ハイライトからゴースト表示までの遅延(ms)

    constructor(scene, textureLoader) {
        this._scene = scene;
        this._textureLoader = textureLoader;
        this._currentMesh = null;   // ゴーストメッシュ (THREE.Group)
        this._cacheKey = '';
        this._canPlace = true;
        this._lastAdjacentKey = '';  // 前フレームの設置先座標キー
        this._highlightStartTime = 0; // ハイライト開始時刻
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
            side: THREE.BackSide,
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
     * @param {boolean} [isHalfMode=false] - ハーフブロックモードか
     */
    update(raycastResult, selectedBlock, orientation, canPlace, isHalfMode = false) {
        if (!raycastResult || !raycastResult.hit || !selectedBlock) {
            this.hide();
            this._lastAdjacentKey = '';
            return;
        }

        // 設置先座標が変わったらタイマーリセット
        const adjacentKey = `${raycastResult.adjacentX},${raycastResult.adjacentY},${raycastResult.adjacentZ}`;
        const now = performance.now();
        if (adjacentKey !== this._lastAdjacentKey) {
            this._lastAdjacentKey = adjacentKey;
            this._highlightStartTime = now;
            this.hide();
            return;
        }

        // 遅延時間に達していなければ非表示のまま
        if (now - this._highlightStartTime < PlacementPreview.ShowDelay) {
            return;
        }

        const newKey = `${selectedBlock.block_str_id}:${orientation}:${isHalfMode ? 'half' : 'full'}`;

        // キャッシュキーが異なる場合のみメッシュ再生成
        if (newKey !== this._cacheKey) {
            this._removeMesh();
            this._currentMesh = this._buildMesh(selectedBlock, orientation, isHalfMode);
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
     * @param {boolean} [isHalfMode=false] - ハーフブロックモードか
     * @returns {THREE.Group}
     */
    _buildMesh(blockDef, orientation, isHalfMode = false) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const atlasInfos = [];
        const indices = [];
        let vertexOffset = 0;

        if (blockDef.shape_type === 'custom' && blockDef.voxel_look) {
            vertexOffset = this._buildCustomMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
        } else if (blockDef.half_placeable && isHalfMode) {
            vertexOffset = this._buildHalfMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
        } else {
            vertexOffset = this._buildFullMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
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
     * 任意範囲のボックス面定義（Three.js座標系: Z は反転済みの値を渡す）
     */
    static _BoxFaces3D(xMin, xMax, yMin, yMax, zMin, zMax) {
        return [
            { name: 'top',    n: [0,1,0],  corners: [[xMin,yMax,zMin],[xMax,yMax,zMin],[xMax,yMax,zMax],[xMin,yMax,zMax]] },
            { name: 'bottom', n: [0,-1,0], corners: [[xMin,yMin,zMax],[xMax,yMin,zMax],[xMax,yMin,zMin],[xMin,yMin,zMin]] },
            { name: 'front',  n: [0,0,1],  corners: [[xMax,yMin,zMax],[xMin,yMin,zMax],[xMin,yMax,zMax],[xMax,yMax,zMax]] },
            { name: 'back',   n: [0,0,-1], corners: [[xMin,yMin,zMin],[xMax,yMin,zMin],[xMax,yMax,zMin],[xMin,yMax,zMin]] },
            { name: 'right',  n: [1,0,0],  corners: [[xMax,yMin,zMin],[xMax,yMin,zMax],[xMax,yMax,zMax],[xMax,yMax,zMin]] },
            { name: 'left',   n: [-1,0,0], corners: [[xMin,yMin,zMax],[xMin,yMin,zMin],[xMin,yMax,zMin],[xMin,yMax,zMax]] },
        ];
    }

    /**
     * フルブロック（1×1×1）のジオメトリを生成
     */
    _buildFullMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        return this._buildBoxFaces(blockDef, PlacementPreview._BoxFaces3D(0, 1, 0, 1, -1, 0), null, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset);
    }

    /**
     * ハーフブロックのジオメトリを生成（ボクセルパイプライン）
     * @param {number} orientation - orient値（topDir * 4）
     */
    _buildHalfMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const voxelData = BlockMeshGeometry.GetHalfVoxelData();
        const gs = 8;
        const blockBase = [0, 0, 0];
        const startVertexCount = positions.length / 3;

        const lightLevels = [];
        const aoLevels = [];
        const out = { positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices };

        for (const config of BlockMeshGeometry.VoxelFaceConfigs) {
            const matAtlasUVs = BlockMeshGeometry.GetFaceAtlasUV(blockDef.block_str_id, config.faceName, this._textureLoader, orientation);
            for (let d = 0; d < gs; d++) {
                const mask = BlockMeshGeometry.BuildVoxelFaceMask(voxelData, config, d, gs);
                vertexOffset = BlockMeshGeometry.EmitVoxelGreedyQuads(
                    out, mask, gs, matAtlasUVs, config, d, blockBase, vertexOffset
                );
            }
        }

        // 回転 + Z反転を適用（Three.js座標系変換）
        const endVertexCount = positions.length / 3;
        BlockMeshGeometry.ApplyOrientationWithZFlip(
            positions, normals, startVertexCount, endVertexCount,
            0.5, 0.5, 0.5, orientation
        );

        return vertexOffset;
    }

    /**
     * ボックス面定義配列から頂点を生成する共通処理（フルブロック用）
     * @param {number} blockOrient - orient値(0〜23)。テクスチャリマップ・UV回転に使用
     */
    _buildBoxFaces(blockDef, faces, _unused, blockOrient, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const oriBase = blockOrient * 6;
        const hasBo = typeof BlockOrientation !== 'undefined';
        for (const face of faces) {
            let texFace;
            if (hasBo && blockOrient > 0) {
                const fi = BlockOrientation.FaceIdx[face.name];
                texFace = BlockOrientation.FaceNames[BlockOrientation.TexRemapIdx[oriBase + fi]];
            } else {
                texFace = face.name;
            }
            const atlasUV = this._textureLoader.getAtlasUV(blockDef.block_str_id, texFace);
            for (const c of face.corners) {
                positions.push(c[0], c[1], c[2]);
                normals.push(face.n[0], face.n[1], face.n[2]);
                atlasInfos.push(atlasUV.offsetX, atlasUV.offsetY, atlasUV.scaleX, atlasUV.scaleY);
            }
            const faceUVRot = hasBo ? BlockOrientation.UVRotIdx[oriBase + BlockOrientation.FaceIdx[face.name]] : 0;
            this._addFaceUVs(uvs, face.name, faceUVRot);
            BlockMeshGeometry.AddQuadIndices(indices, vertexOffset);
            vertexOffset += 4;
        }
        return vertexOffset;
    }

    /**
     * カスタムブロック（8×8×8ボクセル）のジオメトリを生成
     * BlockMeshGeometry共通処理に委譲
     */
    _buildCustomMesh(blockDef, orientation, positions, normals, uvs, atlasInfos, indices, vertexOffset) {
        const voxelData = VoxelData.decode(blockDef.voxel_look);
        const matAtlasUVs = BlockMeshGeometry.GetCustomBlockMaterials(blockDef, this._textureLoader);
        const gs = 8;
        const blockBase = [0, 0, 0];
        const startVertexCount = positions.length / 3;

        // lightLevels/aoLevels はゴーストシェーダーでは不要だが、共通API用にダミー配列を用意
        const lightLevels = [];
        const aoLevels = [];
        const out = { positions, normals, uvs, atlasInfos, lightLevels, aoLevels, indices };

        for (const config of BlockMeshGeometry.VoxelFaceConfigs) {
            for (let d = 0; d < gs; d++) {
                const mask = BlockMeshGeometry.BuildVoxelFaceMask(voxelData, config, d, gs);
                vertexOffset = BlockMeshGeometry.EmitVoxelGreedyQuads(
                    out, mask, gs, matAtlasUVs, config, d, blockBase, vertexOffset
                );
            }
        }

        // 回転 + Z反転を適用（Three.js座標系変換）
        const endVertexCount = positions.length / 3;
        BlockMeshGeometry.ApplyOrientationWithZFlip(
            positions, normals, startVertexCount, endVertexCount,
            0.5, 0.5, 0.5, orientation
        );

        return vertexOffset;
    }

    /**
     * 面のUV座標を追加（top/bottom/側面の標準パターン）
     */
    _addFaceUVs(uvs, faceName, uvRotation = 0) {
        if (faceName === 'top' || faceName === 'bottom') {
            const baseUVs = [[0,1], [1,1], [1,0], [0,0]];
            const shift = uvRotation;
            for (let i = 0; i < 4; i++) {
                const uv = baseUVs[(i + shift) % 4];
                uvs.push(uv[0], uv[1]);
            }
        } else if (uvRotation !== 0) {
            const baseUVs = [[1,0], [0,0], [0,1], [1,1]];
            const shift = uvRotation;
            for (let i = 0; i < 4; i++) {
                const uv = baseUVs[(i + shift) % 4];
                uvs.push(uv[0], uv[1]);
            }
        } else {
            uvs.push(1, 0, 0, 0, 0, 1, 1, 1);
        }
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
