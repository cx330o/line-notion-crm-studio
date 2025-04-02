# GAS（Google Apps Script）詳細設計 — 写真館DEMO

## 1. 概要
Googleフォームの回答やLINE公式アカウントの友だち追加・ブロックイベントをトリガーに、Notionの顧客DB・案件DBへデータを登録・更新し、エラー時はSlack通知を行う。

---

## 2. ファイル構成

```
gas/
├── Code.gs        // メイン処理（onFormSubmit）
├── notion.gs      // Notion API連携ヘルパー
├── slack.gs       // Slack通知ヘルパー
├── webhook.gs     // LINE Webhook受信・署名検証・友だち追加/ブロック対応
└── README.md      // この設計書
```

---

## 3. 各ファイル・関数の詳細

### 3.1 Code.gs

#### 3.1.1 onFormSubmit(e)
- **トリガー**: Googleフォーム回答時
- **処理フロー**:
  1. 回答データ取得（`e.values`や`e.namedValues`）
  2. LINE UID（base64）をデコードし、formData.uidに格納
  3. 顧客情報・案件情報を抽出
  4. Notion APIで顧客DBを検索（searchCustomerByUid）
      - 存在しなければ`createCustomer(formData)`（LINE友達ブロックはfalseで登録、LINE_UIDはデコード済みuidで保存）
      - 存在すれば`updateCustomer(id, formData)`（LINE_UIDもデコード済みuidで更新）
  5. Notion APIで案件DBに新規案件を`createCase(formData, customerId)`で作成
      - 案件名は「タイムスタンプ（YYYYMMDD）_名前」
      - 主顧客リレーションは顧客IDで紐付け
      - 予約日時候補1〜3（日付型）はISO8601形式（ゼロ埋め）で登録
  6. エラー発生時はSlack通知

#### 3.1.2 decodeUid(base64uid)
- base64でエンコードされたUIDをデコードし、formData.uidに格納

### 3.1 顧客DB
| プロパティ | 型 | 備考 |
|------------|----|------|
| 名前 (title) | Title | 世帯主 or 本人 |
| LINE UID | Rich text (unique) | 主キー。GASでデコード済みのUIDを保存・検索に利用 |
| LINEニックネーム | Rich text | LINEのニックネーム（友だち追加時に自動取得） |
| LINEプロフィール画像 | URL | LINEのプロフィール画像URL（友だち追加時に自動取得） |
| 電話番号 | Phone |  |
| メールアドレス | Email |  |
| 生年月日 | Date |  |
| LINE友達ブロック | Checkbox | false=友達、true=ブロック（GAS経由で新規作成時は常にfalse） |
| 家族メンバー | Relation (self) | 双方向・UI 片側表示 |
| 家族タグ | Select | 父 / 母 / 子_長女 … |
| ライフステージ | Formula | 長期判定式 |
| 撮影種別一覧 | Rollup | 案件DB→撮影種別 |
| 判定_七五三 ほか | Formula | `contains()` で抽出 |
| 備考 | Text |  |

---

### 3.2 webhook.gs

#### 3.2.1 doPost(e)
- **トリガー**: LINE公式アカウントのWebhook（友だち追加・ブロック）
- **処理フロー**:
  1. 署名検証（X-Line-Signature）
      - 不正な場合は403で終了
  2. イベントごとに分岐
      - `follow`（友だち追加）
        - 顧客DBに仮登録 or 「LINE友達ブロック」falseで更新
        - **LINEプロフィールAPIでニックネーム・画像も取得しNotionに保存**
      - `unfollow`（ブロック）
        - 顧客DBの「LINE友達ブロック」をtrueで更新
  3. エラー発生時はSlack通知
- ※初回メッセージ送信やGoogleフォーム案内は**行わない**

---

### 3.3 notion.gs

#### 3.3.1 searchCustomerByUid(uid)
- Notion顧客DBでUID一致の顧客を検索（LINE_UIDはリッチテキスト型、デコード済みuidで完全一致検索）
- 検索結果が複数あっても最初の1件のみ返す

#### 3.3.2 createCustomer(data)
- 顧客DBに新規作成（「LINE友達ブロック」falseで作成、LINE_UIDはデコード済みuidで保存）
- **LINEニックネーム・LINEプロフィール画像も保存**

#### 3.3.3 updateCustomer(id, data)
- 顧客DBの既存顧客を更新（「LINE友達ブロック」プロパティも更新可、LINE_UIDもデコード済みuidで更新）
- **LINEニックネーム・LINEプロフィール画像も保存**

#### 3.3.4 createCase(data, customerId)
- 案件DBに新規案件を作成（顧客IDとリレーション、予約日時候補1〜3も登録）
- 日付はISO8601形式（例: 2025-06-10T09:00:00）でゼロ埋め

#### 3.3.5 notionApiRequest(endpoint, method, payload)
- Notion API共通リクエスト関数

---

### 3.4 slack.gs

#### 3.4.1 notifySlack(message)
- Slack Webhookでエラー通知

---

## 4. スクリプトプロパティの利用

- Notion APIトークン、DB ID（顧客DB・案件DB）、Slack Webhook URL、LINEチャネルシークレットなどの機密情報は**スクリプトプロパティ**で管理する。
- 設定例：
  - `NOTION_TOKEN`
  - `CUSTOMER_DB_ID`
  - `CASE_DB_ID`
  - `SLACK_WEBHOOK_URL`
  - `LINE_CHANNEL_SECRET`（署名検証用）
  - `LINE_REPLY_ENDPOINT`（通常は `https://api.line.me/v2/bot/message/reply`。今回は未使用だが拡張用に管理可）
- スクリプトプロパティはGASエディタの「プロジェクトのプロパティ」から設定
- コード内では`PropertiesService.getScriptProperties().getProperty('KEY')`で取得

---

## 5. データフロー詳細

1. **Googleフォーム送信**
    - LINE UID（base64）、名前、予約日時候補1〜3、他属性情報が送信される
2. **onFormSubmit(e)**
    - 回答データをパース
    - UIDをbase64デコードしformData.uidに格納
    - 必要なデータを整形
3. **Notion API連携**
    - 顧客DBをUIDで検索（searchCustomerByUid）
    - 顧客がいなければ`createCustomer`（LINE友達ブロック: false、LINE_UIDはデコード済みuid）、いれば`updateCustomer`（LINE_UIDもデコード済みuid）
    - 案件DBに案件を`createCase`で新規作成（案件名・主顧客リレーション・予約日時候補1〜3はISO8601形式でゼロ埋め）
4. **LINE Webhook受信**
    - 署名検証
    - follow: 顧客DBに仮登録 or 「LINE友達ブロック」falseで更新
    - unfollow: 顧客DBの「LINE友達ブロック」をtrueで更新
5. **エラー時**
    - Slackにエラーメッセージを送信

---

## 6. セキュリティ・運用

- APIキーやDB ID、LINEチャネルシークレットは**スクリプトプロパティ**で一元管理し、漏洩に注意
- Webhookは署名検証（X-Line-Signature）を必ず実装
- Slack通知で障害検知を迅速化
- 必要に応じてログ出力も追加

---

## 7. 拡張性

- 顧客DB・案件DBのプロパティ追加もスクリプトプロパティや定数で管理
- 他の通知先（メール等）もslack.gsに追加可能


