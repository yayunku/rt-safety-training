# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A single static `index.html` file that reimplements Realtek's (瑞昱半導體) contractor safety training Google Form as a standalone, brightly-styled web page. Contractors fill it out, watch 5 embedded YouTube training videos, take a quiz, and submit — all without a database or backend. There is no build step, no package manager, and no test framework; the entire product is this one HTML file.

## Commands

There is nothing to build or install. To preview locally:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/index.html
```

There is no linter or automated test suite. Verification is manual: open the page, walk through the flow, and (when touching Google Form submission logic) confirm real submissions land correctly in the linked Google Sheet, then delete the test row.

## Architecture

**The core trick: this page is a client for someone else's Google Form.** It does not own the data store — a real Google Form (and its linked Google Sheet) is the backend. The page reimplements the form's fields in custom HTML/CSS, then on submit does:

```js
fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data })
```

`FORM_ENDPOINT` is the target Google Form's public `.../formResponse` URL, and `data` is a `FormData` keyed by `entry.<id>` — one numeric ID per question, taken directly from the live Google Form. This only works if:

- Every `entry.<id>` name in this file's inputs matches the real form's question IDs exactly. These IDs are **not derivable from the code** — they come from inspecting the real form's HTML (its `FB_PUBLIC_LOAD_DATA_` embedded JSON has the authoritative field list, or view page source of the live form).
- The target Google Form does **not** require the respondent to sign in (e.g. "Verified" email collection forces server-side auth and makes anonymous `formResponse` POSTs fail with HTTP 401 — this actually happened once; see the spec below for how it was diagnosed and fixed by switching the form's email-collection setting to "Do not collect" on a duplicate of the form).
- `mode: 'no-cors'` means the JS can never read the real HTTP status of the submission — the fetch always "succeeds" from the page's point of view even if the backend rejected it. Any correctness check (required fields, quiz pass/fail) must happen client-side *before* the POST; there is no server response to react to.

**Quiz grading is entirely client-side and hardcoded.** Google's own quiz-grading feature only works inside Google's own form-taking UI, not for POSTs that bypass it — so the correct answers for the quiz questions must be hardcoded in this page's JS (mapped by `entry.<id>`) if any pass/fail or "show me what I got wrong" behavior is wanted. There is no way to fetch correct answers from the public form.

**Design docs**: substantive rebuilds/redesigns of this page go through a spec-first process — see `docs/superpowers/specs/` for the design rationale, the current field/entry-ID mapping, and the reasoning behind submission-mechanism decisions. Check there before assuming why something is built a certain way.

## Distribution model

This file is handed to the company's internal IT team to host on an internal web server; there is no CI/CD or hosting automation in this repo. IT does not need to configure anything beyond serving the static file — no database, no environment variables, no backend service.
