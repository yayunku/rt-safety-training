# 承攬商安全訓練表單重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把單一 `index.html` 重建為 3 步驟精靈式的承攬商安全衛生教育訓練表單，送出後資料進入指定 Google 表單副本後台。

**Architecture:** 純靜態單一 HTML 檔案（無 build、無後端、無測試框架）。頁面是「別人 Google 表單的前端 client」：用自訂 HTML/CSS 重現表單欄位，送出時以 `fetch(FORM_ENDPOINT, {method:'POST', mode:'no-cors', body:FormData})` 把 `entry.<id>` 鍵值直接 POST 到表單副本的 `formResponse` 端點。三個步驟以 JS 切換顯示（同一頁面不同 panel），不是分頁載入。

**Tech Stack:** HTML5、原生 CSS（沿用現有 `--blue`/`--amber` 變數系統）、原生 JavaScript（無框架、無套件）。

## Global Constraints

- 產出必須是**單一 `index.html`**，不得引入 build 工具、套件管理、外部 JS 檔或後端服務。
- 送出端點固定為表單副本：`FORM_ENDPOINT = 'https://docs.google.com/forms/d/e/1FAIpQLSedurwcoMq870khCe3e70xt-5zJQh85dVnoFzNT0KpbWHS4OA/formResponse'`（已實測 POST 回 HTTP 200）。**不得**使用舊的原表單端點 `...1FAIpQLSdbQGt1HYMtBycUR5vJHeFURFYtowakF...`。
- 所有欄位 `name` 必須精確等於下列 entry ID（複製表單保留原 ID，已驗證）：
  - 承攬商名稱 `entry.1281327973`、姓名 `entry.185951546`、身分證 `entry.293336872`
  - 觀看日期 `entry.715793541_year` / `_month` / `_day`
  - 是否已閱讀 `entry.1650749467`（值：`是`/`否`）、同意文件 `entry.1104087735`（值：`同意`/`不同意`）
  - 測驗 Q1 `entry.125731587`、Q2 `entry.1103177906`、Q3 `entry.1514744174`、Q4 `entry.1544188210`、Q5 `entry.981799889`、Q6 `entry.1296077385`、Q7 `entry.1813206164`、Q8 `entry.632043508`、Q9 `entry.1466794690`、Q10 `entry.532185394`
- 測驗正確答案（key）：Q1=`O`、Q2=`X`、Q3=`O`、Q4=`O`、Q5=`O`、Q6=`兩公尺`、Q7=`以上皆是`、Q8=`以上皆是`、Q9=`以上皆是`、Q10=`無需取得動火作業核准`。
- 測驗評分**不阻擋送出**：答錯照樣送出到 Google 表單，只在送出後的完成畫面顯示答對題數與答錯題號。
- 步驟 2 的 gating：「是否已閱讀」選 `否`、或「同意文件」選 `不同意`，則**禁止進入步驟 3**（下一步按鈕停用並顯示提醒）。
- 送出用的選項 `value` 必須是 Google 表單的完整原文（例如各題「以上皆是」的 value 就是 `以上皆是`），畫面顯示標籤可縮短，但 `value` 不可改。
- 視覺沿用現有「藍 + 琥珀」工業安全風格（`--blue:#1E5CC8`、`--amber:#C47A00` 等既有變數），頁首含瑞昱 logo。
- 文案語言：介面繁體中文，程式碼/變數/註解英文。
- 沒有自動化測試框架，所有驗證為手動：用 `python3 -m http.server` 開啟頁面在瀏覽器操作，評分函式用瀏覽器 devtools console 驗證。

---

## File Structure

- **Modify (整份重寫):** `index.html` — 唯一產物，含 3 步驟 wizard 的 HTML/CSS/JS。
- **Modify:** `README.md` — 更新流程說明與表單副本資訊。
- **暫存（不進 git）:** logo 於 build 時下載並轉為 data URI 內嵌，來源 `https://companieslogo.com/img/orig/2379.TW-3cbb6e43.png?t=1720244490`。

因為現有 codebase 慣例就是單一大 HTML 檔，本計畫延續此結構、不拆檔。任務按「wizard 骨架 → 各步驟內容 → 送出/評分 → 文件」順序建構，每個任務結束時頁面都應可在瀏覽器開啟並手動驗證該階段行為。

---

## Task 1: Wizard 骨架 — head/CSS、logo、hero、progress、三個空步驟與導航

**Files:**
- Modify (整份覆寫): `index.html`

**Interfaces:**
- Produces（供後續任務使用）：
  - HTML 結構：`<form id="mainForm" novalidate>` 內含三個 `<section class="wizard-step" data-step="1|2|3">`，各含空的 `<div class="step-body">`（後續任務填入）與 `<div class="wizard-nav">`。
  - 全域 JS：`goToStep(n)`（切換顯示第 n 步、更新 progress、捲到頂）、`window.__currentStep`（目前步數）。
  - 每一步「下一步」按鈕呼叫 `attemptNext(fromStep)`（Task 2/3 會擴充其驗證邏輯；本任務先實作為無條件前進的版本）。
  - CSS class：`.wizard-step`（預設隱藏）、`.wizard-step.active`（顯示）、`.wizard-nav`、`.btn-next`、`.btn-prev`、`.btn-submit`、`.gate-warning`（預設隱藏）、`.brand-logo`。

- [ ] **Step 1: 下載 logo 並產生 data URI 字串**

Run:
```bash
curl -sL "https://companieslogo.com/img/orig/2379.TW-3cbb6e43.png?t=1720244490" \
  -o /tmp/logo.png -w "HTTP:%{http_code}\n"
python3 -c "import base64;print('data:image/png;base64,'+base64.b64encode(open('/tmp/logo.png','rb').read()).decode())" > /tmp/logo_datauri.txt
wc -c /tmp/logo_datauri.txt
```
Expected: `HTTP:200`，且 `logo_datauri.txt` 約 38KB。這個檔案內容（單行 `data:image/png;base64,...`）會在 Step 2 貼進 `<img class="brand-logo">` 的 `src`。

- [ ] **Step 2: 覆寫 `index.html` 為 wizard 骨架**

用下列內容整份覆寫 `index.html`。`<img class="brand-logo" src="__LOGO_DATA_URI__">` 的 `__LOGO_DATA_URI__` 要換成 Step 1 產生的 `logo_datauri.txt` 完整單行內容。

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>承攬商安全衛生教育訓練 — 瑞昱半導體</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:#F4F7FB; --surface:#FFFFFF; --surface-2:#EEF2F8; --border:#D5DDE9;
      --blue:#1E5CC8; --blue-light:#2D6FE0; --blue-dim:rgba(30,92,200,0.08);
      --amber:#C47A00; --amber-dim:rgba(196,122,0,0.08); --amber-glow:rgba(196,122,0,0.20);
      --red:#C0392B; --red-dim:rgba(192,57,43,0.08);
      --green:#1A7F4B; --green-dim:rgba(26,127,75,0.10);
      --text:#0E1A2E; --text-secondary:#4A607A; --text-muted:#8A9DB5;
      --cn:'Noto Sans TC',sans-serif; --en:'Inter',sans-serif;
      --radius:10px; --radius-sm:6px;
      --card-shadow:0 1px 3px rgba(14,26,46,0.06),0 4px 16px rgba(14,26,46,0.07);
    }
    html { scroll-behavior:smooth; }
    body { background:var(--bg); color:var(--text); font-family:var(--cn); font-size:16px; line-height:1.7; min-height:100vh; }

    /* NAV */
    .nav { position:sticky; top:0; z-index:100; background:rgba(244,247,251,0.92);
      backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
      border-bottom:1px solid var(--border); padding:0 40px; height:60px;
      display:flex; align-items:center; justify-content:space-between; }
    .nav-logo { display:flex; align-items:center; gap:12px; text-decoration:none; }
    .brand-logo { height:34px; width:auto; display:block; }
    .nav-wordmark { font-family:var(--en); font-size:14px; font-weight:600; letter-spacing:0.08em; color:var(--text); }
    .nav-badge { font-size:12px; color:var(--text-secondary); }

    /* HERO */
    .hero { position:relative; padding:72px 40px 40px; text-align:center; overflow:hidden; }
    .hero::before { content:''; position:absolute; inset:0;
      background-image:radial-gradient(circle at 0 0, rgba(196,122,0,0.22) 1.5px, transparent 0);
      background-size:36px 36px;
      mask-image:radial-gradient(ellipse 90% 100% at 50% 0%, black 20%, transparent 75%);
      -webkit-mask-image:radial-gradient(ellipse 90% 100% at 50% 0%, black 20%, transparent 75%); }
    .hero-content { position:relative; z-index:1; max-width:640px; margin:0 auto; }
    .hero-eyebrow { display:inline-flex; align-items:center; gap:8px; font-family:var(--en);
      font-size:11px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase;
      color:var(--amber); margin-bottom:20px; padding:6px 16px; border:1px solid var(--amber-glow);
      border-radius:100px; background:var(--amber-dim); }
    .eyebrow-dot { width:6px; height:6px; border-radius:50%; background:var(--amber); animation:blink 2.4s ease infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
    .hero-title { font-size:clamp(26px,4vw,42px); font-weight:700; line-height:1.2; color:var(--text); margin-bottom:8px; }
    .hero-title em { font-style:normal; color:var(--blue); }
    .hero-subtitle { font-family:var(--en); font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-secondary); margin-bottom:18px; }
    .hero-divider { width:44px; height:2px; background:var(--amber); margin:0 auto 16px; }
    .hero-desc { font-size:14px; color:var(--text-secondary); max-width:440px; margin:0 auto; }

    /* PROGRESS */
    .progress-row { display:flex; align-items:flex-start; justify-content:center; padding:8px 40px 0; max-width:640px; margin:0 auto 8px; }
    .progress-step { display:flex; flex-direction:column; align-items:center; gap:6px; flex:0 0 auto; width:96px; }
    .progress-dot { width:34px; height:34px; border-radius:50%; border:2px solid var(--border);
      background:var(--surface); display:flex; align-items:center; justify-content:center;
      font-family:var(--en); font-size:14px; font-weight:600; color:var(--text-muted); transition:all .2s; }
    .progress-dot.active { border-color:var(--blue); background:var(--blue); color:#fff; }
    .progress-dot.done { border-color:var(--green); background:var(--green); color:#fff; }
    .progress-label { font-size:11px; color:var(--text-secondary); white-space:nowrap; }
    .progress-line { flex:1; height:2px; background:var(--border); margin-top:17px; max-width:60px; }
    .progress-line.done { background:var(--green); }

    /* WIZARD */
    .form-wrap { max-width:720px; margin:0 auto; padding:24px 40px 96px; }
    .wizard-step { display:none; }
    .wizard-step.active { display:block; animation:fadeUp .35s ease; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    .step-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
      box-shadow:var(--card-shadow); overflow:hidden; }
    .step-header { display:flex; align-items:center; gap:14px; padding:20px 28px; border-bottom:1px solid var(--border); background:var(--surface-2); }
    .step-num { width:28px; height:28px; border-radius:50%; background:var(--blue); color:#fff;
      display:flex; align-items:center; justify-content:center; font-family:var(--en); font-size:12px; font-weight:600; flex-shrink:0; }
    .step-title-cn { font-size:15px; font-weight:700; color:var(--text); }
    .step-title-en { font-family:var(--en); font-size:11px; color:var(--text-secondary); }
    .step-body { padding:24px 28px 28px; }

    /* NAV BUTTONS */
    .wizard-nav { display:flex; gap:12px; justify-content:space-between; margin-top:20px; }
    .btn-prev, .btn-next, .btn-submit {
      padding:13px 26px; border-radius:var(--radius-sm); font-family:var(--cn); font-size:15px;
      font-weight:600; cursor:pointer; letter-spacing:0.04em; transition:background .15s, transform .1s; border:none; }
    .btn-prev { background:var(--surface); color:var(--text-secondary); border:1px solid var(--border); }
    .btn-prev:hover { background:var(--surface-2); }
    .btn-next, .btn-submit { background:var(--blue); color:#fff; margin-left:auto; }
    .btn-next:hover:not(:disabled), .btn-submit:hover:not(:disabled) { background:var(--blue-light); }
    .btn-next:active:not(:disabled), .btn-submit:active:not(:disabled) { transform:scale(0.99); }
    .btn-next:disabled, .btn-submit:disabled { background:var(--border); color:var(--text-muted); cursor:not-allowed; }

    .gate-warning { display:none; margin-top:14px; padding:12px 16px; border-radius:var(--radius-sm);
      background:var(--red-dim); border:1px solid rgba(192,57,43,0.3); color:var(--red); font-size:13px; }
    .gate-warning.show { display:block; }

    /* FIELDS (供 Task 2/3) */
    .field { margin-bottom:20px; }
    .field:last-child { margin-bottom:0; }
    .field-label { display:flex; align-items:baseline; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
    .label-cn { font-size:14px; font-weight:500; color:var(--text); }
    .label-en { font-family:var(--en); font-size:11px; color:var(--text-secondary); }
    .req { color:var(--amber); font-size:15px; line-height:1; }
    .field-hint { font-size:12px; color:var(--text-muted); margin-top:5px; font-family:var(--en); }
    input[type="text"], input[type="date"] { width:100%; background:var(--surface); border:1px solid var(--border);
      border-radius:var(--radius-sm); padding:11px 14px; font-family:var(--cn); font-size:15px; color:var(--text);
      outline:none; transition:border-color .15s, box-shadow .15s; -webkit-appearance:none; }
    input::placeholder { color:var(--text-muted); font-weight:400; }
    input:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(30,92,200,0.10); }
    input.err { border-color:var(--red); box-shadow:0 0 0 3px rgba(192,57,43,0.08); }
    .err-msg { display:none; color:var(--red); font-size:12px; margin-top:5px; }
    .err-msg.show { display:block; }

    /* VIDEO (供 Task 3) */
    .video-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; margin-bottom:24px; }
    .video-label { font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; font-family:var(--en); }
    .video-wrap { position:relative; width:100%; aspect-ratio:16/9; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border); }
    .video-wrap iframe { position:absolute; inset:0; width:100%; height:100%; border:none; }

    /* RADIO (供 Task 3/4) */
    .radio-group { display:flex; flex-direction:column; gap:8px; }
    .radio-group.inline { flex-direction:row; gap:12px; flex-wrap:wrap; }
    .radio-opt { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1.5px solid var(--border);
      border-radius:var(--radius-sm); cursor:pointer; transition:border-color .15s, background .15s; font-size:14px; color:var(--text); user-select:none; }
    .radio-opt:hover { border-color:var(--blue); background:var(--blue-dim); }
    .radio-opt input[type="radio"] { display:none; }
    .radio-dot { width:16px; height:16px; border-radius:50%; border:2px solid var(--border); background:var(--surface); flex-shrink:0; transition:border-color .15s; }
    .radio-opt input:checked ~ .radio-dot { border-color:var(--blue); border-width:5px; }
    .radio-opt:has(input:checked) { border-color:var(--blue); background:var(--blue-dim); color:var(--blue); }
    .radio-group.ox { flex-direction:row; gap:10px; }
    .radio-opt.ox-o:has(input:checked) { border-color:var(--green); background:var(--green-dim); color:var(--green); }
    .radio-opt.ox-o:has(input:checked) .radio-dot { border-color:var(--green); }
    .radio-opt.ox-x:has(input:checked) { border-color:var(--red); background:var(--red-dim); color:var(--red); }
    .radio-opt.ox-x:has(input:checked) .radio-dot { border-color:var(--red); }

    /* QUIZ (供 Task 4) */
    .quiz-q { margin-bottom:28px; }
    .quiz-q:last-child { margin-bottom:0; }
    .q-num { font-family:var(--en); font-size:11px; font-weight:600; color:var(--blue); margin-bottom:6px; letter-spacing:0.08em; }
    .q-text { font-size:14px; font-weight:500; color:var(--text); margin-bottom:12px; line-height:1.6; }
    .section-note { background:var(--amber-dim); border:1px solid var(--amber-glow); border-radius:var(--radius-sm);
      padding:12px 16px; font-size:13px; color:var(--amber); margin-bottom:24px; }
    .agree-card { background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px 18px; margin-bottom:16px; margin-top:20px; }
    .agree-title { font-size:13px; font-weight:600; color:var(--text); margin-bottom:8px; }
    .agree-body { font-size:13px; color:var(--text-secondary); line-height:1.65; }

    /* SUCCESS (供 Task 5) */
    .success-card { display:none; background:var(--surface); border:1px solid rgba(26,127,75,0.35);
      border-radius:var(--radius); padding:48px 32px; text-align:center; box-shadow:0 0 0 4px rgba(26,127,75,0.06); }
    .success-card.show { display:block; }
    .success-icon { width:64px; height:64px; background:var(--green-dim); border:1.5px solid rgba(26,127,75,0.35);
      border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 22px; font-size:28px; color:var(--green); }
    .success-title { font-size:22px; font-weight:700; color:var(--green); margin-bottom:10px; }
    .success-body { font-size:14px; color:var(--text-secondary); line-height:1.75; }
    .quiz-result { margin:22px auto 0; max-width:420px; text-align:left; background:var(--surface-2);
      border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px 18px; font-size:14px; }
    .quiz-result-score { font-weight:700; color:var(--text); margin-bottom:6px; }
    .quiz-result-wrong { color:var(--red); font-size:13px; }
    .quiz-result-perfect { color:var(--green); font-size:13px; }

    footer { border-top:1px solid var(--border); padding:24px 40px; text-align:center; font-family:var(--en); font-size:11px; color:var(--text-muted); line-height:1.8; }

    @media (max-width:600px) {
      .nav { padding:0 20px; } .nav-badge { display:none; }
      .hero { padding:52px 20px 32px; }
      .progress-row { padding:8px 12px 0; }
      .progress-step { width:auto; flex:1; }
      .form-wrap { padding:20px 16px 72px; }
      .step-header { padding:16px 20px; } .step-body { padding:18px 20px 22px; }
      .video-grid { grid-template-columns:1fr; }
      .radio-group.ox { flex-direction:column; }
      .wizard-nav { flex-direction:column-reverse; }
      .btn-next, .btn-submit { margin-left:0; width:100%; } .btn-prev { width:100%; }
    }
    @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }
  </style>
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="#">
    <img class="brand-logo" src="__LOGO_DATA_URI__" alt="Realtek Semiconductor" />
    <span class="nav-wordmark">REALTEK</span>
  </a>
  <span class="nav-badge">承攬商安全衛生教育訓練</span>
</nav>

<section class="hero">
  <div class="hero-content">
    <div class="hero-eyebrow"><span class="eyebrow-dot"></span>Safety &amp; Health Training</div>
    <h1 class="hero-title">瑞昱承攬商<br><em>線上安全衛生</em>教育訓練</h1>
    <p class="hero-subtitle">Realtek Semiconductor — Contractor Onboarding</p>
    <div class="hero-divider"></div>
    <p class="hero-desc">入廠的承攬商，以人為單位，一人填寫一份。<br>請依序完成基本資料、觀看訓練教材、完成測驗後送出。</p>
  </div>
</section>

<div class="progress-row">
  <div class="progress-step"><div class="progress-dot active" id="dot-1">1</div><div class="progress-label">基本資料</div></div>
  <div class="progress-line" id="line-1"></div>
  <div class="progress-step"><div class="progress-dot" id="dot-2">2</div><div class="progress-label">訓練教材</div></div>
  <div class="progress-line" id="line-2"></div>
  <div class="progress-step"><div class="progress-dot" id="dot-3">3</div><div class="progress-label">訓練測驗</div></div>
</div>

<form id="mainForm" novalidate>
<div class="form-wrap">

  <!-- STEP 1 -->
  <section class="wizard-step active" data-step="1">
    <div class="step-card">
      <div class="step-header"><div class="step-num">1</div>
        <div><div class="step-title-cn">基本資料</div><div class="step-title-en">Personal Information</div></div>
      </div>
      <div class="step-body" id="body-1">
        <!-- Task 2 填入 -->
      </div>
    </div>
    <div class="wizard-nav">
      <button type="button" class="btn-next" onclick="attemptNext(1)">下一步 →</button>
    </div>
  </section>

  <!-- STEP 2 -->
  <section class="wizard-step" data-step="2">
    <div class="step-card">
      <div class="step-header"><div class="step-num">2</div>
        <div><div class="step-title-cn">訓練教材</div><div class="step-title-en">Training Materials</div></div>
      </div>
      <div class="step-body" id="body-2">
        <!-- Task 3 填入 -->
      </div>
    </div>
    <div class="gate-warning" id="gate-2"></div>
    <div class="wizard-nav">
      <button type="button" class="btn-prev" onclick="goToStep(1)">← 上一步</button>
      <button type="button" class="btn-next" onclick="attemptNext(2)">下一步 →</button>
    </div>
  </section>

  <!-- STEP 3 -->
  <section class="wizard-step" data-step="3">
    <div class="step-card">
      <div class="step-header"><div class="step-num">3</div>
        <div><div class="step-title-cn">訓練測驗</div><div class="step-title-en">Safety Knowledge Test</div></div>
      </div>
      <div class="step-body" id="body-3">
        <!-- Task 4 填入 -->
      </div>
    </div>
    <div class="gate-warning" id="gate-3"></div>
    <div class="wizard-nav">
      <button type="button" class="btn-prev" onclick="goToStep(2)">← 上一步</button>
      <button type="submit" class="btn-submit" id="submitBtn">送出訓練登記 →</button>
    </div>
  </section>

  <!-- SUCCESS -->
  <div class="success-card" id="successCard">
    <div class="success-icon">✓</div>
    <div class="success-title">登記完成</div>
    <div class="success-body">
      感謝您完成安全衛生教育訓練登記。<br>您的資料已成功送入系統，請保留此頁面作為紀錄。
    </div>
    <div class="quiz-result" id="quizResult"></div>
  </div>

</div>
</form>

<footer>
  <p>© 2026 Realtek Semiconductor Corp. &nbsp;瑞昱半導體股份有限公司</p>
  <p>Safety &amp; Health Department · 安全衛生部門</p>
</footer>

<script>
  window.__currentStep = 1;

  function goToStep(n) {
    document.querySelectorAll('.wizard-step').forEach(s => {
      s.classList.toggle('active', Number(s.dataset.step) === n);
    });
    for (let i = 1; i <= 3; i++) {
      const dot = document.getElementById('dot-' + i);
      dot.classList.toggle('active', i === n);
      dot.classList.toggle('done', i < n);
      dot.textContent = i < n ? '✓' : String(i);
    }
    for (let i = 1; i <= 2; i++) {
      document.getElementById('line-' + i).classList.toggle('done', i < n);
    }
    window.__currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Task 2/3 會覆寫這個函式以加入各步驟驗證；先實作為無條件前進
  function attemptNext(fromStep) {
    goToStep(fromStep + 1);
  }
</script>
</body>
</html>
```

- [ ] **Step 3: 手動驗證 wizard 骨架**

Run: `cd /home/winnieku/repos/safety-training-form && python3 -m http.server 8000`（背景執行），在瀏覽器開 `http://localhost:8000/index.html`。
Expected 觀察點：
- 頁首左上顯示瑞昱 logo 圖片（非文字方塊）與 REALTEK 字樣。
- 進度列三顆點，第 1 顆藍色 active。
- 只看到步驟 1 卡片；點「下一步」→ 顯示步驟 2、進度第 1 顆變綠打勾、第 2 顆變藍；再「下一步」→ 步驟 3；「上一步」可返回。
- 頁面無 console 錯誤。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: rebuild form as 3-step wizard skeleton with Realtek logo"
```

---

## Task 2: 步驟 1 基本資料欄位與驗證

**Files:**
- Modify: `index.html`（填入 `#body-1`；擴充 `<script>` 內的驗證邏輯）

**Interfaces:**
- Consumes: Task 1 的 `goToStep(n)`、`attemptNext(fromStep)`、`#body-1`。
- Produces:
  - 欄位 id：`#f-company`（`entry.1281327973`）、`#f-name`（`entry.185951546`）、`#f-id`（`entry.293336872`）。
  - JS 函式 `validateStep1()` → 回傳 `boolean`（全部合法才 true，並就地標紅錯誤欄位）。
  - `ID_RE = /^[A-Za-z][0-9]{9}$/`（身分證格式）。

- [ ] **Step 1: 填入步驟 1 欄位 HTML**

把下列內容放入 `index.html` 的 `<div class="step-body" id="body-1">` 內（取代 `<!-- Task 2 填入 -->` 註解）：

```html
<div class="field">
  <div class="field-label"><span class="label-cn">承攬商名稱</span><span class="label-en">Contractor Company</span><span class="req">＊</span></div>
  <input type="text" id="f-company" name="entry.1281327973" placeholder="請填寫公司全稱" />
  <div class="field-hint">Example: ○○工程有限公司（請填寫公司全稱）</div>
  <div class="err-msg" id="err-company">請填寫承攬商名稱</div>
</div>
<div class="field">
  <div class="field-label"><span class="label-cn">訓練人員姓名</span><span class="label-en">Trainee Name</span><span class="req">＊</span></div>
  <input type="text" id="f-name" name="entry.185951546" placeholder="請填寫中文姓名" autocomplete="name" />
  <div class="err-msg" id="err-name">請填寫訓練人員姓名</div>
</div>
<div class="field">
  <div class="field-label"><span class="label-cn">訓練人員身分證字號</span><span class="label-en">National ID Number</span><span class="req">＊</span></div>
  <input type="text" id="f-id" name="entry.293336872" placeholder="A123456789" maxlength="10" />
  <div class="field-hint">Format: 1 letter + 9 digits ·  格式：首碼英文字母 + 9 碼數字</div>
  <div class="err-msg" id="err-id">身分證字號格式不正確（1 碼英文字母 + 9 碼數字）</div>
</div>
```

- [ ] **Step 2: 加入 Step 1 驗證邏輯，並讓 `attemptNext` 使用它**

在 `<script>` 內（`attemptNext` 定義之前）新增：

```js
const ID_RE = /^[A-Za-z][0-9]{9}$/;

function setFieldErr(inputId, errId, hasErr) {
  document.getElementById(inputId).classList.toggle('err', hasErr);
  document.getElementById(errId).classList.toggle('show', hasErr);
}

function validateStep1() {
  const company = document.getElementById('f-company');
  const name    = document.getElementById('f-name');
  const idNum   = document.getElementById('f-id');
  const eCompany = !company.value.trim();
  const eName    = !name.value.trim();
  const eId      = !ID_RE.test(idNum.value.trim());
  setFieldErr('f-company', 'err-company', eCompany);
  setFieldErr('f-name', 'err-name', eName);
  setFieldErr('f-id', 'err-id', eId);
  return !(eCompany || eName || eId);
}

// 輸入時清除該欄錯誤
['f-company','f-name','f-id'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    this.classList.remove('err');
    const em = this.parentElement.querySelector('.err-msg');
    if (em) em.classList.remove('show');
  });
});
```

把 Task 1 的 `attemptNext` 替換為含 step 1 驗證的版本：

```js
function attemptNext(fromStep) {
  if (fromStep === 1 && !validateStep1()) return;
  goToStep(fromStep + 1);
}
```

- [ ] **Step 3: 手動驗證**

重整 `http://localhost:8000/index.html`。
Expected：
- 步驟 1 三欄空白時點「下一步」→ 不前進，三欄標紅並顯示錯誤訊息。
- 身分證輸入 `abc` → 仍標紅；輸入 `A123456789` 且公司/姓名有值 → 點「下一步」成功進入步驟 2。
- 在標紅欄位重新輸入時，紅框與錯誤訊息即時消失。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add step 1 personal info fields with validation"
```

---

## Task 3: 步驟 2 訓練教材、影片、觀看日期與 gating

**Files:**
- Modify: `index.html`（填入 `#body-2`；擴充 `attemptNext`）

**Interfaces:**
- Consumes: Task 2 的 `attemptNext`、`#gate-2`、`goToStep`。
- Produces:
  - 欄位：`#f-date`（觀看日期）、radio `entry.1650749467`（是/否）、radio `entry.1104087735`（同意/不同意）。
  - JS 函式 `validateStep2()` → `boolean`：日期必填、兩題必選；且「是否已閱讀」須為 `是`、「同意文件」須為 `同意`，否則於 `#gate-2` 顯示對應提醒並回傳 false。

- [ ] **Step 1: 填入步驟 2 HTML**

把下列內容放入 `#body-2`（取代 `<!-- Task 3 填入 -->`）。5 部影片 YouTube ID 依序為 `xQS0sywd4ho`、`pC4ODmiem40`、`KrmyCzlHVN4`、`EHC3t3jcIFo`、`Kb4j0zdT4pk`：

```html
<div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px;">
  請點影片右下角 <strong>YouTube</strong> 字體，進入 YouTube 網頁版即可放大觀看。請依序完整觀看全部 5 部影片。
</div>
<div class="video-grid">
  <div class="video-item"><div class="video-label">Part 1 / 5</div>
    <div class="video-wrap"><iframe src="https://www.youtube.com/embed/xQS0sywd4ho" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>
  <div class="video-item"><div class="video-label">Part 2 / 5</div>
    <div class="video-wrap"><iframe src="https://www.youtube.com/embed/pC4ODmiem40" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>
  <div class="video-item"><div class="video-label">Part 3 / 5</div>
    <div class="video-wrap"><iframe src="https://www.youtube.com/embed/KrmyCzlHVN4" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>
  <div class="video-item"><div class="video-label">Part 4 / 5</div>
    <div class="video-wrap"><iframe src="https://www.youtube.com/embed/EHC3t3jcIFo" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>
  <div class="video-item"><div class="video-label">Part 5 / 5</div>
    <div class="video-wrap"><iframe src="https://www.youtube.com/embed/Kb4j0zdT4pk" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>
</div>

<div class="field">
  <div class="field-label"><span class="label-cn">觀看訓練教材日期</span><span class="label-en">Date of Training</span><span class="req">＊</span></div>
  <input type="date" id="f-date" />
  <div class="err-msg" id="err-date">請選擇觀看訓練教材日期</div>
</div>

<div class="field" style="margin-top:24px;">
  <div class="field-label"><span class="label-cn">是否已確實且完整觀看【瑞昱承攬商線上教育訓練教材 1/5 – 5/5】</span><span class="req">＊</span></div>
  <div class="radio-group inline" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.1650749467" value="是" /><span class="radio-dot"></span>是</label>
    <label class="radio-opt"><input type="radio" name="entry.1650749467" value="否" /><span class="radio-dot"></span>否</label>
  </div>
</div>

<div class="agree-card">
  <div class="agree-title">文件準備聲明</div>
  <div class="agree-body">入廠人員同意準備以下文件，供瑞昱人員或主管機關可隨時抽查：<br>
    1. 有效勞工保險資格<br>
    2. 有效意外責任險或相關雇主責任險等 300 萬元（含）以上之保險證明<br>
    3. 三年內 6 小時安全衛生教育訓練證明<br>
    4. 法定人員或設備有效合格證照
  </div>
</div>
<div class="field">
  <div class="field-label"><span class="label-cn">您是否同意？</span><span class="req">＊</span></div>
  <div class="radio-group inline" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.1104087735" value="同意" /><span class="radio-dot"></span>同意</label>
    <label class="radio-opt"><input type="radio" name="entry.1104087735" value="不同意" /><span class="radio-dot"></span>不同意</label>
  </div>
</div>
```

- [ ] **Step 2: 加入 Step 2 驗證 + gating，並擴充 `attemptNext`**

在 `<script>` 內新增：

```js
function getRadioValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function validateStep2() {
  const gate = document.getElementById('gate-2');
  gate.classList.remove('show');
  gate.textContent = '';

  const date = document.getElementById('f-date');
  const eDate = !date.value;
  document.getElementById('err-date').classList.toggle('show', eDate);
  date.classList.toggle('err', eDate);

  const read  = getRadioValue('entry.1650749467');
  const agree = getRadioValue('entry.1104087735');

  // 必選檢查
  if (eDate || !read || !agree) {
    if (!read || !agree) {
      gate.textContent = '請完成觀看確認與文件準備聲明後再繼續。';
      gate.classList.add('show');
    }
    return false;
  }

  // gating：否 / 不同意 擋住
  if (read === '否') {
    gate.textContent = '您必須確實且完整觀看全部訓練教材後，選擇「是」才能繼續進行測驗。';
    gate.classList.add('show');
    return false;
  }
  if (agree === '不同意') {
    gate.textContent = '您必須同意準備相關文件供查核，才能繼續進行測驗。';
    gate.classList.add('show');
    return false;
  }
  return true;
}

// 選日期時清除錯誤
document.getElementById('f-date').addEventListener('input', function () {
  this.classList.remove('err');
  document.getElementById('err-date').classList.remove('show');
});
```

把 `attemptNext` 再次替換為：

```js
function attemptNext(fromStep) {
  if (fromStep === 1 && !validateStep1()) return;
  if (fromStep === 2 && !validateStep2()) return;
  goToStep(fromStep + 1);
}
```

- [ ] **Step 3: 手動驗證**

重整頁面，走到步驟 2。
Expected：
- 5 部影片皆可播放（縮圖/播放器出現）。
- 日期空、或兩題未選 → 點「下一步」不前進並提示。
- 「是否已閱讀」選「否」→ 顯示紅色提醒、不前進；改選「是」後可前進（前提是同意也為「同意」、日期已填）。
- 「同意文件」選「不同意」→ 顯示紅色提醒、不前進；改選「同意」後可前進。
- 全部正確 → 進入步驟 3。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add step 2 training materials with read/agree gating"
```

---

## Task 4: 步驟 3 十題測驗題目

**Files:**
- Modify: `index.html`（填入 `#body-3`）

**Interfaces:**
- Consumes: Task 1 的 `#body-3`、`.quiz-q`/`.radio-group` 樣式。
- Produces: 10 個 radio group，name 與選項 value 精確如 Global Constraints 所列，供 Task 5 讀取與評分。

- [ ] **Step 1: 填入步驟 3 測驗 HTML**

把下列內容放入 `#body-3`（取代 `<!-- Task 4 填入 -->`）。注意各選項 `value` 為 Google 表單完整原文，顯示標籤可較短：

```html
<div class="section-note">本測驗共 10 題，及格分數為 100 分。送出後將顯示您的測驗結果，若未達 100 分，煩請重新研讀教材。</div>

<div class="quiz-q">
  <div class="q-num">Q 01 · 是非題</div>
  <div class="q-text">承攬商進入廠區施工，須向該廠區的警衛窗口換取施工證，依作業期間長短，分為綠色施工證（長期）、黃色施工證（短期）、紅色施工證（臨時）三種。</div>
  <div class="radio-group ox" role="radiogroup">
    <label class="radio-opt ox-o"><input type="radio" name="entry.125731587" value="O" /><span class="radio-dot"></span>O 正確</label>
    <label class="radio-opt ox-x"><input type="radio" name="entry.125731587" value="X" /><span class="radio-dot"></span>X 錯誤</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 02 · 是非題</div>
  <div class="q-text">承攬商於各廠區內，駕駛車輛行駛，時速可大於每小時 20 公里。</div>
  <div class="radio-group ox" role="radiogroup">
    <label class="radio-opt ox-o"><input type="radio" name="entry.1103177906" value="O" /><span class="radio-dot"></span>O 正確</label>
    <label class="radio-opt ox-x"><input type="radio" name="entry.1103177906" value="X" /><span class="radio-dot"></span>X 錯誤</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 03 · 是非題</div>
  <div class="q-text">承攬商於廠內施工須進行施工申請，相關表單包含施工申請許可單、作業危害因素告知單、承攬商安全衛生環保承諾書。</div>
  <div class="radio-group ox" role="radiogroup">
    <label class="radio-opt ox-o"><input type="radio" name="entry.1514744174" value="O" /><span class="radio-dot"></span>O 正確</label>
    <label class="radio-opt ox-x"><input type="radio" name="entry.1514744174" value="X" /><span class="radio-dot"></span>X 錯誤</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 04 · 是非題</div>
  <div class="q-text">承攬商進入廠區施工，屬特殊作業包含：高架作業、吊掛作業、侷限作業、吊籠作業、動火作業、電氣作業。</div>
  <div class="radio-group ox" role="radiogroup">
    <label class="radio-opt ox-o"><input type="radio" name="entry.1544188210" value="O" /><span class="radio-dot"></span>O 正確</label>
    <label class="radio-opt ox-x"><input type="radio" name="entry.1544188210" value="X" /><span class="radio-dot"></span>X 錯誤</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 05 · 是非題</div>
  <div class="q-text">承攬商進入廠區施工，施工人員應於入廠前須檢附：保險證明（勞工保險、團體保險）、六小時承攬商職業安全衛生教育證明、特殊作業操作人員合格證。</div>
  <div class="radio-group ox" role="radiogroup">
    <label class="radio-opt ox-o"><input type="radio" name="entry.981799889" value="O" /><span class="radio-dot"></span>O 正確</label>
    <label class="radio-opt ox-x"><input type="radio" name="entry.981799889" value="X" /><span class="radio-dot"></span>X 錯誤</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 06 · 單選題</div>
  <div class="q-text">高架作業定義為人員立足點至地板或地面間之垂直距離，多少公尺以上之作業？</div>
  <div class="radio-group" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.1296077385" value="兩公尺" /><span class="radio-dot"></span>兩公尺</label>
    <label class="radio-opt"><input type="radio" name="entry.1296077385" value="三公尺" /><span class="radio-dot"></span>三公尺</label>
    <label class="radio-opt"><input type="radio" name="entry.1296077385" value="五公尺" /><span class="radio-dot"></span>五公尺</label>
    <label class="radio-opt"><input type="radio" name="entry.1296077385" value="十公尺" /><span class="radio-dot"></span>十公尺</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 07 · 單選題</div>
  <div class="q-text">使用合梯進行高架作業，下列措施何者正確？</div>
  <div class="radio-group" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.1813206164" value="作業人員穿戴雙掛勾之背負式安全帶，戴安全帽且扣緊帽帶" /><span class="radio-dot"></span>作業人員穿戴雙掛勾之背負式安全帶，戴安全帽且扣緊帽帶</label>
    <label class="radio-opt"><input type="radio" name="entry.1813206164" value="確認合梯踏板與結構完整無破損" /><span class="radio-dot"></span>確認合梯踏板與結構完整無破損</label>
    <label class="radio-opt"><input type="radio" name="entry.1813206164" value="作業人員兩兩一組，夥同作業" /><span class="radio-dot"></span>作業人員兩兩一組，夥同作業</label>
    <label class="radio-opt"><input type="radio" name="entry.1813206164" value="以上皆是" /><span class="radio-dot"></span>以上皆是</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 08 · 單選題</div>
  <div class="q-text">於廠內進行侷限空間作業，下列採行措施何者正確？</div>
  <div class="radio-group" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.632043508" value="使用四合一偵測器連續偵檢作業環境氧氣、一氧化碳、可燃性氣體、硫化氫等氣體濃度是否符合作業規範" /><span class="radio-dot"></span>使用四合一偵測器連續偵檢（氧氣、一氧化碳、可燃性氣體、硫化氫）</label>
    <label class="radio-opt"><input type="radio" name="entry.632043508" value="作業人員穿戴背負式安全帶，並勾掛於進出口之救援用三腳架之捲揚器上" /><span class="radio-dot"></span>作業人員穿戴背負式安全帶，勾掛於救援用三腳架捲揚器</label>
    <label class="radio-opt"><input type="radio" name="entry.632043508" value="於進出口配置全程監視人員，並與內部作業人員保持聯繫" /><span class="radio-dot"></span>於進出口配置全程監視人員，並與內部人員保持聯繫</label>
    <label class="radio-opt"><input type="radio" name="entry.632043508" value="以上皆是" /><span class="radio-dot"></span>以上皆是</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 09 · 單選題</div>
  <div class="q-text">於廠內進行吊掛作業，下列採行措施何者正確？</div>
  <div class="radio-group" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.1466794690" value="提供一機三證(危險性機械合格證、操作人員合格證、指揮人員合格證)供工安人員查核" /><span class="radio-dot"></span>提供一機三證（危險性機械合格證、操作人員合格證、指揮人員合格證）</label>
    <label class="radio-opt"><input type="radio" name="entry.1466794690" value="於吊掛作業前進行自主檢點" /><span class="radio-dot"></span>於吊掛作業前進行自主檢點</label>
    <label class="radio-opt"><input type="radio" name="entry.1466794690" value="進行作業範圍圈為警示，作業中禁止人員闖入吊掛範圍中" /><span class="radio-dot"></span>進行作業範圍警示，禁止人員闖入吊掛範圍</label>
    <label class="radio-opt"><input type="radio" name="entry.1466794690" value="以上皆是" /><span class="radio-dot"></span>以上皆是</label>
  </div>
</div>

<div class="quiz-q">
  <div class="q-num">Q 10 · 單選題</div>
  <div class="q-text">於廠內進行電焊或氧乙炔氣焊，下列採行措施何者<strong>錯誤</strong>？</div>
  <div class="radio-group" role="radiogroup">
    <label class="radio-opt"><input type="radio" name="entry.532185394" value="作業範圍內易燃物已移除" /><span class="radio-dot"></span>作業範圍內易燃物已移除</label>
    <label class="radio-opt"><input type="radio" name="entry.532185394" value="無需取得動火作業核准" /><span class="radio-dot"></span>無需取得動火作業核准</label>
    <label class="radio-opt"><input type="radio" name="entry.532185394" value="交流電焊機一次側已裝設漏電斷路器，二次側已裝設自動電擊防止裝置" /><span class="radio-dot"></span>交流電焊機一次側裝漏電斷路器，二次側裝自動電擊防止裝置</label>
    <label class="radio-opt"><input type="radio" name="entry.532185394" value="氧乙炔氣焊機已裝設防止回火裝置" /><span class="radio-dot"></span>氧乙炔氣焊機已裝設防止回火裝置</label>
  </div>
</div>
```

- [ ] **Step 2: 手動驗證**

重整頁面，走到步驟 3。
Expected：
- 顯示 10 題，Q1–Q5 為 O/X 是非題（O 選中變綠、X 選中變紅），Q6–Q10 為單選題。
- 各選項可點選、樣式正確；此時「送出」按鈕存在但尚未接送出邏輯（Task 5）。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add step 3 ten quiz questions with exact form values"
```

---

## Task 5: 送出邏輯、測驗評分與完成畫面

**Files:**
- Modify: `index.html`（擴充 `<script>`：submit handler、評分、成功畫面）

**Interfaces:**
- Consumes: 全部欄位（Task 2/3/4）、`validateStep1()`、`validateStep2()`、`getRadioValue()`、`#successCard`、`#quizResult`、`#submitBtn`、`window.__currentStep`。
- Produces:
  - `FORM_ENDPOINT`（表單副本端點）。
  - `QUIZ`（陣列：`{id, label, answer}`）與 `gradeQuiz()` → `{correct:number, total:10, wrong:string[]}`（`wrong` 為答錯題號如 `['Q2','Q10']`）。
  - submit handler：驗證 step1/step2/測驗全填 → 組 FormData → `fetch` no-cors 送出 → 顯示成功畫面與測驗結果。

- [ ] **Step 1: 加入送出與評分邏輯**

在 `<script>` 內（結尾處）新增：

```js
const FORM_ENDPOINT = 'https://docs.google.com/forms/d/e/1FAIpQLSedurwcoMq870khCe3e70xt-5zJQh85dVnoFzNT0KpbWHS4OA/formResponse';

const QUIZ = [
  { id: 'entry.125731587',  label: 'Q1',  answer: 'O' },
  { id: 'entry.1103177906', label: 'Q2',  answer: 'X' },
  { id: 'entry.1514744174', label: 'Q3',  answer: 'O' },
  { id: 'entry.1544188210', label: 'Q4',  answer: 'O' },
  { id: 'entry.981799889',  label: 'Q5',  answer: 'O' },
  { id: 'entry.1296077385', label: 'Q6',  answer: '兩公尺' },
  { id: 'entry.1813206164', label: 'Q7',  answer: '以上皆是' },
  { id: 'entry.632043508',  label: 'Q8',  answer: '以上皆是' },
  { id: 'entry.1466794690', label: 'Q9',  answer: '以上皆是' },
  { id: 'entry.532185394',  label: 'Q10', answer: '無需取得動火作業核准' },
];

// 純函式：依目前選取狀態評分。掛在 window 供 console 驗證。
window.gradeQuiz = function gradeQuiz() {
  const wrong = [];
  QUIZ.forEach(q => {
    if (getRadioValue(q.id) !== q.answer) wrong.push(q.label);
  });
  return { correct: QUIZ.length - wrong.length, total: QUIZ.length, wrong };
};

// 測驗是否每題皆已作答
function allQuizAnswered() {
  return QUIZ.every(q => getRadioValue(q.id) !== null);
}

document.getElementById('mainForm').addEventListener('submit', async e => {
  e.preventDefault();

  // 保險起見再跑一次前面步驟驗證（理論上已通過才會到步驟 3）
  if (!validateStep1()) { goToStep(1); return; }
  if (!validateStep2()) { goToStep(2); return; }

  // 測驗必須每題皆作答
  const gate = document.getElementById('gate-3');
  if (!allQuizAnswered()) {
    gate.textContent = '請完成全部 10 題測驗後再送出。';
    gate.classList.add('show');
    return;
  }
  gate.classList.remove('show');

  const btn = document.getElementById('submitBtn');
  btn.textContent = '送出中⋯';
  btn.disabled = true;

  // 組 FormData
  const data = new FormData();
  data.append('entry.1281327973', document.getElementById('f-company').value.trim());
  data.append('entry.185951546',  document.getElementById('f-name').value.trim());
  data.append('entry.293336872',  document.getElementById('f-id').value.trim());

  const [yyyy, mm, dd] = document.getElementById('f-date').value.split('-');
  data.append('entry.715793541_year',  yyyy);
  data.append('entry.715793541_month', String(parseInt(mm)));
  data.append('entry.715793541_day',   String(parseInt(dd)));

  data.append('entry.1650749467', getRadioValue('entry.1650749467'));
  data.append('entry.1104087735', getRadioValue('entry.1104087735'));
  QUIZ.forEach(q => data.append(q.id, getRadioValue(q.id)));

  try {
    await fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data });
  } catch (_) {
    // no-cors 一定會在讀 response 時 throw，資料仍已送出
  }

  // 評分並顯示成功畫面
  const result = window.gradeQuiz();
  const rEl = document.getElementById('quizResult');
  if (result.wrong.length === 0) {
    rEl.innerHTML = '<div class="quiz-result-score">測驗結果：' + result.correct + ' / ' + result.total + ' 分</div>'
      + '<div class="quiz-result-perfect">✓ 全部答對，恭喜通過測驗！</div>';
  } else {
    rEl.innerHTML = '<div class="quiz-result-score">測驗結果：' + result.correct + ' / ' + result.total + ' 分</div>'
      + '<div class="quiz-result-wrong">答錯題號：' + result.wrong.join('、')
      + '<br>未達 100 分，煩請重新研讀教材相關內容。</div>';
  }

  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  document.getElementById('successCard').classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
```

- [ ] **Step 2: 用 console 驗證評分函式**

在瀏覽器走到步驟 3，全部答對（Q1=O, Q2=X, Q3=O, Q4=O, Q5=O, Q6=兩公尺, Q7/Q8/Q9=以上皆是, Q10=無需取得動火作業核准），在 devtools console：

Run: `window.gradeQuiz()`
Expected: `{correct: 10, total: 10, wrong: []}`

改把 Q2 選成 `O`（答錯），再執行 `window.gradeQuiz()`
Expected: `{correct: 9, total: 10, wrong: ['Q2']}`

- [ ] **Step 3: 端到端手動送出驗證（會在 Google 試算表產生測試資料）**

在瀏覽器完整走完三步驟，步驟 1 公司填「測試公司(可刪除)」，測驗故意答錯 1–2 題後送出。
Expected：
- 出現「登記完成」成功畫面。
- 測驗結果區顯示分數（例如 `8 / 10`）與答錯題號。
- 前往表單副本的 Google 試算表（`https://docs.google.com/forms/d/1pQFuY-eovZPHBNqGw3NAM11yEYPRopLz91gn2VF5xT0/edit` 的「回覆」）確認多一筆資料，且每個欄位（公司、姓名、身分證、日期、是否閱讀、同意、10 題答案）內容正確對應。
- 確認無誤後在試算表手動刪除該測試列。

> 若 subagent 無權存取該 Google 試算表，請把本步驟標記為「需使用者驗證」，並在任務回報中請使用者代為確認試算表收到資料。

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add submission to form copy with quiz scoring on success screen"
```

---

## Task 6: 更新 README

**Files:**
- Modify: `README.md`

**Interfaces:** 無程式介面；純文件更新。

- [ ] **Step 1: 覆寫 `README.md`**

用下列內容整份覆寫（繁體中文，對應新的 3 步驟流程、表單副本、測驗結果顯示、gating 行為）：

```markdown
# 瑞昱承攬商線上安全衛生教育訓練 — 使用說明

## 這個頁面是什麼

這是一個網頁版的承攬商安全衛生教育訓練表單，取代原本的 Google 表單介面。
承攬商開啟網址後，以分成三個步驟的精靈式流程完成：

1. **基本資料**：公司全稱、訓練人員姓名、身分證字號
2. **訓練教材**：觀看 5 部 YouTube 訓練影片、填寫觀看日期、確認已完整觀看、同意準備查核文件
3. **訓練測驗**：完成 10 題安全知識測驗後送出

送出後，資料會自動進入指定的 **Google 表單後台（試算表）**，職安同仁查看資料的方式不變。

---

## 幾個重點行為

- **步驟 2 的把關**：若承攬商在「是否已完整觀看」選「否」，或在文件準備聲明選「不同意」，將無法進入測驗，頁面會顯示提醒。
- **測驗結果**：不論答對與否都會送出，送出後的完成畫面會顯示本次答對題數與答錯題號。未達 100 分會提醒重新研讀教材。
- **資料進後台**：本頁透過 Google 表單的送出端點直接送件，資料進入的是這份表單副本的試算表。

---

## 給承攬商的方式

取得網址後（由 IT 提供），直接把**網址**傳給承攬商即可。
對方用手機或電腦的瀏覽器開啟，依三個步驟填完送出就完成。

---

## 告訴 IT 的話

> 我有一個 HTML 檔案（`index.html`），可以麻煩幫我放到公司的網站伺服器上，
> 給一個網址讓外部的承攬商可以開啟嗎？
> 檔案只有一個，不需要資料庫或其他設定，放上去就能用。

IT 不需要做其他任何事。

---

## 如果影片無法播放

5 部訓練影片是嵌入 YouTube 的連結。若承攬商反映影片無法播放，
請告知對方點擊影片右下角的 **YouTube** 圖示，直接前往 YouTube 網頁觀看。

---

## 如果需要修改題目或欄位

請聯絡協助製作此頁面的 IT / 工程師同仁，提供修改需求即可。
若要調整送出的目標表單，需要同時更新頁面中的表單端點與各欄位對應的 entry ID。
```

- [ ] **Step 2: 手動驗證**

Run: `cat README.md`
Expected: 內容為上述新版，無殘留舊敘述（例如不再宣稱「進入同一份 Google 試算表」等與副本不符的描述）。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for 3-step wizard flow and form copy backend"
```

---

## Self-Review 結果

- **Spec coverage：**
  - 3 步驟精靈 → Task 1（骨架+切換）、Task 2/3/4（各步驟內容）✓
  - 藍+琥珀視覺 + logo → Task 1（CSS 變數沿用、base64 logo）✓
  - 正確 entry ID 對應 → Global Constraints + Task 2/3/4 逐欄列出 ✓
  - 送到表單副本端點 → Task 5 `FORM_ENDPOINT` ✓
  - gating（否/不同意擋住）→ Task 3 `validateStep2()` ✓
  - 測驗不阻擋送出、送出後顯示結果 → Task 5 `gradeQuiz()` + 成功畫面 ✓
  - README 更新 → Task 6 ✓
  - 手動測試（含試算表核對、刪除測試列）→ Task 5 Step 3 ✓
- **Placeholder scan：** logo data URI 以可執行指令產生（Task 1 Step 1），非未定義佔位；其餘皆為完整可貼上程式碼。
- **Type/名稱一致性：** `goToStep`、`attemptNext(fromStep)`、`validateStep1/2`、`getRadioValue`、`gradeQuiz`、`QUIZ`、`FORM_ENDPOINT`、`allQuizAnswered`、`setFieldErr`、`ID_RE` 於定義與使用處一致；DOM id（`f-company`/`f-name`/`f-id`/`f-date`/`gate-2`/`gate-3`/`successCard`/`quizResult`/`submitBtn`）跨任務一致。
```
