/**
 * Inventory.js
 * インベントリデータ管理 + UI + ドラッグ&ドロップ
 */
class Inventory {
    static ROWS = 3;
    static COLS = 9;
    static SLOT_COUNT = 27;

    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - インベントリUIの親要素
     * @param {Hotbar} options.hotbar - ホットバーインスタンス
     * @param {Array} options.allBlocks - 全ブロック定義配列
     */
    constructor(options) {
        this._container = options.container;
        this._hotbar = options.hotbar;
        this._allBlocks = options.allBlocks || [];

        // block_str_id → ブロック定義オブジェクトのマップ
        this._blockMap = new Map();
        for (const block of this._allBlocks) {
            this._blockMap.set(block.block_str_id, block);
        }

        // 27スロット
        this._slots = new Array(Inventory.SLOT_COUNT).fill(null);

        // UI要素
        this._overlay = null;
        this._panel = null;
        this._grid = null;
        this._isOpen = false;

        // ドラッグ状態
        this._dragState = null;
        this._lastHoverSlot = null;

        // コールバック
        this._onToggle = null;

        // バインド済みイベントハンドラ
        this._boundMouseDown = this._onMouseDown.bind(this);
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundMouseUp = this._onMouseUp.bind(this);
        this._boundKeyDown = this._onKeyDown.bind(this);

        // UI構築
        this._buildUI();
    }

    // ========================================
    // データ操作
    // ========================================

    /**
     * アイテムを追加
     * @param {string} blockStrId - ブロック文字列ID
     * @param {number} count - 追加数
     * @returns {boolean} 成功したか
     */
    addItem(blockStrId, count = 1) {
        // ホットバーの既存スタックを優先検索
        for (let i = 0; i < Hotbar.SLOT_COUNT; i++) {
            const block = this._hotbar.getSlotBlock(i);
            if (block && block.block_str_id === blockStrId) {
                this._hotbar.setSlotCount(i, this._hotbar.getSlotCount(i) + count);
                return true;
            }
        }
        // インベントリの既存スタックを探す
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            if (this._slots[i] && this._slots[i].block_str_id === blockStrId) {
                this._slots[i].count += count;
                this._updateSlotUI(i);
                return true;
            }
        }
        // 空スロットに配置（インベントリ）
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            if (!this._slots[i]) {
                this._slots[i] = { block_str_id: blockStrId, count: count };
                this._updateSlotUI(i);
                return true;
            }
        }
        return false;
    }

    /**
     * スロットからアイテムを減らす
     * @param {number} slotIndex
     * @param {number} count
     */
    removeItem(slotIndex, count = 1) {
        if (slotIndex < 0 || slotIndex >= Inventory.SLOT_COUNT) return;
        const slot = this._slots[slotIndex];
        if (!slot) return;
        slot.count -= count;
        if (slot.count <= 0) {
            this._slots[slotIndex] = null;
        }
        this._updateSlotUI(slotIndex);
    }

    /**
     * スロット内容を取得
     * @param {number} index
     * @returns {{ block_str_id: string, count: number }|null}
     */
    getSlot(index) {
        if (index < 0 || index >= Inventory.SLOT_COUNT) return null;
        return this._slots[index];
    }

    /**
     * スロット内容を設定
     * @param {number} index
     * @param {{ block_str_id: string, count: number }|null} item
     */
    setSlot(index, item) {
        if (index < 0 || index >= Inventory.SLOT_COUNT) return;
        this._slots[index] = item;
        this._updateSlotUI(index);
    }

    /**
     * 全スロットのアイテム総数
     * @returns {number}
     */
    getItemCount() {
        let total = 0;
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            if (this._slots[i]) total += this._slots[i].count;
        }
        return total;
    }

    /**
     * 全スロットが使用中か
     * @returns {boolean}
     */
    isFull() {
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            if (!this._slots[i]) return false;
        }
        return true;
    }

    // ========================================
    // 開閉操作
    // ========================================

    open() {
        if (this._isOpen) return;
        this._isOpen = true;
        this._overlay.style.display = 'block';
        this._overlay.style.opacity = '1';
        this._overlay.style.pointerEvents = 'auto';
        // グローバルイベント登録
        document.addEventListener('mousedown', this._boundMouseDown);
        document.addEventListener('mousemove', this._boundMouseMove);
        document.addEventListener('mouseup', this._boundMouseUp);
        document.addEventListener('keydown', this._boundKeyDown);
        // UI全体を再描画
        this._renderAllSlots();
        if (this._onToggle) this._onToggle(true);
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._overlay.style.display = 'none';
        this._overlay.style.opacity = '0';
        this._overlay.style.pointerEvents = 'none';
        // ツールチップ非表示
        this._tooltip.style.display = 'none';
        // ドラッグ中なら元に戻す
        if (this._dragState) {
            this._cancelDrag();
        }
        // グローバルイベント解除
        document.removeEventListener('mousedown', this._boundMouseDown);
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup', this._boundMouseUp);
        document.removeEventListener('keydown', this._boundKeyDown);
        if (this._onToggle) this._onToggle(false);
    }

    isOpen() {
        return this._isOpen;
    }

    toggle() {
        if (this._isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * 開閉時コールバック
     * @param {Function} callback - (isOpen: boolean) => void
     */
    onToggle(callback) {
        this._onToggle = callback;
    }

    // ========================================
    // UI構築
    // ========================================

    _buildUI() {
        // オーバーレイ
        this._overlay = document.createElement('div');
        this._overlay.id = 'inventory-overlay';
        this._overlay.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0, 0, 0, 0.55);
            z-index: 999;
            display: none; opacity: 0; pointer-events: none;
        `;

        // パネル
        this._panel = document.createElement('div');
        this._panel.id = 'inventory-panel';
        this._panel.style.cssText = `
            position: fixed;
            bottom: 140px;
            left: 50%; transform: translateX(-50%);
            background: rgba(50, 50, 50, 0.95);
            border: 2px solid #888;
            border-radius: 10px;
            padding: 10px 12px;
            user-select: none;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 1001;
        `;

        // タイトル
        const title = document.createElement('div');
        title.id = 'inventory-title';
        title.textContent = 'インベントリ';
        title.style.cssText = `
            font-size: 18px; text-align: center;
            margin-bottom: 8px; font-weight: bold;
            color: #ddd; letter-spacing: 2px;
        `;
        this._panel.appendChild(title);

        // グリッド
        this._grid = document.createElement('div');
        this._grid.id = 'inventory-grid';
        this._grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(9, 72px);
            gap: 6px;
        `;

        // 27スロット生成
        this._slotElements = [];
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.type = 'inv';
            slot.dataset.index = i;
            slot.style.cssText = `
                width: 72px; height: 72px;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid #555;
                border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; position: relative;
            `;
            this._grid.appendChild(slot);
            this._slotElements.push(slot);
        }

        this._panel.appendChild(this._grid);
        this._overlay.appendChild(this._panel);
        this._container.appendChild(this._overlay);

        // ツールチップ
        this._tooltip = document.createElement('div');
        this._tooltip.id = 'inventory-tooltip';
        this._tooltip.style.cssText = `
            position: fixed; padding: 4px 10px;
            background: rgba(20, 0, 30, 0.92); color: #fff;
            font-size: 13px; border-radius: 4px;
            pointer-events: none; z-index: 2100;
            white-space: nowrap; display: none;
            border: 1px solid #555;
        `;
        document.body.appendChild(this._tooltip);
    }

    // ========================================
    // UI描画
    // ========================================

    _renderAllSlots() {
        for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
            this._updateSlotUI(i);
        }
    }

    /**
     * コンテナにアイテムの画像/テキスト+カウントを描画
     */
    _renderItemContent(el, item) {
        const block = this._blockMap.get(item.block_str_id);
        if (block && block.thumbnail) {
            const img = document.createElement('img');
            img.src = block.thumbnail;
            img.alt = block.name || item.block_str_id;
            img.style.cssText = 'width: 54px; height: 54px; image-rendering: pixelated;';
            el.appendChild(img);
        } else {
            const label = document.createElement('span');
            label.textContent = (block && block.name) || item.block_str_id;
            label.style.cssText = 'font-size: 10px; color: #fff;';
            el.appendChild(label);
        }
        if (item.count > 1) {
            const cnt = document.createElement('span');
            cnt.style.cssText = `
                position: absolute; bottom: 2px; right: 4px;
                font-size: 14px; font-weight: bold;
                text-shadow: 1px 1px 2px #000; color: #fff;
            `;
            cnt.textContent = item.count;
            el.appendChild(cnt);
        }
    }

    _updateSlotUI(index) {
        if (!this._slotElements || index < 0 || index >= this._slotElements.length) return;
        const el = this._slotElements[index];
        const item = this._slots[index];
        el.innerHTML = '';
        if (item) this._renderItemContent(el, item);
    }

    // ========================================
    // ドラッグ&ドロップ
    // ========================================

    _onMouseDown(e) {
        if (!this._isOpen) return;
        const slot = e.target.closest('.inv-slot, .hotbar-slot');
        if (!slot) {
            // パネルやホットバー外のクリックで閉じる（クラフト画面表示中は除外）
            const inPanel = e.target.closest('#inventory-panel, #hotbar-container, #crafting-overlay');
            if (!inPanel) {
                this.close();
            }
            return;
        }

        const type = slot.dataset.type;
        const index = parseInt(slot.dataset.index);
        const item = this._getSlotData(type, index);
        if (!item) return;

        e.preventDefault();

        // ゴースト生成
        const ghost = document.createElement('div');
        ghost.style.cssText = `
            position: fixed; width: 72px; height: 72px;
            pointer-events: none; z-index: 2000; opacity: 0.85;
            display: flex; align-items: center; justify-content: center;
            background: rgba(80, 80, 80, 0.9);
            border: 2px solid #fff; border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        `;
        ghost.style.left = (e.clientX - 36) + 'px';
        ghost.style.top = (e.clientY - 36) + 'px';

        this._renderItemContent(ghost, item);
        document.body.appendChild(ghost);

        this._dragState = {
            sourceType: type,
            sourceIndex: index,
            item: { block_str_id: item.block_str_id, count: item.count },
            ghost: ghost,
            startX: e.clientX,
            startY: e.clientY,
            maxDist: 0
        };

        // ソースを一時空表示
        this._setSlotData(type, index, null);
    }

    _onMouseMove(e) {
        if (this._dragState) {
            this._dragState.ghost.style.left = (e.clientX - 36) + 'px';
            this._dragState.ghost.style.top = (e.clientY - 36) + 'px';

            // maxDist更新（クイック移動判定用）
            const dist = Math.abs(e.clientX - this._dragState.startX) + Math.abs(e.clientY - this._dragState.startY);
            if (dist > this._dragState.maxDist) this._dragState.maxDist = dist;

            // ホバーハイライト（前回の要素のみ解除）
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const slot = target && target.closest('.inv-slot, .hotbar-slot');
            if (this._lastHoverSlot !== slot) {
                if (this._lastHoverSlot) this._lastHoverSlot.classList.remove('drag-over');
                if (slot) slot.classList.add('drag-over');
                this._lastHoverSlot = slot;
            }
            this._tooltip.style.display = 'none';
            return;
        }

        // ツールチップ表示
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const slot = target && target.closest('.inv-slot, .hotbar-slot');
        if (slot) {
            const type = slot.dataset.type;
            const index = parseInt(slot.dataset.index);
            const item = this._getSlotData(type, index);
            if (item) {
                const block = this._blockMap.get(item.block_str_id);
                const name = (block && block.name) || item.block_str_id;
                this._tooltip.textContent = name;
                this._tooltip.style.display = 'block';
                this._tooltip.style.left = (e.clientX + 12) + 'px';
                this._tooltip.style.top = (e.clientY - 30) + 'px';
                return;
            }
        }
        this._tooltip.style.display = 'none';
    }

    _onMouseUp(e) {
        if (!this._dragState) return;

        if (this._lastHoverSlot) {
            this._lastHoverSlot.classList.remove('drag-over');
            this._lastHoverSlot = null;
        }

        const target = document.elementFromPoint(e.clientX, e.clientY);
        const slot = target && target.closest('.inv-slot, .hotbar-slot');

        if (slot) {
            const destType = slot.dataset.type;
            const destIndex = parseInt(slot.dataset.index);

            // 同じスロットにドロップ
            if (destType === this._dragState.sourceType && destIndex === this._dragState.sourceIndex) {
                if (this._dragState.maxDist < 5) {
                    // 短いクリック → クイック移動
                    if (!this._quickTransfer(this._dragState)) {
                        // 移動先がなければ元に戻す
                        this._setSlotData(destType, destIndex, this._dragState.item);
                    }
                } else {
                    // ドラッグして戻った → 元に戻す
                    this._setSlotData(destType, destIndex, this._dragState.item);
                }
                this._dragState.ghost.remove();
                this._dragState = null;
                return;
            }

            const destItem = this._getSlotData(destType, destIndex);

            if (destItem && destItem.block_str_id === this._dragState.item.block_str_id) {
                // 同じブロック → スタック
                destItem.count += this._dragState.item.count;
                this._setSlotData(destType, destIndex, destItem);
            } else {
                // 異なるアイテム or 空 → 入れ替え
                this._setSlotData(destType, destIndex, this._dragState.item);
                this._setSlotData(this._dragState.sourceType, this._dragState.sourceIndex, destItem);
            }
        } else {
            // スロット外 → 元に戻す
            this._setSlotData(this._dragState.sourceType, this._dragState.sourceIndex, this._dragState.item);
        }

        this._dragState.ghost.remove();
        this._dragState = null;
    }

    /**
     * クイック移動: 反対側エリアの最初の空きスロットにアイテムを移動
     * @returns {boolean} 移動成功
     */
    _quickTransfer(drag) {
        if (drag.sourceType === 'inv') {
            // インベントリ → ホットバーの空きスロット
            for (let i = 0; i < Hotbar.SLOT_COUNT; i++) {
                if (!this._hotbar.getSlotBlock(i)) {
                    this._setSlotData('hotbar', i, drag.item);
                    return true;
                }
            }
        } else {
            // ホットバー → インベントリの空きスロット
            for (let i = 0; i < Inventory.SLOT_COUNT; i++) {
                if (!this._slots[i]) {
                    this._setSlotData('inv', i, drag.item);
                    return true;
                }
            }
        }
        return false;
    }

    _cancelDrag() {
        if (!this._dragState) return;
        this._setSlotData(this._dragState.sourceType, this._dragState.sourceIndex, this._dragState.item);
        this._dragState.ghost.remove();
        this._dragState = null;
    }

    _onKeyDown(e) {
        if (e.code === 'Escape' && this._isOpen) {
            this.close();
        }
    }

    // ========================================
    // ホットバー連携ヘルパー
    // ========================================

    /**
     * スロットデータを取得（inv or hotbar）
     */
    _getSlotData(type, index) {
        if (type === 'inv') {
            return this._slots[index];
        } else {
            // ホットバー → { block_str_id, count } 形式に変換
            const block = this._hotbar.getSlotBlock(index);
            if (!block) return null;
            return { block_str_id: block.block_str_id, count: this._hotbar.getSlotCount(index) || 1 };
        }
    }

    /**
     * スロットデータを設定（inv or hotbar）
     */
    _setSlotData(type, index, item) {
        if (type === 'inv') {
            this._slots[index] = item;
            this._updateSlotUI(index);
        } else {
            // ホットバー → ブロック定義オブジェクトに変換して設定
            if (item) {
                const block = this._blockMap.get(item.block_str_id)
                    || { block_str_id: item.block_str_id, name: item.block_str_id };
                this._hotbar.setSlotBlock(index, block);
                this._hotbar.setSlotCount(index, item.count);
            } else {
                this._hotbar.setSlotBlock(index, null);
            }
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.Inventory = Inventory;
}
