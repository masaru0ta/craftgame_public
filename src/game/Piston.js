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
    static _MAX_EXTEND_DISTANCE = 8;

    static _IMMOVABLE = new Set([
        'sticky_piston', 'piston_base', 'sticky_piston_head',
        'pole', 'pole_with_rope', 'rotor', 'switch', 'switch_off',
        'rope_way', 'water'
    ]);

    static _DIRECTION_FROM_TOPDIR = [
        { x: 0, y: 1, z: 0 },   // 0: Y+
        { x: 0, y: -1, z: 0 },  // 1: Y-
        { x: 0, y: 0, z: 1 },   // 2: Z+
        { x: 0, y: 0, z: -1 },  // 3: Z-
        { x: 1, y: 0, z: 0 },   // 4: X+
        { x: -1, y: 0, z: 0 },  // 5: X-
    ];

    constructor(chunkManager, worldContainer, textureLoader) {
        this._chunkManager = chunkManager;
        this._scene = worldContainer;
        this._textureLoader = textureLoader;
        /** @type {Map<string, PistonBody>} */
        this._bodies = new Map();
        /** @type {Map<string, object>} */
        this._meshes = new Map();
        /** @type {Map<string, THREE.Mesh>} */
        this._armMeshes = new Map();
    }

    // === ブロック操作ヘルパー ===

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

    /** ブロック設置 + ライト更新 + チャンク再構築 */
    _placeBlockAt(wx, wy, wz, blockId, orientation = 0) {
        this._setBlock(wx, wy, wz, blockId, orientation);
        this._updateLight(wx, wy, wz, false);
        this._rebuildChunksAround([[wx, wy, wz]]);
    }

    /** ブロック除去 + ライト更新 + チャンク再構築 */
    _removeBlockAt(wx, wy, wz) {
        this._setBlock(wx, wy, wz, 'air');
        this._updateLight(wx, wy, wz, true);
        this._rebuildChunksAround([[wx, wy, wz]]);
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
     * @returns {boolean} 成功したか
     */
    Activate(wx, wy, wz) {
        if (this._getBlock(wx, wy, wz) !== 'sticky_piston') return false;

        const bodyKey = `${wx},${wy},${wz}`;
        if (this._bodies.has(bodyKey)) return false;

        const orientation = this._getOrientation(wx, wy, wz);
        const d = this._getDirection(orientation);
        const adjX = wx + d.x, adjY = wy + d.y, adjZ = wz + d.z;
        const adjBlock = this._getBlock(adjX, adjY, adjZ);

        if (adjBlock && adjBlock !== 'air') {
            return this._startPush(wx, wy, wz, d, orientation, adjX, adjY, adjZ, adjBlock);
        }
        return this._startPickup(wx, wy, wz, d, orientation);
    }

    /** PistonBodyを生成し登録 + メッシュ生成 */
    _registerBody(wx, wy, wz, d, extendDist, mode, carriedBlock, orientation) {
        const body = new PistonBody(wx, wy, wz, d, extendDist, mode, carriedBlock, orientation);
        const bodyKey = `${wx},${wy},${wz}`;
        this._bodies.set(bodyKey, body);
        this._createMesh(bodyKey, body);
        return true;
    }

    // === ピックアップモード ===

    _startPickup(wx, wy, wz, d, orientation) {
        const maxDist = PistonManager._MAX_EXTEND_DISTANCE;

        // D方向にスキャンして最初のブロックを探す
        let targetDist = 0;
        let targetBlockId = null;
        let targetOrientation = 0;

        for (let i = 2; i <= maxDist; i++) {
            const sy = wy + d.y * i;
            if (sy < 0 || sy >= 128) break;
            const bid = this._getBlock(wx + d.x * i, sy, wz + d.z * i);
            if (bid && bid !== 'air') {
                targetDist = i;
                targetBlockId = bid;
                targetOrientation = this._getOrientation(wx + d.x * i, sy, wz + d.z * i);
                break;
            }
        }

        // ブロックが見つからない場合: 最大距離まで空振り
        if (targetDist === 0) {
            return this._registerBody(wx, wy, wz, d, maxDist, 'pickup', null, orientation);
        }

        // 移動不可ブロック: 手前で止まって戻る
        if (PistonManager._IMMOVABLE.has(targetBlockId)) {
            const extendDist = targetDist - 1;
            return extendDist >= 1 && this._registerBody(wx, wy, wz, d, extendDist, 'pickup', null, orientation);
        }

        const carriedBlock = { blockId: targetBlockId, orientation: targetOrientation };
        return this._registerBody(wx, wy, wz, d, targetDist, 'pickup', carriedBlock, orientation);
    }

    // === プッシュモード ===

    _startPush(wx, wy, wz, d, orientation, adjX, adjY, adjZ, adjBlockId) {
        if (PistonManager._IMMOVABLE.has(adjBlockId)) return false;

        const maxDist = PistonManager._MAX_EXTEND_DISTANCE;

        // P+2D からスキャンして空きの末端を探す
        let extendDist = maxDist;
        for (let i = 2; i <= maxDist; i++) {
            const sy = wy + d.y * i;
            if (sy < 0 || sy >= 128) { extendDist = i - 1; break; }
            const bid = this._getBlock(wx + d.x * i, sy, wz + d.z * i);
            if (bid && bid !== 'air') { extendDist = i - 1; break; }
        }

        if (extendDist < 2) return false;

        const carriedBlock = { blockId: adjBlockId, orientation: this._getOrientation(adjX, adjY, adjZ) };
        this._removeBlockAt(adjX, adjY, adjZ);
        return this._registerBody(wx, wy, wz, d, extendDist, 'push', carriedBlock, orientation);
    }

    // === アームメッシュ ===

    _setArmMesh(key, x1, y1, z1, x2, y2, z2) {
        if (typeof THREE === 'undefined' || !this._scene) return;
        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length < 0.01) return;

        let mesh = this._armMeshes.get(key);
        if (!mesh) {
            const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
            const material = new THREE.MeshBasicMaterial({ color: 0x888888 });
            mesh = new THREE.Mesh(geometry, material);
            this._scene.add(mesh);
            this._armMeshes.set(key, mesh);
        }

        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        mesh.scale.set(1, length, 1);
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }

    _removeArmMesh(key) {
        const mesh = this._armMeshes.get(key);
        if (!mesh) return;
        this._scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        this._armMeshes.delete(key);
    }

    // === アニメーションメッシュ ===

    /** RotationBodyMesh互換オブジェクトを構築 */
    _buildCompatBody(body, blocks) {
        return {
            _axisX: body._pistonX, _axisY: body._pistonY, _axisZ: body._pistonZ,
            _blocks: blocks,
            _blockSet: new Set(blocks.map(b => ((b.rx + 128) << 16) | ((b.ry + 128) << 8) | (b.rz + 128))),
            _frontDx: 0, _frontDy: 1, _frontDz: 0,
            _centerX: body._pistonX + 0.5,
            _centerY: body._pistonY + 0.5,
            _centerZ: body._pistonZ + 0.5
        };
    }

    /** ブロックリストからメッシュを生成してシーンに追加 */
    _buildAndAddMesh(key, body, blocks) {
        if (typeof RotationBodyMesh === 'undefined' || !this._scene) return;
        try {
            const compatBody = this._buildCompatBody(body, blocks);
            const mesh = new RotationBodyMesh(compatBody, this._textureLoader, this._chunkManager);
            mesh.Build();
            this._scene.add(mesh.GetGroup());
            this._meshes.set(key, mesh);
        } catch (e) {
            console.warn('PistonManager: メッシュ生成失敗', e);
        }
    }

    _createMesh(key, body) {
        const blocks = [
            { rx: 0, ry: 0, rz: 0, blockId: 'sticky_piston_head', orientation: body._orientation }
        ];
        if (body._carriedBlock && body._mode === 'push') {
            const d = body._direction;
            blocks.push({
                rx: d.x, ry: d.y, rz: d.z,
                blockId: body._carriedBlock.blockId,
                orientation: body._carriedBlock.orientation
            });
        }
        this._buildAndAddMesh(key, body, blocks);
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

    /** メッシュを再構築し指定位置に配置 */
    _replaceMesh(key, body, blocks, posX, posY, posZ) {
        this._removeMesh(key);
        this._buildAndAddMesh(key, body, blocks);
        const mesh = this._meshes.get(key);
        if (mesh) {
            const group = mesh.GetGroup();
            group.position.set(posX, posY, posZ);
        }
    }

    // === フェーズ切り替え・完了処理 ===

    _onExtendComplete(key, body) {
        const d = body._direction;
        const n = body._totalDistance;
        const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;
        const tipX = wx + d.x * n, tipY = wy + d.y * n, tipZ = wz + d.z * n;

        if (body._carriedBlock) {
            if (body._mode === 'pickup') {
                // ターゲットブロックをワールドから除去
                this._removeBlockAt(tipX, tipY, tipZ);
                // メッシュを運搬ブロック付きに再構築（収縮開始位置）
                const blocks = [
                    { rx: 0, ry: 0, rz: 0, blockId: 'sticky_piston_head', orientation: body._orientation },
                    { rx: d.x, ry: d.y, rz: d.z, blockId: body._carriedBlock.blockId, orientation: body._carriedBlock.orientation }
                ];
                this._replaceMesh(key, body, blocks, tipX + 0.5, tipY + 0.5, tipZ + 0.5);
            } else {
                // プッシュ: ブロックを伸びた先に設置
                this._placeBlockAt(tipX, tipY, tipZ, body._carriedBlock.blockId, body._carriedBlock.orientation);
                body._carriedBlock = null;
                // メッシュ再構築（ヘッドのみ、伸長先位置）
                const blocks = [{ rx: 0, ry: 0, rz: 0, blockId: 'sticky_piston_head', orientation: body._orientation }];
                this._replaceMesh(key, body, blocks, tipX + 0.5, tipY + 0.5, tipZ + 0.5);
            }
        }

        body._phase = 'retracting';
        body._displacement = 0;
    }

    _onRetractComplete(key, body) {
        if (body._mode === 'pickup' && body._carriedBlock) {
            const d = body._direction;
            const wx = body._pistonX, wy = body._pistonY, wz = body._pistonZ;
            this._placeBlockAt(wx + d.x, wy + d.y, wz + d.z, body._carriedBlock.blockId, body._carriedBlock.orientation);
        }

        this._removeMesh(key);
        this._removeArmMesh(key);
        this._bodies.delete(key);
    }

    // === 毎フレーム更新 ===

    Update(deltaTime) {
        if (this._bodies.size === 0) return;

        const keysToComplete = [];

        for (const [key, body] of this._bodies) {
            body._displacement += body._speed * deltaTime;
            if (body._displacement >= body._totalDistance) {
                body._displacement = body._totalDistance;
                keysToComplete.push(key);
            }

            const progress = body._displacement / body._totalDistance;
            const d = body._direction;
            const n = body._totalDistance;
            const baseX = body._pistonX + 0.5;
            const baseY = body._pistonY + 0.5;
            const baseZ = body._pistonZ + 0.5;

            // 伸長時: 0→1、収縮時: 1→0
            const t = body._phase === 'extending' ? progress : 1 - progress;
            const headX = baseX + d.x * n * t;
            const headY = baseY + d.y * n * t;
            const headZ = baseZ + d.z * n * t;

            const mesh = this._meshes.get(key);
            if (mesh) {
                mesh.GetGroup().position.set(headX, headY, headZ);
            }
            this._setArmMesh(key, baseX, baseY, baseZ, headX, headY, headZ);
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

if (typeof window !== 'undefined') {
    window.PistonBody = PistonBody;
    window.PistonManager = PistonManager;
}
