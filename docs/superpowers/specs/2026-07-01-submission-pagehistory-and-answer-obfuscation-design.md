# 送出修正（pageHistory）與測驗答案隱藏 — 設計文件

日期：2026-07-01

## 背景與動機

這份文件承接 `2026-07-01-safety-training-form-rebuild-design.md`，處理重建後實測發現的兩個問題。

### 問題一：radio 題全部沒進試算表

實測提交後，基本資料（公司／姓名／身分證，皆為**短答題**）有進 Google 試算表，但**所有 radio 題**（是否已閱讀 `entry.1650749467`、同意文件 `entry.1104087735`、10 題測驗）全空。

除錯過程（已驗證）：

1. 重抓副本表單結構，比對 entry ID 與選項 value → 與 `index.html` **完全一致**，排除 ID 錯誤。
2. 假設是編碼問題（multipart vs urlencoded），送兩筆對照測試 `ZZ-MULTIPART`、`ZZ-URLENCODED` → **兩筆 radio 都沒進**，推翻此假設。
3. 關鍵認知：這是**多頁表單**（步驟 1 基本資料 / 步驟 2 教材 / 步驟 3 測驗，中間有 section 分頁）。短答在第 1 頁（有進），radio 全在第 2、3 頁（沒進）。Google Forms 直接 POST 分頁表單時，必須帶 `pageHistory` 告訴伺服器使用者走過所有頁，否則只接受第 1 頁欄位、後面頁**靜默丟棄仍回 HTTP 200**。
4. 送一筆 `ZZ-PAGEHIST`（urlencoded + `pageHistory=0,1,2` + `fvv=1`）→ 使用者確認 **radio 有值**。**根因確認：多頁表單缺 `pageHistory`。**

### 問題二：測驗答案在 view-source 一眼可見

`index.html` 的 `QUIZ` 陣列把每題正確答案以**明碼**存放（`answer: 'O'`、`'兩公尺'`、`'無需取得動火作業核准'` 等），任何人 view-source 就能直接看到全部答案。使用者要求「不要讓人一眼就看到答案」。

## 需求與限制

- 這是**純靜態前端**單一 `index.html`，無後端、無 build step。評分邏輯必然在瀏覽器執行，因此答案或還原方法終究在檔案內——**無法對抗刻意破解者**。
- 威脅模型是「一般承攬商」：目標僅為**擋掉 view-source 一眼看到答案**，不是密碼學等級安全。
- 送出的 UI／流程／「答錯題號」顯示等**外部行為完全不變**，只改內部機制。

## 設計

### 一、送出改為 urlencoded + pageHistory + fvv

改動位置：`index.html` submit handler 內組資料與送出那段（現為 `new FormData()` + `fetch(..., { body: data })`）。

- 把 `FormData` 改為 `URLSearchParams`（送出即 `application/x-www-form-urlencoded`）。所有 `entry.<id>` 欄位（含短答、日期 `_year/_month/_day`、兩個確認 radio、10 題測驗）沿用原本的 append，鍵名不變。
- 額外附上兩個 Google Forms 分頁提交參數：
  - `pageHistory` = `0,1,2`（本表單 3 頁）
  - `fvv` = `1`
- `fetch` 仍用 `method: 'POST', mode: 'no-cors'`；因 `URLSearchParams` 當 body 時瀏覽器會自動帶 `Content-Type: application/x-www-form-urlencoded`，不需手動設 header。
- 網路失敗的 try/catch 錯誤處理維持原樣。

### 二、測驗答案改用 salted XOR + base64 隱藏

不再於 `QUIZ` 陣列存明碼答案，改存**混淆後字串**，載入時解回、評分時比對。

- 定義一個固定字串 `ANSWER_KEY`（存在檔案內，僅作混淆用途，非機密）。
- **每題加一段隨機 salt（4 bytes）**：決定性混淆（同明碼→同密文）會洩漏「哪些題答案相同」，對 O/X 題等於把猜測範圍砍半。每題產生獨立 salt，讓相同答案也產生不同密文，連「哪幾題同答案」都看不出來。
- 混淆格式：`base64( salt(4 bytes) || (UTF-8(answer) 逐 byte XOR ANSWER_KEY 循環 XOR salt 循環) )`。
- 新增純函式 `deobfuscate(enc)`：`base64 decode → 取前 4 bytes 為 salt、其餘為 body → body 逐 byte XOR ANSWER_KEY 循環 XOR salt 循環 → TextDecoder 還原 UTF-8`。以 `TextEncoder`/`TextDecoder` 處理中文，避免 `atob` 對非 Latin1 字元出錯。
- `QUIZ` 每題的 `answer` 改為 `enc`（混淆字串）。評分時 `getRadioValue(q.id) !== deobfuscate(q.enc)`。
- 殘留洩漏：答案**長度**仍會反映在密文長度上（同長度答案密文等長），但這比「相同字串一眼看出」隱晦得多，對「一般人」威脅模型可接受，不額外做定長 padding。
- 對稱的 `obfuscate()` 僅供產生 `enc` 值時使用，**不需**留在正式檔案裡（可用 node 一次性算出後把結果貼進 `QUIZ`）。決策：正式 `index.html` **只保留 `deobfuscate`**，讓檔案裡沒有「把明碼變成 enc」的痕跡；產生 enc 的腳本另外跑、不入庫。
- 正確答案（明碼，供產生 enc 對照，實作後即從此文件外的地方移除）：
  Q1=O、Q2=X、Q3=O、Q4=O、Q5=O、Q6=兩公尺、Q7=以上皆是、Q8=以上皆是、Q9=以上皆是、Q10=無需取得動火作業核准。

## 驗證方式

- **送出**：本機開頁走完 3 步驟送出，到副本 Google 試算表確認基本資料 **與** 所有 radio（含 10 題測驗）都有值。確認後刪除測試列（含先前 `ZZ-*`、`Winnie test`）。
- **答案隱藏**：view-source / 搜尋檔案內容，確認找不到 `兩公尺`、`無需取得動火作業核准`、`以上皆是` 等明碼答案字串；並實測全對→顯示「100 分 通過」、故意答錯→正確列出答錯題號，確認評分邏輯不變。

## 影響範圍

僅 `index.html`（submit handler 組資料段 + `QUIZ` 定義 + 新增 `deobfuscate`）。無其他檔案。README／CLAUDE.md 是否需同步更新待確認（CLAUDE.md 目前描述送出用 `FormData`，實作後會與事實不符）。
