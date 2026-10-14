# 兩份表單＋Apps Script 後端改版 — 設計文件

日期：2026-10-14
狀態：決策已定案，待實作

## 背景與動機

瑞昱的承攬商訓練表單改版成兩份：

| 類型 | 代碼 |
|---|---|
| 工程發包類型承攬商專用版（一般作業、高風險作業等） | `E`（engineering） |
| 勞務類型承攬商專用版（保全、清潔、供膳、超商販售等） | `S`（service） |

表單 ID、帳號等部署資訊由擁有者自行保管，刻意不寫進公開 repo；後端從 Script Properties 讀取。

這次改版的新需求：

1. 訓練頁要加入個資使用同意文字（全文見附錄 A）
2. 考試合格後，系統自動發【電子訓練合格證明】
3. 合格人員可以用「身分證字號＋姓名」查詢自己的【電子訓練合格證明】

需求 3 必須有後端。舊版刻意不用後端，識別證資料全部放在 QR 網址裡，系統沒有存任何東西可以查。改版後由 Google Apps Script 擔任後端，同時解決舊版的兩個已知限制：答案放在網頁原始碼裡（只做了混淆）；識別證網址任何人都能偽造。

## 需求決策

| 項目 | 決定 |
|---|---|
| repo | 沿用本 repo（一個 repo），繼續部署在目前的 GitHub Pages，不交給 IT 內部主機 |
| 入口 | `index.html` 是首頁，有三顆按鈕：工程發包、勞務、查詢合格證明 |
| 題目來源 | 題目、選項、影片、答案、配分全部由 Apps Script 從 Google 表單**即時讀取**。以後改題只要改表單，網站不用改 |
| 改分 | 後端改分，答案永遠不送到前端；必須全對（每一題計分題都答對）才合格 |
| 送出 | 合格後由後端用 `FormApp` 代送一筆回應到 Google 表單，表單擁有者看資料的方式不變 |
| 證明紀錄 | 後端寫一筆到 Apps Script 擁有者帳號名下的「登記表」試算表。**不存完整身分證字號** |
| 證號 | `RT-{E|S}-{YYYYMMDD}-{NNN}`，日期用 UTC+8，NNN 是當天同類型的流水號（001 起） |
| 有效期 | 發證日（UTC+8）起 **1 年**（舊版 3 年） |
| 作廢 | 登記表有「作廢」勾選欄；被作廢的證明在查詢和查驗時都顯示「已作廢」 |
| 查詢 | 身分證字號＋姓名兩個都要對；每種類型只顯示最新一筆（含已過期、已作廢的狀態） |
| 證明外觀 | 字樣改成「電子訓練合格證明」；2026-10-14 使用者從樣式稿選定：**白卡＋彩色標題帶**（稿中 S3），兩類同版型，工程類標題帶 `#0078AF` 白字、勞務類 `#34EBB7` 深綠黑字；首頁版型 C（左說明右按鈕）、頂端列 2（logo＋Realtek＋網站名稱）。樣式稿：`assets/2026-10-14-style-picker.html` |
| 影片把關 | 維持自我聲明（勾「是」），不追蹤播放進度 |
| 測試 | 開發期間後端接 qaz 名下的兩份**表單副本**，上線前改 Script Properties 切到正式表單 |
| 部署 | 後端程式碼放在本 repo 的 `apps-script/`，用 clasp 推送 |
| 舊版 | 尚未對外發出，舊的 `FORM_ENDPOINT`／`no-cors` 送出、`QUIZ` 混淆答案、識別證的 URL payload 編碼全部移除，不需要相容 |

## 架構

```
GitHub Pages（靜態）                     Apps Script web app（執行身分＝擁有者，存取＝任何人）
─────────────────────                    ──────────────────────────────────────────────
index.html    首頁三選一                  GET  ?action=form&type=E|S   → 表單結構（不含答案）
training.html ?type=E|S 三步驟精靈   ───► POST {action:"submit", ...}  → 改分 → FormApp 代送 → 寫登記表 → 回傳證明
lookup.html   身分證＋姓名查詢       ───► POST {action:"lookup", ...}  → 每類型最新一筆
badge.html    #c=<證號>&t=<token>    ───► GET  ?action=verify&cert=&token= → 即時狀態（有效／過期／作廢）
config.js     API_URL                                │
                                                    ├─ FormApp：讀兩份 Google 表單（qaz 須為表單編輯者）
                                                    └─ SpreadsheetApp：登記表（qaz 名下）
```

### 跨網域呼叫

- Apps Script web app 的回應可以跨網域讀取，但不能處理 CORS preflight。POST 一律用 `Content-Type: text/plain;charset=utf-8` 送 JSON 字串，避免觸發 preflight
- 身分證字號只能放在 POST body，**不可以**出現在任何 URL（URL 會進到 log）
- 所有回應都是 JSON：成功 `{ok:true, ...}`；失敗 `{ok:false, error:"<code>", ...}`。前端依 `error` 代碼顯示中文訊息

### Script Properties

| key | 用途 |
|---|---|
| `FORM_ID_E`、`FORM_ID_S` | 兩份表單的編輯 ID（測試時填副本 ID，上線時改填正式 ID） |
| `REGISTRY_SHEET_ID` | 登記表試算表 ID |
| `HMAC_SECRET` | 隨機產生，用於查詢雜湊與證明 token |

提供一個 `setup()`，讓使用者在 Apps Script 編輯器手動執行一次：
- 沒有登記表就建立一份，寫好表頭，「作廢」欄設成核取方塊
- 沒有 `HMAC_SECRET` 就產生一組
- 已經存在的值不可覆寫（可以重複執行）

另外提供 `clearFormCache()`，改完表單後想立刻生效時手動執行。

## 後端 API

### `GET ?action=form&type=E|S`

讀取 `FORM_ID_{type}`，把表單轉成前端可渲染的結構並快取（2026-10-14 實測後調整：冷讀一次約 15 秒，改為快取 2 小時＋每小時由 time-driven trigger 預熱；含答案的私有模型另存一份 server-side 快取供改分使用，答案永不出現在 API 回應）：

```json
{ "ok": true, "type": "E", "title": "...", "subtitle": "工程發包類型承攬商專用版(ex 一般作業、高風險作業等)",
  "sections": [ { "title": "基本資料", "description": "...", "items": [
      { "id": "<itemId>", "kind": "text|date|radio|checkbox|video|image|header",
        "title": "...", "help": "...", "required": true, "options": ["正確","錯誤"],
        "youtubeId": "8A8QaiF10XM", "graded": true, "role": "consent|taxId|nationalId|name|company|watchDate|gate|quiz|other" } ] } ] }
```

- 每遇到一個 page break 就切成一個 section，前端的每個 section 就是精靈的一步
- **回應裡絕對不能出現正確答案或配分**。`graded` 只表示「這題計分」
- `role` 由後端依題目標題判斷，供前端驗證與後端寫登記表使用：
  - 含「個人資料提供同意書」→ `consent`
  - 含「統編」→ `taxId`
  - 含「身分證」→ `nationalId`
  - 含「姓名」→ `name`
  - 含「公司名稱」→ `company`
  - 日期題 → `watchDate`
  - 不計分且選項恰好是「是／否」的單選 → `gate`
  - 計分題 → `quiz`
  - 判斷不出來的必要角色（consent、taxId、nationalId、name、company）要讓 `form` 回 `error:"form_misconfigured"` 並寫 log，不要默默猜
- **影片**：`FormApp` 的 VideoItem 可能拿不到 YouTube ID。先查證；拿不到的話，改用 `UrlFetchApp` 抓表單的公開 viewform（`form.getPublishedUrl()`），解析 `FB_PUBLIC_LOAD_DATA_`，依 item id 對應影片。公開資料的 item 是 `[itemId, title, help, type, ...]`，影片的 type 是 `12`，YouTube ID 在 `item[6][3]`
- 圖片題（表單頂端的「○○類型承攬商專用版」）只取標題當作 `subtitle`，不傳圖片

### `POST {action:"submit", type, answers:{<itemId>: value}}`

後端逐項檢查，任何一項不過就回錯誤、**不送出、不寫登記表**：

1. 必填都有填；consent 已勾
2. `nationalId`：用附錄 B 的規則驗證（本國身分證，或新式／舊式居留證）
3. `taxId`：8 碼統一編號檢查碼（現行規則：加權和可被 5 整除；第 7 碼是 7 時有特例）
4. `watchDate`：不可晚於今天（UTC+8）
5. 所有 `gate` 題都必須是「是」；不是的話回 `error:"gate"`
6. 計分題逐題比對 `FormApp` 的正確答案；有錯的話回 `{ok:false, error:"quiz", wrong:[itemId...]}`，前端在原位標出答錯的題目

全部通過後：

1. 用 `LockService` 鎖住，避免同時送出時發出重複的流水號
2. 用 `form.createResponse()` 加上每題的 `createResponse(...)`，再 `.submit()` 代送到表單
3. 產生證號，寫一列到登記表（欄位見下方）
4. 回傳 `{ok:true, cert:{certNo, token, type, company, name, maskedId, issuedAt, expiresOn, status:"valid"}}`

### `POST {action:"lookup", idNo, name}`

- 正規化：身分證字號 trim 後轉大寫；姓名做 NFKC 正規化、移除所有空白、英文轉大寫
- 用 `HMAC-SHA256(HMAC_SECRET, idNo + "\n" + name)` 比對登記表的「查詢雜湊」欄
- 每種類型只回最新一筆（依發證時間），附上即時狀態 `valid|expired|revoked` 和 token
- 查不到時回 `{ok:true, certs:[]}`。前端統一顯示「查無資料」，不區分是身分證錯還是姓名錯
- 限流：同一個身分證字號的雜湊在 15 分鐘內失敗 5 次，就回 `error:"too_many_attempts"`（用 `CacheService` 計數）

### `GET ?action=verify&cert=<certNo>&token=<token>`

> 2026-10-14 實測修正：Apps Script web app 保留 `c` 與 `sid` 參數名，帶 `c` 會直接回 400 HTML。API 參數改用 `cert`／`token`；`badge.html` 網址的 fragment 仍用 `#c=&t=`（不送到伺服器，不受影響）。

- `token = base64url(HMAC-SHA256(HMAC_SECRET, certNo))` 的前 16 字元。證號是流水號、可以被猜，靠 token 擋掉逐號掃描
- token 不對 → `error:"invalid"`
- token 正確 → 回傳與 submit 相同形狀的 `cert`，`status` 依當下的日期與作廢欄位計算

### 登記表欄位

`證號 | 類型 | 公司統編 | 公司名稱 | 姓名 | 身分證(遮蔽) | 查詢雜湊 | 發證時間 | 有效期限 | 表單回應ID | 作廢 | 作廢原因`

- 遮蔽格式沿用舊版：`A12****789`
- 「類型」寫中文：「工程發包」或「勞務」
- 時間一律以 UTC+8 計算並寫入

## 前端

- 不要 build step、不要 framework、不要 package manager 依賴；GitHub Pages 直接提供靜態檔
- `config.js` 只放 `API_URL`，預設值是明顯的佔位字串，前端偵測到時顯示「尚未設定後端」
- `training.html?type=E|S`：開頁先打 `form` API，載入中顯示提示，失敗時顯示可重試的錯誤；把 sections 渲染成精靈步驟，沿用舊版 `index.html` 的視覺風格和行為：
  - 第一步在 consent 題上方顯示附錄 A 的同意書全文；**勾選 consent 之前，同一步的其他欄位一律 disabled**，也不能進下一步
  - `gate` 題選「否」時擋住，不能進下一步，並顯示提醒（同舊版）
  - 前端先做格式驗證（身分證、統編、日期）來改善體驗，但後端一定要再驗一次
  - 測驗送出後若有錯，標出答錯的題號，讓使用者改到全對
  - 網路錯誤或 API 錯誤**絕對不能**顯示成功
  - 影片用 YouTube embed，並保留「點 YouTube 字樣到 YouTube 網頁放大觀看」的說明
- 成功畫面：顯示電子訓練合格證明卡、大 QR，以及開啟／下載 PNG／列印三顆按鈕（沿用 `badge.js` 的做法）。QR 內容是 `badge.html#c=<certNo>&t=<token>`，網址不帶任何個資
- `lookup.html`：輸入身分證字號＋姓名（前端先驗證身分證格式）；每筆結果顯示證明卡與狀態，並附開啟連結
- `badge.html`：從 fragment 讀 `c`、`t`，打 `verify` API，即時顯示「有效／已過期／已作廢」
- `badge.js`：
  - 拿掉 URL payload 編碼（`encode`、`decode`、`fnv1a`、`KEY`）
  - 有效期改成 1 年
  - 字樣改成「電子訓練合格證明」
  - 依類型換主色，並在證上標示「工程發包類」或「勞務類」
  - 工程類用現行的 Realtek 藍 `#0078AF`（白字）；勞務類主色 `#34ebb7`（2026-10-14 使用者指定，取代原本的紫色；亮色底改用深色字，文字對比要 ≥ 4.5:1）
  - 匯出 PNG 時不顯示綠色的「有效」標記，這條規則沿用舊版；「已作廢」和「已過期」要顯示，因為這兩種狀態不會變回有效
- 版面在 375px 寬的手機上不能出現水平捲動

## 附錄 A：個資同意書全文（前端照抄，不要改字）

> 蒐集個人資料告知事項暨個人資料提供同意書
>
> 瑞昱半導體股份有限公司（以下稱「本公司」）為遵守個人資料保護法之規定，於您透過本承攬商線上安全衛生教育訓練系統提供個人資料予本公司時，依法告知下列事項：
>
> **一、蒐集目的**
> 本公司為遵循法律規定及因承攬商入廠資格審核、承攬商管理、「承攬商危害告知合格證」製作、「電子訓練合格證明」之製作及查詢及其他災害應變相關事宜等特定目的，會蒐集、處理及利用包含但不限於下列您的個人資料：姓名、性別、出生日期、血型、身分證字號以及身分證、勞保、意外險保單之複本等或其他得以直接或間接識別您個人之資料。
>
> **二、合法使用**
> 本公司將依個人資料保護法、相關法令之規定及本公司隱私權保護政策，妥善蒐集、處理及利用您的個人資料。
>
> **三、個人資料利用之期間、地區、對象及方式**
> 期間：個人資料保存期間，應依相關法令或契約約定之保存年限或本公司因執行業務所需之合理保存期間。
> 地區：本國、分子公司所在地、關係企業所在地或因特定目的之履行而需收到您個人資料之接收者所在地。
> 對象：本公司、本公司之分子公司、關係企業以及為履行特定目的而需取得您個人資料以使該特定目的得以履行之接受者。
> 使用方式：以自動化機器或其他非自動化之利用方式。
>
> **四、您可依個人資料保護法第三條規定，就您的個人資料向本公司行使以下所列權利：**
> 1. 查詢或請求閱覽。
> 2. 請求製給複製本。
> 3. 請求補充或更正。
> 4. 請求停止蒐集、處理或利用。
> 5. 請求刪除。
>
> 如您因行使上述權利而導致對您的權益產生減損時，本公司不負相關賠償責任。
>
> 請務必提供正確之個人資料，否則本公司將無法據以履行該特定目的之相關業務。
>
> 如本公司因業務需要而需委託其他機關處理您的個人資料時，將善盡監督之責，以確保您個人資料之安全。
>
> 您已充分知悉本公司上述告知事項並同意本公司得蒐集、處理、利用及國際傳輸本人之個人資料。

勾選框本身來自表單的 consent 題，不寫在同意書全文裡。

## 附錄 B：身分證字號驗證

接受下列三種格式，英文字母一律轉大寫後再驗證：

- 本國身分證：`^[A-Z][12]\d{8}$`
- 新式統一證號（2021 起的居留證）：`^[A-Z][89]\d{8}$`。檢查碼算法與身分證相同
- 舊式居留證：`^[A-Z][A-D]\d{8}$`。第 2 碼字母換算成數字後取個位數，再套用身分證的檢查碼算法

身分證檢查碼算法：首字母對照表為 `A=10 B=11 C=12 D=13 E=14 F=15 G=16 H=17 I=34 J=18 K=19 L=20 M=21 N=22 O=35 P=23 Q=24 R=25 S=26 T=27 U=28 V=29 W=32 X=30 Y=31 Z=33`。把首字母換成兩位數 `n1 n2` 後，計算 `n1*1 + n2*9 + d1*8 + d2*7 + ... + d7*2 + d8*1 + checkDigit`，總和可以被 10 整除就是合法。

## 已知限制

- 是非題用暴力猜也試得出來，後端改分只能讓答案不出現在原始碼裡，擋不住重複作答
- Apps Script 的 web app 回應約需 1–3 秒，前端都要有載入狀態
