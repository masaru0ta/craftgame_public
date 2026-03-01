/**
 * CustomBlockEditor ユニットテスト
 * リファクタリング前の動作を保証するためのテスト
 */

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

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg ? msg + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertApprox(actual, expected, tolerance = 0.001, msg = '') {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${msg ? msg + ': ' : ''}Expected ~${expected}, got ${actual}`);
    }
}

function assertTrue(actual, msg = '') {
    if (!actual) {
        throw new Error(`${msg ? msg + ': ' : ''}Expected truthy, got ${actual}`);
    }
}

function assertFalse(actual, msg = '') {
    if (actual) {
        throw new Error(`${msg ? msg + ': ' : ''}Expected falsy, got ${actual}`);
    }
}

// ========================================
// 結果描画
// ========================================

function renderResults(results) {
    const container = document.getElementById('results');
    const status = document.getElementById('status');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    if (failed === 0) {
        status.textContent = `ALL PASSED (${total}/${total})`;
        status.style.color = '#4caf50';
    } else {
        status.textContent = `FAILED (${failed}/${total} failed)`;
        status.style.color = '#f44336';
    }

    // カテゴリごとにグループ化
    let currentCategory = '';
    for (const r of results) {
        if (r.category !== currentCategory) {
            currentCategory = r.category;
            const catDiv = document.createElement('div');
            catDiv.className = 'category';
            catDiv.textContent = currentCategory;
            container.appendChild(catDiv);
        }

        const div = document.createElement('div');
        div.className = `test-item ${r.passed ? 'pass' : 'fail'}`;
        div.textContent = `${r.passed ? 'PASS' : 'FAIL'}: ${r.name}`;
        if (!r.passed && r.error) {
            const errDiv = document.createElement('div');
            errDiv.className = 'error';
            errDiv.textContent = r.error;
            div.appendChild(errDiv);
        }
        container.appendChild(div);
    }

    window.testResults = { total, passed, failed, details: results };
}

// ========================================
// 1. 定数・座標変換
// ========================================

function registerConstantsAndCoordTests(runner, editor) {
    const CAT = '1. 定数・座標変換';

    runner.add(CAT, 'GRID_SIZE === 8', () => {
        assertEqual(CustomBlockEditor.GRID_SIZE, 8);
    });

    runner.add(CAT, 'VOXEL_SIZE === 0.125', () => {
        assertEqual(CustomBlockEditor.VOXEL_SIZE, 0.125);
    });

    runner.add(CAT, 'COLLISION_GRID_SIZE === 4', () => {
        assertEqual(CustomBlockEditor.COLLISION_GRID_SIZE, 4);
    });

    runner.add(CAT, '_positionToVoxelCoord - 原点(0,0,0)', () => {
        const coord = editor._positionToVoxelCoord({ x: 0, y: 0, z: 0 });
        // _voxelOffset = (8 * 0.125) / 2 - 0.125 / 2 = 0.4375
        // round(0 + 0.4375) / 0.125 = round(3.5) = 4? Let's check:
        // round((0 + _voxelOffset) / VOXEL_SIZE) = round(0.4375 / 0.125) = round(3.5) = 4
        // Actually Math.round(3.5) = 4 in JS
        assertEqual(typeof coord.x, 'number', 'x is number');
        assertEqual(typeof coord.y, 'number', 'y is number');
        assertEqual(typeof coord.z, 'number', 'z is number');
        // 原点は中央付近の座標になる
        assertTrue(coord.x >= 0 && coord.x < 8, 'x in range');
        assertTrue(coord.y >= 0 && coord.y < 8, 'y in range');
    });

    runner.add(CAT, '_voxelCoordToPosition - (0,0,0)', () => {
        const pos = editor._voxelCoordToPosition(0, 0, 0);
        // x = 0 * 0.125 - 0.4375 = -0.4375
        assertApprox(pos.x, -0.4375, 0.001, 'x');
        assertApprox(pos.y, -0.4375, 0.001, 'y');
        assertApprox(pos.z, -0.4375, 0.001, 'z');
    });

    runner.add(CAT, '_voxelCoordToPosition - (7,7,7)', () => {
        const pos = editor._voxelCoordToPosition(7, 7, 7);
        // x = 7 * 0.125 - 0.4375 = 0.875 - 0.4375 = 0.4375
        assertApprox(pos.x, 0.4375, 0.001, 'x');
        assertApprox(pos.y, 0.4375, 0.001, 'y');
    });

    runner.add(CAT, '_positionToVoxelCoord ⇔ _voxelCoordToPosition 往復', () => {
        const origCoord = { x: 3, y: 5, z: 1 };
        const pos = editor._voxelCoordToPosition(origCoord.x, origCoord.y, origCoord.z);
        const backCoord = editor._positionToVoxelCoord(pos);
        assertEqual(backCoord.x, origCoord.x, 'x roundtrip');
        assertEqual(backCoord.y, origCoord.y, 'y roundtrip');
        assertEqual(backCoord.z, origCoord.z, 'z roundtrip');
    });

    runner.add(CAT, '_isValidCoord - 範囲内', () => {
        assertTrue(editor._isValidCoord(0, 0, 0), '(0,0,0)');
        assertTrue(editor._isValidCoord(7, 7, 7), '(7,7,7)');
        assertTrue(editor._isValidCoord(4, 2, 6), '(4,2,6)');
    });

    runner.add(CAT, '_isValidCoord - 範囲外', () => {
        assertFalse(editor._isValidCoord(-1, 0, 0), '(-1,0,0)');
        assertFalse(editor._isValidCoord(0, 8, 0), '(0,8,0)');
        assertFalse(editor._isValidCoord(0, 0, -1), '(0,0,-1)');
        assertFalse(editor._isValidCoord(8, 0, 0), '(8,0,0)');
    });
}

// ========================================
// 2. ブラシ座標
// ========================================

function registerBrushCoordTests(runner, editor) {
    const CAT = '2. ブラシ座標';

    runner.add(CAT, '_getBrushCoordinates size=1', () => {
        editor.brushSize = 1;
        const coords = editor._getBrushCoordinates(3, 4, 5);
        assertEqual(coords.length, 1, '1座標');
        assertEqual(coords[0].x, 3);
        assertEqual(coords[0].y, 4);
        assertEqual(coords[0].z, 5);
    });

    runner.add(CAT, '_getBrushCoordinates size=2 → 8座標', () => {
        editor.brushSize = 2;
        const coords = editor._getBrushCoordinates(2, 4, 6);
        assertEqual(coords.length, 8, '2x2x2 = 8座標');
    });

    runner.add(CAT, '_getBrushCoordinates size=4 → 64座標', () => {
        editor.brushSize = 4;
        const coords = editor._getBrushCoordinates(0, 0, 0);
        assertEqual(coords.length, 64, '4x4x4 = 64座標');
    });

    runner.add(CAT, '_getBrushCoordinates size=2 スナップ (3,3,3) → (2,2,2)起点', () => {
        editor.brushSize = 2;
        const coords = editor._getBrushCoordinates(3, 3, 3);
        // snap: floor(3/2)*2 = 2
        const minX = Math.min(...coords.map(c => c.x));
        const minY = Math.min(...coords.map(c => c.y));
        const minZ = Math.min(...coords.map(c => c.z));
        assertEqual(minX, 2, 'snap X to 2');
        assertEqual(minY, 2, 'snap Y to 2');
        assertEqual(minZ, 2, 'snap Z to 2');
    });
}

// ========================================
// 3. 状態管理
// ========================================

function registerStateTests(runner, editor) {
    const CAT = '3. 状態管理';

    runner.add(CAT, 'getCurrentMaterial 初期値 === 1', () => {
        assertEqual(editor.getCurrentMaterial(), 1);
    });

    runner.add(CAT, 'setCurrentMaterial(2) → 2', () => {
        editor.setCurrentMaterial(2);
        assertEqual(editor.getCurrentMaterial(), 2);
        editor.setCurrentMaterial(1); // 戻す
    });

    runner.add(CAT, 'setCurrentMaterial(0) 無効値 → 変化なし', () => {
        editor.setCurrentMaterial(1); // リセット
        editor.setCurrentMaterial(0);
        assertEqual(editor.getCurrentMaterial(), 1, '変化なし');
        editor.setCurrentMaterial(4);
        assertEqual(editor.getCurrentMaterial(), 1, '4も無効');
    });

    runner.add(CAT, 'getBrushSize 初期値 === 2', () => {
        assertEqual(editor.getBrushSize(), 2);
    });

    runner.add(CAT, 'setBrushSize(4) → 4', () => {
        editor.setBrushSize(4);
        assertEqual(editor.getBrushSize(), 4);
        editor.setBrushSize(2); // 戻す
    });

    runner.add(CAT, 'setBrushSize(3) 無効値 → 変化なし', () => {
        editor.setBrushSize(2); // リセット
        editor.setBrushSize(3);
        assertEqual(editor.getBrushSize(), 2, '3は無効');
    });

    runner.add(CAT, 'getEditMode 初期値 === look', () => {
        assertEqual(editor.getEditMode(), 'look');
    });

    runner.add(CAT, 'setEditMode(collision) → brushSize が 2 に固定', () => {
        editor.setBrushSize(4);
        editor.setEditMode('collision');
        assertEqual(editor.getEditMode(), 'collision');
        assertEqual(editor.getBrushSize(), 2, 'collision時はbrushSize=2');
        editor.setEditMode('look'); // 戻す
    });
}

// ========================================
// 4. ボクセルデータ操作
// ========================================

function registerVoxelDataTests(runner, editor) {
    const CAT = '4. ボクセルデータ操作';

    runner.add(CAT, '初期データは空', () => {
        // 一旦初期化
        editor._initVoxelData();
        const encoded = editor.getVoxelLookData();
        const decoded = VoxelData.decode(encoded);
        // 全ボクセルが0であることを確認
        let nonZero = 0;
        for (let y = 0; y < 8; y++) {
            for (let z = 0; z < 8; z++) {
                for (let x = 0; x < 8; x++) {
                    if (VoxelData.getVoxel(decoded, x, y, z) !== 0) nonZero++;
                }
            }
        }
        assertEqual(nonZero, 0, '全voxel=0');
    });

    runner.add(CAT, '_placeVoxelAt lookモード → ボクセル設置', () => {
        editor._initVoxelData();
        editor.setEditMode('look');
        editor.brushSize = 1;
        editor._placeVoxelAt(3, 4, 5);
        const v = VoxelData.getVoxel(editor.voxelLookData, 3, 4, 5);
        assertTrue(v > 0, 'ボクセルが設置された');
    });

    runner.add(CAT, '_placeVoxelAt collisionモード → 当たり判定設置', () => {
        editor._initVoxelData();
        editor.setEditMode('collision');
        // collision座標は8x8x8→4x4x4に変換: floor(4/2)=2, floor(6/2)=3
        editor._placeVoxelAt(4, 6, 2);
        const cv = CustomCollision.getVoxel(editor.voxelCollisionData, 2, 3, 1);
        assertEqual(cv, 1, '当たり判定が設置された');
        editor.setEditMode('look'); // 戻す
    });

    runner.add(CAT, '_removeVoxelAt lookモード → ボクセル削除', () => {
        editor._initVoxelData();
        editor.setEditMode('look');
        editor.brushSize = 1;
        // 配置
        editor._placeVoxelAt(2, 2, 2);
        assertTrue(VoxelData.getVoxel(editor.voxelLookData, 2, 2, 2) > 0, '設置確認');
        // 削除
        editor._removeVoxelAt(2, 2, 2);
        assertEqual(VoxelData.getVoxel(editor.voxelLookData, 2, 2, 2), 0, '削除された');
    });

    runner.add(CAT, '_removeVoxelAt collisionモード → 当たり判定削除', () => {
        editor._initVoxelData();
        editor.setEditMode('collision');
        // 配置（8x8x8座標→4x4x4座標: floor(2/2)=1）
        editor._placeVoxelAt(2, 2, 2);
        assertEqual(CustomCollision.getVoxel(editor.voxelCollisionData, 1, 1, 1), 1, '設置確認');
        // 削除
        editor._removeVoxelAt(2, 2, 2);
        assertEqual(CustomCollision.getVoxel(editor.voxelCollisionData, 1, 1, 1), 0, '削除された');
        editor.setEditMode('look');
    });

    runner.add(CAT, 'getVoxelLookData エンコード→デコード往復', () => {
        editor._initVoxelData();
        editor.brushSize = 1;
        editor.setEditMode('look');
        editor._placeVoxelAt(1, 2, 3);
        editor._placeVoxelAt(5, 6, 7);

        const encoded = editor.getVoxelLookData();
        assertTrue(typeof encoded === 'string', 'string型');
        assertTrue(encoded.length > 0, '空でない');

        const decoded = VoxelData.decode(encoded);
        assertTrue(VoxelData.getVoxel(decoded, 1, 2, 3) > 0, '(1,2,3) 復元');
        assertTrue(VoxelData.getVoxel(decoded, 5, 6, 7) > 0, '(5,6,7) 復元');
        assertEqual(VoxelData.getVoxel(decoded, 0, 0, 0), 0, '(0,0,0) は空');
    });

    runner.add(CAT, 'getVoxelCollisionData エンコード→デコード往復', () => {
        editor._initVoxelData();
        editor.setEditMode('collision');
        // 4x4x4座標 floor(2/2)=1
        editor._placeVoxelAt(2, 2, 2);

        const encoded = editor.getVoxelCollisionData();
        assertTrue(typeof encoded === 'string', 'string型');

        const decoded = CustomCollision.decode(encoded);
        assertEqual(CustomCollision.getVoxel(decoded, 1, 1, 1), 1, '(1,1,1) 復元');
        editor.setEditMode('look');
    });

    runner.add(CAT, 'autoCreateCollision - 見た目から当たり判定生成', () => {
        editor._initVoxelData();
        editor.setEditMode('look');
        editor.brushSize = 1;
        // 2x2x2領域のうち1つにボクセル → 対応する当たり判定セルが1に
        editor._placeVoxelAt(0, 0, 0); // collision (0,0,0) に対応

        editor.autoCreateCollision();

        const cv = CustomCollision.getVoxel(editor.voxelCollisionData, 0, 0, 0);
        assertEqual(cv, 1, 'ボクセルがある領域は当たり判定1');

        // ボクセルがない領域は0
        const cv2 = CustomCollision.getVoxel(editor.voxelCollisionData, 3, 3, 3);
        assertEqual(cv2, 0, 'ボクセルがない領域は当たり判定0');
    });

    runner.add(CAT, '_expandCollisionToLookSize - 4x4x4→8x8x8展開', () => {
        editor._initVoxelData();
        // 当たり判定 (1,1,1) を設定
        CustomCollision.setVoxel(editor.voxelCollisionData, 1, 1, 1, 1);

        const expanded = editor._expandCollisionToLookSize();
        // (1,1,1) → 8x8x8の (2,2,2)~(3,3,3) に展開
        assertEqual(VoxelData.getVoxel(expanded, 2, 2, 2), 1, '(2,2,2) = 1');
        assertEqual(VoxelData.getVoxel(expanded, 3, 3, 3), 1, '(3,3,3) = 1');
        assertEqual(VoxelData.getVoxel(expanded, 0, 0, 0), 0, '(0,0,0) = 0');
        assertEqual(VoxelData.getVoxel(expanded, 4, 4, 4), 0, '(4,4,4) = 0');
    });
}

// ========================================
// 5. Three.js 初期化
// ========================================

function registerInitTests(runner, editor) {
    const CAT = '5. Three.js 初期化';

    runner.add(CAT, 'init() 後に scene 存在', () => {
        assertTrue(editor.scene !== null, 'scene');
        assertTrue(editor.scene instanceof THREE.Scene, 'Scene型');
    });

    runner.add(CAT, 'init() 後に camera 存在', () => {
        assertTrue(editor.camera !== null, 'camera');
        assertTrue(editor.camera instanceof THREE.PerspectiveCamera, 'PerspectiveCamera型');
    });

    runner.add(CAT, 'init() 後に renderer 存在', () => {
        assertTrue(editor.renderer !== null, 'renderer');
        assertTrue(editor.renderer instanceof THREE.WebGLRenderer, 'WebGLRenderer型');
    });

    runner.add(CAT, 'シーンにライトがある', () => {
        const children = editor.scene.children;
        const hasAmbient = children.some(c => c instanceof THREE.AmbientLight);
        const hasDirectional = children.some(c => c instanceof THREE.DirectionalLight);
        assertTrue(hasAmbient, 'AmbientLight');
        assertTrue(hasDirectional, 'DirectionalLight');
    });

    runner.add(CAT, 'ハイライトオブジェクト存在', () => {
        assertTrue(editor.highlightFace !== null, 'highlightFace');
        assertTrue(editor.highlightEdges !== null, 'highlightEdges');
        assertTrue(editor.gridHighlight !== null, 'gridHighlight');
    });

    runner.add(CAT, 'レイキャスター・マウス存在', () => {
        assertTrue(editor.raycaster !== null, 'raycaster');
        assertTrue(editor.mouse !== null, 'mouse');
        assertTrue(editor.raycaster instanceof THREE.Raycaster, 'Raycaster型');
    });
}

// ========================================
// 6. カメラ操作
// ========================================

function registerCameraTests(runner, editor) {
    const CAT = '6. カメラ操作';

    runner.add(CAT, '初期カメラ距離 === 3', () => {
        assertEqual(editor.cameraDistance, 3);
    });

    runner.add(CAT, '_updateCameraPosition 位置計算 (angle 0, 20°)', () => {
        editor.horizontalAngle = 0;
        editor.verticalAngle = 20;
        editor.cameraDistance = 3;
        editor._updateCameraPosition();

        const cam = editor.camera.position;
        // hRad = 0, vRad = 20 * PI/180 ≈ 0.349
        // x = 3 * sin(0) * cos(0.349) = 0
        // y = 3 * sin(0.349) ≈ 1.026
        // z = 3 * cos(0) * cos(0.349) ≈ 2.819
        assertApprox(cam.x, 0, 0.01, 'x ≈ 0');
        assertApprox(cam.y, 3 * Math.sin(20 * Math.PI / 180), 0.01, 'y');
        assertApprox(cam.z, 3 * Math.cos(20 * Math.PI / 180), 0.01, 'z');
    });

    runner.add(CAT, 'ズーム下限チェック (_handleWheel)', () => {
        editor.cameraDistance = 1;
        // deltaY > 0 でズームアウト、deltaY < 0 でズームイン
        // deltaY = -2000 → distance += -2000 * 0.002 = -4 → 1-4 = -3 → clamp to 1
        editor._handleWheel({ preventDefault: () => {}, deltaY: -2000 });
        assertTrue(editor.cameraDistance >= 1, `下限 >= 1 (実際: ${editor.cameraDistance})`);
        editor.cameraDistance = 3; // 戻す
        editor._updateCameraPosition();
    });

    runner.add(CAT, 'ズーム上限チェック (_handleWheel)', () => {
        editor.cameraDistance = 9;
        // deltaY = 2000 → distance += 2000 * 0.002 = 4 → 9+4 = 13 → clamp to 10
        editor._handleWheel({ preventDefault: () => {}, deltaY: 2000 });
        assertTrue(editor.cameraDistance <= 10, `上限 <= 10 (実際: ${editor.cameraDistance})`);
        editor.cameraDistance = 3; // 戻す
        editor._updateCameraPosition();
    });
}

// ========================================
// 7. 基底クラス
// ========================================

function registerBaseClassTests(runner, editor) {
    const CAT = '7. 基底クラス';

    runner.add(CAT, 'VoxelEditorBase が定義されている', () => {
        assertTrue(typeof VoxelEditorBase === 'function', 'VoxelEditorBase is a function');
    });

    runner.add(CAT, 'CustomBlockEditor は VoxelEditorBase を継承', () => {
        assertTrue(editor instanceof VoxelEditorBase, 'instanceof VoxelEditorBase');
    });
}

// ========================================
// メインエントリポイント
// ========================================

window.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status');

    try {
        status.textContent = '初期化中...';

        // エディタ初期化
        const container = document.getElementById('editor-container');
        const editor = new CustomBlockEditor({
            container: container,
            THREE: THREE
        });
        editor.init();

        status.textContent = 'テスト実行中...';

        // テスト登録
        const runner = new TestRunner();
        registerConstantsAndCoordTests(runner, editor);
        registerBrushCoordTests(runner, editor);
        registerStateTests(runner, editor);
        registerVoxelDataTests(runner, editor);
        registerInitTests(runner, editor);
        registerCameraTests(runner, editor);
        registerBaseClassTests(runner, editor);

        // テスト実行
        const results = await runner.runAll();
        renderResults(results);

        // クリーンアップ（レンダーループ停止）
        if (editor.animationId) {
            cancelAnimationFrame(editor.animationId);
        }

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
