/**
 * spec_1-9_character_editor テストページ用スクリプト
 */

// GASモッククラス
class GasMock {
    constructor() {
        this.characters = [];
    }

    async getCharacters() {
        return [...this.characters];
    }

    async saveCharacter(data) {
        const index = this.characters.findIndex(c => c.character_str_id === data.character_str_id);
        if (index >= 0) {
            this.characters[index] = { ...data };
        } else {
            data.character_id = this.characters.length;
            this.characters.push({ ...data });
        }
        return { success: true };
    }

    async deleteCharacter(strId) {
        this.characters = this.characters.filter(c => c.character_str_id !== strId);
        return { success: true };
    }
}

// グローバル変数
let editor = null;
let api = null;
let characterList = []; // { strId, name, data: CharacterData }
let activeIndex = -1;
let newCharCounter = 0;

// スキンカラーパレット
const SKIN_COLORS = [
    0xFFE0BD, 0xFFCD94, 0xEAC086, 0xD4A373,
    0xC68642, 0x8D5524, 0x6B3A1F, 0x3B2213
];

// 基本色パレット
const BASIC_COLORS = [
    0xE74C3C, 0xE67E22, 0xF1C40F, 0x2ECC71, 0x1ABC9C, 0x3498DB, 0x9B59B6, 0xECF0F1,
    0xC0392B, 0xD35400, 0xF39C12, 0x27AE60, 0x16A085, 0x2980B9, 0x8E44AD, 0xBDC3C7,
    0x922B21, 0xA04000, 0xB7950B, 0x1E8449, 0x117864, 0x1F618D, 0x6C3483, 0x7F8C8D
];

/**
 * 初期化
 */
function init() {
    // モックモード判定
    const params = new URLSearchParams(window.location.search);
    const isMock = params.get('mock') === 'true';

    if (isMock) {
        api = new GasMock();
    } else {
        const GAS_URL = 'https://script.google.com/macros/s/AKfycbzG0rjt6etezPMgtHZRhHsGSX2km1T4aoX7FYKPSpK8pMcuaAE2W__yY1HMkI0MkidH/exec';
        api = new GasApi(GAS_URL);
    }

    // エディタ初期化
    const canvas = document.getElementById('preview-canvas');
    editor = new CharacterEditor({
        canvas: canvas,
        THREE: THREE
    });
    editor.init();

    // コールバック設定
    editor._onColorPicked = (color) => {
        updateColorUI(color);
    };
    editor._onToolChanged = (tool) => {
        setActiveTool(tool);
    };

    // テスト用グローバル公開
    window.CharacterData = CharacterData;
    window.characterEditor = editor;

    // UI初期化
    initPalette();
    initToolButtons();
    initAnimControls();
    initCharacterButtons();
    initColorInputs();
    initSaveButton();

    // 初期データ読み込み
    loadCharacters();
}

/**
 * パレット初期化
 */
function initPalette() {
    const skinPalette = document.getElementById('skin-palette');
    SKIN_COLORS.forEach((color, i) => {
        const cell = createPaletteCell(color);
        skinPalette.appendChild(cell);
    });

    const basicPalette = document.getElementById('basic-palette');
    BASIC_COLORS.forEach((color, i) => {
        const cell = createPaletteCell(color);
        basicPalette.appendChild(cell);
    });
}

function createPaletteCell(color) {
    const cell = document.createElement('div');
    cell.className = 'palette-cell';
    cell.style.background = '#' + color.toString(16).padStart(6, '0');
    cell.dataset.color = color;
    cell.addEventListener('click', () => {
        // 全パレットのactive解除
        document.querySelectorAll('.palette-cell').forEach(c => c.classList.remove('active'));
        cell.classList.add('active');
        editor.selectedColor = color;
        updateColorUI(color);
    });
    return cell;
}

/**
 * ツールボタン初期化
 */
function initToolButtons() {
    const tools = ['paint', 'eyedropper', 'eraser', 'fill'];
    tools.forEach(tool => {
        const btn = document.getElementById('tool-' + tool);
        btn.addEventListener('click', () => {
            setActiveTool(tool);
            editor.selectedTool = tool;
        });
    });
}

function setActiveTool(tool) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tool-' + tool);
    if (btn) btn.classList.add('active');
}

/**
 * アニメーションコントロール初期化
 */
function initAnimControls() {
    const select = document.getElementById('anim-select');
    const playBtn = document.getElementById('btn-anim-play');
    const stopBtn = document.getElementById('btn-anim-stop');

    playBtn.addEventListener('click', () => {
        const animName = select.value;
        editor.animator.play(animName);
    });

    stopBtn.addEventListener('click', () => {
        editor.animator.stop();
    });

    select.addEventListener('change', () => {
        if (editor.animator.isPlaying) {
            editor.animator.play(select.value);
        }
    });
}

/**
 * キャラクター一覧ボタン初期化
 */
function initCharacterButtons() {
    document.getElementById('btn-new-character').addEventListener('click', createNewCharacter);
    document.getElementById('btn-duplicate-character').addEventListener('click', duplicateCharacter);
    document.getElementById('btn-delete-character').addEventListener('click', deleteCharacter);
}

/**
 * カラー入力初期化
 */
function initColorInputs() {
    const hexInput = document.getElementById('color-hex');
    const picker = document.getElementById('color-picker');

    hexInput.addEventListener('input', () => {
        const hex = hexInput.value.replace('#', '');
        if (hex.length === 6) {
            const color = parseInt(hex, 16);
            editor.selectedColor = color;
            picker.value = '#' + hex;
            document.getElementById('current-color-swatch').style.background = '#' + hex;
        }
    });

    picker.addEventListener('input', () => {
        const hex = picker.value.replace('#', '');
        const color = parseInt(hex, 16);
        editor.selectedColor = color;
        hexInput.value = '#' + hex.toUpperCase();
        document.getElementById('current-color-swatch').style.background = picker.value;
    });
}

/**
 * 保存ボタン初期化
 */
function initSaveButton() {
    document.getElementById('btn-save').addEventListener('click', saveCurrentCharacter);
}

/**
 * 色UIを更新
 */
function updateColorUI(color) {
    const hex = '#' + color.toString(16).padStart(6, '0').toUpperCase();
    document.getElementById('color-hex').value = hex;
    document.getElementById('color-picker').value = hex;
    document.getElementById('current-color-swatch').style.background = hex;
}

/**
 * キャラクター一覧を読み込み
 */
async function loadCharacters() {
    const chars = await api.getCharacters();
    characterList = chars.map(c => {
        const data = CharacterData.fromJSON(c);
        return { strId: c.character_str_id, name: c.name, data: data };
    });
    renderCharacterList();
}

/**
 * キャラクター一覧を描画
 */
function renderCharacterList() {
    const listEl = document.getElementById('character-list');
    listEl.innerHTML = '';

    characterList.forEach((char, index) => {
        const item = document.createElement('div');
        item.className = 'character-item' + (index === activeIndex ? ' active' : '');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'character-name';
        nameSpan.textContent = char.name;

        const idSpan = document.createElement('span');
        idSpan.className = 'character-id';
        idSpan.textContent = char.strId;

        item.appendChild(nameSpan);
        item.appendChild(idSpan);

        item.addEventListener('click', () => {
            selectCharacter(index);
        });

        listEl.appendChild(item);
    });
}

/**
 * キャラクターを選択
 */
function selectCharacter(index) {
    activeIndex = index;
    renderCharacterList();

    if (index >= 0 && index < characterList.length) {
        const char = characterList[index];
        document.getElementById('input-character-id').value = char.strId;
        document.getElementById('input-character-name').value = char.name;
        editor.loadCharacterData(char.data);
    }
}

/**
 * 新規キャラクター作成
 */
function createNewCharacter() {
    newCharCounter++;
    const strId = 'char_' + newCharCounter;
    const name = '新規キャラクター';
    const data = new CharacterData();

    characterList.push({ strId, name, data });
    activeIndex = characterList.length - 1;

    document.getElementById('input-character-id').value = strId;
    document.getElementById('input-character-name').value = name;
    editor.loadCharacterData(data);

    renderCharacterList();
}

/**
 * 複製
 */
function duplicateCharacter() {
    if (activeIndex < 0 || activeIndex >= characterList.length) return;

    const original = characterList[activeIndex];
    const json = original.data.toJSON();
    const copiedData = CharacterData.fromJSON(json);
    const copiedStrId = original.strId + '_copy';
    const copiedName = original.name + 'のコピー';

    characterList.push({ strId: copiedStrId, name: copiedName, data: copiedData });
    activeIndex = characterList.length - 1;

    document.getElementById('input-character-id').value = copiedStrId;
    document.getElementById('input-character-name').value = copiedName;
    editor.loadCharacterData(copiedData);

    renderCharacterList();
}

/**
 * 削除
 */
async function deleteCharacter() {
    if (activeIndex < 0 || activeIndex >= characterList.length) return;

    if (!confirm('このキャラクターを削除しますか？')) return;

    const char = characterList[activeIndex];
    await api.deleteCharacter(char.strId);
    characterList.splice(activeIndex, 1);

    // 先頭を選択
    if (characterList.length > 0) {
        activeIndex = 0;
        const first = characterList[0];
        document.getElementById('input-character-id').value = first.strId;
        document.getElementById('input-character-name').value = first.name;
        editor.loadCharacterData(first.data);
    } else {
        activeIndex = -1;
        document.getElementById('input-character-id').value = '';
        document.getElementById('input-character-name').value = '';
    }

    renderCharacterList();
}

/**
 * 現在のキャラクターを保存
 */
async function saveCurrentCharacter() {
    if (activeIndex < 0 || activeIndex >= characterList.length) return;

    const strId = document.getElementById('input-character-id').value;
    const name = document.getElementById('input-character-name').value;
    const data = editor.getCharacterData();
    const json = data.toJSON();

    // API保存
    await api.saveCharacter({
        character_str_id: strId,
        name: name,
        ...json
    });

    // ローカル更新
    characterList[activeIndex].strId = strId;
    characterList[activeIndex].name = name;
    characterList[activeIndex].data = data;

    renderCharacterList();

    // ステータスメッセージ
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = '保存しました';
    statusEl.style.display = 'inline';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', init);
