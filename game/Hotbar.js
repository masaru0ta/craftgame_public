/**
 * Hotbar.js
 * ホットバーUI - 設置するブロックを選択するUI
 */
class Hotbar {
    static SLOT_COUNT = 9;

    /**
     * コンストラクタ
     * @param {HTMLElement} container - ホットバーのコンテナ要素
     * @param {Array} blocks - ブロック定義の配列
     */
    constructor(container, blocks) {
        this.container = container;
        this.blocks = blocks.slice(0, Hotbar.SLOT_COUNT);
        this.selectedSlot = 0;
        this._counts = new Array(Hotbar.SLOT_COUNT).fill(1);
        this._tooltipTimer = null;
        this._rebuildPending = false;

        // ツールチップ要素
        this._tooltip = document.createElement('div');
        this._tooltip.id = 'hotbar-tooltip';
        this._tooltip.style.cssText = `
            position: fixed; padding: 4px 10px;
            background: rgba(20, 0, 30, 0.92); color: #fff;
            font-size: 13px; border-radius: 4px;
            pointer-events: none; z-index: 2100;
            white-space: nowrap; display: none;
            border: 1px solid #555;
            left: 50%; transform: translateX(-50%);
            transition: opacity 0.3s;
        `;
        document.body.appendChild(this._tooltip);

        this._createSlots();
        this.updateDisplay();
    }

    /**
     * スロット要素を作成
     */
    _createSlots() {
        this.container.innerHTML = '';
        this.slots = [];

        for (let i = 0; i < Hotbar.SLOT_COUNT; i++) {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot';
            slot.dataset.slot = i;
            slot.dataset.type = 'hotbar';
            slot.dataset.index = i;

            const block = this.blocks[i];
            if (block) {
                // サムネイル画像を追加
                if (block.thumbnail) {
                    const img = document.createElement('img');
                    img.src = block.thumbnail;
                    img.alt = block.name || block.block_str_id;
                    slot.appendChild(img);
                } else {
                    // サムネイルがない場合はブロック名の最初の3文字を表示
                    const displayName = block.name || block.block_str_id;
                    slot.textContent = displayName.substring(0, 3);
                    slot.style.fontSize = '10px';
                    slot.style.color = '#fff';
                }

                // ブロック名をツールチップとして設定
                const blockName = block.name || block.block_str_id;
                slot.title = blockName;

                // カウント表示（2以上の場合）
                const count = this._counts[i] || 1;
                if (count > 1) {
                    const cnt = document.createElement('span');
                    cnt.className = 'hotbar-count';
                    cnt.textContent = count;
                    slot.appendChild(cnt);
                }
            }

            // クリック/タップでスロット選択
            slot.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectSlot(i);
            });

            this.container.appendChild(slot);
            this.slots.push(slot);
        }
    }

    /**
     * スロットを選択
     * @param {number} index - スロットインデックス (0-8)
     */
    selectSlot(index) {
        if (index < 0) index = Hotbar.SLOT_COUNT - 1;
        if (index >= Hotbar.SLOT_COUNT) index = 0;

        this.selectedSlot = index;
        this.updateDisplay();
        this._showSelectedTooltip();
    }

    /**
     * 選択スロットのアイテム名ツールチップを一時表示
     */
    _showSelectedTooltip() {
        const block = this.blocks[this.selectedSlot];
        if (!block) {
            this._tooltip.style.display = 'none';
            return;
        }
        const name = block.name || block.block_str_id;
        this._tooltip.textContent = name;
        // 選択スロットの上に配置
        const slotEl = this.slots[this.selectedSlot];
        if (!slotEl) return;
        const slotRect = slotEl.getBoundingClientRect();
        this._tooltip.style.display = 'block';
        this._tooltip.style.opacity = '1';
        this._tooltip.style.left = (slotRect.left + slotRect.width / 2) + 'px';
        this._tooltip.style.top = (slotRect.top - 30) + 'px';

        // 2秒後にフェードアウト
        clearTimeout(this._tooltipTimer);
        this._tooltipTimer = setTimeout(() => {
            this._tooltip.style.opacity = '0';
            setTimeout(() => { this._tooltip.style.display = 'none'; }, 300);
        }, 2000);
    }

    /**
     * 現在の選択インデックスを取得
     * @returns {number}
     */
    getSelectedSlot() {
        return this.selectedSlot;
    }

    /**
     * 選択中のブロック定義を取得
     * @returns {Object|null}
     */
    getSelectedBlock() {
        return this.blocks[this.selectedSlot] || null;
    }

    /**
     * 特定スロットのブロック定義を取得
     * @param {number} index - スロットインデックス (0-8)
     * @returns {Object|null} ブロック定義オブジェクト
     */
    getSlotBlock(index) {
        if (index < 0 || index >= Hotbar.SLOT_COUNT) return null;
        return this.blocks[index] || null;
    }

    /**
     * 特定スロットのブロック定義を設定
     * @param {number} index - スロットインデックス (0-8)
     * @param {Object|null} block - ブロック定義オブジェクト
     */
    setSlotBlock(index, block) {
        if (index < 0 || index >= Hotbar.SLOT_COUNT) return;
        this.blocks[index] = block;
        if (!block) this._counts[index] = 0;
        this._rebuild();
    }

    /**
     * スロットのカウントを取得
     * @param {number} index
     * @returns {number}
     */
    getSlotCount(index) {
        if (index < 0 || index >= Hotbar.SLOT_COUNT) return 0;
        return this._counts[index] || 0;
    }

    /**
     * スロットのカウントを設定（UIも更新）
     * @param {number} index
     * @param {number} count
     */
    setSlotCount(index, count) {
        if (index < 0 || index >= Hotbar.SLOT_COUNT) return;
        this._counts[index] = count;
        this._rebuild();
    }

    /**
     * 次フレームでUI再構築（連続呼び出しを1回にまとめる）
     */
    _rebuild() {
        if (this._rebuildPending) return;
        this._rebuildPending = true;
        queueMicrotask(() => {
            this._rebuildPending = false;
            this._createSlots();
            this.updateDisplay();
        });
    }

    /**
     * マウスホイールイベント処理
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        if (event.deltaY > 0) {
            // ホイール下 - 次のスロットへ
            this.selectSlot(this.selectedSlot + 1);
        } else if (event.deltaY < 0) {
            // ホイール上 - 前のスロットへ
            this.selectSlot(this.selectedSlot - 1);
        }
    }

    /**
     * 表示を更新
     */
    updateDisplay() {
        for (let i = 0; i < this.slots.length; i++) {
            if (i === this.selectedSlot) {
                this.slots[i].classList.add('selected');
            } else {
                this.slots[i].classList.remove('selected');
            }
        }
    }
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.Hotbar = Hotbar;
}
