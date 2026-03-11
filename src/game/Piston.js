/**
 * Piston.js
 * 粘着ピストン管理クラス - 1往復動作・1ブロック運搬
 */

class PistonBody {
    /**
     * @param {number} pistonX - ピストンのワールドX
     * @param {number} pistonY - ピストンのワールドY
     * @param {number} pistonZ - ピストンのワールドZ
     * @param {{x:number,y:number,z:number}} direction - 方向ベクトル D
     * @param {number} totalDistance - 伸長距離N
     * @param {'pickup'|'push'} mode - 動作モード
     * @param {{blockId:string, orientation:number}|null} carriedBlock - 運搬ブロック
     * @param {number} orientation - ピストンの orientation
     */
    constructor(pistonX, pistonY, pistonZ, direction, totalDistance, mode, carriedBlock, orientation) {
        this._pistonX = pistonX;
        this._pistonY = pistonY;
        this._pistonZ = pistonZ;
        this._direction = direction;
        this._totalDistance = totalDistance;
        this._mode = mode;
        this._carriedBlock = carriedBlock;
        this._orientation = orientation;
        this._phase = 'extending'; // 'extending' → 'retracting'
        this._displacement = 0;
        this._speed = 10.0; // 10ブロック/秒
    }
}

class PistonManager {
    /** 最大伸長距離 */
    static _MAX_EXTEND_DISTANCE = 8;

    /** 移動不可ブロック */
    static _IMMOVABLE = new Set([
        'sticky_piston', 'piston_base', 'sticky_piston_head',
        'pole', 'pole_with_rope', 'rotor', 'switch', 'switch_off',
        'rope_way', 'water'
    ]);

    /** topDir → 方向ベクトル */
    static _DIRECTION_FROM_TOPDIR = [
        { x: 0, y: 1, z: 0 },   // 0: Y+
        { x: 0, y: -1, z: 0 },  // 1: Y-
        { x: 0, y: 0, z: 1 },   // 2: Z+
        { x: 0, y: 0, z: -1 },  // 3: Z-
        { x: 1, y: 0, z: 0 },   // 4: X+
        { x: -1, y: 0, z: 0 },  // 5: X-
    ];

    /**
     * @param {object} chunkManager
     * @param {THREE.Group} worldContainer - シーンコンテナ
     * @param {object} textureLoader - テクスチャローダー
     */
    constructor(chunkManager, worldContainer, textureLoader) {
        this._chunkManager = chunkManager;
        this._scene = worldContainer;
        this._textureLoader = textureLoader;
        /** @type {Map<string, PistonBody>} */
        this._bodies = new Map();
        /** @type {Map<string, object>} アニメーションメッシュ */
        this._meshes = new Map();
        /** @type {Map<string, THREE.Mesh>} アーム（棒）メッシュ */
        this._armMeshes = new Map();
    }

    // === ヘルパー ===

    _resolve(wx, wy, wz) {
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const chunk = this._chunkManager.chunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.chunkData) return null;
        const ly = wy - chunk.chunkData.baseY;
        if (ly < 0 || ly >= 128) return null;
        return { cd: chunk.chunkData, lx: ((wx % 16) + 16) % 16, ly, lz: ((wz % 16) + 16) % 16 };
    }

    _getBlock(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getBlock(r.lx, r.ly, r.lz) : null;
    }

    _getOrientation(wx, wy, wz) {
        const r = this._resolve(wx, wy, wz);
        return r ? r.cd.getOrientation(r.lx, r.ly, r.lz) : 0;
    }

    _setBlock(wx, wy, wz, blockId, orientation = 0) {
        const r = this._resolve(wx, wy, wz);
        if (r) r.cd.setBlock(r.lx, r.ly, r.lz, blockId, orientation);
    }

    _getDirection(orientation) {
        const topDir = Math.floor(orientation / 4);
        return PistonManager._DIRECTION_FROM_TOPDIR[topDir] || PistonManager._DIRECTION_FROM_TOPDIR[0];
    }

    _updateLight(wx, wy, wz, removed) {
        const lc = this._chunkManager.lightCalculator;
        if (!lc) return;
        const r = this._resolve(wx, wy, wz);
        if (!r) return;
        const cx = Math.floor(wx / 16);
        const cz = Math.floor(wz / 16);
        const neighbors = this._chunkManager._getNeighborChunks(cx, cz);
        if (removed) {
            lc.onBlockRemoved(r.cd, r.lx, r.ly, r.lz, neighbors);
        } else {
            lc.onBlockPlaced(r.cd, r.lx, r.ly, r.lz, neighbors);
        }
    }

    _rebuildChunksAround(positions) {
        const affected = new Set();
        for (const [wx, , wz] of positions) {
            const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
            affected.add(`${cx},${cz}`);
            const lx = ((wx % 16) + 16) % 16;
            const lz = ((wz % 16) + 16) % 16;
            if (lx === 0)  affected.add(`${cx - 1},${cz}`);
            if (lx === 15) affected.add(`${cx + 1},${cz}`);
            if (lz === 0)  affected.add(`${cx},${cz - 1}`);
            if (lz === 15) affected.add(`${cx},${cz + 1}`);
        }
        for (const chunkKey of affected) {
            const [cx, cz] = chunkKey.split(',').map(Number);
            this._chunkManager.rebuildChunkMesh(cx, cz);
        }
    }

    // === メイン操作 ===

    /**
     * 粘着ピストンを作動させる（1往復開始）
     * @param {number} wx - sticky_piston のワールドX
     * @param {number} wy - sticky_piston のワールドY
     * @param {number} wz - sticky_piston のワールドZ
     * @returns {boolean} 成功したか
     */
    Activate(wx, wy, wz) {
        const blockId = this._getBlock(wx, wy, wz);
        if (blockId !== 'sticky_piston') return false;

        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false; // 動作中

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);

        // TOP面の隣のブロックを確認
        const adjX = wx + d.x, adjY = wy + d.y, adjZ = wz + d.z;
        const adjBlock = this._getBlock(adjX, adjY, adjZ);
        const adjHasBlock = adjBlock && adjBlock !== 'air';

        if (adjHasBlock) {
            return this._startPush(wx, wy, wz, d, orientation, adjX, adjY, adjZ, adjBlock);
        } else {
            return this._startPickup(wx, wy, wz, d, orientation);
        }
    }

    // === ピックアップモード ===

    _startPickup(wx, wy, wz, d, orientation) {
        const maxDist = PistonManager._MAX_EXTEND_DISTANCE;

        // D方向にスキャンして最初のブロックを探す
        let targetDist = 0;
        let targetBlockId = null;
        let targetOrientation = 0;

        for (let i = 2; i <= maxDist; i++) {
            const sx = wx + d.x * i, sy = wy + d.y * i, sz = wz + d.z * i;
            if (sy < 0 || sy >= 128) break;
            const bid = this._getBlock(sx, sy, sz);
            if (bid && bid !== 'air') {
                targetDist = i;
                targetBlockId = bid;
                targetOrientation = this._getOrientation(sx, sy, sz);
                break;
            }
        }

        if (targetDist === 0) return false; // ブロックが見つからない

        // 移動不可ブロックの場合: 手前で止まって戻る（何も運ばない）
        let carriedBlock = null;
        let extendDist = targetDist;
        if (PistonManager._IMMOVABLE.has(targetBlockId)) {
            extendDist = targetDist - 1;
            if (extendDist < 1) return false;
        } else {
            carriedBlock = { blockId: targetBlockId, orientation: targetOrientation };
        }

        // アニメーション開始（ブロック除去はフェーズ1完了時に行う）
        const body = new PistonBody(wx, wy, wz, d, extendDist, 'pickup', carriedBlock, orientation);
        const bodyKey = `${wx},${wy},${wz}`;
        this._bodies.set(bodyKey, body);
        this._createMesh(bodyKey, body);

        return true;
    }

    // === プッシュモード ===

    _startPush(wx, wy, wz, d, orientation, adjX, adjY, adjZ, adjBlockId) {
        // 移動不可ブロック → 動作失敗
        if (PistonManager._IMMOVABLE.has(adjBlockId)) return false;

        const maxDist = PistonManager._MAX_EXTEND_DISTANCE;
        const adjOrientation = this._getOrientation(adjX, adjY, adjZ);

        // P+2D からスキャンして空きの末端を探す
        let extendDist = maxDist;
        for (let i = 2; i <= maxDist; i++) {
            const sx = wx + d.x * i, sy = wy + d.y * i, sz = wz + d.z * i;
            if (sy < 0 || sy >= 128) {
                extendDist = i - 1;
                break;
            }
            const bid = this._getBlock(sx, sy, sz);
            if (bid && bid !== 'air') {
                extendDist = i - 1;
                break;
            }
        }

        if (extendDist < 2) {
            // 置く場所がない（すぐ隣に障害物）→ 動作失敗
            return false;
        }

        const carriedBlock = { blockId: adjBlockId, orientation: adjOrientation };

        // ブロックBをワールドから即時除去
        this._setBlock(adjX, adjY, adjZ, 'air');
        this._updateLight(adjX, adjY, adjZ, true);
        this._rebuildChunksAround([[adjX, adjY, adjZ]]);

        // アニメーション開始
        const body = new PistonBody(wx, wy, wz, d, extendDist, 'push', carriedBlock, orientation);
        const bodyKey = `${wx},${wy},${wz}`;
        this._bodies.set(bodyKey, body);
        this._createMesh(bodyKey, body);

        return true;
    }

    // === アームメッシュ ===

    _createArmMesh(key, x1, y1, z1, x2, y2, z2) {
        if (typeof THREE === 'undefined' || !this._scene) return;
        this._removeArmMesh(key);
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.01) return;
        const geometry = new THREE.CylinderGeometry(0.1, 0.1, length, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
        this._scene.add(mesh);
        this._armMeshes.set(key, mesh);
    }

    _updateArmMesh(key, x1, y1, z1, x2, y2, z2) {
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.01) return;
        const mesh = this._armMeshes.get(key);
        if (!mesh) {
            this._createArmMesh(key, x1, y1, z1, x2, y2, z2);
            return;
        }
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quat);
        if (mesh.geometry) mesh.geometry.dispose();
        mesh.geometry = new THREE.CylinderGeometry(0.1, 0.1, length, 6);
    }

    _removeArmMesh(key) {
        const mesh = this._armMeshes.get(key);
        if (!mesh) return;
        this._scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        this._armMeshes.delete(key);
    }

    // === アニメーションメッシュ生成 ===

    _createMesh(key, body) {
        if (typeof RotationBodyMesh === 'undefined' || !this._scene) return;

        try {
            // ヘッドブロック + 運搬ブロックをメッシュ化
            const blocks = [];
            // ピストンヘッド（相対座標 0,0,0）
            blocks.push({
                rx: 0, ry: 0, rz: 0,
                blockId: 'sticky_piston_head', orientation: body._orientation
            });
            // 運搬ブロック（ヘッドの先端側 = D方向に1ブロック先）
            if (body._carriedBlock) {
                const d = body._direction;
                if (body._mode === 'push') {
                    // プッシュ: ブロックはヘッドのD方向先
                    blocks.push({
                        rx: d.x, ry: d.y, rz: d.z,
                        blockId: body._carriedBlock.blockId,
                        orientation: body._carriedBlock.orientation
                    });
                } else {
                    // ピックアップ: フェーズ1完了後に運搬開始（初期時点ではヘッドのみ）
                }
            }

            const compatBody = {
                _axisX: body._pistonX, _axisY: body._pistonY, _axisZ: body._pistonZ,
                _blocks: blocks,
                _blockSet: new Set(blocks.map(b => {
                    return ((b.rx + 128) << 16) | ((b.ry + 128) << 8) | (b.rz + 128);
                })),
                _frontDx: 0, _frontDy: 1, _frontDz: 0,
                _centerX: body._pistonX + 0.5,
                _centerY: body._pistonY + 0.5,
                _centerZ: body._pistonZ + 0.5
            };
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        } catch (e) {
            console.warn('PistonManager: メッシュ生成失敗', e);
        }
    }

    _removeMesh(key) {
        const mesh = this._meshes.get(key);
        if (!mesh) return;
        try {
            this._scene.remove(mesh.GetGroup());
            mesh.Dispose();
        } catch (e) {
            console.warn('PistonManager: メッシュ削除失敗', e);
        }
        this._meshes.delete(key);
    }

    /**
     * ピックアップモードのフェーズ1完了後、運搬ブロック付きメッシュに再構築
     */
    _rebuildMeshWithCarriedBlock(key, body) {
        this._removeMesh(key);
        if (typeof RotationBodyMesh === 'undefined' || !this._scene) return;
        try {
            const d = body._direction;
            const blocks = [
                { rx: 0, ry: 0, rz: 0, blockId: 'sticky_piston_head', orientation: body._orientation },
                { rx: d.x, ry: d.y, rz: d.z, blockId: body._carriedBlock.blockId, orientation: body._carriedBlock.orientation }
            ];
            const compatBody = {
                _axisX: body._pistonX, _axisY: body._pistonY, _axisZ: body._pistonZ,
                _blocks: blocks,
                _blockSet: new Set(blocks.map(b => ((b.rx + 128) << 16) | ((b.ry + 128) << 8) | (b.rz + 128))),
                _frontDx: 0, _frontDy: 1, _frontDz: 0,
                _centerX: body._pistonX + 0.5,
                _centerY: body._pistonY + 0.5,
                _centerZ: body._pistonZ + 0.5
            };
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            // 収縮開始位置に配置
            const group = mesh.GetGroup();
            group.position.x = body._pistonX + 0.5 + body._direction.x * body._totalDistance;
            group.position.y = body._pistonY + 0.5 + body._direction.y * body._totalDistance;
            group.position.z = body._pistonZ + 0.5 + body._direction.z * body._totalDistance;
            this._scene.add(group);
            this._meshes.set(key, mesh);
        } catch (e) {
            console.warn('PistonManager: メッシュ再構築失敗', e);
        }
    }

    // === フェーズ切り替え・完了処理 ===

    _onExtendComplete(key, body) {
        const d = body._direction;
        const n = body._totalDistance;
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;

        if (body._mode === 'pickup' && body._carriedBlock) {
            // ターゲットブロックをワールドから除去
            const tx = wx + d.x * n, ty = wy + d.y * n, tz = wz + d.z * n;
            this._setBlock(tx, ty, tz, 'air');
            this._updateLight(tx, ty, tz, true);
            this._rebuildChunksAround([[tx, ty, tz]]);
            // メッシュを運搬ブロック付きに再構築
            this._rebuildMeshWithCarriedBlock(key, body);
        } else if (body._mode === 'push' && body._carriedBlock) {
            // ブロックを伸びた先に設置
            const px = wx + d.x * n, py = wy + d.y * n, pz = wz + d.z * n;
            this._setBlock(px, py, pz, body._carriedBlock.blockId, body._carriedBlock.orientation);
            this._updateLight(px, py, pz, false);
            this._rebuildChunksAround([[px, py, pz]]);
            // プッシュ後、運搬ブロックを解放
            body._carriedBlock = null;
            // メッシュ再構築（ヘッドのみ）
            this._removeMesh(key);
            this._createMesh(key, body);
            // メッシュ位置を伸長先に合わせる
            const mesh = this._meshes.get(key);
            if (mesh) {
                const group = mesh.GetGroup();
                group.position.x = wx + 0.5 + d.x * n;
                group.position.y = wy + 0.5 + d.y * n;
                group.position.z = wz + 0.5 + d.z * n;
            }
        }

        // フェーズ切り替え
        body._phase = 'retracting';
        body._displacement = 0;
    }

    _onRetractComplete(key, body) {
        const d = body._direction;
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;

        if (body._mode === 'pickup' && body._carriedBlock) {
            // ブロックをピストンのTOP面隣に設置
            const px = wx + d.x, py = wy + d.y, pz = wz + d.z;
            this._setBlock(px, py, pz, body._carriedBlock.blockId, body._carriedBlock.orientation);
            this._updateLight(px, py, pz, false);
            this._rebuildChunksAround([[px, py, pz]]);
        }

        // メッシュ・アーム削除
        this._removeMesh(key);
        this._removeArmMesh(key);
        this._bodies.delete(key);
    }

    // === 毎フレーム更新 ===

    /**
     * アニメーション更新
     * @param {number} deltaTime - 秒
     */
    Update(deltaTime) {
        if (this._bodies.size === 0) return;

        const keysToComplete = [];

        for (const [key, body] of this._bodies) {
            body._displacement += body._speed * deltaTime;

            if (body._displacement >= body._totalDistance) {
                body._displacement = body._totalDistance;
                keysToComplete.push(key);
            }

            // メッシュ位置更新
            const progress = body._displacement / body._totalDistance;
            const d = body._direction;
            const n = body._totalDistance;
            const baseX = body._pistonX + 0.5;
            const baseY = body._pistonY + 0.5;
            const baseZ = body._pistonZ + 0.5;

            let headX, headY, headZ;
            if (body._phase === 'extending') {
                headX = baseX + d.x * n * progress;
                headY = baseY + d.y * n * progress;
                headZ = baseZ + d.z * n * progress;
            } else {
                // 収縮: 伸びた先から戻る
                headX = baseX + d.x * n * (1 - progress);
                headY = baseY + d.y * n * (1 - progress);
                headZ = baseZ + d.z * n * (1 - progress);
            }

            const mesh = this._meshes.get(key);
            if (mesh) {
                const group = mesh.GetGroup();
                group.position.x = headX;
                group.position.y = headY;
                group.position.z = headZ;
            }

            // アーム更新
            this._updateArmMesh(key, baseX, baseY, baseZ, headX, headY, headZ);
        }

        for (const key of keysToComplete) {
            const body = this._bodies.get(key);
            if (!body) continue;

            if (body._phase === 'extending') {
                this._onExtendComplete(key, body);
            } else {
                this._onRetractComplete(key, body);
            }
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.PistonBody = PistonBody;
    window.PistonManager = PistonManager;
}
