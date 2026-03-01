/**
 * StructureEditor ユニットテスト
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

    runner.add(CAT, 'CANVAS_SIZE === 32', () => {
        assertEqual(StructureEditor.CANVAS_SIZE, 32);
    });

    runner.add(CAT, 'VOXEL_SIZE === 1.0', () => {
        assertEqual(StructureEditor.VOXEL_SIZE, 1.0);
    });

    runner.add(CAT, 'ORIGIN_X === 16, ORIGIN_Y === 0, ORIGIN_Z === 16', () => {
        assertEqual(StructureEditor.ORIGIN_X, 16);
        assertEqual(StructureEditor.ORIGIN_Y, 0);
        assertEqual(StructureEditor.ORIGIN_Z, 16);
    });

    runner.add(CAT, '_positionToVoxelCoord - ワールド原点', () => {
        // half = 16, x = round(0 + 16 - 0.5) = round(15.5) = 16
        const coord = editor._positionToVoxelCoord({ x: 0, y: 0, z: 0 });
        assertEqual(coord.x, 16, 'x');
        assertEqual(coord.y, 0, 'y');
        assertEqual(coord.z, 16, 'z');
    });

    runner.add(CAT, '_voxelCoordToPosition - (0,0,0)', () => {
        // half=16, x = 0 - 16 + 0.5 = -15.5
        const pos = editor._voxelCoordToPosition(0, 0, 0);
        assertApprox(pos.x, -15.5, 0.001, 'x');
        assertApprox(pos.y, 0, 0.001, 'y');
        assertApprox(pos.z, -15.5, 0.001, 'z');
    });

    runner.add(CAT, '_positionToVoxelCoord ⇔ _voxelCoordToPosition 往復', () => {
        const origCoord = { x: 10, y: 5, z: 20 };
        const pos = editor._voxelCoordToPosition(origCoord.x, origCoord.y, origCoord.z);
        const backCoord = editor._positionToVoxelCoord(pos);
        assertEqual(backCoord.x, origCoord.x, 'x roundtrip');
        assertEqual(backCoord.y, origCoord.y, 'y roundtrip');
        assertEqual(backCoord.z, origCoord.z, 'z roundtrip');
    });
}

// ========================================
// 2. ブラシ座標
// ========================================

function registerBrushCoordTests(runner, editor) {
    const CAT = '2. ブラシ座標';

    runner.add(CAT, '_snapCoord size=1 → そのまま', () => {
        editor.brushSize = 1;
        assertEqual(editor._snapCoord(5), 5);
        assertEqual(editor._snapCoord(0), 0);
        assertEqual(editor._snapCoord(31), 31);
    });

    runner.add(CAT, '_snapCoord size=2 → 偶数にスナップ', () => {
        editor.brushSize = 2;
        assertEqual(editor._snapCoord(3), 2, '3→2');
        assertEqual(editor._snapCoord(4), 4, '4→4');
        assertEqual(editor._snapCoord(5), 4, '5→4');
    });

    runner.add(CAT, '_snapCoord size=4 → 4の倍数にスナップ', () => {
        editor.brushSize = 4;
        assertEqual(editor._snapCoord(5), 4, '5→4');
        assertEqual(editor._snapCoord(7), 4, '7→4');
        assertEqual(editor._snapCoord(8), 8, '8→8');
        editor.brushSize = 1; // 戻す
    });
}

// ========================================
// 3. 状態管理
// ========================================

function registerStateTests(runner, editor) {
    const CAT = '3. 状態管理';

    runner.add(CAT, 'getCurrentBlock 初期値 === null', () => {
        assertEqual(editor.getCurrentBlock(), null);
    });

    runner.add(CAT, 'setCurrentBlock → getCurrentBlock', () => {
        editor.setCurrentBlock('stone');
        assertEqual(editor.getCurrentBlock(), 'stone');
        editor.setCurrentBlock(null); // 戻す
    });

    runner.add(CAT, 'brushSize 初期値 === 1', () => {
        assertEqual(editor.brushSize, 1);
    });

    runner.add(CAT, 'setBrushSize(2) → brushSize === 2', () => {
        editor.setBrushSize(2);
        assertEqual(editor.brushSize, 2);
        editor.setBrushSize(1); // 戻す
    });

    runner.add(CAT, 'toggleBackgroundColor → bgColorIndex が循環', () => {
        const initial = editor.bgColorIndex;
        editor.toggleBackgroundColor();
        assertEqual(editor.bgColorIndex, (initial + 1) % editor.bgColors.length);
        // 元に戻す
        while (editor.bgColorIndex !== initial) {
            editor.toggleBackgroundColor();
        }
    });

    runner.add(CAT, 'CAMERA_DEFAULTS 定数が正しい', () => {
        const cam = StructureEditor.CAMERA_DEFAULTS;
        assertEqual(cam.distance, 30, 'distance');
        assertEqual(cam.hAngle, 0, 'hAngle');
        assertEqual(cam.vAngle, 20, 'vAngle');
        assertEqual(cam.zoomMin, 5, 'zoomMin');
        assertEqual(cam.zoomMax, 100, 'zoomMax');
        assertEqual(cam.sensitivity, 0.5, 'sensitivity');
        assertEqual(cam.zoomSpeed, 0.02, 'zoomSpeed');
    });
}

// ========================================
// 4. ボクセルデータ操作
// ========================================

function registerVoxelDataTests(runner, editor) {
    const CAT = '4. ボクセルデータ操作';

    runner.add(CAT, 'newStructure → 空のStructureDataが作成', () => {
        editor.newStructure();
        assertTrue(editor.structureData != null, 'structureData exists');
        assertEqual(editor.structureData.canvasSize, 32, 'canvasSize');
    });

    runner.add(CAT, '_placeVoxelAt で配置 → getBlock で確認', () => {
        editor.newStructure();
        editor.setCurrentBlock('stone');
        editor.brushSize = 1;
        editor._placeVoxelAt(10, 5, 10, 0);
        const block = editor.structureData.getBlock(10, 5, 10);
        assertEqual(block.blockStrId, 'stone', 'blockStrId');
        assertEqual(block.orientation, 0, 'orientation');
    });

    runner.add(CAT, '_placeVoxelAt brushSize=2 → 8ブロック配置', () => {
        editor.newStructure();
        editor.setCurrentBlock('dirt');
        editor.brushSize = 2;
        editor._placeVoxelAt(4, 0, 4, 0);
        let count = 0;
        for (let dy = 0; dy < 2; dy++)
            for (let dz = 0; dz < 2; dz++)
                for (let dx = 0; dx < 2; dx++) {
                    const b = editor.structureData.getBlock(4 + dx, 0 + dy, 4 + dz);
                    if (b.blockStrId === 'dirt') count++;
                }
        assertEqual(count, 8, '2x2x2 = 8ブロック');
        editor.brushSize = 1; // 戻す
    });

    runner.add(CAT, 'StructureData setBlock/getBlock 往復', () => {
        editor.newStructure();
        editor.structureData.setBlock(0, 0, 0, 'gold', 5);
        const b = editor.structureData.getBlock(0, 0, 0);
        assertEqual(b.blockStrId, 'gold', 'blockStrId');
        assertEqual(b.orientation, 5, 'orientation');
    });

    runner.add(CAT, 'getStructureData はStructureDataを返す', () => {
        editor.newStructure();
        const sd = editor.getStructureData();
        assertTrue(sd instanceof StructureData, 'instanceof StructureData');
    });

    runner.add(CAT, 'getExportData はエクスポートデータを返す', () => {
        editor.newStructure();
        editor.setCurrentBlock('stone');
        editor._placeVoxelAt(0, 0, 0, 0);
        const data = editor.getExportData();
        assertTrue(data != null, 'data exists');
        assertTrue(data.palette != null, 'palette exists');
        assertTrue(data.voxel_data != null, 'voxel_data exists');
    });
}

// ========================================
// 5. Three.js 初期化
// ========================================

function registerThreeJsTests(runner, editor) {
    const CAT = '5. Three.js 初期化';

    runner.add(CAT, 'scene が存在する', () => {
        assertTrue(editor.scene != null, 'scene');
        assertTrue(editor.scene instanceof THREE.Scene, 'instanceof Scene');
    });

    runner.add(CAT, 'camera が PerspectiveCamera', () => {
        assertTrue(editor.camera != null, 'camera');
        assertTrue(editor.camera instanceof THREE.PerspectiveCamera, 'instanceof PerspectiveCamera');
    });

    runner.add(CAT, 'renderer が WebGLRenderer', () => {
        assertTrue(editor.renderer != null, 'renderer');
        assertTrue(editor.renderer instanceof THREE.WebGLRenderer, 'instanceof WebGLRenderer');
    });

    runner.add(CAT, 'ライトがシーンに追加されている', () => {
        let ambientCount = 0;
        let directionalCount = 0;
        editor.scene.traverse(obj => {
            if (obj instanceof THREE.AmbientLight) ambientCount++;
            if (obj instanceof THREE.DirectionalLight) directionalCount++;
        });
        assertTrue(ambientCount >= 1, 'AmbientLight');
        assertTrue(directionalCount >= 1, 'DirectionalLight');
    });

    runner.add(CAT, 'highlightFace / highlightEdges / gridHighlight が存在', () => {
        assertTrue(editor.highlightFace != null, 'highlightFace');
        assertTrue(editor.highlightEdges != null, 'highlightEdges');
        assertTrue(editor.gridHighlight != null, 'gridHighlight');
    });

    runner.add(CAT, 'raycaster / mouse が存在', () => {
        assertTrue(editor.raycaster != null, 'raycaster');
        assertTrue(editor.raycaster instanceof THREE.Raycaster, 'instanceof Raycaster');
        assertTrue(editor.mouse != null, 'mouse');
    });
}

// ========================================
// 6. カメラ操作
// ========================================

function registerCameraTests(runner, editor) {
    const CAT = '6. カメラ操作';

    runner.add(CAT, '初期カメラ距離 === 30', () => {
        assertEqual(editor.cameraDistance, StructureEditor.CAMERA_DEFAULTS.distance);
    });

    runner.add(CAT, '_updateCameraPosition でカメラ位置が計算される', () => {
        editor.horizontalAngle = 0;
        editor.verticalAngle = 0;
        editor.cameraDistance = 30;
        editor._updateCameraPosition();
        // hRad=0, vRad=0 → x=0, y=0, z=30
        assertApprox(editor.camera.position.x, 0, 0.01, 'x');
        assertApprox(editor.camera.position.y, 0, 0.01, 'y');
        assertApprox(editor.camera.position.z, 30, 0.01, 'z');
    });

    runner.add(CAT, '_handleWheel でズーム変更（範囲制限あり）', () => {
        editor.cameraDistance = 30;
        // ズームイン（大きなdeltaY → zoomMin=5 に制限）
        const bigEvent = { deltaY: -100000, preventDefault() {} };
        editor._handleWheel(bigEvent);
        assertEqual(editor.cameraDistance, StructureEditor.CAMERA_DEFAULTS.zoomMin, 'zoomMin制限');

        // ズームアウト
        const bigOut = { deltaY: 100000, preventDefault() {} };
        editor._handleWheel(bigOut);
        assertEqual(editor.cameraDistance, StructureEditor.CAMERA_DEFAULTS.zoomMax, 'zoomMax制限');

        // 元に戻す
        editor.cameraDistance = 30;
        editor._updateCameraPosition();
    });

    runner.add(CAT, '_applyDragDelta でカメラ角度が変更される', () => {
        editor.horizontalAngle = 0;
        editor.verticalAngle = 20;
        editor._applyDragDelta(10, 5);
        // sensitivity=0.5: hAngle -= 10*0.5 = -5, vAngle += 5*0.5 = 22.5
        assertApprox(editor.horizontalAngle, -5, 0.01, 'horizontalAngle');
        assertApprox(editor.verticalAngle, 22.5, 0.01, 'verticalAngle');
        // 戻す
        editor.horizontalAngle = 0;
        editor.verticalAngle = 20;
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

    runner.add(CAT, 'StructureEditor は VoxelEditorBase を継承', () => {
        assertTrue(editor instanceof VoxelEditorBase, 'instanceof VoxelEditorBase');
    });
}

// ========================================
// メインエントリ
// ========================================

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const container = document.getElementById('editor-container');
        const editor = new StructureEditor({
            container: container,
            THREE: THREE,
            blocks: [],
            textures: []
        });
        editor.init();

        const runner = new TestRunner();

        registerConstantsAndCoordTests(runner, editor);
        registerBrushCoordTests(runner, editor);
        registerStateTests(runner, editor);
        registerVoxelDataTests(runner, editor);
        registerThreeJsTests(runner, editor);
        registerCameraTests(runner, editor);
        registerBaseClassTests(runner, editor);

        const results = await runner.runAll();
        renderResults(results);

        // テスト完了後にエディタをクリーンアップ
        editor.dispose();
    } catch (e) {
        document.getElementById('status').textContent = `エラー: ${e.message}`;
        document.getElementById('status').style.color = '#f44336';
        window.testResults = { total: 0, passed: 0, failed: 1, details: [{ name: 'init', passed: false, error: e.message }] };
    }
});
