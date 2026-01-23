# 仕様書: 1-5 カスタムブロック当たり判定エディタ

## 1. 概要

1-4 で作った CustomBlockEditor に、当たり判定を編集する機能と当たり判定チェック機能を追加する。
この仕様では以下を作成する:

1. **CustomCollision** - 当たり判定データのエンコード/デコード
2. **CollisionChecker** - 衝突テストのボール物理演算
3. **CustomBlockEditorへの当たり判定編集機能追加** - 1-4で作成した機能を拡張
4. **BlockEditorUIへの衝突テスト機能追加** - 1-4で拡張したBlockEditorUIにさらに追加

当たり判定データは 4x4x4 のグリッドで編集する。
当たり判定チェック機能では、上部から多量のボールが落ちてくる。

src/test/ 及び src/game/ のディレクトリは公開用の Github リポジトリにプッシュする
公開用リポジトリ: https://github.com/masaru0ta/craftgame_public

## 2. 関連資料

- spec_1-1_block_data_sheet.md: データ構造
- spec_1-3_standard_block_editor.md: BlockEditorUI基盤
- spec_1-4_custom_block_editor.md: CustomBlockEditor、BlockEditorUIのカスタムブロック拡張
- spec_1-6_block_shape_manager.md: block_manager統合ツール
- **mockups/mock_block_editor_ui.html**: BlockEditorUIのビジュアルモック（UIパーツ・サイズ・色仕様）

## 3. アーキテクチャ

### 3.1 クラス構成

```
BlockEditorUI (1-3で作成、1-4で拡張、この仕様でさらに拡張)
    ├── StandardBlockEditor (1-3で作成)
    │   └── StandardBlockMeshBuilder
    └── CustomBlockEditor (1-4で作成、この仕様で拡張)
        ├── CustomBlockMeshBuilder
        ├── CustomCollision (この仕様で作成)
        └── CollisionChecker (この仕様で作成)
```

### 3.2 責務分離

| クラス | 責務 |
|--------|------|
| BlockEditorUI | UI生成、衝突テスト開始/停止の制御（1-4から拡張） |
| CustomBlockEditor | 当たり判定編集モード、当たり判定ボクセル表示（1-4から拡張） |
| CustomCollision | 当たり判定データのエンコード/デコード（ゲーム本体でも使用） |
| CollisionChecker | 衝突テストのボール物理演算（独立クラス） |

## 4. BlockEditorUI 拡張（衝突テスト用）

### 4.1 概要

1-4で拡張したBlockEditorUIに、衝突テスト機能を追加する:
- 衝突テストボタン
- 自動作成ボタン

### 4.2 追加UI要素

カスタムブロック用コントロールパネル（見た目モード時）:

```
.control-panel.has-check-btn (flex: 1, 高さ1/8)
    ├── .slots-container
    │   └── マテリアルスロット x3 (1-4で追加)
    └── .check-btn（衝突テストボタン）
```

カスタムブロック用コントロールパネル（当たり判定モード時）:

```
.control-panel.has-check-btn (flex: 1, 高さ1/8)
    ├── .slots-container
    │   └── .auto-create-btn（自動作成ボタン）
    └── .check-btn（衝突テストボタン）
```

### 4.3 追加メソッド

| メソッド | 説明 |
|----------|------|
| `startCollisionTest()` | 衝突テストを開始 |
| `stopCollisionTest()` | 衝突テストを停止 |

## 5. CustomBlockEditor 当たり判定機能（実装詳細）

1-4で定義された以下のメソッドの実装詳細を本仕様で規定する:
- `setEditMode(mode)` / `getEditMode()`
- `getVoxelCollisionData()`
- `autoCreateCollision()`

### 5.1 編集モード切替

CustomBlockEditor は2つの編集モードをサポート:

| モード | グリッドサイズ | ブラシサイズ | 表示内容 |
|--------|---------------|-------------|----------|
| look（見た目） | 8x8x8 | 1x, 2x, 4x 選択可 | ボクセルメッシュ |
| collision（当たり判定） | 4x4x4 | 2x 固定 | 白いボクセル |

モード切替時:
- 見た目モード: ボクセルメッシュを表示、当たり判定メッシュを非表示
- 当たり判定モード: ボクセルメッシュを非表示、当たり判定メッシュ（白いボクセル）を表示

### 5.2 当たり判定編集

- 見た目編集と同様の操作で、当たり判定のボクセルを編集できる
- ハイライトサイズは見た目の2x2x2ボクセルに相当（当たり判定1ボクセル分）
- 右クリックで当たり判定ボクセルを配置
- 左クリックで当たり判定ボクセルを削除

### 5.3 自動作成機能

`autoCreateCollision()` を呼び出すと:
- 見た目の2x2x2ボクセル領域に1つでもボクセルがあれば、対応する当たり判定ボクセルを1（衝突あり）に設定
- 見た目の2x2x2ボクセル領域が全て空の場合、対応する当たり判定ボクセルを0（通過可）に設定
- 既存の当たり判定データは上書きされる

## 6. CustomCollision クラス

### 6.1 概要

当たり判定データ（4x4x4、1bit）のエンコード/デコードを担当するライブラリクラス。
ゲーム本体でも使用される。

### 6.2 公開メソッド

| メソッド | 説明 |
|----------|------|
| `encode(data)` | 4x4x4の当たり判定配列をBase64にエンコード |
| `decode(base64)` | Base64から4x4x4の当たり判定配列にデコード |

### 6.3 データ構造

- 入力/出力の `data` は3次元配列 `[y][z][x]`（各要素は0または1）
- エンコード時: 64ボクセル（4x4x4）を8バイトにパックしBase64化
- デコード時: Base64から8バイトを復元し3次元配列に展開

## 7. CollisionChecker クラス

### 7.1 コンストラクタ

```javascript
constructor(options) {
  // options.THREE: Three.jsライブラリ
  // options.scene: Three.jsシーン（ボールを追加する対象）
  // options.camera: Three.jsカメラ（重力方向の計算用）
}
```

### 7.2 公開メソッド

| メソッド | 説明 |
|----------|------|
| `setCollisionData(data)` | 4x4x4の当たり判定データを設定 |
| `start()` | 衝突テストを開始（ボール生成、アニメーション開始） |
| `stop()` | 衝突テストを停止（ボール削除） |
| `dispose()` | リソース解放 |

### 7.3 衝突テスト仕様

CollisionChecker の動作仕様:

- 小さな球体（直径0.1ブロック相当）が上空から落ちてくる
- 同時に30個の球体が存在
- 球体が画面外に落ちたら消え、新しい球体が上空から生成される（継続的に落下）
- 当たり判定ボクセルとの衝突でボールが反射する
- 重力シミュレーション（当たり判定が無い場所では落下）
- 重力方向は常に画面の下方向（カメラの向きに追従）
- 物理演算は60fps固定タイムステップで実行

## 8. データ形式

### voxel_collision形式（4x4x4、1bit）
- 各ボクセルは1ビット（0-1）で表現
  - 0: 通過可（空気）
  - 1: 衝突あり（ソリッド）
- データはY→Z→X順で格納
- Base64エンコードして保存
- 総データサイズ: 4x4x4 = 64ボクセル * 1bit = 64bit = 8bytes

## 9. ファイル構成

```
src/
  test/
    （1-4のテストページを使用、衝突テスト機能が追加される）
  game/
    block_editor_ui.js          # BlockEditorUIクラス（1-4で拡張済み、ここでさらに拡張）
    custom_block_editor.js      # CustomBlockEditorクラス（1-4で作成済み、ここで拡張）
    custom_collision_checker.js # 衝突テストチェッカー（新規作成）
    custom_collision.js         # 当たり判定データライブラリ（新規作成）
```

## 10. 補足仕様

### 10.1 初期状態
- 新規ブロック作成時、または `voxel_collision` が空のブロックを選択した場合、当たり判定は全て0（通過可）で開始

### 10.2 見た目との対応
- 当たり判定の1ボクセル = 見た目の2x2x2ボクセルに対応
- 当たり判定座標(x,y,z) は 見た目座標(x*2, y*2, z*2)〜(x*2+1, y*2+1, z*2+1) に対応

### 10.3 編集範囲の制限
- 4x4x4の範囲外にボクセルを配置しようとした場合は無視する

### 10.4 空の状態での保存
- 当たり判定が0個（全て通過可）の状態でも保存を許可する

### 10.5 保存の動作
- 保存時は見た目（voxel_look）と当たり判定（voxel_collision）を同時に保存する

## 11. 実装詳細: ボクセル表示

### 11.1 面ごとの明るさ

ボクセルの視認性向上のため、面ごとに異なる明るさを適用する。

| 面 | 明るさ |
|---|---|
| +Y (上面) | 1.0 (最も明るい) |
| +Z, -Z (前後) | 0.85 |
| +X, -X (左右) | 0.75 |
| -Y (底面) | 0.5 (最も暗い) |

- `MeshBasicMaterial` と頂点カラーを使用（ライティングの影響を受けない）
- 見た目ボクセル、当たり判定ボクセルの両方に適用

### 11.2 当たり判定ボクセル表示仕様

- 色: 白色（#FFFFFF）× 面ごとの明るさ
- サイズ: ブロック全体を1として各当たり判定は1/4
- 当たり判定モード時は見た目メッシュを非表示にし、当たり判定ボクセルのみ表示

## 12. 実装上の注意点

### 12.1 座標系の違いに注意

見た目編集モードと当たり判定編集モードでは座標系が異なる：

| モード | グリッドサイズ | ボクセルサイズ |
|--------|---------------|---------------|
| 見た目編集 | 8x8x8 | 1/8 |
| 当たり判定編集 | 4x4x4 | 1/4 |

### 12.2 highlightedVoxel/highlightedFace の座標系

`showVoxelHighlight()` および `showFloorHighlight()` では、**モードに応じた座標系**で `highlightedVoxel` および `highlightedFace` を設定する。

- 見た目モード: 8x8x8 座標系（0-7）
- 当たり判定モード: 4x4x4 座標系（0-3）

### 12.3 配置・削除処理での座標変換は不要

**重要**: `placeCollisionVoxel()` および `deleteCollisionVoxel()` では、`highlightedVoxel` と `highlightedFace` が**既に4x4座標系で設定されている**ため、座標変換を行ってはならない。

### 12.4 レイキャスト対象の切り替え

`updateHighlight()` では、モードに応じてレイキャスト対象を切り替える。

## 13. テスト用CSSセレクタ定義

BlockEditorUIが生成する衝突テスト用UI要素。サイズ・色の詳細は `mockups/mock_block_editor_ui.html` を参照。

| 要素 | セレクタ | 検証内容 |
|:-----|:---------|:---------|
| 自動作成ボタン | `.auto-create-btn` | 当たり判定モード時に表示 |
| 衝突テストボタン | `.check-btn` | 衝突テスト開始/停止 |
| コントロールパネル（カスタムブロック用） | `.control-panel.has-check-btn` | 衝突テストボタンがある場合のレイアウト |

## 14. テスト観点

テストコードは `tests/spec_1-5_collision_editor.spec.js` に実装。

```bash
# テスト項目一覧
npx playwright test --config=tests/playwright.config.js --list

# テスト実行
npm test

# UIモードでテスト確認
npm run test:ui
```

### 観点一覧

| 観点 | 内容 |
|------|------|
| BlockEditorUI 衝突テスト拡張 | 衝突テストボタンの開始/停止、自動作成ボタンの表示とクリック動作 |
| CustomBlockEditor 当たり判定編集 | setEditMode(), getEditMode() の動作、4x4グリッド表示、白色ボクセル表示、見た目メッシュ非表示、右クリック配置、左クリック削除、範囲制限 |
| 自動作成機能 | autoCreateCollision() による見た目データからの自動生成、2x2x2領域判定 |
| CollisionChecker クラス | setCollisionData(), start(), stop(), dispose() の動作、30個の球体、重力・衝突・反射、60fps物理演算 |
| CustomCollision データ | getVoxelCollisionData() のBase64エンコード、空状態での取得 |
| テストページ | 衝突テストボタン表示、モード切替、衝突テスト動作確認 |
