/**
 * GameItemUtils.js
 * ゲームアイテム関連のユーティリティ関数
 */

/**
 * ブロック・構造物・道具を統一アイテムリストに変換する
 * @param {Object} textureLoader - TextureLoaderインスタンス
 * @param {Array} placeableBlocks - air除外のブロック一覧
 * @returns {Array} 統一アイテム定義配列
 */
function BuildUnifiedItems(textureLoader, placeableBlocks) {
    const items = [];
    const textures = textureLoader.textures || [];

    // 1. ブロックアイテム（is_item=true）
    for (const block of placeableBlocks) {
        if (!block.is_item) continue;
        items.push({
            item_str_id: block.block_str_id,
            block_str_id: block.block_str_id,
            item_type: 'block',
            name: block.name || block.block_str_id,
            max_stack: block.max_stack || 99,
            thumbnail: block.thumbnail || null,
            _blockData: block
        });
    }

    // 2. 構造物アイテム（is_item=true）
    const structures = textureLoader.structures || [];
    for (const struct of structures) {
        if (!struct.is_item) continue;
        items.push({
            item_str_id: struct.structure_str_id,
            block_str_id: struct.structure_str_id,
            structure_str_id: struct.structure_str_id,
            item_type: 'structure',
            name: struct.name || struct.structure_str_id,
            max_stack: struct.max_stack || 1,
            thumbnail: null,
            _structureData: struct,
            // 構造物データのフィールドを展開（CanPlace/Place で使用）
            palette: struct.palette,
            voxel_data: struct.voxel_data,
            orientation_data: struct.orientation_data,
            size_x: struct.size_x,
            size_y: struct.size_y,
            size_z: struct.size_z,
            bb_min_x: struct.bb_min_x,
            bb_min_y: struct.bb_min_y,
            bb_min_z: struct.bb_min_z,
            linked_destruction: struct.linked_destruction || false,
        });
    }

    // 3. 道具アイテム（アイテムシート）
    const toolItems = textureLoader.items || [];
    for (const item of toolItems) {
        if (items.some(i => i.item_str_id === item.item_str_id)) continue;
        let thumbnail = null;
        if (item.texture) {
            const tex = textures.find(t => t.file_name === item.texture);
            if (tex && tex.image_base64) thumbnail = tex.image_base64;
        }
        items.push({
            item_str_id: item.item_str_id,
            block_str_id: item.item_str_id,
            item_type: 'tool',
            name: item.name || item.item_str_id,
            max_stack: item.max_stack || 99,
            thumbnail: thumbnail,
            _toolData: item
        });
    }

    return items;
}
