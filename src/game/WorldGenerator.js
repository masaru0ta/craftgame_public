/**
 * WorldGenerator - 地形生成クラス
 */
class WorldGenerator {
    constructor() {
        // 将来的にシード値などを保持

        // 7セグメント風の数字パターン（3x5ブロック）
        // 1=ブロックあり、0=なし
        this.digitPatterns = {
            0: [
                [1, 1, 1],
                [1, 0, 1],
                [1, 0, 1],
                [1, 0, 1],
                [1, 1, 1]
            ],
            1: [
                [0, 1, 0],
                [1, 1, 0],
                [0, 1, 0],
                [0, 1, 0],
                [1, 1, 1]
            ],
            2: [
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 1],
                [1, 0, 0],
                [1, 1, 1]
            ],
            3: [
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 1]
            ],
            4: [
                [1, 0, 1],
                [1, 0, 1],
                [1, 1, 1],
                [0, 0, 1],
                [0, 0, 1]
            ],
            5: [
                [1, 1, 1],
                [1, 0, 0],
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 1]
            ],
            6: [
                [1, 1, 1],
                [1, 0, 0],
                [1, 1, 1],
                [1, 0, 1],
                [1, 1, 1]
            ],
            7: [
                [1, 1, 1],
                [0, 0, 1],
                [0, 0, 1],
                [0, 0, 1],
                [0, 0, 1]
            ],
            8: [
                [1, 1, 1],
                [1, 0, 1],
                [1, 1, 1],
                [1, 0, 1],
                [1, 1, 1]
            ],
            9: [
                [1, 1, 1],
                [1, 0, 1],
                [1, 1, 1],
                [0, 0, 1],
                [1, 1, 1]
            ]
        };
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

        // チャンク座標を数字で描画
        this._drawChunkCoordinates(chunkData);
    }

    /**
     * チャンク座標を数字ブロックで描画
     * X座標を上段、Z座標を下段に配置
     * 正の数はstone、負の数はdirtで描画
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    _drawChunkCoordinates(chunkData) {
        const chunkX = chunkData.chunkX;
        const chunkZ = chunkData.chunkZ;

        // 描画開始位置（チャンク中央付近）
        const startX = 4;
        const baseY = 64; // 地表の上

        // X座標を描画（上段）
        const xBlock = chunkX >= 0 ? 'stone' : 'dirt';
        const xDigits = this._numberToDigits(Math.abs(chunkX));
        let currentZ = 2;
        this._drawDigits(chunkData, xDigits, startX, baseY, currentZ, xBlock);

        // Z座標を描画（下段、1ブロック空けて）
        const zBlock = chunkZ >= 0 ? 'stone' : 'dirt';
        const zDigits = this._numberToDigits(Math.abs(chunkZ));
        currentZ = 2 + 5 + 1; // 5行 + 1ブロック空け
        this._drawDigits(chunkData, zDigits, startX, baseY, currentZ, zBlock);
    }

    /**
     * 数値を桁の配列に変換
     * @param {number} num - 数値
     * @returns {number[]} 桁の配列
     */
    _numberToDigits(num) {
        if (num === 0) return [0];
        const digits = [];
        while (num > 0) {
            digits.unshift(num % 10);
            num = Math.floor(num / 10);
        }
        return digits;
    }

    /**
     * 数字の配列を描画
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     * @param {number[]} digits - 桁の配列
     * @param {number} startX - 描画開始X座標
     * @param {number} baseY - 描画開始Y座標
     * @param {number} startZ - 描画開始Z座標
     * @param {string} blockType - 使用するブロック種類
     */
    _drawDigits(chunkData, digits, startX, baseY, startZ, blockType) {
        let offsetX = 0;

        for (const digit of digits) {
            this._drawDigit(chunkData, digit, startX + offsetX, baseY, startZ, blockType);
            offsetX += 4; // 3ブロック幅 + 1ブロック間隔
        }
    }

    /**
     * 1つの数字を描画（地表に水平に配置）
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     * @param {number} digit - 数字（0-9）
     * @param {number} startX - 描画開始X座標
     * @param {number} baseY - 描画Y座標（固定）
     * @param {number} startZ - 描画開始Z座標
     * @param {string} blockType - 使用するブロック種類
     */
    _drawDigit(chunkData, digit, startX, baseY, startZ, blockType) {
        const pattern = this.digitPatterns[digit];
        if (!pattern) return;

        // 地表（X-Z平面）に水平に描画
        // 数字の上部が北側（Z+方向）を向くように配置
        // row（0-4）→ Z方向に対応（反転して上部がZ+側に）
        // col（0-2）→ X方向に対応
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) {
                if (pattern[row][col] === 1) {
                    const x = startX + col;
                    const y = baseY; // Y座標は固定（地表）
                    const z = startZ + (4 - row); // 反転: row=0が最大Z（北側）

                    // チャンク範囲内かチェック
                    if (x >= 0 && x < ChunkData.SIZE_X &&
                        z >= 0 && z < ChunkData.SIZE_Z &&
                        y >= 0 && y < ChunkData.SIZE_Y) {
                        chunkData.setBlock(x, y, z, blockType);
                    }
                }
            }
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
