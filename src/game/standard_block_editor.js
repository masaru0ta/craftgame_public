/**
 * 通常ブロック用エディターUI
 * 3Dプレビュー、テクスチャ選択、データ管理を行う
 */

const StandardBlockEditor = (function() {
  // Three.js関連
  let scene, camera, renderer;
  let blockMesh = null;

  // 回転制御
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let rotationY = 0;  // 水平回転（ラジアン）
  let rotationX = 0;  // 垂直傾き（ラジアン）
  const MAX_ROTATION_X = Math.PI / 2;  // 90度

  // ズーム制御
  let cameraDistance = 3;
  const MIN_DISTANCE = 1.5;
  const MAX_DISTANCE = 10;

  // データ
  let blocks = [];
  let textures = [];
  let textureMap = {};  // file_name -> image_base64
  let currentBlock = null;
  let currentTextures = {
    default: null,
    top: null,
    bottom: null,
    front: null,
    left: null,
    right: null,
    back: null
  };

  // UI要素
  let container = null;
  let previewContainer = null;
  let textureSlotsContainer = null;
  let textureModal = null;
  let textureGrid = null;
  let currentEditingFace = null;

  /**
   * エディタを初期化
   * @param {HTMLElement} containerElement - エディタのコンテナ要素
   */
  async function init(containerElement) {
    container = containerElement;

    // 3Dプレビュー用のコンテナを取得
    previewContainer = container.querySelector('#preview-container');
    textureSlotsContainer = container.querySelector('#texture-slots');
    // モーダルはcontainerの外にあるのでdocumentから取得
    textureModal = document.querySelector('#texture-modal');
    textureGrid = document.querySelector('#texture-grid');

    // Three.jsのセットアップ
    setupThreeJS();

    // イベントリスナーのセットアップ
    setupEventListeners();

    // データをロード
    await loadData();

    // アニメーションループ開始
    animate();
  }

  /**
   * Three.jsのセットアップ
   */
  function setupThreeJS() {
    const width = previewContainer.clientWidth;
    const height = previewContainer.clientHeight;

    // シーン
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // カメラ
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    updateCameraPosition();

    // レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    previewContainer.appendChild(renderer.domElement);

    // 床面の白い枠線
    createFloorGrid();

    // 方向ラベル
    createDirectionLabels();
  }

  /**
   * 床面のグリッド（白い枠線）を作成
   */
  function createFloorGrid() {
    // 床面の高さ（ブロックの底面より少し下）
    const floorY = -0.55;
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.5, floorY, -0.5,  0.5, floorY, -0.5,
       0.5, floorY, -0.5,  0.5, floorY,  0.5,
       0.5, floorY,  0.5, -0.5, floorY,  0.5,
      -0.5, floorY,  0.5, -0.5, floorY, -0.5
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const line = new THREE.LineSegments(geometry, material);
    scene.add(line);
  }

  /**
   * 方向ラベルを作成
   */
  function createDirectionLabels() {
    // 床面の高さに合わせる
    const labelY = -0.55;
    const labels = [
      { text: 'FRONT', position: [0, labelY, -1] },
      { text: 'BACK', position: [0, labelY, 1] },
      { text: 'LEFT', position: [-1, labelY, 0] },
      { text: 'RIGHT', position: [1, labelY, 0] }
    ];

    labels.forEach(label => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 128;
      canvas.height = 32;
      context.fillStyle = '#ffffff';
      context.font = '20px Arial';
      context.textAlign = 'center';
      context.fillText(label.text, 64, 24);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(...label.position);
      sprite.scale.set(0.8, 0.2, 1);
      scene.add(sprite);
    });
  }

  /**
   * カメラ位置を更新
   */
  function updateCameraPosition() {
    const x = cameraDistance * Math.sin(rotationY) * Math.cos(rotationX);
    const y = cameraDistance * Math.sin(rotationX);
    const z = cameraDistance * Math.cos(rotationY) * Math.cos(rotationX);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }

  /**
   * イベントリスナーのセットアップ
   */
  function setupEventListeners() {
    // マウスドラッグで回転
    previewContainer.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      // 水平回転：マウスを右にドラッグするとブロックが右に回転
      rotationY -= deltaX * 0.01;

      // 垂直回転：制限付き
      rotationX += deltaY * 0.01;
      rotationX = Math.max(-MAX_ROTATION_X, Math.min(MAX_ROTATION_X, rotationX));

      updateCameraPosition();
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // ホイールでズーム
    previewContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      cameraDistance += e.deltaY * 0.01;
      cameraDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, cameraDistance));
      updateCameraPosition();
    });

    // テクスチャスロットのクリック
    textureSlotsContainer.querySelectorAll('.texture-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        currentEditingFace = slot.dataset.face;
        openTextureModal();
      });
    });

    // モーダルの閉じるボタン
    textureModal.querySelector('.close-modal').addEventListener('click', closeTextureModal);

    // モーダル背景クリックで閉じる
    textureModal.addEventListener('click', (e) => {
      if (e.target === textureModal) {
        closeTextureModal();
      }
    });

    // ブロック選択
    document.getElementById('block-select').addEventListener('change', (e) => {
      const blockId = parseInt(e.target.value);
      selectBlock(blockId);
    });

    // 保存ボタン
    document.getElementById('save-button').addEventListener('click', saveBlock);

    // ウィンドウリサイズ
    window.addEventListener('resize', onWindowResize);
  }

  /**
   * ウィンドウリサイズ時の処理
   */
  function onWindowResize() {
    const width = previewContainer.clientWidth;
    const height = previewContainer.clientHeight;
    renderer.setSize(width, height);
  }

  /**
   * データをロード
   */
  async function loadData() {
    try {
      const data = await GasAPI.getAll();
      blocks = data.blocks.filter(b => b.shape_type === 'normal');
      textures = data.textures;

      // テクスチャマップを作成
      textureMap = {};
      textures.forEach(t => {
        textureMap[t.file_name] = t.image_base64;
      });

      // ブロック選択プルダウンを更新
      updateBlockSelect();

      // 最初のブロックを選択
      if (blocks.length > 0) {
        selectBlock(blocks[0].block_id);
      }
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
      alert('データの読み込みに失敗しました: ' + error.message);
    }
  }

  /**
   * ブロック選択プルダウンを更新
   */
  function updateBlockSelect() {
    const select = document.getElementById('block-select');
    select.innerHTML = '';
    blocks.forEach(block => {
      const option = document.createElement('option');
      option.value = block.block_id;
      option.textContent = `${block.block_id}: ${block.name}`;
      select.appendChild(option);
    });
  }

  /**
   * ブロックを選択
   * @param {number} blockId - ブロックID
   */
  function selectBlock(blockId) {
    currentBlock = blocks.find(b => b.block_id === blockId);
    if (!currentBlock) return;

    // 情報を表示
    document.getElementById('block-str-id').textContent = currentBlock.block_str_id;
    document.getElementById('block-name').textContent = currentBlock.name;

    // テクスチャ設定を読み込み
    currentTextures = {
      default: currentBlock.tex_default || null,
      top: currentBlock.tex_top || null,
      bottom: currentBlock.tex_bottom || null,
      front: currentBlock.tex_front || null,
      left: currentBlock.tex_left || null,
      right: currentBlock.tex_right || null,
      back: currentBlock.tex_back || null
    };

    // テクスチャスロットを更新
    updateTextureSlots();

    // 3Dプレビューを更新
    updateBlockMesh();
  }

  /**
   * テクスチャスロットのUIを更新
   */
  function updateTextureSlots() {
    const faces = ['default', 'top', 'bottom', 'front', 'left', 'right', 'back'];
    faces.forEach(face => {
      const slot = textureSlotsContainer.querySelector(`[data-face="${face}"]`);
      const img = slot.querySelector('img');
      const textureName = currentTextures[face];

      if (textureName && textureMap[textureName]) {
        img.src = textureMap[textureName];
        img.style.display = 'block';
        slot.style.backgroundColor = 'transparent';
      } else {
        img.src = '';
        img.style.display = 'none';
        slot.style.backgroundColor = '#000000';
      }
    });
  }

  /**
   * 3Dプレビューのブロックメッシュを更新
   */
  function updateBlockMesh() {
    // 既存のメッシュを削除
    if (blockMesh) {
      scene.remove(blockMesh);
      if (Array.isArray(blockMesh.material)) {
        blockMesh.material.forEach(m => m.dispose());
      }
      blockMesh.geometry.dispose();
    }

    // 実際の表示用のブロックデータを作成（未設定の面はdefaultを使用）
    const displayBlock = {
      tex_default: currentTextures.default,
      tex_top: currentTextures.top || currentTextures.default,
      tex_bottom: currentTextures.bottom || currentTextures.default,
      tex_front: currentTextures.front || currentTextures.default,
      tex_back: currentTextures.back || currentTextures.default,
      tex_left: currentTextures.left || currentTextures.default,
      tex_right: currentTextures.right || currentTextures.default
    };

    // 新しいメッシュを作成
    blockMesh = StandardBlockMeshBuilder.createBlockMesh(displayBlock, textureMap);
    scene.add(blockMesh);
  }

  /**
   * テクスチャ選択モーダルを開く
   */
  function openTextureModal() {
    // グリッドを更新
    textureGrid.innerHTML = '';

    // 「テクスチャなし」タイル
    const noneTile = document.createElement('div');
    noneTile.className = 'texture-tile texture-none';
    noneTile.innerHTML = '<span>テクスチャなし</span>';
    noneTile.addEventListener('click', () => {
      selectTexture(null);
    });
    textureGrid.appendChild(noneTile);

    // テクスチャタイル
    textures.forEach(texture => {
      const tile = document.createElement('div');
      tile.className = 'texture-tile';
      if (texture.image_base64) {
        tile.innerHTML = `<img src="${texture.image_base64}" alt="${texture.file_name}">`;
      }
      tile.addEventListener('click', () => {
        selectTexture(texture.file_name);
      });
      textureGrid.appendChild(tile);
    });

    // 「テクスチャ追加」タイル
    const addTile = document.createElement('div');
    addTile.className = 'texture-tile texture-add';
    addTile.innerHTML = '<span>+ 追加</span>';
    addTile.addEventListener('click', uploadTexture);
    textureGrid.appendChild(addTile);

    textureModal.style.display = 'flex';
  }

  /**
   * テクスチャ選択モーダルを閉じる
   */
  function closeTextureModal() {
    textureModal.style.display = 'none';
    currentEditingFace = null;
  }

  /**
   * テクスチャを選択
   * @param {string|null} fileName - テクスチャファイル名（nullでテクスチャなし）
   */
  function selectTexture(fileName) {
    if (currentEditingFace) {
      currentTextures[currentEditingFace] = fileName;
      updateTextureSlots();
      updateBlockMesh();
    }
    closeTextureModal();
  }

  /**
   * テクスチャをアップロード
   */
  function uploadTexture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageBase64 = event.target.result;
        const fileName = file.name.replace(/\.[^/.]+$/, ''); // 拡張子を除去

        try {
          // 新しいtexture_idを決定
          const maxId = textures.reduce((max, t) => Math.max(max, t.texture_id), 0);
          const newTextureId = maxId + 1;

          // APIに保存
          await GasAPI.saveTexture({
            texture_id: newTextureId,
            file_name: fileName,
            color_hex: '',
            image_base64: imageBase64
          });

          // ローカルデータを更新
          const newTexture = {
            texture_id: newTextureId,
            file_name: fileName,
            color_hex: '',
            image_base64: imageBase64
          };
          textures.push(newTexture);
          textureMap[fileName] = imageBase64;

          // モーダルを再表示
          openTextureModal();
        } catch (error) {
          console.error('テクスチャのアップロードに失敗しました:', error);
          alert('テクスチャのアップロードに失敗しました: ' + error.message);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  /**
   * ブロックを保存
   */
  async function saveBlock() {
    if (!currentBlock) return;

    try {
      // ブロックデータを作成
      const blockData = {
        block_id: currentBlock.block_id,
        block_str_id: currentBlock.block_str_id,
        name: currentBlock.name,
        shape_type: currentBlock.shape_type,
        is_transparent: currentBlock.is_transparent || false,
        light_level: currentBlock.light_level || 0,
        tex_default: currentTextures.default || ''
      };

      // 各面のテクスチャ（設定されている場合のみ）
      if (currentTextures.top) blockData.tex_top = currentTextures.top;
      if (currentTextures.bottom) blockData.tex_bottom = currentTextures.bottom;
      if (currentTextures.front) blockData.tex_front = currentTextures.front;
      if (currentTextures.back) blockData.tex_back = currentTextures.back;
      if (currentTextures.left) blockData.tex_left = currentTextures.left;
      if (currentTextures.right) blockData.tex_right = currentTextures.right;

      await GasAPI.saveBlock(blockData);

      // ローカルデータを更新
      const index = blocks.findIndex(b => b.block_id === currentBlock.block_id);
      if (index >= 0) {
        blocks[index] = { ...blocks[index], ...blockData };
        currentBlock = blocks[index];
      }

      alert('保存しました');
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存に失敗しました: ' + error.message);
    }
  }

  /**
   * アニメーションループ
   */
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  return {
    init: init
  };
})();
