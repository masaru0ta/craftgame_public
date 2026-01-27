/**
 * WorldGenerator - 地形生成クラス
 */
class WorldGenerator {
    constructor() {
        // 将来的にシード値などを保持

        // ワールドタイプ（"flat" または "perlin"）
        this.worldType = 'flat';

        // デフォルトの地形高さ
        this.defaultTerrainHeight = 64;

        // デフォルトの地形色（草の色）
        this.defaultTerrainColor = '#4CAF50';

        // パーリンノイズ1（ベース地形 - 細かい起伏）
        this.perlin1Seed = 12345;
        this.perlin1Scale = 0.02;
        this.perlin1Amplitude = 0.3;

        // パーリンノイズ2（山 - 大きい高さ、広い間隔）
        this.perlin2Seed = 67890;
        this.perlin2Scale = 0.005;
        this.perlin2Amplitude = 1.0;
        this.perlin2Threshold = 60;  // この高さ以上で振幅3倍

        // 共通パラメータ
        this.perlinMinHeight = 40;
        this.perlinMaxHeight = 100;

        // 後方互換性のためのエイリアス
        this.perlinSeed = this.perlin1Seed;
        this.perlinScale = this.perlin1Scale;

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

    /**
     * ワールドタイプを設定
     * @param {string} type - "flat" または "perlin"
     */
    setWorldType(type) {
        this.worldType = type;
    }

    /**
     * 現在のワールドタイプに応じてチャンクを生成
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    generate(chunkData) {
        if (this.worldType === 'perlin') {
            this.generateSimplePerlin(chunkData);
        } else {
            this.generateTest(chunkData);
        }
    }

    /**
     * 簡易パーリンノイズ地形を生成
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    generateSimplePerlin(chunkData) {
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;
        const chunkX = chunkData.chunkX;
        const chunkZ = chunkData.chunkZ;

        for (let lz = 0; lz < sizeZ; lz++) {
            for (let lx = 0; lx < sizeX; lx++) {
                // ワールド座標を計算
                const worldX = chunkX * sizeX + lx;
                const worldZ = chunkZ * sizeZ + lz;

                // 高さを計算
                const height = this._getPerlinHeight(worldX, worldZ);

                // 地下を土で埋める
                for (let y = 0; y < height; y++) {
                    chunkData.setBlock(lx, y, lz, 'dirt');
                }

                // 高さに応じた表面ブロック
                let surfaceBlock;
                if (height >= 80) {
                    surfaceBlock = 'stone';  // 山頂は石
                } else {
                    surfaceBlock = 'grass';  // それ以外は草
                }
                chunkData.setBlock(lx, height, lz, surfaceBlock);
            }
        }
    }

    /**
     * 単一ノイズ値を計算（サイン波の組み合わせ）
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @param {number} scale - ノイズスケール
     * @param {number} seed - シード値
     * @returns {number} -1〜1のノイズ値
     */
    _calculateNoise(worldX, worldZ, scale, seed) {
        const x = worldX * scale;
        const z = worldZ * scale;

        let noise = 0;
        noise += Math.sin(x * 1.0 + seed) * 0.5;
        noise += Math.sin(z * 1.0 + seed * 1.3) * 0.5;
        noise += Math.sin((x + z) * 0.7 + seed * 0.7) * 0.3;
        noise += Math.sin((x - z) * 0.5 + seed * 1.1) * 0.2;

        // -1.5〜1.5 を -1〜1 に正規化
        return noise / 1.5;
    }

    /**
     * 2層パーリンノイズで高さを計算
     * ノイズ1: ベース地形（細かい起伏）
     * ノイズ2: 山（大きい高さ、広い間隔）、閾値超過時に振幅3倍
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {number} 地形の高さ
     */
    _getPerlinHeight(worldX, worldZ) {
        // ノイズ1（ベース地形）
        const noise1 = this._calculateNoise(worldX, worldZ, this.perlin1Scale, this.perlin1Seed);

        // ノイズ2（山）
        const noise2 = this._calculateNoise(worldX, worldZ, this.perlin2Scale, this.perlin2Seed);

        // 2つのノイズを振幅で重み付けして合成（-1〜1の範囲）
        const totalAmplitude = this.perlin1Amplitude + this.perlin2Amplitude;
        const combinedNoise = (noise1 * this.perlin1Amplitude + noise2 * this.perlin2Amplitude) / totalAmplitude;

        // -1〜1 を 0〜1 に正規化
        const normalized = (combinedNoise + 1) / 2;

        // smoothstep で滑らかに補間
        const smooth = normalized * normalized * (3 - 2 * normalized);

        // 基本高さを計算
        let baseHeight = this.perlinMinHeight + smooth * (this.perlinMaxHeight - this.perlinMinHeight);

        // 山閾値を超えた場合、超過分を3倍に強調
        if (baseHeight > this.perlin2Threshold) {
            const excess = baseHeight - this.perlin2Threshold;
            baseHeight = this.perlin2Threshold + excess * 3;
        }

        const height = Math.floor(baseHeight);
        return Math.max(this.perlinMinHeight, Math.min(this.perlinMaxHeight, height));
    }

    /**
     * 指定座標の地形の高さを取得
     * LoD 2/3 で使用する簡易高さ情報
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {number} 地形の高さ（Y座標）
     */
    getTerrainHeight(worldX, worldZ) {
        if (this.worldType === 'perlin') {
            return this._getPerlinHeight(worldX, worldZ);
        }
        // フラット地形なので固定値を返す
        return this.defaultTerrainHeight;
    }

    /**
     * 指定座標の地形の色を取得
     * LoD 2/3 で使用する簡易色情報
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {string} 色（16進数形式、例: "#4CAF50"）
     */
    getTerrainColor(worldX, worldZ) {
        if (this.worldType === 'perlin') {
            // 高さに応じたグラデーション（低い=濃い緑、高い=薄い緑）
            const height = this._getPerlinHeight(worldX, worldZ);
            return this._heightToColor(height);
        }
        // フラット地形なので固定色を返す
        return this.defaultTerrainColor;
    }

    /**
     * 高さから色を計算（パーリンノイズ用）
     * @param {number} height - 地形の高さ
     * @returns {string} 色（16進数形式）
     */
    _heightToColor(height) {
        let r, g, b;
        const lowThreshold = 64;  // 低地→高地の境界
        const midHeight = 80;     // 高地→山頂の境界

        if (height < lowThreshold) {
            // 低地（40〜64）: 濃い緑 → 薄い緑
            const t = (height - this.perlinMinHeight) / (lowThreshold - this.perlinMinHeight);
            r = Math.floor(0x2E + t * (0x4C - 0x2E));
            g = Math.floor(0x7D + t * (0xAF - 0x7D));
            b = Math.floor(0x32 + t * (0x50 - 0x32));
        } else if (height < midHeight) {
            // 高地（64〜80）: 薄い緑 → 茶色
            const t = (height - lowThreshold) / (midHeight - lowThreshold);
            r = Math.floor(0x4C + t * (0x8B - 0x4C));
            g = Math.floor(0xAF + t * (0x73 - 0xAF));
            b = Math.floor(0x50 + t * (0x47 - 0x50));
        } else {
            // 山頂（80〜100）: 茶色 → 灰色
            const t = (height - midHeight) / (this.perlinMaxHeight - midHeight);
            r = Math.floor(0x8B + t * (0x9E - 0x8B));
            g = Math.floor(0x73 + t * (0x9E - 0x73));
            b = Math.floor(0x47 + t * (0x9E - 0x47));
        }

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
}

// グローバルスコープに公開
window.WorldGenerator = WorldGenerator;
