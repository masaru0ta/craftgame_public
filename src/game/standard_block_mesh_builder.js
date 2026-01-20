/**
 * 通常ブロック用メッシュ生成ライブラリ
 * Three.jsを使用して標準ブロック（1x1x1立方体）のメッシュを生成する
 */

const StandardBlockMeshBuilder = (function() {
  /**
   * テクスチャをロード
   * @param {string} imageBase64 - Base64エンコードされた画像データ
   * @returns {THREE.Texture} テクスチャ
   */
  function loadTexture(imageBase64) {
    const texture = new THREE.TextureLoader().load(imageBase64);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  /**
   * ブロックデータからマテリアル配列を作成
   * @param {Object} blockData - ブロックデータ
   * @param {Object} textureMap - テクスチャマップ（file_name -> image_base64）
   * @returns {THREE.Material[]} マテリアル配列 [right, left, top, bottom, front, back]
   */
  function createMaterials(blockData, textureMap) {
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const materials = [];

    for (const face of faceOrder) {
      const texKey = `tex_${face}`;
      let textureName = blockData[texKey] || blockData.tex_default;

      if (textureName && textureMap[textureName]) {
        const texture = loadTexture(textureMap[textureName]);
        materials.push(new THREE.MeshBasicMaterial({ map: texture }));
      } else {
        // テクスチャがない場合はグレーのマテリアル
        materials.push(new THREE.MeshBasicMaterial({ color: 0x808080 }));
      }
    }

    return materials;
  }

  /**
   * 通常ブロックのメッシュを生成
   * @param {Object} blockData - ブロックデータ
   * @param {Object} textureMap - テクスチャマップ（file_name -> image_base64）
   * @returns {THREE.Mesh} ブロックのメッシュ
   */
  function createBlockMesh(blockData, textureMap) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = createMaterials(blockData, textureMap);
    const mesh = new THREE.Mesh(geometry, materials);
    return mesh;
  }

  /**
   * 特定の面のみテクスチャを更新
   * @param {THREE.Mesh} mesh - 対象のメッシュ
   * @param {string} face - 面の名前（top, bottom, front, back, left, right）
   * @param {string|null} imageBase64 - Base64画像データ（nullでテクスチャなし）
   */
  function updateFaceTexture(mesh, face, imageBase64) {
    const faceIndex = {
      'right': 0,
      'left': 1,
      'top': 2,
      'bottom': 3,
      'front': 4,
      'back': 5
    };

    const index = faceIndex[face];
    if (index === undefined) return;

    if (mesh.material[index]) {
      mesh.material[index].dispose();
    }

    if (imageBase64) {
      const texture = loadTexture(imageBase64);
      mesh.material[index] = new THREE.MeshBasicMaterial({ map: texture });
    } else {
      mesh.material[index] = new THREE.MeshBasicMaterial({ color: 0x808080 });
    }
  }

  /**
   * ブロック全体のテクスチャを更新
   * @param {THREE.Mesh} mesh - 対象のメッシュ
   * @param {Object} blockData - ブロックデータ
   * @param {Object} textureMap - テクスチャマップ
   */
  function updateAllTextures(mesh, blockData, textureMap) {
    const materials = createMaterials(blockData, textureMap);

    // 古いマテリアルを破棄
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    }

    mesh.material = materials;
  }

  return {
    createBlockMesh: createBlockMesh,
    updateFaceTexture: updateFaceTexture,
    updateAllTextures: updateAllTextures,
    loadTexture: loadTexture
  };
})();
