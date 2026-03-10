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
        this._connections = new Map();  // "x,y,z" → {x, y, z}
        this._meshes = new Map();       // 正規化キー → THREE.Mesh
        this._pendingRopeStart = null;
        // 動的ロープ
        this._dynamicRopes = new Map(); // ropeKey → {bodyA, rxA, ryA, rzA, bodyB, rxB, ryB, rzB}
        this._rotationAxisManager = null;
        this._prevEndpoints = new Map();
        // メッシュ更新用の再利用オブジェクト
        this._tmpDir = new THREE.Vector3();
        this._tmpUp = new THREE.Vector3(0, 1, 0);
        this._tmpQuat = new THREE.Quaternion();
    }

    StartConnection(wx, wy, wz) {
        this._setBlockAt(wx, wy, wz, 'pole_with_rope');
        this._pendingRopeStart = { x: wx, y: wy, z: wz };
        this._rebuildChunkAt(wx, wz);
    }

    CompleteConnection(wx, wy, wz) {
        if (!this._pendingRopeStart) return;
        const p1 = this._pendingRopeStart;
        if (p1.x === wx && p1.y === wy && p1.z === wz) return;

        this._setBlockAt(wx, wy, wz, 'pole_with_rope');
        this._connections.set(`${p1.x},${p1.y},${p1.z}`, { x: wx, y: wy, z: wz });
        this._connections.set(`${wx},${wy},${wz}`, { x: p1.x, y: p1.y, z: p1.z });
        this._createRopeMesh(p1.x, p1.y, p1.z, wx, wy, wz);
        this._pendingRopeStart = null;
        this._rebuildChunkAt(wx, wz);
    }

    CancelConnection() {
        if (!this._pendingRopeStart) return;
        const p = this._pendingRopeStart;
        this._setBlockAt(p.x, p.y, p.z, 'pole');
        this._rebuildChunkAt(p.x, p.z);
        this._pendingRopeStart = null;
    }

    IsPending() {
        return this._pendingRopeStart !== null;
    }

    OnPoleDestroyed(wx, wy, wz) {
        const key = `${wx},${wy},${wz}`;
        const target = this._connections.get(key);
        if (!target) return;

        this._setBlockAt(target.x, target.y, target.z, 'pole');
        this._rebuildChunkAt(target.x, target.z);

        this._connections.delete(key);
        this._connections.delete(`${target.x},${target.y},${target.z}`);

        this._removeRopeMesh(this._ropeKey(wx, wy, wz, target.x, target.y, target.z));
    }

    GetConnection(wx, wy, wz) {
        return this._connections.get(`${wx},${wy},${wz}`) || null;
    }

    /**
     * 回転体生成時の通知 — 構成ブロックにpole_with_ropeがあれば動的ロープに登録
     */
    NotifyBodyCreated(body) {
        if (!body || !body._blocks) return;
        const ax = body._axisX, ay = body._axisY, az = body._axisZ;
        for (const b of body._blocks) {
            if (b.blockId !== 'pole_with_rope') continue;
            const wx = ax + b.rx, wy = ay + b.ry, wz = az + b.rz;
            const target = this._connections.get(`${wx},${wy},${wz}`);
            if (!target) continue;

            const ropeKey = this._ropeKey(wx, wy, wz, target.x, target.y, target.z);
            if (this._dynamicRopes.has(ropeKey)) {
                const entry = this._dynamicRopes.get(ropeKey);
                if (!entry.bodyB && entry.bodyA !== body) {
                    entry.bodyB = body;
                    entry.rxB = b.rx; entry.ryB = b.ry; entry.rzB = b.rz;
                }
                continue;
            }

            // 結び先が同じbody内か判定
            let bodyB = null, rxB = target.x, ryB = target.y, rzB = target.z;
            for (const b2 of body._blocks) {
                if (b2.blockId === 'pole_with_rope' &&
                    ax + b2.rx === target.x && ay + b2.ry === target.y && az + b2.rz === target.z) {
                    bodyB = body;
                    rxB = b2.rx; ryB = b2.ry; rzB = b2.rz;
                    break;
                }
            }

            this._dynamicRopes.set(ropeKey, {
                bodyA: body, rxA: b.rx, ryA: b.ry, rzA: b.rz,
                bodyB, rxB, ryB, rzB
            });
        }
    }

    /**
     * 回転体解除時の通知 — 該当bodyを含む動的ロープを除外
     */
    NotifyBodyDissolved(body) {
        for (const [ropeKey, entry] of this._dynamicRopes) {
            if (entry.bodyA === body || entry.bodyB === body) {
                this._dynamicRopes.delete(ropeKey);
                this._prevEndpoints.delete(ropeKey);
            }
        }
    }

    /**
     * 回転体解除後の接続座標更新 — ブロック移動に伴い_connectionsとメッシュを更新
     */
    OnEndpointsMoved(moves) {
        for (const m of moves) {
            const oldKey = `${m.oldX},${m.oldY},${m.oldZ}`;
            const target = this._connections.get(oldKey);
            if (!target) continue;

            const newKey = `${m.newX},${m.newY},${m.newZ}`;
            this._connections.delete(oldKey);
            this._connections.set(newKey, { x: target.x, y: target.y, z: target.z });

            // 相手側の接続先も更新
            const targetKey = `${target.x},${target.y},${target.z}`;
            const partnerConn = this._connections.get(targetKey);
            if (partnerConn && partnerConn.x === m.oldX && partnerConn.y === m.oldY && partnerConn.z === m.oldZ) {
                this._connections.set(targetKey, { x: m.newX, y: m.newY, z: m.newZ });
            }

            // ロープメッシュのキーを更新
            const oldMeshKey = this._ropeKey(m.oldX, m.oldY, m.oldZ, target.x, target.y, target.z);
            const newMeshKey = this._ropeKey(m.newX, m.newY, m.newZ, target.x, target.y, target.z);
            const mesh = this._meshes.get(oldMeshKey);
            if (mesh) {
                this._meshes.delete(oldMeshKey);
                this._meshes.set(newMeshKey, mesh);
                this._updateRopeMesh(mesh,
                    m.newX + 0.5, m.newY + 0.5, m.newZ + 0.5,
                    target.x + 0.5, target.y + 0.5, target.z + 0.5);
            }
        }
    }

    /**
     * 毎フレーム更新 — 動的ロープのメッシュ端点を再計算
     */
    Update(deltaTime) {
        if (this._dynamicRopes.size === 0) return;
        const ram = this._rotationAxisManager;

        for (const [ropeKey, entry] of this._dynamicRopes) {
            const posA = this._calcEndpoint(entry.bodyA, entry.rxA, entry.ryA, entry.rzA, ram);
            const posB = this._calcEndpoint(entry.bodyB, entry.rxB, entry.ryB, entry.rzB, ram);

            // 前フレームとの変化検出
            const prev = this._prevEndpoints.get(ropeKey);
            if (prev &&
                Math.abs(prev.ax - posA.x) < 0.0001 && Math.abs(prev.ay - posA.y) < 0.0001 && Math.abs(prev.az - posA.z) < 0.0001 &&
                Math.abs(prev.bx - posB.x) < 0.0001 && Math.abs(prev.by - posB.y) < 0.0001 && Math.abs(prev.bz - posB.z) < 0.0001) {
                continue;
            }
            this._prevEndpoints.set(ropeKey, { ax: posA.x, ay: posA.y, az: posA.z, bx: posB.x, by: posB.y, bz: posB.z });

            const mesh = this._meshes.get(ropeKey);
            if (mesh) {
                this._updateRopeMesh(mesh, posA.x, posA.y, posA.z, posB.x, posB.y, posB.z);
            }
        }
    }

    /**
     * 端点のワールド座標を算出
     */
    _calcEndpoint(body, rx, ry, rz, ram) {
        if (body) {
            const w = ram.LocalToWorld(body, body._axisX + rx + 0.5, body._axisY + ry + 0.5, body._axisZ + rz + 0.5);
            return { x: w.x, y: w.y, z: w.z };
        }
        return { x: rx + 0.5, y: ry + 0.5, z: rz + 0.5 };
    }

    /**
     * ロープメッシュの位置・向き・長さを更新
     */
    _updateRopeMesh(mesh, ax, ay, az, bx, by, bz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length === 0) return;

        mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        this._tmpDir.set(dx, dy, dz).normalize();
        this._tmpUp.set(0, 1, 0);
        this._tmpQuat.setFromUnitVectors(this._tmpUp, this._tmpDir);
        mesh.quaternion.copy(this._tmpQuat);

        if (mesh.geometry) mesh.geometry.dispose();
        mesh.geometry = new THREE.CylinderGeometry(0.05, 0.05, length, 6);
    }

    /**
     * ロープメッシュを生成
     */
    _createRopeMesh(x1, y1, z1, x2, y2, z2) {
        const cx1 = x1 + 0.5, cy1 = y1 + 0.5, cz1 = z1 + 0.5;
        const cx2 = x2 + 0.5, cy2 = y2 + 0.5, cz2 = z2 + 0.5;
        const dx = cx2 - cx1, dy = cy2 - cy1, dz = cz2 - cz1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length === 0) return;

        const geometry = new THREE.CylinderGeometry(0.05, 0.05, length, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set((cx1 + cx2) / 2, (cy1 + cy2) / 2, (cz1 + cz2) / 2);
        this._tmpDir.set(dx, dy, dz).normalize();
        this._tmpUp.set(0, 1, 0);
        this._tmpQuat.setFromUnitVectors(this._tmpUp, this._tmpDir);
        mesh.quaternion.copy(this._tmpQuat);

        this._scene.add(mesh);
        this._meshes.set(this._ropeKey(x1, y1, z1, x2, y2, z2), mesh);
    }

    /**
     * ロープメッシュ削除
     */
    _removeRopeMesh(meshKey) {
        const mesh = this._meshes.get(meshKey);
        if (!mesh) return;
        this._scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        this._meshes.delete(meshKey);
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

    _setBlockAt(wx, wy, wz, blockId) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return;
        const lx = ((wx % 16) + 16) % 16;
        const lz = ((wz % 16) + 16) % 16;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return;
        const ori = chunk.chunkData.getOrientation(lx, ly, lz);
        chunk.chunkData.setBlock(lx, ly, lz, blockId, ori);
    }

    _rebuildChunkAt(wx, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        this._chunkManager.rebuildChunkMesh(cx, cz);
    }
}

if (typeof window !== 'undefined') {
    window.RopeManager = RopeManager;
}
