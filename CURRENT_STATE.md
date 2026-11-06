# Level Up Board — Current State

Nov 5, 2026 · @Ang

The board works, but the same decisions are made in too many places, so every fix moves the bug somewhere else. The fix is one decider (the monitor) and one doc (this one). This doc replaces all 449 earlier handoffs.

## Rules for every session

Every Claude Code session reads this doc first and only this doc. Older handoffs are history, not instructions.

1. **Update this doc, never start a new handoff.** At the end of a session, change the sections that changed.
2. **One item from the fix plan at a time.** No new features until step 6 of the fix plan is done.
3. **Plan before code.** Paste the plan or diff to the reviewer (Claude on claude.ai) before accepting it.
4. **A fix removes a copy, it never adds a layer.** If the change makes the same decision in a new place, it is rejected.
5. **Nothing is "fixed" without proof.** Cite the file and line, and show the regression tests passing.
6. **Open decisions stay open.** If a rule in the Decisions section is unanswered, stop and ask Ang. Never guess and build.

## How it works today

Chelsea's setups flow one way into the Sheet, then get read twice: once by the monitor and once by each member's browser. That second read is where the board contradicts itself.

1. **Chelsea** submits a setup in the intake app (`levelup-chelsea-intake`, Vercel). Confirmed working by Ang on 2026-11-05; posts sometimes arrive slowly.
2. **Google Sheet** (gid 1165837241) stores every setup. It is the only source of Chelsea's levels.
3. **Monitor** (`levelup-trade-monitor`), every 15 minutes from Ang's PC, reads the Sheet, decides trigger, stop, targets and expiry, and writes `monitor-feed.json`.
4. **Board** (`levelup-sheets` on GitHub Pages): `index.html` (landing) and `sheet.html` (detail). Each page reads the Sheet again, reads the feed, and fetches live prices in the browser.

| Component | Where it lives | What it decides |
| --- | --- | --- |
| `core/levelup-core.js` | monitor repo, copied to `levelup-sheets/levelup-core.js` | Sheet text to setups and levels (one parser since 2026-11-05) |
| `monitor/engine.js` | monitor repo | Triggered or not, pre-trigger invalidation |
| `monitor/lifecycle.js` | monitor repo | Whether a trade is over |
| `monitor/public-feed.js` | monitor repo | What the board is allowed to show |
| `mech-feed` script | inside `index.html` AND `sheet.html` | Re-decides side, state and warnings in the browser (the problem) |

**Working folders.** Do all monitor code work in `C:\dev\work\levelup-trade-monitor`. NEVER edit in `C:\dev\monitor-task\repo` or `C:\dev\monitor-task\sheets`; the 15-minute runner resets those. Board work goes in `C:\dev\levelup-sheets`. The OneDrive `LevelUp_Monitor_Rebuild` copy is 47 commits behind; do not use it.

## What runs on a schedule

The goal is exactly one scheduled writer: the 15-minute task on Ang's PC. Two others were still running on 2026-11-05.

| Writer | Schedule | Status | Action |
| --- | --- | --- | --- |
| Windows task "LevelUp Monitor (hourly)" running `run-hourly.ps1` | Every 15 min, only while the PC is awake | Keep. The only intended writer | Pause by creating `C:\dev\monitor-task\STOP` |
| Cloudflare Worker `levelup-monitor-dispatcher` | Was every 30 min, starting GitHub runs | Cron trigger removed 2026-11-05 | Worker and token kept, so it can be restored |
| GitHub Actions `monitor-shadow.yml` | Hourly cron `3 * * * *` | Still enabled until Claude Code removes the schedule | Keep `workflow_dispatch` for manual runs |
| Cloudflare Worker `levelup-sheet-monitor` | None | Idle. Its storage is used by the dispatcher | Leave alone |

**Known gap:** when the PC sleeps the board goes stale with no alert. On 2026-11-05 the feed stopped from 02:51 to 07:18.

## Decisions waiting on Ang and Chelsea

These are product rules, not code questions. Until each has one written answer, code built around it will keep looping. Write the answer and the date next to each one.

- [ ] **Diamond rule (Chelsea, 2026-11-05) - PARTLY ANSWERED.** Each side of a pair stays live until it triggers, or its own stop or expiry hits; one side being invalidated never ends the other. **STILL OPEN:** does a side whose own stop was breached BEFORE it ever triggered (the ADA, BTC, DOGE, ONDO and XRP longs) come back to Watching at 6%? Until that is answered, those five stay as they are.
- [x] **Auto-return (Chelsea, confirmed 2026-11-05).** When one side of a pair is invalidated or stopped, the OPPOSITE side goes back to Watching once price is within 6% of its trigger price (e.g. $100 trigger: $94 to $106). Watching is NOT triggered. The trigger is ALWAYS a 1-hour candle OPENING above (long) or below (short) the Simple and Smooth moving averages. A stopped trade is over and never comes back. (Supersedes the 10% figure asked about on 2026-10-29.) Verified 2026-11-05: engine already tests the 1H candle OPEN (monitor/engine.js:399, :58). No change needed.
- [x] **Written invalidation (Chelsea, 2026-11-05).** NO - it is a note only and does not override the strength meter. Add a visible warning on the card when price is past her written invalidation.
- [x] **"Not a live watch" wording (Chelsea, 2026-11-05).** One sentence, exactly: "This setup never triggered and is no longer valid. Shown for the record only - not something to watch." (Replaces both sentences currently live at `index.html` lines 1477 and 2046.)
- [x] **Split pair (Chelsea, 2026-11-05).** The two cards STAY TOGETHER - it shows students the "if this, then that".
- [x] **Old ChatGPT prompt (Chelsea, 2026-11-05).** Never used. No action.

## Known problems, ranked

The root cause is one decision made in several places that drift apart. Problems 1 to 4 are versions of it.

| # | Problem | Where | Why it matters |
| --- | --- | --- | --- |
| 1 | `mech-feed` exists twice and has diverged: 72 KB in `index.html`, 83 KB in `sheet.html`, only about 240 lines shared | both pages | The card and the detail page can tell a member different things |
| 2 | "Which side leads a pair" is decided 3 ways; only one follows the 2026-10-30 rule that the Sheet sets publish time | `sheet.html:376`, `sheet.html:1251`, `index.html:1817` | Caused the BTC, LINK, HYPE and ADA side bugs (8 rounds in 13 days) |
| 3 | "Is this trade over" is decided in the monitor and again in both pages | `monitor/lifecycle.js`, `index.html:1893`, `sheet.html:1347` | Caused the HYPE red box |
| 4 | Two code paths write "Not a live watch" with different wording | `index.html:1477`, `index.html:2046` | Members don't understand it; the same warning reads two ways |
| 5 | Live price fetched by 4 separate timers per page | `sheet.html:574, 787, 1555, 1686` | Different prices on screen at once |
| 6 | Whole detail page rebuilt every 60 seconds | `sheet.html:560, 587` | Restarts the voice memo and closes open sections |
| 7 | Every change ships straight to the live board | process | No safe place to test; "APPROVED & FROZEN" on 2026-09-29 was followed by 270+ commits |
| 8 | Uncommitted fix (PLS-20b) parked in `C:\dev\levelup-sheets\sheet.html` since 2026-11-04 | working folder | Easy to lose or ship by accident |
| 9 | TURBO hidden by a hardcoded list in 4 places, still present in the data | `index.html:467` and others | Fragile; the file's own comment warns against it |
| 10 | Intake posts sometimes arrive slowly | intake app to Sheet | Not urgent; investigate after the fix plan |

## Fix plan

Do these in order. Each step is done only when its check passes, and the result is recorded here.

- [x] **0. Stop extra writers.** Cloudflare dispatcher cron removed on 2026-11-05.
- [x] **0b. Remove the `monitor-shadow` hourly cron.** monitor-shadow hourly cron removed 2026-11-05 (d68b515); tests now assert no schedule.
- [x] **0c. Give Claude Code its own working folder.** Done 2026-11-05: `C:\dev\work\levelup-trade-monitor` is a separate clone of levelup-trade-monitor that the runner never touches. All monitor code work happens there.
- [ ] **0d. Review the 2026-11-04 stash in monitor-task\repo.** Done when it is kept or dropped.
- [ ] **0e. config/monitor.config.json target_cadence_minutes is still 60; real cadence is 15.** Decide and align (affects the staleness check).
- [ ] **1. Answer the open decisions** (section above). Done when every box there has a written answer and date.
- [ ] **2. Lock in past bugs as tests:** BTC (2026-10-23), HYPE (2026-10-29/30), LINK, ADA and PEPE. Done when the tests fail on the old code and pass on the current code.
- [ ] **3. Staging board.** A copy of the board where every change lands first. Done when Ang can open a staging link and approve before anything goes live.
- [ ] **4. Make the monitor the only decider.** The feed states, per side: which side leads, whether it is over, and the exact warning text. The pages only display it. Done when the browser-side copies in step 5 have nothing left to decide.
- [ ] **5. Delete the browser copies.** Remove the duplicated side, state and warning logic from both `mech-feed` blocks. Done when `currentBatch`, `expiredFor` and both "Not a live watch" writers are gone from the pages.
- [ ] **6. One shared price fetch and one Sheet read per page.** Done when each page has one price timer and one Sheet fetch.
- [ ] **7. Clean up.** Commit or drop PLS-20b, rename the OneDrive clone to `_OLD_DO_NOT_USE`, and replace the TURBO hardcode with a Sheet status.
- [ ] **8. Stale-feed alert.** Notify Ang when the feed is more than 45 minutes old.

## Evidence

The full audit from 2026-11-05 is at `C:\Users\angie\LEVELUP_AUDIT`. Start with `INVENTORY.md`. It holds the claims check, loops, rewrites, skipped work and duplicates, with file and line for each.

- `AUTOMATION.md`: every scheduled writer and the data flow
- `REPOS.md`: all 8 repos and working folders
- `TIMELINE.md`: 113 sessions and 449 documents in date order
- `gitlog_*.txt` and `raw/`: the command output behind every claim

Two audit findings were corrected on review. The Chelsea intake works (the audit flagged it as possibly dead from a stale note). The two `mech-feed` blocks are not near-copies; they share only about 240 of roughly 1,000 lines.
