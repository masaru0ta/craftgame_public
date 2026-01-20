/**
 * 標準ブロックエディタ メインスクリプト
 * ページ読み込み時にエディタを初期化
 */

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('editor-container');
  await StandardBlockEditor.init(container);
});
