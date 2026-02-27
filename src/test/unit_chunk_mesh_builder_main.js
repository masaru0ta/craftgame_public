/**
 * ChunkMeshBuilder ユニットテスト (Golden Master)
 * リファクタリング前の出力を保証するためのテスト
 */

// ========================================
// ゴールデンマスター設定
// ========================================

// true にすると値をキャプチャして表示（初回用）
const CAPTURE_MODE = false;

// キャプチャした値をここにハードコード（CAPTURE_MODE=false で検証）
const GOLDEN = {
    build_CULLED_nogreedy: { vertexCount: 200, indexCount: 300, posHash: 1743276, normHash: 13968 },
    build_CULLED_greedy:   { vertexCount: 108, indexCount: 162, posHash: 429949, normHash: 5210 },
    buildLoD1_greedy:      { vertexCount: 108, indexCount: 162, posHash: 428461, normHash: 5210 },
    buildWaterMesh:        { vertexCount: 20, indexCount: 30, posHash: 14324, normHash: 22 },
};

// ========================================
// テストランナー
// ========================================

class TestRunner {
    constructor() {
        this.tests = [];
        this.results = [];
    }

    add(category, name, fn) {
        this.tests.push({ category, name, fn });
    }

    async runAll() {
        for (const test of this.tests) {
            try {
                await test.fn();
                this.results.push({ category: test.category, name: test.name, passed: true });
            } catch (e) {
                this.results.push({
                    category: test.category,
                    name: test.name,
                    passed: false,
                    error: e.message
                });
            }
        }
        return this.results;
    }
}

// ========================================
// アサーション
// ========================================

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertClose(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Assertion failed'}: expected ~${expected}, got ${actual} (tolerance: ${tolerance})`);
    }
}

function assertArrayEqual(actual, expected, message) {
    if (actual.length !== expected.length) {
        throw new Error(`${message || 'Array mismatch'}: length ${actual.length} vs ${expected.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(`${message || 'Array mismatch'}: index ${i}: ${actual[i]} vs ${expected[i]}`);
        }
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || 'Expected true');
    }
}

// 配列のハッシュ（順序依存の重み付き合算）
function hashFloatArray(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i] * (i + 1);
    }
    // 丸めて浮動小数点誤差を吸収
    return Math.round(sum * 1000) / 1000;
}

// メッシュのフィンガープリントを取得
function getMeshFingerprint(mesh) {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    const vertexCount = posAttr ? posAttr.count : 0;
    const indexCount = geo.index ? geo.index.count : 0;
    const posHash = posAttr ? hashFloatArray(posAttr.array) : 0;
    const normAttr = geo.getAttribute('normal');
    const normHash = normAttr ? hashFloatArray(normAttr.array) : 0;
    return { vertexCount, indexCount, posHash, normHash };
}

// ========================================
// DOM描画
// ========================================

function renderResults(results) {
    const container = document.getElementById('results');
    const status = document.getElementById('status');

    const passCount = results.filter(r => r.passed).length;
    const failCount = results.length - passCount;

    if (failCount === 0) {
        status.textContent = `ALL PASSED (${passCount}/${results.length})`;
        status.style.color = '#4caf50';
    } else {
        status.textContent = `FAILED (${failCount}/${results.length} failed)`;
        status.style.color = '#f44336';
    }

    let currentCategory = '';
    for (const result of results) {
        if (result.category !== currentCategory) {
            currentCategory = result.category;
            const catDiv = document.createElement('div');
            catDiv.className = 'category';
            catDiv.textContent = currentCategory;
            container.appendChild(catDiv);
        }

        const div = document.createElement('div');
        div.className = `test-item ${result.passed ? 'pass' : 'fail'}`;
        div.textContent = `${result.passed ? 'PASS' : 'FAIL'}: ${result.name}`;
        if (result.error) {
            const err = document.createElement('div');
            err.className = 'error';
            err.textContent = result.error;
            div.appendChild(err);
        }
        container.appendChild(div);
    }

    // Playwright 用にグローバルに公開
    window.testResults = {
        total: results.length,
        passed: passCount,
        failed: failCount,
        details: results
    };
}

function showCapture(name, values) {
    console.log(`GOLDEN: ${name}`, JSON.stringify(values));
    const output = document.getElementById('capture-output');
    output.style.display = 'block';
    output.textContent += `${name}: ${JSON.stringify(values)}\n`;
}

// ========================================
// テストフィクスチャ
// ========================================

function createTestChunk() {
    const chunk = new ChunkData(0, 0);

    // 孤立ブロック
    chunk.setBlock(5, 10, 5, 'stone');
    // 積み重ね
    chunk.setBlock(5, 11, 5, 'stone');
    // 隣接（異種ブロック）
    chunk.setBlock(6, 10, 5, 'dirt');
    // 水ブロック
    chunk.setBlock(7, 10, 5, 'water');

    // 3x2 stone wall（グリーディメッシング検証用）
    for (let x = 10; x < 13; x++) {
        for (let y = 20; y < 22; y++) {
            chunk.setBlock(x, y, 5, 'stone');
        }
    }

    // L字コーナー（AO検証用）
    chunk.setBlock(3, 10, 3, 'stone');
    chunk.setBlock(4, 10, 3, 'stone');
    chunk.setBlock(3, 10, 4, 'stone');

    // ハイトマップ構築
    chunk.buildHeightMap(new Set());

    // ライトマップ計算
    const lightCalc = new LightCalculator();
    lightCalc.calculate(chunk, null);

    return chunk;
}

// ========================================
// カテゴリ1: 純粋関数テスト
// ========================================

function registerPureFunctionTests(runner, builder) {
    const CAT = '1. 純粋関数';

    // --- _faceLightingFactor ---
    // LIGHT_DIR = normalize([0.5, 1.0, 0.3])
    const len = Math.sqrt(0.5*0.5 + 1.0*1.0 + 0.3*0.3);
    const ldx = 0.5/len, ldy = 1.0/len, ldz = 0.3/len;

    const faceLightTests = [
        { name: 'top [0,1,0]',    normal: [0,1,0],   dot: ldy },
        { name: 'bottom [0,-1,0]', normal: [0,-1,0], dot: -ldy },
        { name: 'right [1,0,0]',  normal: [1,0,0],   dot: ldx },
        { name: 'left [-1,0,0]',  normal: [-1,0,0],  dot: -ldx },
        { name: 'front [0,0,-1]', normal: [0,0,-1],  dot: -ldz },
        { name: 'back [0,0,1]',   normal: [0,0,1],   dot: ldz },
    ];

    for (const t of faceLightTests) {
        runner.add(CAT, `_faceLightingFactor - ${t.name}`, () => {
            const factor = ChunkMeshBuilder._faceLightingFactor(t.normal);
            const expected = 0.4 + 1.0 * Math.max(t.dot, 0);
            assertClose(factor, expected, 0.001, t.name);
        });
    }

    // --- _lightFactor ---
    runner.add(CAT, '_lightFactor - level 0 (min)', () => {
        assertClose(ChunkMeshBuilder._lightFactor(0), 0.1, 0.001);
    });
    runner.add(CAT, '_lightFactor - level 7 (mid)', () => {
        assertClose(ChunkMeshBuilder._lightFactor(7), 0.1 + 7/15 * 0.9, 0.001);
    });
    runner.add(CAT, '_lightFactor - level 15 (max)', () => {
        assertClose(ChunkMeshBuilder._lightFactor(15), 1.0, 0.001);
    });
    runner.add(CAT, '_lightFactor - undefined → 1.0', () => {
        assertEqual(ChunkMeshBuilder._lightFactor(undefined), 1.0);
    });

    // --- _addQuadIndices ---
    runner.add(CAT, '_addQuadIndices - 通常 (ao対角和が等しい)', () => {
        const indices = [];
        ChunkMeshBuilder._addQuadIndices(indices, 0, [0, 0, 0, 0]);
        assertArrayEqual(indices, [0, 1, 2, 0, 2, 3]);
    });
    runner.add(CAT, '_addQuadIndices - フリップ (ao[0]+ao[2] > ao[1]+ao[3])', () => {
        const indices = [];
        ChunkMeshBuilder._addQuadIndices(indices, 0, [2, 0, 2, 0]);
        assertArrayEqual(indices, [0, 1, 3, 1, 2, 3]);
    });
    runner.add(CAT, '_addQuadIndices - 頂点オフセット付き', () => {
        const indices = [];
        ChunkMeshBuilder._addQuadIndices(indices, 8, [0, 0, 0, 0]);
        assertArrayEqual(indices, [8, 9, 10, 8, 10, 11]);
    });

    // --- _faceToGridCoords ---
    runner.add(CAT, '_faceToGridCoords - top/bottom (depth=y, u=x, v=z)', () => {
        const r = ChunkMeshBuilder._faceToGridCoords('top', 3, 10, 7);
        assertEqual(r.depth, 10); assertEqual(r.u, 3); assertEqual(r.v, 7);
    });
    runner.add(CAT, '_faceToGridCoords - front/back (depth=z, u=x, v=y)', () => {
        const r = ChunkMeshBuilder._faceToGridCoords('front', 3, 10, 7);
        assertEqual(r.depth, 7); assertEqual(r.u, 3); assertEqual(r.v, 10);
    });
    runner.add(CAT, '_faceToGridCoords - left/right (depth=x, u=y, v=z)', () => {
        const r = ChunkMeshBuilder._faceToGridCoords('right', 3, 10, 7);
        assertEqual(r.depth, 3); assertEqual(r.u, 10); assertEqual(r.v, 7);
    });

    // --- _gridToMeshCoords ---
    runner.add(CAT, '_gridToMeshCoords - top', () => {
        const r = ChunkMeshBuilder._gridToMeshCoords('top', 3, 7, 10, 2, 4);
        assertEqual(r.x, 3); assertEqual(r.y, 10); assertEqual(r.z, 7);
        assertEqual(r.meshWidth, 2); assertEqual(r.meshHeight, 4);
    });
    runner.add(CAT, '_gridToMeshCoords - front', () => {
        const r = ChunkMeshBuilder._gridToMeshCoords('front', 3, 10, 7, 2, 4);
        assertEqual(r.x, 3); assertEqual(r.y, 10); assertEqual(r.z, 7);
        assertEqual(r.meshWidth, 2); assertEqual(r.meshHeight, 4);
    });
    runner.add(CAT, '_gridToMeshCoords - right', () => {
        const r = ChunkMeshBuilder._gridToMeshCoords('right', 10, 7, 3, 2, 4);
        assertEqual(r.x, 3); assertEqual(r.y, 10); assertEqual(r.z, 7);
        assertEqual(r.meshWidth, 2); assertEqual(r.meshHeight, 4);
    });

    // --- _resolveNeighborChunk ---
    runner.add(CAT, '_resolveNeighborChunk - neighborChunks が null', () => {
        const chunk = new ChunkData(0, 0);
        assertEqual(ChunkMeshBuilder._resolveNeighborChunk(chunk, -1, 5, null), null);
    });
    runner.add(CAT, '_resolveNeighborChunk - X負方向', () => {
        const chunk = new ChunkData(1, 0);
        const neighbor = new ChunkData(0, 0);
        const neighbors = new Map([['0,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveNeighborChunk(chunk, -1, 5, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 15);
        assertEqual(r.localZ, 5);
    });
    runner.add(CAT, '_resolveNeighborChunk - X正方向', () => {
        const chunk = new ChunkData(0, 0);
        const neighbor = new ChunkData(1, 0);
        const neighbors = new Map([['1,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveNeighborChunk(chunk, 16, 5, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 0);
        assertEqual(r.localZ, 5);
    });
    runner.add(CAT, '_resolveNeighborChunk - Z負方向', () => {
        const chunk = new ChunkData(0, 1);
        const neighbor = new ChunkData(0, 0);
        const neighbors = new Map([['0,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveNeighborChunk(chunk, 5, -1, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 5);
        assertEqual(r.localZ, 15);
    });
    runner.add(CAT, '_resolveNeighborChunk - 隣接チャンクが存在しない', () => {
        const chunk = new ChunkData(0, 0);
        const neighbors = new Map();
        const r = ChunkMeshBuilder._resolveNeighborChunk(chunk, -1, 5, neighbors);
        assertEqual(r, null);
    });

    // --- _hexToRgb ---
    runner.add(CAT, '_hexToRgb - #ff8040', () => {
        const rgb = builder._hexToRgb('#ff8040');
        assertClose(rgb.r, 1.0, 0.01);
        assertClose(rgb.g, 128/255, 0.01);
        assertClose(rgb.b, 64/255, 0.01);
    });
    runner.add(CAT, '_hexToRgb - #000000 (黒)', () => {
        const rgb = builder._hexToRgb('#000000');
        assertEqual(rgb.r, 0); assertEqual(rgb.g, 0); assertEqual(rgb.b, 0);
    });
    runner.add(CAT, '_hexToRgb - 無効値 → グレーフォールバック', () => {
        const rgb = builder._hexToRgb('invalid');
        assertEqual(rgb.r, 0.5); assertEqual(rgb.g, 0.5); assertEqual(rgb.b, 0.5);
    });
}

// ========================================
// カテゴリ2: ジオメトリヘルパーテスト
// ========================================

function registerGeometryTests(runner, builder) {
    const CAT = '2. ジオメトリヘルパー';

    // --- _getFaceCorners ---
    runner.add(CAT, '_getFaceCorners - top 1x1', () => {
        const c = builder._getFaceCorners(5, 10, 5, 'top', 1, 1);
        assertEqual(c.length, 4);
        // top: 後左, 後右, 前右, 前左 (y+1面)
        assertEqual(c[0].x, 5);  assertEqual(c[0].y, 11); assertEqual(c[0].z, 6);
        assertEqual(c[1].x, 6);  assertEqual(c[1].y, 11); assertEqual(c[1].z, 6);
        assertEqual(c[2].x, 6);  assertEqual(c[2].y, 11); assertEqual(c[2].z, 5);
        assertEqual(c[3].x, 5);  assertEqual(c[3].y, 11); assertEqual(c[3].z, 5);
    });

    runner.add(CAT, '_getFaceCorners - front 1x1', () => {
        const c = builder._getFaceCorners(5, 10, 5, 'front', 1, 1);
        assertEqual(c.length, 4);
        // front(Z-): 右下, 左下, 左上, 右上
        assertEqual(c[0].x, 6);  assertEqual(c[0].y, 10); assertEqual(c[0].z, 5);
        assertEqual(c[1].x, 5);  assertEqual(c[1].y, 10); assertEqual(c[1].z, 5);
        assertEqual(c[2].x, 5);  assertEqual(c[2].y, 11); assertEqual(c[2].z, 5);
        assertEqual(c[3].x, 6);  assertEqual(c[3].y, 11); assertEqual(c[3].z, 5);
    });

    runner.add(CAT, '_getFaceCorners - right 3x2 (greedy)', () => {
        const c = builder._getFaceCorners(5, 10, 5, 'right', 3, 2);
        assertEqual(c.length, 4);
        // right(X+): 後下, 前下, 前上, 後上
        // width→Y方向, height→Z方向
        assertEqual(c[0].x, 6);  assertEqual(c[0].y, 10); assertEqual(c[0].z, 7);
        assertEqual(c[1].x, 6);  assertEqual(c[1].y, 10); assertEqual(c[1].z, 5);
        assertEqual(c[2].x, 6);  assertEqual(c[2].y, 13); assertEqual(c[2].z, 5);
        assertEqual(c[3].x, 6);  assertEqual(c[3].y, 13); assertEqual(c[3].z, 7);
    });

    // --- _addTilingUVs ---
    runner.add(CAT, '_addTilingUVs - top 1x1', () => {
        const uvs = [];
        builder._addTilingUVs(uvs, 'top', 1, 1);
        assertArrayEqual(uvs, [0, 1, 1, 1, 1, 0, 0, 0]);
    });
    runner.add(CAT, '_addTilingUVs - front 3x2', () => {
        const uvs = [];
        builder._addTilingUVs(uvs, 'front', 3, 2);
        assertArrayEqual(uvs, [3, 0, 0, 0, 0, 2, 3, 2]);
    });

    // --- _shouldCullFace ---
    runner.add(CAT, '_shouldCullFace - 不透過隣接 → カリング', () => {
        const chunk = createTestChunk();
        // stone(5,10,5) の right 面: (6,10,5) は dirt → カリング
        assertEqual(builder._shouldCullFace(chunk, 5, 10, 5, 'right', null), true);
    });
    runner.add(CAT, '_shouldCullFace - 空気隣接 → カリングしない', () => {
        const chunk = createTestChunk();
        // stone(5,10,5) の left 面: (4,10,5) は air → カリングしない
        assertEqual(builder._shouldCullFace(chunk, 5, 10, 5, 'left', null), false);
    });
    runner.add(CAT, '_shouldCullFace - 水隣接 → カリングしない', () => {
        const chunk = createTestChunk();
        // dirt(6,10,5) の right 面: (7,10,5) は water → カリングしない
        assertEqual(builder._shouldCullFace(chunk, 6, 10, 5, 'right', null), false);
    });

    // --- _isOpaqueAt ---
    runner.add(CAT, '_isOpaqueAt - stone は不透過', () => {
        const chunk = createTestChunk();
        assertEqual(builder._isOpaqueAt(chunk, 5, 10, 5, null), true);
    });
    runner.add(CAT, '_isOpaqueAt - air は透過', () => {
        const chunk = createTestChunk();
        assertEqual(builder._isOpaqueAt(chunk, 0, 0, 0, null), false);
    });
    runner.add(CAT, '_isOpaqueAt - water は透過', () => {
        const chunk = createTestChunk();
        assertEqual(builder._isOpaqueAt(chunk, 7, 10, 5, null), false);
    });
    runner.add(CAT, '_isOpaqueAt - y<0 は不透過（地盤）', () => {
        const chunk = createTestChunk();
        assertEqual(builder._isOpaqueAt(chunk, 0, -1, 0, null), true);
    });
    runner.add(CAT, '_isOpaqueAt - y>=SIZE_Y は透過', () => {
        const chunk = createTestChunk();
        assertEqual(builder._isOpaqueAt(chunk, 0, 128, 0, null), false);
    });

    // --- _getVertexAO ---
    runner.add(CAT, '_getVertexAO - 孤立ブロック top面 (AO=0)', () => {
        // stone(5,11,5) の上面: 上にブロックなし → AO全頂点0
        const chunk = createTestChunk();
        const ao = builder._getVertexAO(chunk, 5, 11, 5, 'top', null);
        assertEqual(ao.length, 4);
        for (const v of ao) {
            assertEqual(v, 0, `AO should be 0 for isolated top, got ${v}`);
        }
    });
    runner.add(CAT, '_getVertexAO - 隣接ブロックでAO>0', () => {
        // (3,10,3) の right面(X+) をテスト
        // right面のV2,V3は (x+1, y+1, z) 方向を参照
        // (4,11,3) にブロックがあれば side2=true → AO>0
        const chunk = new ChunkData(0, 0);
        chunk.setBlock(3, 10, 3, 'stone');
        chunk.setBlock(4, 11, 3, 'stone');  // right面の上方に配置
        chunk.buildHeightMap(new Set());
        const lightCalc = new LightCalculator();
        lightCalc.calculate(chunk, null);

        const ao = builder._getVertexAO(chunk, 3, 10, 3, 'right', null);
        assertEqual(ao.length, 4);
        // V2,V3 で side2=(1,1,0) → (4,11,3) が不透過 → AO>=1
        const hasAO = ao.some(v => v > 0);
        assertTrue(hasAO, 'right面: 上方隣接でAO>0であるべき (ao=' + ao.join(',') + ')');
    });
}

// ========================================
// カテゴリ3: ゴールデンマスターテスト
// ========================================

function registerGoldenMasterTests(runner, builder) {
    const CAT = '3. ゴールデンマスター';

    // blockColors / blockShapes（LoD1用）
    const blockColors = {
        'stone': '#808080',
        'dirt': '#8B4513',
    };
    const blockShapes = {
        'stone': 'normal',
        'dirt': 'normal',
    };

    let fingerprintNoGreedy = null;
    let fingerprintGreedy = null;

    // --- build (CULLED, greedy=false) ---
    runner.add(CAT, 'build(CULLED, greedy=false) フィンガープリント', () => {
        const chunk = createTestChunk();
        const mesh = builder.build(chunk, 'CULLED', false, null);
        assertTrue(mesh instanceof THREE.Mesh, 'THREE.Mesh のインスタンスであること');

        const fp = getMeshFingerprint(mesh);
        fingerprintNoGreedy = fp;

        if (CAPTURE_MODE) {
            showCapture('build_CULLED_nogreedy', fp);
            return;
        }
        const g = GOLDEN.build_CULLED_nogreedy;
        assertEqual(fp.vertexCount, g.vertexCount, '頂点数');
        assertEqual(fp.indexCount, g.indexCount, 'インデックス数');
        assertClose(fp.posHash, g.posHash, 0.01, 'positionsハッシュ');
        assertClose(fp.normHash, g.normHash, 0.01, 'normalsハッシュ');
    });

    // --- build (CULLED, greedy=true) ---
    runner.add(CAT, 'build(CULLED, greedy=true) フィンガープリント', () => {
        const chunk = createTestChunk();
        const mesh = builder.build(chunk, 'CULLED', true, null);
        assertTrue(mesh instanceof THREE.Mesh, 'THREE.Mesh のインスタンスであること');

        const fp = getMeshFingerprint(mesh);
        fingerprintGreedy = fp;

        if (CAPTURE_MODE) {
            showCapture('build_CULLED_greedy', fp);
            return;
        }
        const g = GOLDEN.build_CULLED_greedy;
        assertEqual(fp.vertexCount, g.vertexCount, '頂点数');
        assertEqual(fp.indexCount, g.indexCount, 'インデックス数');
        assertClose(fp.posHash, g.posHash, 0.01, 'positionsハッシュ');
        assertClose(fp.normHash, g.normHash, 0.01, 'normalsハッシュ');
    });

    // --- greedy < non-greedy ---
    runner.add(CAT, 'greedy メッシュは non-greedy より頂点数が少ない', () => {
        assertTrue(fingerprintNoGreedy !== null, 'non-greedy テストが先に実行されていること');
        assertTrue(fingerprintGreedy !== null, 'greedy テストが先に実行されていること');
        assertTrue(
            fingerprintGreedy.vertexCount <= fingerprintNoGreedy.vertexCount,
            `greedy(${fingerprintGreedy.vertexCount}) <= non-greedy(${fingerprintNoGreedy.vertexCount})`
        );
    });

    // --- buildLoD1 ---
    runner.add(CAT, 'buildLoD1(greedy=true) フィンガープリント', () => {
        const chunk = createTestChunk();
        const mesh = builder.buildLoD1(chunk, blockColors, blockShapes, true, null);
        assertTrue(mesh instanceof THREE.Mesh, 'THREE.Mesh のインスタンスであること');

        const fp = getMeshFingerprint(mesh);

        if (CAPTURE_MODE) {
            showCapture('buildLoD1_greedy', fp);
            return;
        }
        const g = GOLDEN.buildLoD1_greedy;
        assertEqual(fp.vertexCount, g.vertexCount, '頂点数');
        assertEqual(fp.indexCount, g.indexCount, 'インデックス数');
        assertClose(fp.posHash, g.posHash, 0.01, 'positionsハッシュ');
        assertClose(fp.normHash, g.normHash, 0.01, 'normalsハッシュ');
    });

    // --- buildWaterMesh ---
    runner.add(CAT, 'buildWaterMesh フィンガープリント', () => {
        const chunk = createTestChunk();
        const mesh = builder.buildWaterMesh(chunk, null, { waterColor: '#3366cc' });
        assertTrue(mesh !== null, '水メッシュが生成されること');
        assertTrue(mesh instanceof THREE.Mesh, 'THREE.Mesh のインスタンスであること');

        const fp = getMeshFingerprint(mesh);

        if (CAPTURE_MODE) {
            showCapture('buildWaterMesh', fp);
            return;
        }
        const g = GOLDEN.buildWaterMesh;
        assertEqual(fp.vertexCount, g.vertexCount, '頂点数');
        assertEqual(fp.indexCount, g.indexCount, 'インデックス数');
        assertClose(fp.posHash, g.posHash, 0.01, 'positionsハッシュ');
        assertClose(fp.normHash, g.normHash, 0.01, 'normalsハッシュ');
    });

    // --- build の geometry 属性チェック ---
    runner.add(CAT, 'build() の geometry に必要な属性が全てある', () => {
        const chunk = createTestChunk();
        const mesh = builder.build(chunk, 'CULLED', false, null);
        const geo = mesh.geometry;
        assertTrue(geo.getAttribute('position') !== null, 'position 属性');
        assertTrue(geo.getAttribute('normal') !== null, 'normal 属性');
        assertTrue(geo.getAttribute('uv') !== null, 'uv 属性');
        assertTrue(geo.getAttribute('atlasInfo') !== null, 'atlasInfo 属性');
        assertTrue(geo.getAttribute('lightLevel') !== null, 'lightLevel 属性');
        assertTrue(geo.getAttribute('aoLevel') !== null, 'aoLevel 属性');
        assertTrue(geo.index !== null, 'index');
    });
}

// ========================================
// カテゴリ4: ブロック位置解決テスト
// ========================================

function registerBlockLocationTests(runner) {
    const CAT = '4. ブロック位置解決';

    runner.add(CAT, '_resolveBlockLocation - チャンク範囲内', () => {
        const chunk = new ChunkData(0, 0);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, 5, 10, 5, null);
        assertEqual(r.chunk, chunk);
        assertEqual(r.localX, 5);
        assertEqual(r.localY, 10);
        assertEqual(r.localZ, 5);
    });

    runner.add(CAT, '_resolveBlockLocation - X負方向隣接', () => {
        const chunk = new ChunkData(1, 0);
        const neighbor = new ChunkData(0, 0);
        const neighbors = new Map([['0,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, -1, 10, 5, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 15);
        assertEqual(r.localY, 10);
        assertEqual(r.localZ, 5);
    });

    runner.add(CAT, '_resolveBlockLocation - X正方向隣接', () => {
        const chunk = new ChunkData(0, 0);
        const neighbor = new ChunkData(1, 0);
        const neighbors = new Map([['1,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, 16, 10, 5, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 0);
        assertEqual(r.localY, 10);
        assertEqual(r.localZ, 5);
    });

    runner.add(CAT, '_resolveBlockLocation - Z負方向隣接', () => {
        const chunk = new ChunkData(0, 1);
        const neighbor = new ChunkData(0, 0);
        const neighbors = new Map([['0,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, 5, 10, -1, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localX, 5);
        assertEqual(r.localY, 10);
        assertEqual(r.localZ, 15);
    });

    runner.add(CAT, '_resolveBlockLocation - baseY差分補正', () => {
        const chunk = new ChunkData(1, 0);
        chunk.baseY = 10;
        const neighbor = new ChunkData(0, 0);
        neighbor.baseY = 5;
        const neighbors = new Map([['0,0', neighbor]]);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, -1, 20, 5, neighbors);
        assertEqual(r.chunk, neighbor);
        assertEqual(r.localY, 25, 'baseY差分: 20 + (10 - 5) = 25');
    });

    runner.add(CAT, '_resolveBlockLocation - 隣接なし → null', () => {
        const chunk = new ChunkData(0, 0);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, -1, 10, 5, new Map());
        assertEqual(r, null);
    });

    runner.add(CAT, '_resolveBlockLocation - neighborChunks null → null', () => {
        const chunk = new ChunkData(0, 0);
        const r = ChunkMeshBuilder._resolveBlockLocation(chunk, -1, 10, 5, null);
        assertEqual(r, null);
    });
}

// ========================================
// 5. カスタムブロック マテリアル準備
// ========================================

function registerCustomBlockMaterialTests(runner, builder) {
    const CAT = '5. カスタムブロック マテリアル';

    runner.add(CAT, '_prepareCustomBlockMaterials - 正常なblockDef', () => {
        // textureLoader に存在するテクスチャ名を使う
        const blockDef = {
            material_1: 'stone',
            material_2: 'dirt',
            material_3: 'stone',
            tex_default: 'stone'
        };
        const result = builder._prepareCustomBlockMaterials(blockDef);
        assertEqual(Array.isArray(result), true, '配列を返す');
        assertEqual(result.length, 3, '3要素');
        for (let i = 0; i < 3; i++) {
            assertEqual(typeof result[i].offsetX, 'number', `[${i}].offsetX は number`);
            assertEqual(typeof result[i].scaleX, 'number', `[${i}].scaleX は number`);
        }
    });

    runner.add(CAT, '_prepareCustomBlockMaterials - 全マテリアル未定義 → tex_default フォールバック', () => {
        const blockDef = {
            tex_default: 'stone'
        };
        const result = builder._prepareCustomBlockMaterials(blockDef);
        assertEqual(result.length, 3, '3要素');
        // 全要素が tex_default のアトラスUV
        const defaultUV = builder.textureLoader.getAtlasUVByTexName('stone');
        for (let i = 0; i < 3; i++) {
            assertEqual(result[i].offsetX, defaultUV.offsetX, `[${i}] は tex_default と同じ`);
        }
    });
}

// ========================================
// メインエントリポイント
// ========================================

window.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status');

    try {
        status.textContent = 'TextureLoader 読み込み中...';

        // TextureLoader 初期化
        const textureLoader = new TextureLoader();
        await textureLoader.loadAll();

        // ChunkMeshBuilder 初期化
        const builder = new ChunkMeshBuilder(textureLoader);

        status.textContent = 'テスト実行中...';

        // テスト登録
        const runner = new TestRunner();
        registerPureFunctionTests(runner, builder);
        registerGeometryTests(runner, builder);
        registerGoldenMasterTests(runner, builder);
        registerBlockLocationTests(runner);
        registerCustomBlockMaterialTests(runner, builder);

        // テスト実行
        const results = await runner.runAll();
        renderResults(results);

    } catch (e) {
        status.textContent = 'セットアップエラー: ' + e.message;
        status.style.color = '#f44336';
        console.error('Setup error:', e);
        window.testResults = {
            total: 0, passed: 0, failed: 1,
            details: [{ name: 'setup', passed: false, error: e.message }]
        };
    }
});
