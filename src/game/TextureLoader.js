/**
 * TextureLoader - テクスチャ取得・管理クラス
 * GAS APIからブロック定義とテクスチャを取得し、Three.jsマテリアルを生成
 */
class TextureLoader {
    // GAS APIベースURL
    static API_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';

    // フォールバック色（テクスチャがない場合）
    static FALLBACK_COLORS = {
        'air': null,
        'dirt': '#8B4513',
        'grass': '#228B22',
        'stone': '#808080',
        'test': '#FF00FF'
    };

    // 面の順序（Three.js BoxGeometry準拠）
    static FACE_ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back'];

    constructor() {
        this.isLoading = false;
        this.isLoaded = false;
        this.blocks = [];        // ブロック定義リスト
        this.textures = [];      // テクスチャリスト
        this._textureCache = new Map();   // テクスチャキャッシュ (file_name -> THREE.Texture)
        this._materialCache = new Map();  // マテリアルキャッシュ (block_str_id -> THREE.Material[6])

        // アトラス関連
        this._atlasTexture = null;        // アトラステクスチャ
        this._atlasMaterial = null;       // アトラスマテリアル
        this._atlasUVMap = new Map();     // "blockStrId:faceName" -> { offsetX, offsetY, scaleX, scaleY }
        this._atlasSize = 0;              // アトラスのサイズ（テクスチャ数）
    }

    /**
     * 全データを読み込み
     * @returns {Promise<void>}
     */
    async loadAll() {
        if (this.isLoading || this.isLoaded) {
            return;
        }

        this.isLoading = true;

        try {
            const response = await fetch(`${TextureLoader.API_URL}?action=getAll`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'API error');
            }

            this.blocks = result.data.blocks || [];
            this.textures = result.data.textures || [];

            // テクスチャをキャッシュに読み込み
            await this._loadTextures();

            // マテリアルを生成
            this._createMaterials();

            // アトラスを生成
            this._createAtlas();

            this.isLoaded = true;
        } catch (error) {
            console.error('TextureLoader: Failed to load data:', error);
            // フォールバック: 空のデータでも動作可能に
            this._createFallbackMaterials();
            this.isLoaded = true;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * テクスチャをBase64からThree.jsテクスチャに変換
     */
    async _loadTextures() {
        for (const texData of this.textures) {
            if (texData.image_base64) {
                try {
                    const texture = await this._createTextureFromBase64(texData.image_base64);
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    this._textureCache.set(texData.file_name, texture);
                } catch (e) {
                    console.warn(`Failed to load texture: ${texData.file_name}`, e);
                }
            }
        }
    }

    /**
     * Base64からThree.jsテクスチャを作成
     * @param {string} base64 - Base64エンコードされた画像データ
     * @returns {Promise<THREE.Texture>}
     */
    _createTextureFromBase64(base64) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const texture = new THREE.Texture(img);
                texture.needsUpdate = true;
                resolve(texture);
            };
            img.onerror = reject;
            img.src = base64;
        });
    }

    /**
     * ブロック定義からマテリアルを生成
     */
    _createMaterials() {
        for (const block of this.blocks) {
            const materials = this._createMaterialsForBlock(block);
            this._materialCache.set(block.block_str_id, materials);
        }

        // フォールバックマテリアルも作成
        this._createFallbackMaterials();
    }

    /**
     * フォールバックマテリアルを作成
     */
    _createFallbackMaterials() {
        for (const [blockId, color] of Object.entries(TextureLoader.FALLBACK_COLORS)) {
            if (!this._materialCache.has(blockId) && color) {
                const material = new THREE.MeshLambertMaterial({ color: color });
                // 6面同じマテリアル
                this._materialCache.set(blockId, Array(6).fill(material));
            }
        }
    }

    /**
     * ブロック定義から6面分のマテリアルを作成
     * @param {Object} block - ブロック定義
     * @returns {THREE.Material[]} 6面分のマテリアル配列
     */
    _createMaterialsForBlock(block) {
        const materials = [];
        const defaultTexName = block.tex_default || null;

        // 各面のテクスチャ名を取得
        const faceTextures = {
            right: block.tex_right || defaultTexName,
            left: block.tex_left || defaultTexName,
            top: block.tex_top || defaultTexName,
            bottom: block.tex_bottom || defaultTexName,
            front: block.tex_front || defaultTexName,
            back: block.tex_back || defaultTexName
        };

        for (const face of TextureLoader.FACE_ORDER) {
            const texName = faceTextures[face];
            const texture = texName ? this._textureCache.get(texName) : null;

            if (texture) {
                // テクスチャありの場合
                const clonedTexture = texture.clone();
                clonedTexture.needsUpdate = true;  // クローン後にneedsUpdateを設定
                const material = new THREE.MeshLambertMaterial({
                    map: clonedTexture,
                    transparent: block.is_transparent || false
                });
                material.map.wrapS = THREE.RepeatWrapping;
                material.map.wrapT = THREE.RepeatWrapping;
                material.map.magFilter = THREE.NearestFilter;
                material.map.minFilter = THREE.NearestFilter;
                materials.push(material);
            } else {
                // フォールバック色
                const color = TextureLoader.FALLBACK_COLORS[block.block_str_id] || '#FF00FF';
                materials.push(new THREE.MeshLambertMaterial({ color: color }));
            }
        }

        return materials;
    }

    /**
     * ブロックIDからマテリアル配列を取得
     * @param {string} blockStrId - ブロックID
     * @returns {THREE.Material[]|null} 6面分のマテリアル配列
     */
    getMaterials(blockStrId) {
        if (blockStrId === 'air') {
            return null;
        }
        return this._materialCache.get(blockStrId) || this._materialCache.get('test');
    }

    /**
     * ブロックIDと面名からテクスチャを取得
     * @param {string} blockStrId - ブロックID
     * @param {string} faceName - 面名 (right, left, top, bottom, front, back)
     * @returns {THREE.Texture|null}
     */
    getTexture(blockStrId, faceName) {
        const block = this.blocks.find(b => b.block_str_id === blockStrId);
        if (!block) return null;

        const texName = block[`tex_${faceName}`] || block.tex_default;
        return texName ? this._textureCache.get(texName) : null;
    }

    /**
     * ブロック定義を取得
     * @param {string} blockStrId - ブロックID
     * @returns {Object|null}
     */
    getBlockDef(blockStrId) {
        return this.blocks.find(b => b.block_str_id === blockStrId) || null;
    }

    /**
     * アトラステクスチャを生成
     */
    _createAtlas() {
        // 使用するテクスチャを収集（ブロック定義から使用されているテクスチャのみ）
        const usedTextures = new Set();
        const texNameToBlock = new Map(); // テクスチャ名 -> 使用するブロックと面の情報

        for (const block of this.blocks) {
            if (block.block_str_id === 'air') continue;

            for (const face of TextureLoader.FACE_ORDER) {
                const texName = block[`tex_${face}`] || block.tex_default;
                if (texName && this._textureCache.has(texName)) {
                    usedTextures.add(texName);
                    const key = `${block.block_str_id}:${face}`;
                    texNameToBlock.set(key, texName);
                }
            }
        }

        // テクスチャが無い場合はフォールバック
        if (usedTextures.size === 0) {
            this._createFallbackAtlas();
            return;
        }

        // アトラスのグリッドサイズを決定（正方形）
        const texCount = usedTextures.size;
        const gridSize = Math.ceil(Math.sqrt(texCount));
        this._atlasSize = gridSize;

        // テクスチャサイズを取得（最初のテクスチャから）
        const firstTexName = usedTextures.values().next().value;
        const firstTex = this._textureCache.get(firstTexName);
        const texSize = firstTex.image ? firstTex.image.width : 16;

        // アトラスキャンバスを作成
        const atlasWidth = gridSize * texSize;
        const atlasHeight = gridSize * texSize;
        const canvas = document.createElement('canvas');
        canvas.width = atlasWidth;
        canvas.height = atlasHeight;
        const ctx = canvas.getContext('2d');

        // テクスチャをキャンバスに配置
        const texNameToIndex = new Map();
        let index = 0;
        for (const texName of usedTextures) {
            const tex = this._textureCache.get(texName);
            if (tex && tex.image) {
                const gridX = index % gridSize;
                const gridY = Math.floor(index / gridSize);
                ctx.drawImage(tex.image, gridX * texSize, gridY * texSize);
                texNameToIndex.set(texName, { gridX, gridY });
            }
            index++;
        }

        // Three.jsテクスチャを作成
        this._atlasTexture = new THREE.Texture(canvas);
        this._atlasTexture.needsUpdate = true;
        this._atlasTexture.magFilter = THREE.NearestFilter;
        this._atlasTexture.minFilter = THREE.NearestFilter;
        this._atlasTexture.wrapS = THREE.RepeatWrapping;
        this._atlasTexture.wrapT = THREE.RepeatWrapping;

        // アトラスマテリアルを作成（カスタムシェーダーでタイリング対応）
        this._atlasMaterial = this._createAtlasShaderMaterial(this._atlasTexture, gridSize);

        // UVマップを生成
        const uvScale = 1 / gridSize;
        for (const block of this.blocks) {
            if (block.block_str_id === 'air') continue;

            for (const face of TextureLoader.FACE_ORDER) {
                const texName = block[`tex_${face}`] || block.tex_default;
                const key = `${block.block_str_id}:${face}`;

                if (texName && texNameToIndex.has(texName)) {
                    const { gridX, gridY } = texNameToIndex.get(texName);
                    this._atlasUVMap.set(key, {
                        offsetX: gridX * uvScale,
                        offsetY: 1 - (gridY + 1) * uvScale, // Yは上下反転
                        scaleX: uvScale,
                        scaleY: uvScale
                    });
                } else {
                    // フォールバック（最初のテクスチャ位置を使用）
                    this._atlasUVMap.set(key, {
                        offsetX: 0,
                        offsetY: 1 - uvScale,
                        scaleX: uvScale,
                        scaleY: uvScale
                    });
                }
            }
        }

        // フォールバックブロック用のUVも追加
        for (const [blockId, color] of Object.entries(TextureLoader.FALLBACK_COLORS)) {
            if (!color) continue;
            for (const face of TextureLoader.FACE_ORDER) {
                const key = `${blockId}:${face}`;
                if (!this._atlasUVMap.has(key)) {
                    this._atlasUVMap.set(key, {
                        offsetX: 0,
                        offsetY: 1 - uvScale,
                        scaleX: uvScale,
                        scaleY: uvScale
                    });
                }
            }
        }
    }

    /**
     * フォールバックアトラスを作成（テクスチャが無い場合）
     */
    _createFallbackAtlas() {
        // 単色の小さいアトラスを作成
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(0, 0, 16, 16);

        this._atlasTexture = new THREE.Texture(canvas);
        this._atlasTexture.needsUpdate = true;
        this._atlasTexture.magFilter = THREE.NearestFilter;
        this._atlasTexture.minFilter = THREE.NearestFilter;

        this._atlasMaterial = new THREE.MeshLambertMaterial({
            map: this._atlasTexture
        });

        this._atlasSize = 1;

        // フォールバックUV（全体を使用）
        for (const [blockId, color] of Object.entries(TextureLoader.FALLBACK_COLORS)) {
            if (!color) continue;
            for (const face of TextureLoader.FACE_ORDER) {
                const key = `${blockId}:${face}`;
                this._atlasUVMap.set(key, {
                    offsetX: 0,
                    offsetY: 0,
                    scaleX: 1,
                    scaleY: 1
                });
            }
        }
    }

    /**
     * アトラス用シェーダーマテリアルを作成
     * UV座標のfract()でアトラス内タイリングを実現
     * Lambertライティング対応
     */
    _createAtlasShaderMaterial(atlasTexture, gridSize) {
        const vertexShader = `
            attribute vec4 atlasInfo; // x: offsetX, y: offsetY, z: scaleX, w: scaleY
            varying vec2 vUv;
            varying vec4 vAtlasInfo;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                vUv = uv;
                vAtlasInfo = atlasInfo;
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const fragmentShader = `
            uniform sampler2D atlasTexture;
            uniform vec3 ambientLightColor;
            uniform vec3 directionalLightColor;
            uniform vec3 directionalLightDirection;

            varying vec2 vUv;
            varying vec4 vAtlasInfo;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                // UV座標をタイリング（fract()で0-1に正規化）
                vec2 tiledUv = fract(vUv);
                // アトラス内の位置に変換
                vec2 atlasUv = tiledUv * vAtlasInfo.zw + vAtlasInfo.xy;
                vec4 texColor = texture2D(atlasTexture, atlasUv);

                // Lambertライティング
                vec3 normal = normalize(vNormal);
                float dotNL = max(dot(normal, directionalLightDirection), 0.0);
                vec3 irradiance = ambientLightColor + directionalLightColor * dotNL;

                gl_FragColor = vec4(texColor.rgb * irradiance, texColor.a);
            }
        `;

        return new THREE.ShaderMaterial({
            uniforms: {
                atlasTexture: { value: atlasTexture },
                ambientLightColor: { value: new THREE.Color(0.4, 0.4, 0.4) },
                directionalLightColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
                directionalLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.FrontSide
        });
    }

    /**
     * アトラスマテリアルを取得
     * @returns {THREE.Material}
     */
    getAtlasMaterial() {
        return this._atlasMaterial;
    }

    /**
     * アトラスUV情報を取得
     * @param {string} blockStrId - ブロックID
     * @param {string} faceName - 面名
     * @returns {{ offsetX: number, offsetY: number, scaleX: number, scaleY: number }}
     */
    getAtlasUV(blockStrId, faceName) {
        const key = `${blockStrId}:${faceName}`;
        return this._atlasUVMap.get(key) || {
            offsetX: 0,
            offsetY: 0,
            scaleX: 1 / (this._atlasSize || 1),
            scaleY: 1 / (this._atlasSize || 1)
        };
    }
}

// グローバルスコープに公開
window.TextureLoader = TextureLoader;
