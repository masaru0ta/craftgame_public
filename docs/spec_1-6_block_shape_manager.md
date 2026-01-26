# 仕様書: 1-6 ブロック形状管理ツール

## 1. 概要

ブロック形状一覧を表示し、標準ブロック・カスタムブロックの編集ができる統合管理ツールを作る。
1-3〜1-5 で作成した BlockEditorUI（およびコアクラス群）をそのまま利用する。

主な機能:
- ブロック形状一覧のグリッド表示（サムネイル付き）
- ブロック形状ごとの基本情報の編集
- ブロック形状（テクスチャ・カスタムブロック・当たり判定）の編集
- テクスチャの編集

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-2_gas_api.md: API仕様
- spec_1-3_standard_block_editor.md: BlockEditorUI基盤、StandardBlockEditor
- spec_1-4_custom_block_editor.md: CustomBlockEditor、BlockEditorUIのカスタムブロック拡張
- spec_1-5_collision_editor.md: CollisionChecker、BlockEditorUIの衝突テスト拡張
- **mockup_1-6_block_shape_manager.html**: モックアップ

## 3. アーキテクチャ

### 3.1 クラス構成

```
block_manager_main.js
    └── BlockEditorUI (1-3で作成、1-4/1-5で拡張済み)
        ├── StandardBlockEditor (1-3で作成)
        │   └── StandardBlockMeshBuilder
        └── CustomBlockEditor (1-4で作成、1-5で拡張)
            ├── CustomBlockMeshBuilder
            ├── CustomCollision (1-5で作成)
            └── CollisionChecker (1-5で作成)
```

### 3.2 責務分離

| クラス | 責務 | 定義場所 |
|--------|------|----------|
| block_manager_main.js | 画面制御、データ管理、BlockEditorUIの利用 | この仕様 |
| BlockEditorUI | UI生成、イベントハンドリング、エディタ切替 | 1-3〜1-5 |
| StandardBlockEditor | 標準ブロックの3D表示、テクスチャ管理 | 1-3 |
| CustomBlockEditor | カスタムブロックの3D表示、ボクセル編集 | 1-4/1-5 |
| CollisionChecker | 衝突テストのボール物理演算 | 1-5 |
| BlockThumbnail | サムネイル生成 | この仕様 |

### 3.3 BlockEditorUI の利用

BlockEditorUI は 1-3〜1-5 で完成済みのクラスを使用する。
block_manager ではコンテナ要素を渡して初期化し、ブロックデータをロードするだけで利用できる。

```javascript
// 利用例
const editorUI = new BlockEditorUI({
  container: document.getElementById('editor-container'),
  THREE: THREE,
  onTextureSelect: (slot) => openTextureModal(slot),
  onBlockChange: (blockData) => markAsModified(blockData)
});
editorUI.init();
editorUI.loadBlock(blockData, textures);
```

## 4. 機能詳細

### 4.1 レイアウト

画面レイアウト（要素配置、色、サイズ）はモックアップに準拠する。
詳細は `mockup_1-6_block_shape_manager.html` を参照。

### 4.2 処理ロジック

#### 4.2.1 ページ読み込み時

1. GAS API でブロック一覧を取得
2. ブロック一覧の先頭（block_id 最小）を自動選択
3. 選択したブロックを中央カラム（基本情報）と右カラム（BlockEditorUI）に表示

#### 4.2.2 ブロック選択

タイルクリック時:
1. 未保存の変更がある場合、確認ダイアログを表示
2. 選択状態を更新
3. 基本情報フォームを更新
4. BlockEditorUI にブロックをロード
   - shape_type が `normal` の場合: StandardBlockEditor（1-3）でテクスチャ編集
   - shape_type が `custom` の場合: CustomBlockEditor（1-4/1-5）でボクセル・当たり判定編集

#### 4.2.3 新規ブロック作成

「+ 新規追加」タイルクリック時:
1. 新規作成モーダルを表示
2. 入力バリデーション
   - block_str_id: 必須、英数字とアンダースコアのみ、重複不可
   - name: 必須
3. GAS API で作成
4. 一覧を更新し、新規ブロックを選択状態に

#### 4.2.4 ブロックタイプ変更

通常ブロック ↔ カスタムブロック 変更時:
1. 確認ダイアログを表示（関連データがクリアされる旨）
2. OK で shape_type を変更、関連データをクリア
3. BlockEditorUI を再初期化

#### 4.2.5 ブロック保存

保存ボタンクリック時:
1. 基本情報フォームの値を取得
2. BlockEditorUI から形状データを取得
3. GAS API で保存
4. 変更フラグをクリア

#### 4.2.6 ブロック削除

削除ボタンクリック時:
1. 確認ダイアログを表示
2. OK で GAS API から削除
3. 一覧を更新

#### 4.2.7 テクスチャ編集

テクスチャ一覧タブ:
1. テクスチャ選択で詳細表示
2. 代表色（color_hex）のみ編集可能
3. 保存で GAS API に反映

## 5. ファイル構成

```
src/
  tool/
    block_manager.html            # 一覧画面HTML
    block_manager_style.css       # 共通スタイル
    block_manager_main.js         # 一覧画面スクリプト
  game/
    block_editor_ui.js            # BlockEditorUI クラス（1-3〜1-5で作成済み）
    standard_block_editor.js      # 標準ブロックエディタ（1-3）
    custom_block_editor.js        # カスタムブロックエディタ（1-4/1-5）
    custom_collision_checker.js   # 衝突テストチェッカー（1-5）
    standard_block_mesh_builder.js
    custom_block_mesh_builder.js
    voxel_data.js
    custom_collision.js
    gas_api.js
    block_thumbnail.js            # サムネイル生成ライブラリ（この仕様で作成）
```

## 6. 補足仕様

### 6.1 サムネイル

- ブロック一覧のサムネイルはテクスチャの代表色（color_hex）を使用
- サムネイルはメモリ内キャッシュ（永続化なし）
- ブロック更新時にキャッシュを無効化

### 6.2 一覧のソート

- デフォルトは block_id 昇順

## 7. テスト用CSSセレクタ定義

| 要素 | セレクタ | 検証内容 |
|------|----------|----------|
| タブバー | `.tabs` | タブ切り替え |
| タブ | `.tab` | ブロック一覧/テクスチャ一覧 |
| アクティブタブ | `.tab.active` | 選択中のタブ |
| メインコンテンツ | `.main` | タブに対応するコンテンツ |
| アクティブコンテンツ | `.main.active` | 表示中のコンテンツ |
| 左カラム | `.col-left` | ブロック一覧グリッド |
| 中央カラム | `.col-mid` | 基本情報フォーム |
| 右カラム | `.col-right` | BlockEditorUI（3Dエディタ） |
| グリッド | `.grid` | タイルのグリッド表示 |
| タイル | `.tile` | 各ブロック/テクスチャのタイル |
| 選択中タイル | `.tile.selected` | 選択状態 |
| 3Dプレビュー枠 | `.preview-container` | BlockEditorUIのコンテナ |
| ツールバー | `.toolbar` | ツールボタン枠 |
| コントロールパネル | `.control-panel` | テクスチャ/マテリアル設定枠 |
| 標準ブロック用スロット | `.slot` | テクスチャスロット（normal時に表示） |
| カスタムブロック用マテリアル | `.material-slot` | マテリアルスロット（custom時に表示） |
| モード切替ボタン | `#modeToggle` | 編集/衝突テストモード切替（custom時） |
| テクスチャ選択モーダル | `.texture-modal-overlay` | テクスチャ選択UI |
| スロット画像 | `.slot-image` | スロット内のテクスチャ画像表示 |
| BGボタン | `.bg-btn` | 背景色切替ボタン |

## 8. テスト方針

### 方針

1-6は1-3〜1-5で作成済みのBlockEditorUIを統合するツールであるため、BlockEditorUI自体の機能テストは不要。
1-6固有の以下の機能のみをテストする:

- モックアップとUIデザイン（要素の存在、場所、色、サイズ）が一致するか検証
- 処理ロジックの要件１つずつ動作検証
- BlockEditorUI統合テスト:
  - ブロック選択時に右カラムにBlockEditorUIが初期化される
  - 標準ブロック（shape_type: normal）選択時にテクスチャスロット（`.slot`）が表示される
  - カスタムブロック（shape_type: custom）選択時にマテリアルスロット（`.material-slot`）とモード切替ボタン（`#modeToggle`）が表示される
  - スロットクリックでテクスチャ選択モーダル（`.texture-modal-overlay`）が表示される
  - テクスチャ選択後にスロット画像（`.slot-image`）が更新される
  - BGボタン（`.bg-btn`）がツールバーに表示される

### テスト用ページ

`src/test/spec_1-6_block_manager.html` に配置
