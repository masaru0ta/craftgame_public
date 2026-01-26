# 仕様書: 1-7 データファイル一覧画面

## 1. 概要

利用するスプレッドシートを切り換える機能を提供する。

- データファイル（スプレッドシート参照）の一覧表示・追加・編集・削除・コピー
- 使用中データファイルの切り替え
- データはGAS側（PropertiesService）で管理し、全クライアント共通

## 2. 関連資料

- spec_1-2_gas_api.md: API仕様
- **mockup_1-7_data_file_manager.html**: モックアップ

## 3. データ構造

### データファイル

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| id | string | UUID形式の一意ID |
| name | string | 表示名 |
| spreadsheetId | string | GoogleスプレッドシートのID |
| createdAt | number | 作成日時（UNIXタイムスタンプ） |

### PropertiesService保存形式

| キー | 値 |
|------|-----|
| `dataFiles` | データファイル配列のJSON |
| `activeDataFileId` | 使用中ファイルのID |

## 4. UI構成

タブに「データ選択」を追加（一番左、区切り線付き）。

| 領域 | 内容 |
|------|------|
| 左カラム | データファイル一覧（リスト形式）、追加ボタン |
| 右カラム | 選択ファイルの詳細表示・編集フォーム、または新規追加フォーム |

### 一覧の表示

- 各ファイル: アイコン、名前、スプレッドシートID、作成日時
- 使用中ファイルには「使用中」バッジを表示
- クリックで選択（右カラムに詳細表示）

### 詳細パネルのボタン

| ボタン | 動作 |
|--------|------|
| 削除 | ファイルを削除（使用中は無効化） |
| コピー作成 | ファイルをコピー（名前に_copy付与） |
| このデータを使用 | 使用中ファイルを切り替え（使用中なら非表示） |
| 保存 | 編集内容を保存 |

## 5. GAS API

### 5.1 getDataFiles - 一覧取得

データファイル一覧と使用中IDを取得。

**リクエスト:** `?action=getDataFiles`

**レスポンス:**
```json
{
  "files": [
    { "id": "uuid", "name": "default_data", "spreadsheetId": "xxx", "createdAt": 1704844800000 }
  ],
  "activeId": "uuid"
}
```

### 5.2 setActiveDataFile - 使用中設定

**リクエスト:** `?action=setActiveDataFile&data={"id":"uuid"}`

### 5.3 createDataFile - 作成

**リクエスト:** `?action=createDataFile&data={"name":"test","spreadsheetId":"xxx"}`

**レスポンス:** 作成されたファイルオブジェクト

### 5.4 updateDataFile - 更新

**リクエスト:** `?action=updateDataFile&data={"id":"uuid","name":"new_name","spreadsheetId":"xxx"}`

### 5.5 deleteDataFile - 削除

**リクエスト:** `?action=deleteDataFile&data={"id":"uuid"}`

※使用中ファイルは削除不可（エラーを返す）

### 5.6 copyDataFile - コピー

**リクエスト:** `?action=copyDataFile&data={"id":"uuid"}`

**動作:**
1. 元スプレッドシートを同じフォルダにコピー（ファイル名: 元の名前 + `_copy`）
2. コピーされたスプレッドシートのIDで新しいデータファイルを作成

**レスポンス:** 作成されたファイルオブジェクト（新しいspreadsheetIdを含む）

### 5.7 既存APIの変更

`getBlocks`, `getTextures`, `getAll`, `saveBlock` 等の既存APIは、使用中ファイルのスプレッドシートIDを自動的に使用する。

## 6. テスト用セレクタ

| 要素 | セレクタ |
|------|----------|
| データ選択タブ | `.tab.data-tab` |
| データ選択画面 | `#dataSelect` |
| 左カラム | `.col-data-left` |
| 右カラム | `.col-data-right` |
| ファイル一覧 | `.data-file-list` |
| ファイル項目 | `.data-file-item` |
| 選択中ファイル | `.data-file-item.selected` |
| 使用中バッジ | `.data-file-status` |
| 追加ボタン | `.add-file-item` |
| 詳細パネル | `#detailPanel` |
| 追加パネル | `#addPanel` |
| ファイル名入力 | `#detailName` |
| スプレッドシートID入力 | `#detailSpreadsheetId` |
| 作成日時 | `#detailCreatedAt` |
| 削除ボタン | `#deleteBtn` |
| コピーボタン | `#copyBtn` |
| 使用ボタン | `#useBtn` |
| 保存ボタン | `#saveBtn` |

## 7. テスト項目

- モックアップとUIデザイン（要素の存在、場所、色、サイズ）が一致するか検証
- 処理ロジックの要件１つずつ動作検証

## 8. 制限事項

- 使用中ファイルは削除不可（先に別ファイルを使用中にする必要あり）
- PropertiesServiceの容量制限: 合計500KB
- スプレッドシートへのアクセス権限がない場合はAPIエラー
