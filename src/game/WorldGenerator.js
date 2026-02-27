/**
 * WorldGenerator - 地形生成クラス
 */
class WorldGenerator {
    constructor() {
        // 将来的にシード値などを保持

        // ワールドタイプ（"flat", "perlin", "realmap"）
        this.worldType = 'flat';

        // リアル地形ローダー
        this.realMapLoader = null;

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

        // 木配置用
        this.treeSeed = 54321;
        // 草配置用
        this.grassSeed = 12345;
        // 棒配置用
        this.stickSeed = 99999;
        this._treeStructure = null;   // デコード済みStructureData
        this._treeOffset = [0, 0, 0]; // 構造物のオフセット [ox, oy, oz]
        this._treeSizeX = 0;
        this._treeSizeY = 0;
        this._treeSizeZ = 0;

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
     * - y=63: lod_testブロック(lod_test)
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

        // y=63: lod_testブロック（ベース）
        for (let z = 0; z < sizeZ; z++) {
            for (let x = 0; x < sizeX; x++) {
                chunkData.setBlock(x, 63, z, 'lod_test');
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
     * @param {string} type - "flat", "perlin", "realmap"
     */
    setWorldType(type) {
        this.worldType = type;
    }

    /**
     * 現在のワールドタイプに応じてチャンクを生成
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    generate(chunkData) {
        if (this.worldType === 'realmap') {
            // baseY を算出してチャンクデータに設定
            chunkData.baseY = this.calculateBaseY(chunkData.chunkX, chunkData.chunkZ);
            this.generateRealMap(chunkData);
        } else if (this.worldType === 'perlin') {
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

    // ========== リアル地形マップ ==========

    /**
     * 被覆クラスインデックスからサーフェスブロックIDへのマッピング
     */
    static get LC_SURFACE_BLOCKS() {
        return ['water', 'grass', 'grass', 'grass', 'dirt', 'stone', 'sand', 'stone', 'water', 'grass', 'grass', 'grass'];
    }

    /**
     * 被覆クラスインデックスからサブサーフェスブロックIDへのマッピング
     */
    static get LC_SUB_SURFACE_BLOCKS() {
        return ['sand', 'dirt', 'dirt', 'dirt', 'dirt', 'stone', 'stone', 'stone', 'sand', 'dirt', 'dirt', 'dirt'];
    }

    /**
     * 被覆クラスインデックスからLoD色へのマッピング
     */
    static get LC_COLORS() {
        return [
            '#1565C0', // 0: 海/不明（青）
            '#006400', // 1: 樹木（濃緑）
            '#C8961E', // 2: 低木（黄土）
            '#B4D23C', // 3: 草地（黄緑）
            '#BE78D2', // 4: 農地（紫）
            '#C8B4A0', // 5: 市街地（ベージュ）
            '#A0A0A0', // 6: 裸地（灰）
            '#E6E6F0', // 7: 雪氷（白）
            '#1E50B4', // 8: 水域（青）
            '#008C96', // 9: 湿地（ティール）
            '#00B464', // 10: マングローブ（緑）
            '#D2C382', // 11: 蘚苔（ベージュ）
        ];
    }

    /** 海面のY座標 */
    static get SEA_LEVEL() { return 64; }
    /** 表面から石層までの深さ */
    static get STONE_DEPTH() { return 5; }

    /**
     * チャンク領域の最適な baseY を算出
     * @param {number} chunkX - チャンクX座標
     * @param {number} chunkZ - チャンクZ座標
     * @returns {number} baseY（ワールドY座標のオフセット）
     */
    calculateBaseY(chunkX, chunkZ) {
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;
        const SEA_LEVEL = WorldGenerator.SEA_LEVEL;
        const loader = this.realMapLoader;

        let minWorldY = Infinity;
        let maxWorldY = -Infinity;

        for (let lz = 0; lz < sizeZ; lz++) {
            for (let lx = 0; lx < sizeX; lx++) {
                const worldX = chunkX * sizeX + lx;
                const worldZ = chunkZ * sizeZ + lz;
                const elevBlocks = loader ? loader.getElevation(worldX, worldZ) : 0;
                const surfaceY = SEA_LEVEL + elevBlocks;

                // 水域の場合は海面も考慮
                const lcIndex = loader ? loader.getLandcover(worldX, worldZ) : 0;
                const effectiveMin = (lcIndex === 0 || lcIndex === 8) ? Math.min(surfaceY, SEA_LEVEL) : surfaceY;
                const effectiveMax = (lcIndex === 0 || lcIndex === 8) ? Math.max(surfaceY, SEA_LEVEL) : surfaceY;

                if (effectiveMin < minWorldY) minWorldY = effectiveMin;
                if (effectiveMax > maxWorldY) maxWorldY = effectiveMax;
            }
        }

        // 地表がチャンク高さの中央付近に来るよう配置
        let baseY = Math.round((minWorldY + maxWorldY) / 2) - 64;

        // 範囲に収まるようクランプ
        baseY = Math.max(baseY, maxWorldY - 127);  // 最高点が収まるように
        baseY = Math.min(baseY, minWorldY - 1);     // 岩盤が収まるように

        return baseY;
    }

    /**
     * リアル地形マップからチャンクを生成
     * @param {ChunkData} chunkData - 対象のチャンクデータ
     */
    generateRealMap(chunkData) {
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;
        const chunkX = chunkData.chunkX;
        const chunkZ = chunkData.chunkZ;
        const SEA_LEVEL = WorldGenerator.SEA_LEVEL;
        const STONE_DEPTH = WorldGenerator.STONE_DEPTH;
        const surfaceBlocks = WorldGenerator.LC_SURFACE_BLOCKS;
        const subSurfaceBlocks = WorldGenerator.LC_SUB_SURFACE_BLOCKS;
        const loader = this.realMapLoader;
        const baseY = chunkData.baseY;

        for (let lz = 0; lz < sizeZ; lz++) {
            for (let lx = 0; lx < sizeX; lx++) {
                const worldX = chunkX * sizeX + lx;
                const worldZ = chunkZ * sizeZ + lz;

                // 地形データ取得
                const elevBlocks = loader ? loader.getElevation(worldX, worldZ) : 0;
                const lcIndex = loader ? loader.getLandcover(worldX, worldZ) : 0;

                // 表面Y座標（ワールド → ローカル変換）
                const worldSurfaceY = SEA_LEVEL + elevBlocks;
                const localSurfaceY = worldSurfaceY - baseY;
                const localSeaLevel = SEA_LEVEL - baseY;

                // ローカルY範囲にクランプ
                const clampedSurfaceY = Math.max(1, Math.min(127, localSurfaceY));

                // サーフェスブロック・サブサーフェスブロック
                const surfBlock = surfaceBlocks[lcIndex] || 'stone';
                const subBlock = subSurfaceBlocks[lcIndex] || 'stone';

                // y=0: 岩盤
                chunkData.setBlock(lx, 0, lz, 'stone');

                // y=1 ～ clampedSurfaceY - STONE_DEPTH: 石
                const stoneTop = Math.max(1, clampedSurfaceY - STONE_DEPTH);
                for (let y = 1; y <= stoneTop; y++) {
                    chunkData.setBlock(lx, y, lz, 'stone');
                }

                // clampedSurfaceY - STONE_DEPTH + 1 ～ clampedSurfaceY - 1: サブサーフェス
                for (let y = stoneTop + 1; y < clampedSurfaceY; y++) {
                    chunkData.setBlock(lx, y, lz, subBlock);
                }

                // clampedSurfaceY: サーフェス
                chunkData.setBlock(lx, clampedSurfaceY, lz, surfBlock);

                // 水面生成: 海(0)・水域(8) で localSurfaceY < localSeaLevel の場合
                if ((lcIndex === 0 || lcIndex === 8) && clampedSurfaceY < localSeaLevel) {
                    const clampedSeaLevel = Math.min(127, localSeaLevel);
                    for (let y = clampedSurfaceY + 1; y <= clampedSeaLevel; y++) {
                        chunkData.setBlock(lx, y, lz, 'water');
                    }
                }
            }
        }

        // 木の配置（地形生成後）
        this._placeTreesInChunk(chunkData);

        // 草の配置（木の後、木ブロックがある位置には生えない）
        this._placeGrassInChunk(chunkData);

        // 棒の配置（草の後、既存ブロックがある位置には生えない）
        this._placeSticksInChunk(chunkData);
    }

    // ========== 構造物自動配置（木） ==========

    /** 木配置グリッドセルサイズ */
    static get TREE_GRID() { return 8; }
    /** 木配置確率 */
    static get TREE_DENSITY() { return 0.8; }

    // ========== 草ブロック自動配置 ==========

    /** 草配置グリッドセルサイズ */
    static get GRASS_GRID() { return 2; }
    /** 草配置確率 */
    static get GRASS_DENSITY() { return 0.6; }

    // ========== 棒ブロック自動配置 ==========

    /** 棒配置グリッドセルサイズ */
    static get STICK_GRID() { return 6; }
    /** 棒配置確率 */
    static get STICK_DENSITY() { return 0.3; }

    /**
     * 木構造物データを設定
     * @param {Object} structureRecord - GAS構造物レコード
     */
    setTreeStructure(structureRecord) {
        const parsed = typeof structureRecord.palette === 'string'
            ? JSON.parse(structureRecord.palette) : structureRecord.palette;

        let palette, offset;
        if (Array.isArray(parsed)) {
            palette = parsed;
            offset = [0, 0, 0];
        } else {
            palette = parsed.blocks;
            offset = parsed.offset || [0, 0, 0];
        }

        const sx = structureRecord.size_x || 0;
        const sy = structureRecord.size_y || 0;
        const sz = structureRecord.size_z || 0;

        this._treeStructure = StructureData.decode(
            structureRecord.voxel_data,
            structureRecord.orientation_data || '',
            palette, sx, sy, sz,
            Math.max(sx, sy, sz, 1), 0, 0, 0
        );
        this._treeOffset = offset;
        this._treeSizeX = sx;
        this._treeSizeY = sy;
        this._treeSizeZ = sz;

        // 木ブロック位置をプリキャッシュ（forEachBlockの繰り返し呼び出しを排除）
        const blocks = [];
        this._treeStructure.forEachBlock((bx, by, bz, blockStrId) => {
            blocks.push({ bx, by, bz, blockStrId });
        });
        this._treeBlockCache = blocks;
    }

    /**
     * 座標ベースの決定的ハッシュ関数（整数版）
     * @param {number} x
     * @param {number} z
     * @param {number} seed
     * @returns {number} 符号なし32ビット整数
     */
    _hashRaw(x, z, seed) {
        let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1013904223);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        n = n ^ (n >>> 16);
        n = Math.imul(n ^ (n >>> 13), 1103515245);
        n = n ^ (n >>> 16);
        return n >>> 0;
    }

    /**
     * 座標ベースの決定的ハッシュ関数（0.0〜1.0版）
     * @param {number} x
     * @param {number} z
     * @param {number} seed
     * @returns {number} 0.0〜1.0
     */
    _hashPosition(x, z, seed) {
        return this._hashRaw(x, z, seed) / 0xFFFFFFFF;
    }

    /**
     * チャンク内に木を配置する（最適化版）
     * @param {ChunkData} chunkData
     */
    _placeTreesInChunk(chunkData) {
        const cache = this._treeBlockCache;
        if (!cache || cache.length === 0) return;

        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;
        const cx = chunkData.chunkX;
        const cz = chunkData.chunkZ;
        const baseY = chunkData.baseY;
        const SEA_LEVEL = WorldGenerator.SEA_LEVEL;
        const loader = this.realMapLoader;
        const GRID = WorldGenerator.TREE_GRID;
        const DENSITY = WorldGenerator.TREE_DENSITY;
        const off = this._treeOffset;
        const treeSeed = this.treeSeed;

        // 木パレットを事前登録（_expandBitsを配置ループ前に1回で済ませる）
        const treePalette = this._treeStructure.getPalette();
        for (let i = 1; i < treePalette.length; i++) {
            chunkData.ensurePaletteEntry(treePalette[i]);
        }

        // チャンクワールド座標範囲
        const chunkWorldMinX = cx * sizeX;
        const chunkWorldMaxX = cx * sizeX + sizeX - 1;
        const chunkWorldMinZ = cz * sizeZ;
        const chunkWorldMaxZ = cz * sizeZ + sizeZ - 1;

        // 木サイズとオフセットから、スキャン範囲を計算
        const treeMaxX = off[0] + this._treeSizeX - 1;
        const treeMaxZ = off[2] + this._treeSizeZ - 1;

        const scanMinX = chunkWorldMinX - treeMaxX;
        const scanMaxX = chunkWorldMaxX - off[0];
        const scanMinZ = chunkWorldMinZ - treeMaxZ;
        const scanMaxZ = chunkWorldMaxZ - off[2];

        // スキャン範囲のグリッドセルを列挙
        const cellMinX = Math.floor(scanMinX / GRID);
        const cellMaxX = Math.floor(scanMaxX / GRID);
        const cellMinZ = Math.floor(scanMinZ / GRID);
        const cellMaxZ = Math.floor(scanMaxZ / GRID);

        const cacheLen = cache.length;

        for (let cellZ = cellMinZ; cellZ <= cellMaxZ; cellZ++) {
            for (let cellX = cellMinX; cellX <= cellMaxX; cellX++) {
                const baseCellX = cellX * GRID;
                const baseCellZ = cellZ * GRID;

                // 1回のハッシュから密度判定・X/Zオフセットを導出
                const hash = this._hashRaw(baseCellX, baseCellZ, treeSeed);
                if ((hash >>> 0) / 0xFFFFFFFF >= DENSITY) continue;

                const rootX = baseCellX + ((hash >>> 8) % GRID);
                const rootZ = baseCellZ + ((hash >>> 16) % GRID);

                // 被覆チェック: lcIndex===1（樹木）のみ
                if (!loader || loader.getLandcover(rootX, rootZ) !== 1) continue;

                // 地表Y座標（ワールド座標）: 地表の1ブロック上を根元とする
                const elevBlocks = loader.getElevation(rootX, rootZ);
                const rootWorldY = SEA_LEVEL + elevBlocks + 1;

                // Y範囲の早期リジェクト
                const treeMinLocalY = rootWorldY + off[1] - baseY;
                const treeMaxLocalY = treeMinLocalY + this._treeSizeY - 1;
                if (treeMaxLocalY < 0 || treeMinLocalY >= 128) continue;

                // キャッシュ配列をダイレクトイテレート
                const offX = rootX + off[0] - chunkWorldMinX;
                const offY = rootWorldY + off[1] - baseY;
                const offZ = rootZ + off[2] - chunkWorldMinZ;

                for (let i = 0; i < cacheLen; i++) {
                    const block = cache[i];
                    const lx = offX + block.bx;
                    const ly = offY + block.by;
                    const lz = offZ + block.bz;

                    if (lx >= 0 && lx < sizeX && ly >= 0 && ly < 128 && lz >= 0 && lz < sizeZ) {
                        const existing = chunkData.getBlock(lx, ly, lz);
                        if (existing === 'air' || existing === 'water') {
                            chunkData.setBlock(lx, ly, lz, block.blockStrId);
                        }
                    }
                }
            }
        }
    }

    /**
     * チャンク内に草を配置する
     * @param {ChunkData} chunkData
     */
    /**
     * 地表に単体ブロックをグリッド+ハッシュ方式で配置する汎用メソッド
     * @param {ChunkData} chunkData - チャンクデータ
     * @param {string} blockId - 配置するブロックID
     * @param {number} grid - グリッドセルサイズ
     * @param {number} density - 配置確率 (0.0-1.0)
     * @param {number} seed - ハッシュシード
     */
    _placeSurfaceBlockInChunk(chunkData, blockId, grid, density, seed) {
        const loader = this.realMapLoader;
        if (!loader) return;

        const SEA_LEVEL = WorldGenerator.SEA_LEVEL;
        const sizeX = ChunkData.SIZE_X;
        const sizeZ = ChunkData.SIZE_Z;
        const baseY = chunkData.baseY;
        const cx = chunkData.chunkX;
        const cz = chunkData.chunkZ;

        chunkData.ensurePaletteEntry(blockId);

        const chunkWorldMinX = cx * sizeX;
        const chunkWorldMinZ = cz * sizeZ;

        const cellMinX = Math.floor(chunkWorldMinX / grid);
        const cellMaxX = Math.floor((chunkWorldMinX + sizeX - 1) / grid);
        const cellMinZ = Math.floor(chunkWorldMinZ / grid);
        const cellMaxZ = Math.floor((chunkWorldMinZ + sizeZ - 1) / grid);

        for (let cellZ = cellMinZ; cellZ <= cellMaxZ; cellZ++) {
            for (let cellX = cellMinX; cellX <= cellMaxX; cellX++) {
                const baseCellX = cellX * grid;
                const baseCellZ = cellZ * grid;

                const hash = this._hashRaw(baseCellX, baseCellZ, seed);
                if ((hash >>> 0) / 0xFFFFFFFF >= density) continue;

                const worldX = baseCellX + ((hash >>> 8) % grid);
                const worldZ = baseCellZ + ((hash >>> 16) % grid);

                const lx = worldX - chunkWorldMinX;
                const lz = worldZ - chunkWorldMinZ;
                if (lx < 0 || lx >= sizeX || lz < 0 || lz >= sizeZ) continue;

                // 被覆チェック: 樹木(1), 低木(2), 草地(3)
                const lc = loader.getLandcover(worldX, worldZ);
                if (lc !== 1 && lc !== 2 && lc !== 3) continue;

                const elevBlocks = loader.getElevation(worldX, worldZ);
                const surfaceWorldY = SEA_LEVEL + elevBlocks;
                const placeY = surfaceWorldY - baseY + 1;

                if (placeY < 0 || placeY >= 128) continue;
                if (chunkData.getBlock(lx, placeY, lz) !== 'air') continue;

                chunkData.setBlock(lx, placeY, lz, blockId);
            }
        }
    }

    _placeGrassInChunk(chunkData) {
        this._placeSurfaceBlockInChunk(chunkData, 'short_grass',
            WorldGenerator.GRASS_GRID, WorldGenerator.GRASS_DENSITY, this.grassSeed);
    }

    _placeSticksInChunk(chunkData) {
        this._placeSurfaceBlockInChunk(chunkData, 'stick',
            WorldGenerator.STICK_GRID, WorldGenerator.STICK_DENSITY, this.stickSeed);
    }

    /**
     * 指定座標の地形の高さを取得
     * LoD で使用する簡易高さ情報
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {number} 地形の高さ（Y座標）
     */
    getTerrainHeight(worldX, worldZ) {
        if (this.worldType === 'realmap' && this.realMapLoader && this.realMapLoader.loaded) {
            const elev = this.realMapLoader.getElevation(worldX, worldZ);
            const surfaceY = WorldGenerator.SEA_LEVEL + elev;
            // 海面下は海面高さを返す（水面の高さ）
            return Math.max(surfaceY, WorldGenerator.SEA_LEVEL);
        }
        if (this.worldType === 'perlin') {
            return this._getPerlinHeight(worldX, worldZ);
        }
        // フラット地形なので固定値を返す
        return this.defaultTerrainHeight;
    }

    /**
     * 指定座標の地形の色を取得
     * LoD で使用する簡易色情報
     * @param {number} worldX - ワールドX座標
     * @param {number} worldZ - ワールドZ座標
     * @returns {string} 色（16進数形式、例: "#4CAF50"）
     */
    getTerrainColor(worldX, worldZ) {
        if (this.worldType === 'realmap' && this.realMapLoader && this.realMapLoader.loaded) {
            const lcIndex = this.realMapLoader.getLandcover(worldX, worldZ);
            return WorldGenerator.LC_COLORS[lcIndex] || '#505050';
        }
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
