# Contractor safety training

Read `docs/superpowers/specs/2026-10-14-two-forms-apps-script-backend-design.md` before changing form handling, consent, certificates, or lookup. Its decision table is authoritative. For presentation, follow the owner-selected header 2, landing C and certificate S3 in `docs/superpowers/specs/assets/2026-10-14-style-picker.html`; both certificate types use S3, superseding the older gradient/purple choices. The August badge spec explains the retained SVG, QR, PNG and print design; the October spec supersedes its data storage and expiry rules.

## Files and runtime

The GitHub Pages frontend has no build step, framework, runtime npm dependencies, or external scripts. Serve these files together in one directory:

- `index.html`: landing links for engineering (`E`), service (`S`), and lookup.
- `training.html`, `training.js`: API-driven sections, consent and video declaration gates, validation, quiz error placement, and issued certificate.
- `lookup.html`, `lookup.js`: ID and name lookup, showing the latest certificate per type including revoked/expired records.
- `badge.html`, `verify.js`: read `#c=<certNo>&t=<token>` and fetch current status; no personal data in the URL.
- `badge.js`: retained vendored MIT QR generator and logo, SVG certificate, PNG export, print. Both types use the owner-selected S3 white card with a tinted panel: engineering has a `#0078AF` band with white text, service a `#34EBB7` band with `#053D30` text. SVG dimensions are 300 × 540 and PNG export is 600 × 1080. Export/print omit the valid status pill and retain expired/revoked status.
- `common.js`: JSON API transport, Chinese errors, certificate presentation.
- `core.js`: pure normalization, validation and certificate helpers. This is an exact checked-in copy of `apps-script/Core.js`, allowing a flat static directory and an independently pushable GAS directory. Edit `apps-script/Core.js`, copy it to `core.js`, and run tests; byte equality is tested. This does not require a production build.
- `consent.js`: Appendix A as plain text, preserving its line breaks. Unit tests compare it against the read-only design document; E2E compares the rendered text against this constant.
- `style.css`: original wizard design with responsive additions and system fonts.
- `config.js`: only `API_URL`, initially an explicit placeholder. Replace it with the deployed Apps Script `/exec` URL. The pages display `尚未設定後端` until configured.

`apps-script/Core.js` has no GAS globals. HMAC computation is an injected function; formatting and messages are pure. `apps-script/Server.js` owns all service calls, HTTP entry points, setup, and cache clearing. No form answers or HMAC secret are embedded in the static files.

## API and persistence

All responses are JSON: `{ok:true,...}` or `{ok:false,error,...}`. GET supports `form&type=E|S` and `verify&cert=...&token=...`. POST supports `{action:"submit",type,answers}` and `{action:"lookup",idNo,name}` using `text/plain;charset=utf-8` to avoid preflight. IDs and names are sent only in POST bodies. The frontend shows success only after a successful response with a certificate. Apps Script reserves query names `c` and `sid`; the transport removes them even from configured URLs. `verify.js` maps the unchanged badge fragment `c`/`t` to API parameters `cert`/`token`. Deploy the matching frontend and backend together; old browser tabs need a reload.

The form endpoint caches an allowlisted public structure under `form:E|S`; a separate server-only model with the answer key is stored under `form-private:E|S`. Both use a 7200-second TTL and check the configured form edit ID before reuse. Only allowlisted public fields can leave the form endpoint, even on a cache hit. Submit grades from the private cache, validates all required roles, consent, ID, tax ID, watch date and gates, then compares all graded choices. A private cache miss reads FormApp without fetching video IDs. Successful submission obtains items in one `getItems()` call and maps them by ID; cached source types avoid repeated type/getter calls. A cold submission reuses the items already fetched for its model. Under a script lock it submits a FormApp response and writes the registry row. Sequence numbers are per Taipei date and type; 999 is the maximum representable three-digit sequence and further issuance returns `sequence_exhausted`. Expiry is issue date plus one year, valid through that date; leap day follows the previous badge's JS rollover convention.

The registry retains masked ID and an HMAC lookup hash, not full ID. Google Form responses retain submitted identity fields as required by the design. The registry `作廢` checkbox takes precedence over expiry. Lookup returns each type's latest record without filtering its status. Five failed lookups for the normalized ID's keyed hash block lookup until fewer than five failures remain in the rolling 15-minute window. Failure timestamps are authoritative Script Properties under `lookupfail:<keyed ID hash>`, read and written under the script lock; cache eviction cannot reset a lockout. Each unblocked lookup scans properties once, removes expired failure keys/timestamps, and reserves space for a potential failure before checking identity. A conservative 200 KiB budget (UTF-8 JSON size of all properties, including overhead) returns `busy` rather than evicting active lockouts or allowing uncounted guesses. Property read/write quotas and the scan can limit throughput during flooding. Keep the registry sheet name (`登記表`) and header order intact.

Form and registry writes cannot be a cross-service transaction: a registry failure after FormApp accepts a response returns an error and can leave a form-only submission. A lost response after both writes can leave a valid certificate despite a client network error. The error message advises lookup before retrying; there is no idempotency key in this API.

VideoItem has no URL getter in the official reference. The backend fetches `form.getPublishedUrl()` and parses JSON from `FB_PUBLIC_LOAD_DATA_`, mapping type 12 items by item ID to `item[6][3]`. This public-page representation is undocumented and can change; missing/malformed video data fails with `form_misconfigured`. Image layout items supply the subtitle, without transmitting images. Unsupported input types, ambiguous/missing identity roles, non-choice graded items, or free-text Other choices fail closed instead of silently dropping data. Real forms must use the supported text/date/radio/checkbox and layout items described in the spec.

## Apps Script configuration

Work with test copies owned by the Apps Script owner account until the owner switches to production. Set these Script Properties:

| Property | Value |
| --- | --- |
| `FORM_ID_E` | Engineering form's **edit** ID |
| `FORM_ID_S` | Service form's **edit** ID |
| `REGISTRY_SHEET_ID` | Registry spreadsheet ID, created by setup when absent |
| `HMAC_SECRET` | Persistent secret, created by setup when absent |

The deploying account must be an editor of both forms. Run `setup()` manually in the Apps Script editor; it can be rerun without replacing existing properties or registry data. It creates the registry headers and revoke checkboxes when creating a registry, and installs an hourly time-driven trigger for `warmFormCache()` only if that handler already has no clock trigger. Run setup as the same deploying owner: trigger enumeration is user-scoped, so running it under a different account can create an additional trigger. After granting the new trigger scope, run `warmFormCache()` manually for immediate prewarming; setup itself only schedules it. Do not rotate `HMAC_SECRET` casually: existing lookup hashes and certificate tokens depend on it.

`apps-script/appsscript.json` uses V8, Asia/Taipei, deployment-owner execution and anonymous access. Its OAuth scopes are Forms (read plus submit), Spreadsheets (registry creation/read/write), external request (video fallback), and `script.scriptapp` for installing/enumerating triggers. The deploying owner must reauthorize the added scope before running setup. References: [ScriptApp](https://developers.google.com/apps-script/reference/script/script-app) and [ClockTriggerBuilder](https://developers.google.com/apps-script/reference/script/clock-trigger-builder).

For a future authorized clasp push, work from `apps-script/` and copy `.clasp.json.example` to an ignored `.clasp.json`, then set the script ID; `rootDir: "."` refers to that directory. This repository does not contain a real clasp configuration. Do not run clasp, deploy, commit, push, or contact live forms as part of an offline implementation/test run.

To switch test → production, change `FORM_ID_E` and `FORM_ID_S` to the production forms' edit IDs (kept by the owner, deliberately not stored in this public repo), then run `clearFormCache()`. It clears both public and private caches, then synchronously rebuilds both types. `warmFormCache()` also rebuilds both models for E and S regardless of cache hits. It attempts the other type even if one fails, then reports a safe error; a failed normal warm leaves any previous cache usable until expiry. The form-ID-aware caches avoid using a previous form's model after a property switch. Preserve the production registry and secret; do not mix a disposable test registry into production without the owner's decision.

Form edits, including answer-key changes, can remain cached until the next successful hourly warm or two-hour expiry. Run `clearFormCache()` after editing. Concurrent cache rebuilds are not serialized; avoid editing forms during a rebuild and rerun clear/warm if a rebuild was already in flight. Public and private entries may be evicted independently, so an already-open page can disagree with a newer grading model; reload after edits. CacheService may evict before TTL, and models at or above the conservative 95,000-byte cache threshold run uncached. A trigger failure, missing authorization, or quota limit can restore cold-load latency. Warm operations consume FormApp, UrlFetch and trigger runtime quotas; one warm can partially succeed. Logs identify only the failed type, not model contents.

The loading message warns that first load may need 15 seconds. Submit remains disabled while awaiting the API and displays `送出中，約需 10–20 秒，請勿關閉頁面`. These are estimates, not timeouts or guaranteed performance; FormApp submission, registry I/O and lock contention remain. This guard prevents double submission within the page, not retries after a lost response.

## Verification

Use Node 22+, `npm ci`, then `npm test` (unit and Chromium E2E). Dependencies are development-only. `npm run test:unit` and `npm run test:e2e` run the suites separately. The test runner disables process isolation so unit results remain visible in restricted environments.

E2E uses installed Chromium under `~/.cache/ms-playwright`; override its executable with `CHROMIUM_PATH` if needed. Static files are fulfilled through `page.route` at a synthetic origin, so no local HTTP listener is needed. API responses are stubbed, Google Forms and Apps Script URLs are explicitly blocked, and every other external request (including video embeds) is aborted. Tests never call live Google services. E2E covers both training types, gates, quiz corrections, QR decoding with jsqr, PNG/print, statuses, lookup, errors, URL privacy, exact consent, and 375px layout. A sandbox that prohibits Chromium's socket operations cannot run E2E; a browser startup failure is not a passing test.

For interactive local preview, use `python3 -m http.server 8000`. The default API placeholder prevents accidental real submissions. Live OAuth, public-page video parsing, cross-origin redirects, and actual FormApp/Sheets writes still require an owner-authorized test deployment on the form copies; VM/API stubs cannot validate them.
