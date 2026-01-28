/**
 * PhysicsWorld.js
 * 物理演算・衝突判定クラス
 * AABB衝突判定、接地判定、押し返し処理を実装
 */
class PhysicsWorld {
    /**
     * コンストラクタ
     * @param {ChunkManager} chunkManager - チャンクマネージャー
     * @param {TextureLoader} textureLoader - テクスチャローダー（ブロック定義取得用）
     */
    constructor(chunkManager, textureLoader) {
        this.chunkManager = chunkManager;
        this.textureLoader = textureLoader;

        // 衝突判定の検索範囲（プレイヤー周辺のブロック数）
        this.collisionSearchRadius = 2;

        // 接地判定の閾値
        this.groundCheckDistance = 0.01;
    }

    /**
     * プレイヤーを移動（衝突判定付き）
     * @param {Player} player - プレイヤー
     * @param {{x: number, y: number, z: number}} velocity - 速度ベクトル
     * @param {number} deltaTime - 経過時間（秒）
     */
    movePlayer(player, velocity, deltaTime) {
        const pos = player.getPosition();

        // 移動量を計算
        const dx = velocity.x * deltaTime;
        const dy = velocity.y * deltaTime;
        const dz = velocity.z * deltaTime;

        // Y軸を先に処理（接地判定のため）
        if (dy !== 0) {
            pos.y += dy;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionY(player, dy);
            const newPos = player.getPosition();
            pos.y = newPos.y;
        }

        // X軸の処理
        if (dx !== 0) {
            pos.x += dx;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionX(player, dx);
            const newPos = player.getPosition();
            pos.x = newPos.x;
        }

        // Z軸の処理
        if (dz !== 0) {
            pos.z += dz;
            player.setPosition(pos.x, pos.y, pos.z);
            this._resolveCollisionZ(player, dz);
        }

        // 接地判定を更新
        player.setOnGround(this.isOnGround(player));
    }

    /**
     * Y軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dy - 移動方向
     */
    _resolveCollisionY(player, dy) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            if (dy > 0) {
                // 上昇中 - 天井に当たった
                const newY = blockAABB.minY - player.getHeight();
                player.setPosition(player.getPosition().x, newY, player.getPosition().z);
                player.setVelocity(player.getVelocity().x, 0, player.getVelocity().z);
            } else if (dy < 0) {
                // 落下中 - 床に着地
                const newY = blockAABB.maxY;
                player.setPosition(player.getPosition().x, newY, player.getPosition().z);
                player.setVelocity(player.getVelocity().x, 0, player.getVelocity().z);
            }
        }
    }

    /**
     * X軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dx - 移動方向
     */
    _resolveCollisionX(player, dx) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);
        const halfWidth = Player.WIDTH / 2;

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            const pos = player.getPosition();
            if (dx > 0) {
                // 東へ移動中 - 壁に当たった
                const newX = blockAABB.minX - halfWidth;
                player.setPosition(newX, pos.y, pos.z);
            } else if (dx < 0) {
                // 西へ移動中 - 壁に当たった
                const newX = blockAABB.maxX + halfWidth;
                player.setPosition(newX, pos.y, pos.z);
            }
            player.setVelocity(0, player.getVelocity().y, player.getVelocity().z);
        }
    }

    /**
     * Z軸方向の衝突を解決
     * @param {Player} player
     * @param {number} dz - 移動方向
     */
    _resolveCollisionZ(player, dz) {
        const aabb = player.getAABB();
        const collisions = this._getCollidingBlocks(aabb);
        const halfWidth = Player.WIDTH / 2;

        for (const blockAABB of collisions) {
            const playerAABB = player.getAABB();

            if (!this._aabbIntersects(playerAABB, blockAABB)) continue;

            const pos = player.getPosition();
            if (dz > 0) {
                // 北へ移動中 - 壁に当たった
                const newZ = blockAABB.minZ - halfWidth;
                player.setPosition(pos.x, pos.y, newZ);
            } else if (dz < 0) {
                // 南へ移動中 - 壁に当たった
                const newZ = blockAABB.maxZ + halfWidth;
                player.setPosition(pos.x, pos.y, newZ);
            }
            player.setVelocity(player.getVelocity().x, player.getVelocity().y, 0);
        }
    }

    /**
     * プレイヤー周辺の衝突するブロックのAABBリストを取得
     * @param {Object} playerAABB - プレイヤーのAABB
     * @returns {Array<Object>} 衝突するブロックのAABBリスト
     */
    _getCollidingBlocks(playerAABB) {
        const collisions = [];

        // 検索範囲を計算
        const minX = Math.floor(playerAABB.minX) - 1;
        const maxX = Math.ceil(playerAABB.maxX) + 1;
        const minY = Math.floor(playerAABB.minY) - 1;
        const maxY = Math.ceil(playerAABB.maxY) + 1;
        const minZ = Math.floor(playerAABB.minZ) - 1;
        const maxZ = Math.ceil(playerAABB.maxZ) + 1;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const blockAABBs = this.getBlockCollisionAABBs(x, y, z);
                    collisions.push(...blockAABBs);
                }
            }
        }

        return collisions;
    }

    /**
     * 2つのAABBが交差しているかチェック
     * @param {Object} a - AABB
     * @param {Object} b - AABB
     * @returns {boolean}
     */
    _aabbIntersects(a, b) {
        return a.minX < b.maxX && a.maxX > b.minX &&
               a.minY < b.maxY && a.maxY > b.minY &&
               a.minZ < b.maxZ && a.maxZ > b.minZ;
    }

    /**
     * 接地判定
     * @param {Player} player
     * @returns {boolean}
     */
    isOnGround(player) {
        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 足元のAABBを作成（薄い板状）
        const checkAABB = {
            minX: pos.x - halfWidth,
            minY: pos.y - this.groundCheckDistance,
            minZ: pos.z - halfWidth,
            maxX: pos.x + halfWidth,
            maxY: pos.y,
            maxZ: pos.z + halfWidth
        };

        // 検索範囲を計算
        const minX = Math.floor(checkAABB.minX);
        const maxX = Math.ceil(checkAABB.maxX);
        const y = Math.floor(pos.y) - 1;
        const minZ = Math.floor(checkAABB.minZ);
        const maxZ = Math.ceil(checkAABB.maxZ);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const blockAABBs = this.getBlockCollisionAABBs(x, y, z);
                for (const blockAABB of blockAABBs) {
                    if (this._aabbIntersects(checkAABB, blockAABB)) {
                        return true;
                    }
                }
                // 現在の高さのブロックもチェック
                const blockAABBs2 = this.getBlockCollisionAABBs(x, Math.floor(pos.y), z);
                for (const blockAABB of blockAABBs2) {
                    if (blockAABB.maxY <= pos.y + 0.01 && blockAABB.maxY >= pos.y - 0.01) {
                        if (pos.x - halfWidth < blockAABB.maxX && pos.x + halfWidth > blockAABB.minX &&
                            pos.z - halfWidth < blockAABB.maxZ && pos.z + halfWidth > blockAABB.minZ) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * ワールド座標からブロックを取得
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {string|null} block_str_id または null
     */
    getBlockAt(x, y, z) {
        if (!this.chunkManager) return null;

        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);

        // チャンク座標を計算
        const chunkX = Math.floor(blockX / 16);
        const chunkZ = Math.floor(blockZ / 16);
        const key = `${chunkX},${chunkZ}`;

        const chunk = this.chunkManager.chunks.get(key);
        if (!chunk || !chunk.chunkData) return null;

        // チャンク内座標
        const localX = ((blockX % 16) + 16) % 16;
        const localZ = ((blockZ % 16) + 16) % 16;

        return chunk.chunkData.getBlock(localX, blockY, localZ);
    }

    /**
     * ブロック位置のAABBリストを取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @returns {Array<Object>} AABBリスト
     */
    getBlockCollisionAABBs(blockX, blockY, blockZ) {
        // Y座標の範囲チェック
        if (blockY < 0 || blockY >= 128) return [];

        const blockStrId = this.getBlockAt(blockX, blockY, blockZ);

        // 空気ブロックは判定なし
        if (!blockStrId || blockStrId === 'air') return [];

        // ブロック定義を取得
        const blockDef = this._getBlockDefinition(blockStrId);

        if (!blockDef) {
            // 定義がない場合は1x1x1のAABBを返す
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        // 標準ブロックは1x1x1のAABB
        if (blockDef.shape_type === 'standard' || !blockDef.shape_type) {
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        // カスタムブロックは当たり判定ボクセルを使用
        if (blockDef.shape_type === 'custom' && blockDef.voxel_collision) {
            return this._getCustomBlockAABBs(blockX, blockY, blockZ, blockDef.voxel_collision);
        }

        // その他は1x1x1のAABB
        return [{
            minX: blockX,
            minY: blockY,
            minZ: blockZ,
            maxX: blockX + 1,
            maxY: blockY + 1,
            maxZ: blockZ + 1
        }];
    }

    /**
     * カスタムブロックの当たり判定AABBリストを取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @param {string} voxelCollision - Base64エンコードされた当たり判定データ
     * @returns {Array<Object>} AABBリスト
     */
    _getCustomBlockAABBs(blockX, blockY, blockZ, voxelCollision) {
        const aabbs = [];

        // CustomCollisionクラスを使用してデコード
        if (typeof CustomCollision === 'undefined') {
            // CustomCollisionがない場合は1x1x1を返す
            return [{
                minX: blockX,
                minY: blockY,
                minZ: blockZ,
                maxX: blockX + 1,
                maxY: blockY + 1,
                maxZ: blockZ + 1
            }];
        }

        const collisionData = CustomCollision.decode(voxelCollision);
        const voxelSize = 0.25; // 1/4 ブロック

        // 4x4x4のボクセルをチェック
        for (let vy = 0; vy < 4; vy++) {
            for (let vz = 0; vz < 4; vz++) {
                for (let vx = 0; vx < 4; vx++) {
                    if (collisionData[vy][vz][vx] === 1) {
                        aabbs.push({
                            minX: blockX + vx * voxelSize,
                            minY: blockY + vy * voxelSize,
                            minZ: blockZ + vz * voxelSize,
                            maxX: blockX + (vx + 1) * voxelSize,
                            maxY: blockY + (vy + 1) * voxelSize,
                            maxZ: blockZ + (vz + 1) * voxelSize
                        });
                    }
                }
            }
        }

        return aabbs;
    }

    /**
     * ブロック定義を取得
     * @param {string} blockStrId
     * @returns {Object|null}
     */
    _getBlockDefinition(blockStrId) {
        if (!this.textureLoader || !this.textureLoader.blocks) return null;

        return this.textureLoader.blocks.find(b => b.block_str_id === blockStrId) || null;
    }

    /**
     * スニーク時の落下防止チェック
     * プレイヤーが移動しようとしている方向に床がないかチェック
     * @param {Player} player
     * @param {number} dx - X方向の移動量
     * @param {number} dz - Z方向の移動量
     * @returns {{dx: number, dz: number}} 修正された移動量
     */
    checkSneakEdge(player, dx, dz) {
        if (!player.isSneaking() || player.isFlying()) {
            return { dx, dz };
        }

        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 移動後の位置で足元をチェック
        const checkX = pos.x + dx;
        const checkZ = pos.z + dz;

        // 足元にブロックがあるかチェック
        const hasGroundAfterMove = this._hasGroundAt(checkX, pos.y, checkZ, halfWidth);

        if (!hasGroundAfterMove && player.isOnGround()) {
            // 現在の位置で足元にブロックがあるか
            const hasGroundNow = this._hasGroundAt(pos.x, pos.y, pos.z, halfWidth);

            if (hasGroundNow) {
                // 軸ごとにチェック
                let newDx = dx;
                let newDz = dz;

                // X方向のみで落下するか
                if (dx !== 0) {
                    const hasGroundX = this._hasGroundAt(pos.x + dx, pos.y, pos.z, halfWidth);
                    if (!hasGroundX) newDx = 0;
                }

                // Z方向のみで落下するか
                if (dz !== 0) {
                    const hasGroundZ = this._hasGroundAt(pos.x, pos.y, pos.z + dz, halfWidth);
                    if (!hasGroundZ) newDz = 0;
                }

                return { dx: newDx, dz: newDz };
            }
        }

        return { dx, dz };
    }

    /**
     * 指定位置の足元にブロックがあるかチェック
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} halfWidth
     * @returns {boolean}
     */
    _hasGroundAt(x, y, z, halfWidth) {
        // 4隅と中心をチェック
        const checkPoints = [
            { x: x, z: z },
            { x: x - halfWidth * 0.9, z: z - halfWidth * 0.9 },
            { x: x + halfWidth * 0.9, z: z - halfWidth * 0.9 },
            { x: x - halfWidth * 0.9, z: z + halfWidth * 0.9 },
            { x: x + halfWidth * 0.9, z: z + halfWidth * 0.9 }
        ];

        for (const point of checkPoints) {
            const blockY = Math.floor(y) - 1;
            const blockAABBs = this.getBlockCollisionAABBs(
                Math.floor(point.x),
                blockY,
                Math.floor(point.z)
            );
            if (blockAABBs.length > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * 段差を乗り越えられるかチェック（オートジャンプ用）
     * @param {Player} player - プレイヤー
     * @param {number} dx - X方向の移動量
     * @param {number} dz - Z方向の移動量
     * @param {number} maxStepHeight - 最大段差高さ
     * @returns {{canStepUp: boolean, stepHeight: number}} 段差情報
     */
    checkStepUp(player, dx, dz, maxStepHeight) {
        const pos = player.getPosition();
        const halfWidth = Player.WIDTH / 2;

        // 移動先の位置
        const targetX = pos.x + dx;
        const targetZ = pos.z + dz;

        // 移動先のAABB（足元付近）
        const checkAABB = {
            minX: targetX - halfWidth,
            minY: pos.y,
            minZ: targetZ - halfWidth,
            maxX: targetX + halfWidth,
            maxY: pos.y + 0.1, // 少し上まで
            maxZ: targetZ + halfWidth
        };

        // 移動先で衝突するブロックを取得
        const collisions = this._getCollidingBlocks(checkAABB);

        // 衝突がなければ段差なし
        if (collisions.length === 0) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 衝突があるか確認
        let hasCollision = false;
        let maxBlockTop = pos.y;

        for (const blockAABB of collisions) {
            if (this._aabbIntersects(checkAABB, blockAABB)) {
                hasCollision = true;
                // 衝突ブロックの上面の高さを記録
                if (blockAABB.maxY > maxBlockTop) {
                    maxBlockTop = blockAABB.maxY;
                }
            }
        }

        if (!hasCollision) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 段差の高さを計算
        const stepHeight = maxBlockTop - pos.y;

        // 最大段差を超えている場合は乗り越えられない
        if (stepHeight > maxStepHeight || stepHeight <= 0) {
            return { canStepUp: false, stepHeight: 0 };
        }

        // 段差の上にプレイヤーが入れるスペースがあるか確認
        const headRoom = player.getHeight();
        const stepTopAABB = {
            minX: targetX - halfWidth,
            minY: maxBlockTop,
            minZ: targetZ - halfWidth,
            maxX: targetX + halfWidth,
            maxY: maxBlockTop + headRoom,
            maxZ: targetZ + halfWidth
        };

        const headCollisions = this._getCollidingBlocks(stepTopAABB);
        for (const blockAABB of headCollisions) {
            if (this._aabbIntersects(stepTopAABB, blockAABB)) {
                // 頭上に障害物があるので乗り越えられない
                return { canStepUp: false, stepHeight: 0 };
            }
        }

        return { canStepUp: true, stepHeight: stepHeight };
    }

    /**
     * レイキャスト（ブロック設置/破壊用）
     * @param {{x: number, y: number, z: number}} origin - 始点
     * @param {{x: number, y: number, z: number}} direction - 方向（単位ベクトル）
     * @param {number} maxDistance - 最大距離
     * @returns {{hit: boolean, blockX: number, blockY: number, blockZ: number, face: string, distance: number, adjacentX: number, adjacentY: number, adjacentZ: number}|null}
     */
    raycast(origin, direction, maxDistance) {
        // DDA (Digital Differential Analyzer) アルゴリズム
        const step = 0.05;  // より高精度なステップ
        let x = origin.x;
        let y = origin.y;
        let z = origin.z;

        for (let dist = 0; dist < maxDistance; dist += step) {
            const blockX = Math.floor(x);
            const blockY = Math.floor(y);
            const blockZ = Math.floor(z);

            const blockStrId = this.getBlockAt(blockX, blockY, blockZ);
            if (blockStrId && blockStrId !== 'air') {
                // ブロック定義を取得
                const blockDef = this._getBlockDefinition(blockStrId);

                // カスタムブロックの場合、当たり判定ボクセルをチェック
                if (blockDef && blockDef.shape_type === 'custom' && blockDef.voxel_collision) {
                    const customHit = this._raycastCustomBlock(
                        x, y, z, blockX, blockY, blockZ, blockDef.voxel_collision
                    );
                    if (customHit) {
                        const adjacent = this._getAdjacentBlock(blockX, blockY, blockZ, customHit.face);
                        return {
                            hit: true,
                            blockX,
                            blockY,
                            blockZ,
                            face: customHit.face,
                            distance: dist,
                            adjacentX: adjacent.x,
                            adjacentY: adjacent.y,
                            adjacentZ: adjacent.z
                        };
                    }
                    // カスタムブロックの当たり判定ボクセルにヒットしなかった場合は継続
                } else {
                    // 通常ブロック
                    const face = this._determineFace(x - blockX, y - blockY, z - blockZ);
                    const adjacent = this._getAdjacentBlock(blockX, blockY, blockZ, face);

                    return {
                        hit: true,
                        blockX,
                        blockY,
                        blockZ,
                        face,
                        distance: dist,
                        adjacentX: adjacent.x,
                        adjacentY: adjacent.y,
                        adjacentZ: adjacent.z
                    };
                }
            }

            x += direction.x * step;
            y += direction.y * step;
            z += direction.z * step;
        }

        return null;
    }

    /**
     * カスタムブロックの当たり判定ボクセルに対するレイキャスト
     * @param {number} x - レイの現在位置X
     * @param {number} y - レイの現在位置Y
     * @param {number} z - レイの現在位置Z
     * @param {number} blockX - ブロック座標X
     * @param {number} blockY - ブロック座標Y
     * @param {number} blockZ - ブロック座標Z
     * @param {string} voxelCollision - Base64エンコードされた当たり判定データ
     * @returns {{face: string}|null} ヒット情報またはnull
     */
    _raycastCustomBlock(x, y, z, blockX, blockY, blockZ, voxelCollision) {
        if (typeof CustomCollision === 'undefined') {
            return { face: this._determineFace(x - blockX, y - blockY, z - blockZ) };
        }

        const collisionData = CustomCollision.decode(voxelCollision);
        const voxelSize = 0.25; // 1/4 ブロック

        // ブロック内のローカル座標を計算
        const localX = x - blockX;
        const localY = y - blockY;
        const localZ = z - blockZ;

        // 当たり判定ボクセル座標を計算（0-3）
        const vx = Math.min(3, Math.floor(localX / voxelSize));
        const vy = Math.min(3, Math.floor(localY / voxelSize));
        const vz = Math.min(3, Math.floor(localZ / voxelSize));

        // 当たり判定ボクセルをチェック
        if (CustomCollision.getVoxel(collisionData, vx, vy, vz) === 1) {
            // ボクセル内のローカル座標から面を判定
            const voxelLocalX = (localX - vx * voxelSize) / voxelSize;
            const voxelLocalY = (localY - vy * voxelSize) / voxelSize;
            const voxelLocalZ = (localZ - vz * voxelSize) / voxelSize;
            const face = this._determineFace(voxelLocalX, voxelLocalY, voxelLocalZ);
            return { face };
        }

        return null;
    }

    /**
     * 面に隣接するブロック座標を取得
     * @param {number} blockX
     * @param {number} blockY
     * @param {number} blockZ
     * @param {string} face
     * @returns {{x: number, y: number, z: number}}
     */
    _getAdjacentBlock(blockX, blockY, blockZ, face) {
        switch (face) {
            case 'top':
                return { x: blockX, y: blockY + 1, z: blockZ };
            case 'bottom':
                return { x: blockX, y: blockY - 1, z: blockZ };
            case 'north':
                return { x: blockX, y: blockY, z: blockZ + 1 };
            case 'south':
                return { x: blockX, y: blockY, z: blockZ - 1 };
            case 'east':
                return { x: blockX + 1, y: blockY, z: blockZ };
            case 'west':
                return { x: blockX - 1, y: blockY, z: blockZ };
            default:
                return { x: blockX, y: blockY + 1, z: blockZ };
        }
    }

    /**
     * ブロック内の位置から面を判定
     * @param {number} localX
     * @param {number} localY
     * @param {number} localZ
     * @returns {string}
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
    window.PhysicsWorld = PhysicsWorld;
}
