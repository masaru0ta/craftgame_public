/**
 * RopeManager.js
 * ロープ接続管理 - 2つのポール間をロープで結ぶ
 */
class RopeManager {
    /**
     * @param {object} chunkManager - ChunkManager インスタンス
     * @param {THREE.Scene} scene - Three.js シーン
     */
    constructor(chunkManager, scene) {
        this._chunkManager = chunkManager;
        this._scene = scene;
        // 接続情報: "x,y,z" → {x, y, z}
        this._connections = new Map();
        // ロープメッシュ: 正規化キー → THREE.Mesh
        this._meshes = new Map();
        // 接続待ちポール座標
        this._pendingRopeStart = null;
    }

    /**
     * ロープ接続を開始（1つ目のポールクリック）
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    StartConnection(wx, wy, wz) {
        // pole を pole_with_rope に変更
        this._setBlockAt(wx, wy, wz, 'pole_with_rope');
        this._pendingRopeStart = { x: wx, y: wy, z: wz };
        this._rebuildChunkAt(wx, wy, wz);
    }

    /**
     * ロープ接続を完了（2つ目のポールクリック）
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    CompleteConnection(wx, wy, wz) {
        if (!this._pendingRopeStart) return;
        const p1 = this._pendingRopeStart;
        // 同じ座標なら無視
        if (p1.x === wx && p1.y === wy && p1.z === wz) return;

        // 2つ目を pole_with_rope に変更
        this._setBlockAt(wx, wy, wz, 'pole_with_rope');

        // 双方向の接続情報を保存
        const key1 = `${p1.x},${p1.y},${p1.z}`;
        const key2 = `${wx},${wy},${wz}`;
        this._connections.set(key1, { x: wx, y: wy, z: wz });
        this._connections.set(key2, { x: p1.x, y: p1.y, z: p1.z });

        // ロープメッシュ生成
        this._createRopeMesh(p1.x, p1.y, p1.z, wx, wy, wz);

        this._pendingRopeStart = null;
        this._rebuildChunkAt(wx, wy, wz);
    }

    /**
     * 接続待ちをキャンセル
     */
    CancelConnection() {
        if (!this._pendingRopeStart) return;
        const p = this._pendingRopeStart;
        // pole_with_rope を pole に戻す
        this._setBlockAt(p.x, p.y, p.z, 'pole');
        this._rebuildChunkAt(p.x, p.y, p.z);
        this._pendingRopeStart = null;
    }

    /**
     * 接続待ち中かどうか
     * @returns {boolean}
     */
    IsPending() {
        return this._pendingRopeStart !== null;
    }

    /**
     * ポール破壊時の処理
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     */
    OnPoleDestroyed(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        const target = this._connections.get(key);
        if (!target) return;

        // 結び先を pole に戻す
        this._setBlockAt(target.x, target.y, target.z, 'pole');
        this._rebuildChunkAt(target.x, target.y, target.z);

        // 双方の接続情報を削除
        const targetKey = `${target.x},${target.y},${target.z}`;
        this._connections.delete(key);
        this._connections.delete(targetKey);

        // ロープメッシュ削除
        const meshKey = this._ropeKey(wx, wy, wz, target.x, target.y, target.z);
        const mesh = this._meshes.get(meshKey);
        if (mesh) {
            this._scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            this._meshes.delete(meshKey);
        }
    }

    /**
     * 指定座標の結び先を取得
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     * @returns {{x:number, y:number, z:number}|null}
     */
    GetConnection(wx, wy, wz) {
        return this._connections.get(`${wx},${wy},${wz}`) || null;
    }

    /**
     * ロープメッシュを生成
     */
    _createRopeMesh(x1, y1, z1, x2, y2, z2) {
        // ブロック中央座標（worldContainer内なのでZ反転不要）
        const cx1 = x1 + 0.5, cy1 = y1 + 0.5, cz1 = z1 + 0.5;
        const cx2 = x2 + 0.5, cy2 = y2 + 0.5, cz2 = z2 + 0.5;

        const dx = cx2 - cx1, dy = cy2 - cy1, dz = cz2 - cz1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length === 0) return;

        // 円柱ジオメトリ（半径0.03）
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, length, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
        const mesh = new THREE.Mesh(geometry, material);

        // 中点に配置
        mesh.position.set((cx1 + cx2) / 2, (cy1 + cy2) / 2, (cz1 + cz2) / 2);

        // 向きを設定（Y軸デフォルト→2点間ベクトルへ回転）
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);

        this._scene.add(mesh);
        const key = this._ropeKey(x1, y1, z1, x2, y2, z2);
        this._meshes.set(key, mesh);
    }

    /**
     * ロープメッシュの一意キー生成（座標の小さい方を先に）
     */
    _ropeKey(x1, y1, z1, x2, y2, z2) {
        if (x1 < x2 || (x1 === x2 && y1 < y2) || (x1 === x2 && y1 === y2 && z1 < z2)) {
            return `${x1},${y1},${z1}-${x2},${y2},${z2}`;
        }
        return `${x2},${y2},${z2}-${x1},${y1},${z1}`;
    }

    /**
     * チャンクデータのブロックを変更
     */
    _setBlockAt(wx, wy, wz, blockId) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return;
        chunk.chunkData.setBlock(lx, ly, lz, blockId);
    }

    /**
     * 該当チャンクのメッシュを再構築
     */
    _rebuildChunkAt(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (chunk) {
            this._chunkManager.rebuildChunkMesh(cx, cz);
        }
    }
}

if (typeof window !== 'undefined') {
    window.RopeManager = RopeManager;
}
