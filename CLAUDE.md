# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Three static files that reimplement Realtek's (瑞昱半導體) contractor safety training Google Form as a standalone, brightly-styled web page. Contractors accept a privacy notice, fill in their details, watch 5 embedded YouTube training videos, take a quiz they must ace, and submit — all without a database or backend. On success the page issues a digital contractor badge as a QR code. There is no build step, no package manager, and no test framework.

```
index.html   the 3-step form wizard + success screen
badge.html   the digital contractor badge, opened by scanning the QR
badge.js     badge rendering, QR generation, payload codec — shared by both pages
```

All three must sit in the same directory; the badge URL is resolved relative to the current page. Deployment target is GitHub Pages (plus a copy on the company's internal web server).

## Commands

There is nothing to build or install. To preview locally:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/index.html
```

There is no linter or automated test suite. Verification is scripted ad hoc with headless Chromium (see the badge section below) or manual: open the page, walk through the flow, and (when touching Google Form submission logic) confirm real submissions land correctly in the linked Google Sheet, then delete the test row.

## Architecture

**The core trick: this page is a client for someone else's Google Form.** It does not own the data store — a real Google Form (and its linked Google Sheet) is the backend. The page reimplements the form's fields in custom HTML/CSS, then on submit does:

```js
fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data })
```

`FORM_ENDPOINT` is the target Google Form's public `.../formResponse` URL, and `data` is a `URLSearchParams` (sent as `application/x-www-form-urlencoded`) keyed by `entry.<id>` — one numeric ID per question, taken directly from the live Google Form. This only works if:

- Every `entry.<id>` name in this file's inputs matches the real form's question IDs exactly. These IDs are **not derivable from the code** — they come from inspecting the real form's HTML (its `FB_PUBLIC_LOAD_DATA_` embedded JSON has the authoritative field list, or view page source of the live form).
- The form is **multi-page** (基本資料 / 教材 / 測驗 sections), so the POST must include `pageHistory=0,1,2` (and `fvv=1`). Without them, Google silently drops every field on pages after the first (all the radio answers) while still returning HTTP 200 — this actually happened once; see the spec below for how it was diagnosed. `FormData`/multipart submits also fail this way; use `URLSearchParams`.
- The target Google Form does **not** require the respondent to sign in (e.g. "Verified" email collection forces server-side auth and makes anonymous `formResponse` POSTs fail with HTTP 401 — this actually happened once; see the spec below for how it was diagnosed and fixed by switching the form's email-collection setting to "Do not collect" on a duplicate of the form).
- `mode: 'no-cors'` means the JS can never read the real HTTP status of the submission — the fetch always "succeeds" from the page's point of view even if the backend rejected it. Any correctness check (required fields, quiz pass/fail) must happen client-side *before* the POST; there is no server response to react to.

**Only a perfect quiz score is ever submitted.** The submit handler grades client-side first and returns early when anything is wrong — it flags the wrong questions in place and never sends the POST. Every row that reaches the Sheet is therefore 100 / 100. Step 1 has a second hard gate: the privacy-notice checkbox, which keeps the three inputs `disabled` until it is accepted.

**Quiz grading is duplicated: Google grades server-side, the page grades client-side.** Google *does* auto-grade the answers submitted by a bypassing `formResponse` POST — the score shows up in the linked response Sheet's 「分數」 column (e.g. `100 / 100`), keyed by the identity fields the form collects (company/name/ID), so per-person scores are available there without collecting email. But `mode: 'no-cors'` means the page can never read that score back, so to show the respondent their result and "which questions you got wrong" *on the page immediately*, the correct answers must also live in this page's JS (mapped by `entry.<id>`). There is no way to fetch correct answers from the public form. The answers are **not stored in plaintext**: each is salted XOR+base64 obfuscated (`enc` in the `QUIZ` array, decoded by `deobfuscate()`) so they aren't readable from view-source at a glance. A per-question random salt means identical answers produce different ciphertext, so you can't even tell which questions share an answer. This is casual concealment only — a client-side quiz can never keep answers truly secret; it just stops a contractor from reading them off the page source.

**The digital badge has no backend either — the URL *is* the badge.** `badge.js` packs the badge fields into the URL fragment: `badge.html#d=<base64url(JSON)>.<8-char FNV-1a checksum>`. A fragment is never sent to the server, so no PII lands in GitHub Pages' logs. Consequences worth knowing before changing anything here:

- The checksum (`KEY` in `badge.js`) is casual tamper detection, exactly like the quiz answer obfuscation. Anyone reading the file can mint a valid URL. Real anti-forgery needs a backend issuing/verifying API — out of scope, see the spec.
- Only the **masked** ID (`A12****789`) goes into the payload; the full number exists only in the Google Sheet.
- Expiry is training date + 3 years, and both the issue timestamp and the "today" used for the expiry comparison are computed at **UTC+8 regardless of device timezone**.
- The badge is one SVG string used three ways (screen, PNG export, print). `mode: 'export'` deliberately omits the green 有效 pill — a saved PNG can't know it expired — but keeps the red 已過期 stamp, which can never become wrong.
- The QR generator is vendored (minified, MIT, Kazuhiko Arase) at the top of `badge.js`. Never swap it for an online QR service: that would ship contractor names to a third party and break air-gapped internal hosting.
- Verification uses headless Chromium via `playwright-core` (browsers already in `~/.cache/ms-playwright`), including decoding the rendered QR with `jsqr` to prove it scans back to the exact URL. Always route `**/docs.google.com/**` to a stub so test runs never reach the real form.

**Design docs**: substantive rebuilds/redesigns of this page go through a spec-first process — see `docs/superpowers/specs/` for the design rationale, the current field/entry-ID mapping, and the reasoning behind submission-mechanism decisions. Check there before assuming why something is built a certain way.

## Distribution model

The three files are handed to the company's internal IT team to host on an internal web server, and are also served from GitHub Pages out of the repo root. There is no CI/CD or hosting automation in this repo. IT does not need to configure anything beyond serving the static files in one directory — no database, no environment variables, no backend service. Dropping `badge.html` or `badge.js` breaks the badge QR while the form itself keeps working, so check for all three when handing off.
