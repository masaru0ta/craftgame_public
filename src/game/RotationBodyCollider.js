/**
 * RotationBodyCollider.js
 * 回転体の当たり判定（逆変換方式）
 * バウンディングスフィア＋ローカル空間グリッド判定
 */
class RotationBodyCollider {
    static SnapDistance = 0.1; // 乗車スナップ距離

    constructor() {
        this._ridingBody = null;     // 現在乗車中の回転体
        this._ridingLocalPos = null; // 乗車時のローカル座標
    }

    /**
     * レイキャストで回転体にヒットするか判定（逆変換方式）
     * @param {THREE.Raycaster} raycaster
     * @param {Array<RotationBody>} bodies
     * @returns {object|null}
     */
    Raycast(raycaster, bodies) {
        const origin = raycaster.ray.origin;
        const direction = raycaster.ray.direction;
        const maxDist = raycaster.far || 20;

        let closestHit = null;
        let closestDist = maxDist;

        for (const body of bodies) {
            if (body._blocks.length === 0) continue;

            // バウンディングスフィアチェック
            const cx = body.axisX + 0.5;
            const cy = body.axisY + 0.5;
            const cz = body.axisZ + 0.5;
            const dx = origin.x - cx;
            const dy = origin.y - cy;
            const dz = origin.z - cz;
            const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distToCenter > body.boundingSphereRadius + maxDist) continue;

            // 逆変換方式でレイをローカル空間に変換
            const hit = this._raycastBody(body, origin, direction, maxDist);
            if (hit && hit.distance < closestDist) {
                closestDist = hit.distance;
                closestHit = hit;
                closestHit.body = body;
            }

            // 子回転体もチェック
            for (const child of body.childBodies) {
                if (child._blocks.length === 0) continue;
                const childHit = this._raycastChildBody(body, child, origin, direction, maxDist);
                if (childHit && childHit.distance < closestDist) {
                    closestDist = childHit.distance;
                    closestHit = childHit;
                    closestHit.body = child;
                }
            }
        }

        return closestHit;
    }

    /**
     * プレイヤーの乗車判定と追従処理
     * @param {Player} player
     * @param {Array<RotationBody>} bodies
     * @returns {boolean}
     */
    UpdatePlayerRiding(player, bodies) {
        const pos = player.getPosition();

        // 乗車中の場合、追従処理
        if (this._ridingBody && this._ridingLocalPos) {
            const body = this._ridingBody;
            if (body._blocks.length === 0 || !body.isRotating) {
                this._ridingBody = null;
                this._ridingLocalPos = null;
                return false;
            }

            // ローカル座標をワールド座標に変換（正変換）
            const worldPos = this._localToWorld(body, this._ridingLocalPos);
            player.setPosition(worldPos.x, worldPos.y, worldPos.z);

            // まだ乗っているか確認
            if (!this._isPlayerOnBody(player, body)) {
                this._ridingBody = null;
                this._ridingLocalPos = null;
                return false;
            }

            return true;
        }

        // 新規乗車判定
        for (const body of bodies) {
            if (body._blocks.length === 0 || !body.isRotating) continue;

            if (this._isPlayerOnBody(player, body)) {
                // ワールド座標をローカル座標に逆変換
                this._ridingBody = body;
                this._ridingLocalPos = this._worldToLocal(body, pos);
                return true;
            }
        }

        return false;
    }

    /**
     * プレイヤーが回転体の上に乗っているか判定
     */
    _isPlayerOnBody(player, body) {
        const pos = player.getPosition();
        const halfWidth = typeof Player !== 'undefined' && Player.WIDTH ? Player.WIDTH / 2 : 0.3;

        // プレイヤー足元のAABBを逆変換してローカル空間で判定
        const localPos = this._worldToLocal(body, pos);
        const feetY = localPos.y;

        for (const block of body._blocks) {
            // ブロック上面のローカルY座標（ブロック中心からの距離）
            // ブロック(rx,ry,rz)のローカル空間範囲: [rx-0.5, rx+0.5) x [ry-0.5, ry+0.5) x [rz-0.5, rz+0.5)
            const blockTopY = block.y + 0.5;

            // 足元がブロック上面付近か
            if (Math.abs(feetY - blockTopY) > RotationBodyCollider.SnapDistance) continue;

            // XZ範囲チェック: プレイヤーAABBとブロックの重なり
            const blockMinX = block.x - 0.5;
            const blockMaxX = block.x + 0.5;
            const blockMinZ = block.z - 0.5;
            const blockMaxZ = block.z + 0.5;
            const playerMinX = localPos.x - halfWidth;
            const playerMaxX = localPos.x + halfWidth;
            const playerMinZ = localPos.z - halfWidth;
            const playerMaxZ = localPos.z + halfWidth;

            if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
                return true;
            }
        }

        return false;
    }

    /**
     * ワールド座標をローカル座標に逆変換
     */
    _worldToLocal(body, worldPos) {
        // 軸位置を原点にする
        const dx = worldPos.x - (body.axisX + 0.5);
        const dy = worldPos.y - (body.axisY + 0.5);
        const dz = worldPos.z - (body.axisZ + 0.5);

        // 逆回転
        return this._rotatePoint(dx, dy, dz, body.GetRotationAxis(), -body.angle);
    }

    /**
     * ローカル座標をワールド座標に正変換
     */
    _localToWorld(body, localPos) {
        // 正回転
        const rotated = this._rotatePoint(localPos.x, localPos.y, localPos.z, body.GetRotationAxis(), body.angle);

        // 軸位置を足す
        return {
            x: rotated.x + body.axisX + 0.5,
            y: rotated.y + body.axisY + 0.5,
            z: rotated.z + body.axisZ + 0.5
        };
    }

    /**
     * 点を軸周りに回転
     */
    _rotatePoint(x, y, z, axis, angle) {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        if (axis === 'y') {
            return {
                x: cosA * x - sinA * z,
                y: y,
                z: sinA * x + cosA * z
            };
        } else if (axis === 'x') {
            return {
                x: x,
                y: cosA * y - sinA * z,
                z: sinA * y + cosA * z
            };
        } else { // z
            return {
                x: cosA * x - sinA * y,
                y: sinA * x + cosA * y,
                z: z
            };
        }
    }

    /**
     * 回転体へのレイキャスト（逆変換方式）
     */
    _raycastBody(body, origin, direction, maxDist) {
        const axis = body.GetRotationAxis();
        const angle = body.angle;

        // レイの始点を逆変換
        const localOrigin = this._worldToLocal(body, origin);
        // レイの方向も逆回転
        const localDir = this._rotatePoint(direction.x, direction.y, direction.z, axis, -angle);

        // ローカル空間でグリッドDDA走査
        return this._gridRaycast(body, localOrigin, localDir, maxDist);
    }

    /**
     * 子回転体へのレイキャスト（2段逆変換）
     */
    _raycastChildBody(parentBody, childBody, origin, direction, maxDist) {
        const parentAxis = parentBody.GetRotationAxis();
        const parentAngle = parentBody.angle;
        const childAxis = childBody.GetRotationAxis();
        const childAngle = childBody.angle;

        // 1段目: 親の逆変換
        const p1 = this._worldToLocal(parentBody, origin);
        const d1 = this._rotatePoint(direction.x, direction.y, direction.z, parentAxis, -parentAngle);

        // 2段目: 子の逆変換（子軸の相対位置を引く）
        const relX = childBody.axisX - parentBody.axisX;
        const relY = childBody.axisY - parentBody.axisY;
        const relZ = childBody.axisZ - parentBody.axisZ;
        const p2 = this._rotatePoint(p1.x - relX, p1.y - relY, p1.z - relZ, childAxis, -childAngle);
        const d2 = this._rotatePoint(d1.x, d1.y, d1.z, childAxis, -childAngle);

        return this._gridRaycast(childBody, p2, d2, maxDist);
    }

    /**
     * ローカル空間でのグリッドDDAレイキャスト
     */
    _gridRaycast(body, origin, direction, maxDist) {
        const step = 0.1;
        const steps = Math.ceil(maxDist / step);
        let prevBX = NaN, prevBY = NaN, prevBZ = NaN;

        for (let i = 0; i <= steps; i++) {
            const t = i * step;
            const px = origin.x + direction.x * t;
            const py = origin.y + direction.y * t;
            const pz = origin.z + direction.z * t;

            // ローカル空間のブロック座標に変換（+0.5オフセット: 軸中心が原点）
            const bx = Math.floor(px + 0.5);
            const by = Math.floor(py + 0.5);
            const bz = Math.floor(pz + 0.5);

            if (bx === prevBX && by === prevBY && bz === prevBZ) continue;
            prevBX = bx; prevBY = by; prevBZ = bz;

            // ブロックが存在するか
            const block = body._blocks.find(b => b.x === bx && b.y === by && b.z === bz);
            if (block) {
                // ヒット面を判定
                const localX = (px + 0.5) - bx;
                const localY = (py + 0.5) - by;
                const localZ = (pz + 0.5) - bz;
                const face = this._determineFace(localX, localY, localZ);

                return {
                    distance: t,
                    blockX: bx + body.axisX,
                    blockY: by + body.axisY,
                    blockZ: bz + body.axisZ,
                    face: face
                };
            }
        }

        return null;
    }

    /**
     * ブロック内の位置から面を判定
     */
    _determineFace(localX, localY, localZ) {
        const faces = [
            { name: 'west', value: localX },
            { name: 'east', value: 1 - localX },
            { name: 'bottom', value: localY },
            { name: 'top', value: 1 - localY },
            { name: 'south', value: localZ },
            { name: 'north', value: 1 - localZ }
        ];
        faces.sort((a, b) => a.value - b.value);
        return faces[0].name;
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.RotationBodyCollider = RotationBodyCollider;
}
