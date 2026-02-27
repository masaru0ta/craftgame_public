/**
 * CraftingScreen.js
 * クラフト画面UI + 素材チェック + クラフト実行
 *
 * 構成: クラフトパネル（カテゴリタブ + レシピグリッド + 詳細）
 *       インベントリパネルは既存Inventory.jsを連動表示
 */
class CraftingScreen {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - クラフト画面UIの親要素
     * @param {Inventory} options.inventory - インベントリインスタンス
     * @param {Hotbar} options.hotbar - ホットバーインスタンス
     * @param {Array} options.allBlocks - 全ブロック定義配列
     * @param {Array} options.recipes - レシピ定義配列
     */
    constructor(options) {
        this._container = options.container;
        this._inventory = options.inventory;
        this._hotbar = options.hotbar;
        this._allBlocks = options.allBlocks || [];
        this._recipes = options.recipes || [];

        this._blockMap = new Map();
        for (const block of this._allBlocks) {
            this._blockMap.set(block.block_str_id, block);
        }

        // 状態
        this._isOpen = false;
        this._selectedRecipe = null;
        this._selectedCategory = 'tools';
        this._onToggle = null;

        // カテゴリ定義
        this._categories = [
            { id: 'tools', name: '道具' },
            { id: 'building', name: '建築用' },
            { id: 'food', name: '食料' },
            { id: 'furniture', name: '家具' }
        ];

        // バインド済みイベントハンドラ
        this._boundKeyDown = this._onKeyDown.bind(this);
        this._boundMouseDown = this._onMouseDown.bind(this);

        this._buildUI();
    }

    // ========================================
    // 公開API
    // ========================================

    open() {
        if (this._isOpen) return;
        if (this._inventory && this._inventory.isOpen()) {
            this._inventory.close();
        }
        this._isOpen = true;
        this._selectedRecipe = null;
        this._overlay.style.display = 'flex';
        document.addEventListener('keydown', this._boundKeyDown);
        document.addEventListener('mousedown', this._boundMouseDown);
        // 既存インベントリUIを連動表示
        if (this._inventory && !this._inventory.isOpen()) {
            this._inventory.open();
        }
        this._renderRecipeList();
        this._renderDetail();
        if (this._onToggle) this._onToggle(true);
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._overlay.style.display = 'none';
        document.removeEventListener('keydown', this._boundKeyDown);
        document.removeEventListener('mousedown', this._boundMouseDown);
        // インベントリも閉じる
        if (this._inventory && this._inventory.isOpen()) {
            this._inventory.close();
        }
        if (this._onToggle) this._onToggle(false);
    }

    isOpen() { return this._isOpen; }

    onToggle(callback) { this._onToggle = callback; }

    getSelectedRecipe() { return this._selectedRecipe; }

    // ========================================
    // レシピシステム
    // ========================================

    _parseMaterials(materialsStr) {
        if (!materialsStr) return [];
        return materialsStr.split(',').map(part => {
            const [id, count] = part.trim().split(':');
            return { id: id.trim(), count: parseInt(count) || 1 };
        });
    }

    _countItem(blockStrId) {
        let total = 0;
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            const slot = this._inventory.getSlot(i);
            if (slot && slot.block_str_id === blockStrId) total += slot.count;
        }
        for (let i = 0; i < Hotbar.SLOT_COUNT; i++) {
            const block = this._hotbar.getSlotBlock(i);
            if (block && block.block_str_id === blockStrId) total += this._hotbar.getSlotCount(i);
        }
        return total;
    }

    canCraft(recipe) {
        const materials = this._parseMaterials(recipe.materials);
        return materials.every(m => this._countItem(m.id) >= m.count);
    }

    _executeCraft(recipe) {
        if (!this.canCraft(recipe)) return;

        const materials = this._parseMaterials(recipe.materials);

        for (const mat of materials) {
            let remaining = mat.count;
            for (let i = 0; i < Hotbar.SLOT_COUNT && remaining > 0; i++) {
                const block = this._hotbar.getSlotBlock(i);
                if (block && block.block_str_id === mat.id) {
                    const have = this._hotbar.getSlotCount(i);
                    const consume = Math.min(have, remaining);
                    remaining -= consume;
                    if (have - consume <= 0) {
                        this._hotbar.setSlotBlock(i, null);
                    } else {
                        this._hotbar.setSlotCount(i, have - consume);
                    }
                }
            }
            for (let i = 0; i < Inventory.SLOT_COUNT && remaining > 0; i++) {
                const slot = this._inventory.getSlot(i);
                if (slot && slot.block_str_id === mat.id) {
                    const consume = Math.min(slot.count, remaining);
                    remaining -= consume;
                    if (slot.count - consume <= 0) {
                        this._inventory.setSlot(i, null);
                    } else {
                        this._inventory.setSlot(i, {
                            block_str_id: slot.block_str_id,
                            count: slot.count - consume
                        });
                    }
                }
            }
        }

        this._inventory.addItem(recipe.result_id, recipe.result_count);

        // UI更新
        this._renderRecipeList();
        this._renderDetail();
        // 既存インベントリUIも更新
        if (this._inventory && typeof this._inventory.renderUI === 'function') {
            this._inventory.renderUI();
        }
    }

    // ========================================
    // UI構築
    // ========================================

    _buildUI() {
        // オーバーレイ
        this._overlay = document.createElement('div');
        this._overlay.id = 'crafting-overlay';
        this._overlay.style.cssText = `
            position: fixed; inset: 0;
            background: transparent;
            z-index: 999;
            display: none;
            justify-content: center;
            align-items: flex-start;
            padding-top: 40px;
            pointer-events: none;
        `;

        // クラフトパネル（724px = インベントリパネルと同幅）
        this._panel = document.createElement('div');
        this._panel.id = 'crafting-panel';
        this._panel.style.cssText = `
            background: rgba(50, 50, 50, 0.95);
            border: 2px solid #888;
            border-radius: 10px;
            padding: 16px;
            width: 724px;
            box-sizing: border-box;
            user-select: none;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 1001;
            pointer-events: auto;
        `;

        // タイトル
        const title = document.createElement('div');
        title.id = 'crafting-title';
        title.textContent = 'クラフト';
        title.style.cssText = `
            font-size: 18px; text-align: center;
            margin-bottom: 12px; font-weight: bold;
            color: #ddd; letter-spacing: 2px;
        `;
        this._panel.appendChild(title);

        // メインコンテンツ（レシピセクション + 詳細）
        const craftArea = document.createElement('div');
        craftArea.className = 'craft-area';
        craftArea.style.cssText = 'display: flex; gap: 16px; min-height: 280px;';

        // 左側: レシピセクション（タブ + グリッド）
        const recipeSection = document.createElement('div');
        recipeSection.className = 'craft-recipe-section';
        recipeSection.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 0;';

        // カテゴリタブ
        this._tabBar = document.createElement('div');
        this._tabBar.className = 'craft-tabs';
        this._tabBar.style.cssText = 'display: flex; gap: 2px; margin-bottom: 0; position: relative; z-index: 1;';

        for (const cat of this._categories) {
            const tab = document.createElement('div');
            tab.className = 'craft-tab' + (cat.id === this._selectedCategory ? ' selected' : '');
            tab.dataset.category = cat.id;
            tab.textContent = cat.name;
            tab.style.cssText = `
                flex: 1; padding: 6px 4px; text-align: center;
                font-size: 12px; cursor: pointer;
                border: 1px solid #555; border-bottom: none;
                border-radius: 6px 6px 0 0;
                transition: background 0.1s, color 0.1s;
                ${cat.id === this._selectedCategory
                    ? 'background: rgba(0,0,0,0.3); color: #fff; font-weight: bold;'
                    : 'background: rgba(0,0,0,0.2); color: #888;'}
            `;
            tab.addEventListener('click', () => {
                this._selectedCategory = cat.id;
                this._selectedRecipe = null;
                this._updateTabs();
                this._renderRecipeList();
                this._renderDetail();
            });
            this._tabBar.appendChild(tab);
        }
        recipeSection.appendChild(this._tabBar);

        // レシピグリッド
        this._recipeList = document.createElement('div');
        this._recipeList.id = 'crafting-recipe-list';
        this._recipeList.style.cssText = `
            flex: 1;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #555; border-top: none;
            border-radius: 0 0 6px 6px;
            overflow-y: auto;
            max-height: 250px;
            padding: 8px;
            display: grid;
            grid-template-columns: repeat(auto-fill, 54px);
            gap: 6px;
            align-content: start;
        `;
        recipeSection.appendChild(this._recipeList);
        craftArea.appendChild(recipeSection);

        // 右側: 詳細パネル（220px固定）
        this._detail = document.createElement('div');
        this._detail.id = 'crafting-detail';
        this._detail.style.cssText = `
            width: 220px; min-width: 220px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #555;
            border-radius: 6px;
            padding: 20px;
            display: flex;
            flex-direction: column;
        `;
        craftArea.appendChild(this._detail);

        this._panel.appendChild(craftArea);
        this._overlay.appendChild(this._panel);
        this._container.appendChild(this._overlay);
    }

    // ========================================
    // タブ更新
    // ========================================

    _updateTabs() {
        const tabs = this._tabBar.querySelectorAll('.craft-tab');
        for (const tab of tabs) {
            const isSelected = tab.dataset.category === this._selectedCategory;
            tab.classList.toggle('selected', isSelected);
            tab.style.background = isSelected ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)';
            tab.style.color = isSelected ? '#fff' : '#888';
            tab.style.fontWeight = isSelected ? 'bold' : 'normal';
        }
    }

    // ========================================
    // レシピ一覧描画（グリッド）
    // ========================================

    _renderRecipeList() {
        this._recipeList.innerHTML = '';
        const filtered = this._recipes.filter(r => r.category === this._selectedCategory);

        for (const recipe of filtered) {
            const item = document.createElement('div');
            item.className = 'craft-recipe-item';
            const craftable = this.canCraft(recipe);
            const isSelected = this._selectedRecipe && this._selectedRecipe.recipe_id === recipe.recipe_id;

            item.style.cssText = `
                width: 54px; height: 54px;
                box-sizing: border-box;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                border: 2px solid ${isSelected ? '#fff' : '#555'};
                border-radius: 4px;
                background: ${isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.4)'};
                transition: background 0.1s, border-color 0.1s;
                ${craftable ? '' : 'opacity: 0.5;'}
            `;
            if (isSelected) item.classList.add('selected');
            if (!craftable) item.classList.add('insufficient');

            // サムネイル
            const thumb = this._createThumbnail(recipe.result_id, 40);
            item.appendChild(thumb);

            // ツールチップ用
            item.title = recipe.name;

            item.addEventListener('click', () => {
                this._selectedRecipe = recipe;
                this._renderRecipeList();
                this._renderDetail();
            });

            this._recipeList.appendChild(item);
        }
    }

    // ========================================
    // 詳細パネル描画
    // ========================================

    _renderDetail() {
        this._detail.innerHTML = '';

        if (!this._selectedRecipe) {
            this._detail.textContent = 'レシピを選択してください';
            this._detail.style.color = '#888';
            this._detail.style.alignItems = 'center';
            this._detail.style.justifyContent = 'center';
            return;
        }

        this._detail.style.color = '';
        this._detail.style.alignItems = '';
        this._detail.style.justifyContent = '';

        const recipe = this._selectedRecipe;
        const craftable = this.canCraft(recipe);

        // 必要素材ラベル
        const matLabel = document.createElement('div');
        matLabel.textContent = '必要素材';
        matLabel.style.cssText = 'color: #aaa; font-size: 12px; margin-bottom: 8px;';
        this._detail.appendChild(matLabel);

        // 必要素材リスト
        const matContainer = document.createElement('div');
        matContainer.id = 'crafting-materials';

        const materials = this._parseMaterials(recipe.materials);
        for (const mat of materials) {
            const row = document.createElement('div');
            row.className = 'craft-material-row';
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 0;';

            const thumb = this._createThumbnail(mat.id, 28);
            row.appendChild(thumb);

            const block = this._blockMap.get(mat.id);
            const matName = document.createElement('span');
            matName.textContent = (block && block.name) || mat.id;
            matName.style.cssText = 'color: #ddd; font-size: 13px; flex: 1;';
            row.appendChild(matName);

            const have = this._countItem(mat.id);
            const countSpan = document.createElement('span');
            countSpan.setAttribute('data-count', 'true');
            countSpan.textContent = `${have} / ${mat.count}`;
            const sufficient = have >= mat.count;
            countSpan.style.cssText = `
                font-size: 13px; font-weight: bold;
                color: ${sufficient ? '#4CAF50' : '#F44336'};
            `;
            row.appendChild(countSpan);
            matContainer.appendChild(row);
        }
        this._detail.appendChild(matContainer);

        // 矢印
        const arrow = document.createElement('div');
        arrow.className = 'craft-arrow';
        arrow.textContent = '▼';
        arrow.style.cssText = 'text-align: center; font-size: 32px; color: #888; line-height: 1; margin: 8px 0 4px;';
        this._detail.appendChild(arrow);

        // クラフトボタン（アイコン + 名前 + 個数を内包）
        const btn = document.createElement('button');
        btn.id = 'crafting-craft-btn';
        btn.disabled = !craftable;
        btn.style.cssText = `
            margin-top: 0; padding: 8px 12px;
            font-size: 14px; font-weight: bold;
            color: #fff;
            background: ${craftable ? '#4CAF50' : '#555'};
            border: none; border-radius: 6px;
            cursor: ${craftable ? 'pointer' : 'not-allowed'};
            width: 100%;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        `;

        const resultIcon = this._createThumbnail(recipe.result_id, 32);
        resultIcon.id = 'crafting-result-icon';
        btn.appendChild(resultIcon);

        const resultName = document.createElement('span');
        resultName.id = 'crafting-result-name';
        resultName.textContent = recipe.name;
        btn.appendChild(resultName);

        if (recipe.result_count > 1) {
            const resultCount = document.createElement('span');
            resultCount.id = 'crafting-result-count';
            resultCount.textContent = `×${recipe.result_count}`;
            resultCount.style.cssText = 'color: rgba(255,255,255,0.8); font-size: 14px;';
            btn.appendChild(resultCount);
        }

        btn.addEventListener('click', () => {
            if (!btn.disabled) {
                this._executeCraft(recipe);
            }
        });
        this._detail.appendChild(btn);
    }

    // ========================================
    // ヘルパー
    // ========================================

    _createThumbnail(blockStrId, size) {
        const block = this._blockMap.get(blockStrId);
        if (block && block.thumbnail) {
            const img = document.createElement('img');
            img.src = block.thumbnail;
            img.alt = block.name || blockStrId;
            img.style.cssText = `width: ${size}px; height: ${size}px; image-rendering: pixelated;`;
            return img;
        }
        const span = document.createElement('span');
        span.textContent = (block && block.name) || blockStrId;
        span.style.cssText = `
            display: flex; width: ${size}px; height: ${size}px;
            background: #555; color: #fff; font-size: 10px;
            align-items: center; justify-content: center;
            border-radius: 4px;
        `;
        return span;
    }

    // ========================================
    // イベントハンドラ
    // ========================================

    _onKeyDown(e) {
        if (e.code === 'Escape' && this._isOpen) {
            e.stopPropagation();
            this.close();
        }
    }

    _onMouseDown(e) {
        if (!this._isOpen) return;
        // クラフトパネル・インベントリパネル・ホットバー外のクリック → 閉じる
        if (!e.target.closest('#crafting-panel, #inventory-panel, #hotbar-container')) {
            this.close();
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.CraftingScreen = CraftingScreen;
}
