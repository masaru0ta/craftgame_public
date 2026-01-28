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

                // ブロック名ラベルを追加
                const nameLabel = document.createElement('div');
                nameLabel.className = 'hotbar-name';
                nameLabel.textContent = blockName;
                slot.appendChild(nameLabel);
            }

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
