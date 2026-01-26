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
}

// グローバルスコープに公開
window.TextureLoader = TextureLoader;
