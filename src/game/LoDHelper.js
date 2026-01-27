/**
 * LoDHelper - LoD 2/3用のメッシュ生成ヘルパークラス
 *
 * LoD 2: 1チャンク = 4隅の高さで1つの四角形
 * LoD 3: 4x4チャンク = 4隅の高さで1つの四角形
 */
class LoDHelper {
    /**
     * LoD 2用メッシュを生成（1チャンク = 1四角形）
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @param {WorldGenerator} worldGenerator - 地形生成クラス
     * @returns {THREE.Mesh} 生成されたメッシュ
     */
    static createLoD2Mesh(chunkX, chunkZ, worldGenerator) {
        const sizeX = typeof ChunkData !== 'undefined' ? ChunkData.SIZE_X : 16;
        const sizeZ = typeof ChunkData !== 'undefined' ? ChunkData.SIZE_Z : 16;

        // チャンクのワールド座標
        const worldX0 = chunkX * sizeX;
        const worldZ0 = chunkZ * sizeZ;
        const worldX1 = worldX0 + sizeX;
        const worldZ1 = worldZ0 + sizeZ;

        // 4隅の高さと色を取得
        const corners = [
            { x: worldX0, z: worldZ0 }, // 左前
            { x: worldX1, z: worldZ0 }, // 右前
            { x: worldX1, z: worldZ1 }, // 右奥
            { x: worldX0, z: worldZ1 }  // 左奥
        ];

        const heights = corners.map(c => worldGenerator.getTerrainHeight(c.x, c.z));
        const colors = corners.map(c => worldGenerator.getTerrainColor(c.x, c.z));

        return LoDHelper._createQuadMesh(
            corners, heights, colors, `lod2_${chunkX}_${chunkZ}`
        );
    }

    /**
     * LoD 3用メッシュを生成（4x4チャンク = 1四角形）
     * @param {number} gridX - 4x4グリッドのX座標（4の倍数）
     * @param {number} gridZ - 4x4グリッドのZ座標（4の倍数）
     * @param {WorldGenerator} worldGenerator - 地形生成クラス
     * @returns {THREE.Mesh} 生成されたメッシュ
     */
    static createLoD3Mesh(gridX, gridZ, worldGenerator) {
        const sizeX = typeof ChunkData !== 'undefined' ? ChunkData.SIZE_X : 16;
        const sizeZ = typeof ChunkData !== 'undefined' ? ChunkData.SIZE_Z : 16;

        // 4x4チャンクのワールド座標
        const worldX0 = gridX * sizeX;
        const worldZ0 = gridZ * sizeZ;
        const worldX1 = (gridX + 4) * sizeX;
        const worldZ1 = (gridZ + 4) * sizeZ;

        // 4隅の高さと色を取得
        const corners = [
            { x: worldX0, z: worldZ0 }, // 左前
            { x: worldX1, z: worldZ0 }, // 右前
            { x: worldX1, z: worldZ1 }, // 右奥
            { x: worldX0, z: worldZ1 }  // 左奥
        ];

        const heights = corners.map(c => worldGenerator.getTerrainHeight(c.x, c.z));
        const colors = corners.map(c => worldGenerator.getTerrainColor(c.x, c.z));

        return LoDHelper._createQuadMesh(
            corners, heights, colors, `lod3_${gridX}_${gridZ}`
        );
    }

    /**
     * 4×4グリッド座標を計算
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {{gridX: number, gridZ: number}} グリッド座標（4の倍数）
     */
    static getLoD3Grid(chunkX, chunkZ) {
        return {
            gridX: Math.floor(chunkX / 4) * 4,
            gridZ: Math.floor(chunkZ / 4) * 4
        };
    }

    /**
     * 四角形メッシュを作成（内部ヘルパー）
     * @param {Array} corners - 4隅の座標 [{x, z}, ...]
     * @param {Array} heights - 4隅の高さ [y0, y1, y2, y3]
     * @param {Array} colors - 4隅の色 ["#RRGGBB", ...]
     * @param {string} name - メッシュ名
     * @returns {THREE.Mesh}
     */
    static _createQuadMesh(corners, heights, colors, name) {
        // ジオメトリを作成
        const geometry = new THREE.BufferGeometry();

        // 頂点座標（4頂点）
        // 左手座標系対応: Three.js の Z を反転して考える
        const positions = new Float32Array([
            corners[0].x, heights[0], corners[0].z, // 左前
            corners[1].x, heights[1], corners[1].z, // 右前
            corners[2].x, heights[2], corners[2].z, // 右奥
            corners[3].x, heights[3], corners[3].z  // 左奥
        ]);

        // 頂点カラー
        const vertexColors = new Float32Array(12);
        for (let i = 0; i < 4; i++) {
            const color = LoDHelper._hexToRgb(colors[i]);
            vertexColors[i * 3] = color.r;
            vertexColors[i * 3 + 1] = color.g;
            vertexColors[i * 3 + 2] = color.b;
        }

        // インデックス（2三角形 = 1四角形）
        // Z軸反転対応: 頂点順序を時計回りに
        const indices = new Uint16Array([
            0, 3, 2,  // 三角形1
            0, 2, 1   // 三角形2
        ]);

        // 法線（上向き）
        const normals = new Float32Array([
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            0, 1, 0
        ]);

        // UV座標（単純に0-1）
        const uvs = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // マテリアル（頂点カラー使用）
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;

        return mesh;
    }

    /**
     * 16進数カラーをRGBに変換
     * @param {string} hex - 16進数カラー（例: "#4CAF50"）
     * @returns {{r: number, g: number, b: number}} 0-1範囲のRGB
     */
    static _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255
            };
        }
        return { r: 0.5, g: 0.5, b: 0.5 }; // デフォルトはグレー
    }

    /**
     * LoD色分け表示用の色を取得
     * @param {number} lodLevel - LoDレベル（0-3）
     * @returns {string} 16進数カラー
     */
    static getDebugColor(lodLevel) {
        const colors = {
            0: '#00FF00', // 緑
            1: '#FFFF00', // 黄
            2: '#FFA500', // オレンジ
            3: '#FF0000'  // 赤
        };
        return colors[lodLevel] || '#FFFFFF';
    }
}

// グローバルスコープに公開
if (typeof window !== 'undefined') {
    window.LoDHelper = LoDHelper;
}
