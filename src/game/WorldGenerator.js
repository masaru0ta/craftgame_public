/**
 * WorldGenerator - 地形生成クラス
 */
class WorldGenerator {
    constructor() {
        // 将来的にシード値などを保持
    }

    /**
     * テスト用地形を生成
     * - y=0〜62: 土ブロック(dirt)
     * - y=63: 草ブロック(grass)
     * - x=0,y=63,z=* と x=*,y=63,z=0: 石ブロック(stone)
     * - 四隅(y=63): テストブロック(test)、その下(y=62)は空気
     *
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    generateTest(chunkData) {
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;

        // y=0〜62: 土ブロック
        for (let y = 0; y <= 62; y++) {
            for (let z = 0; z < sizeZ; z++) {
                for (let x = 0; x < sizeX; x++) {
                    chunkData.setBlock(x, y, z, 'dirt');
                }
            }
        }

        // y=63: 草ブロック（ベース）
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++) {
                chunkData.setBlock(x, 63, z, 'grass');
            }
        }

        // x=0, y=63, z=* に石ブロック
        for (let z = 0; z < sizeZ; z++) {
            chunkData.setBlock(0, 63, z, 'stone');
        }

        // x=*, y=63, z=0 に石ブロック
        for (let x = 0; x < sizeX; x++) {
            chunkData.setBlock(x, 63, 0, 'stone');
        }

        // 四隅にテストブロック
        const corners = [
            { x: 0, z: 0 },
            { x: 0, z: sizeZ - 1 },
            { x: sizeX - 1, z: 0 },
            { x: sizeX - 1, z: sizeZ - 1 }
        ];

        for (const corner of corners) {
            // テストブロック
            chunkData.setBlock(corner.x, 63, corner.z, 'test');
            // その下は空気
            chunkData.setBlock(corner.x, 62, corner.z, 'air');
        }
    }

    /**
     * フラットな地形を生成（シンプル版）
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     * @param {number} height - 地面の高さ (デフォルト: 63)
     * @param {string} surfaceBlock - 表面ブロック (デフォルト: 'grass')
     * @param {string} fillBlock - 埋めるブロック (デフォルト: 'dirt')
     */
    generateFlat(chunkData, height = 63, surfaceBlock = 'grass', fillBlock = 'dirt') {
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;

        // 地下を埋める
        for (let y = 0; y < height; y++) {
            for (let z = 0; z < sizeZ; z++) {
                for (let x = 0; x < sizeX; x++) {
                    chunkData.setBlock(x, y, z, fillBlock);
                }
            }
        }

        // 表面
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++) {
                chunkData.setBlock(x, height, z, surfaceBlock);
            }
        }
    }
}

// グローバルスコープに公開
window.WorldGenerator = WorldGenerator;
