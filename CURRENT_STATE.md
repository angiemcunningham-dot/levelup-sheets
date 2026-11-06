# Level Up Board — Current State

Nov 5, 2026 · @Ang

**Next session starts with: Review publish-staging.js diff with Ang, then run it once and open the preview link.**

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

**Working folders.** Monitor code work goes in `C:\dev\work\levelup-trade-monitor`, board work in `C:\dev\work\levelup-sheets`. Both are clones nothing else touches. NEVER edit in `C:\dev\monitor-task\repo` or `C:\dev\monitor-task\sheets` - the 15-minute runner resets them - and not in `C:\dev\levelup-sheets` either - nothing fetches it any more, so it is frozen and should be treated as dead. The monitor compares its fixtures against whichever board clone has the newest origin/main, so a frozen one simply stops being read. The OneDrive `LevelUp_Monitor_Rebuild` copy is 47 commits behind; do not use it.

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

- [x] **Diamond rule (Chelsea, confirmed 2026-11-05).** Each side of a pair stays live on its own. A side that NEVER triggered does not die when price passes its stop; it returns to Watching when price is within 6% of its trigger. Only a trade that TRIGGERED and then hit its stop is over. This applies to the stuck longs: ADA, BTC, DOGE, ONDO, XRP.
  - **Scope: PAIRS ONLY.** A single, unpaired setup whose stop was passed before it triggered stays dormant. It does not come back at 6%.
  - **EXPIRED is final.** A side that ran out its 24-hour watch window without triggering never returns, however close price comes.
  - **Design (2026-11-05): no new lifecycle state.** A paired side whose stop was passed pre-trigger is DORMANT - `cannot_trigger` true, and it shows the "never triggered" sentence. When price comes within 6% of its trigger it returns to ordinary Watching (`cannot_trigger` false). It can still only TRIGGER by the usual 1H candle OPEN beyond SMA9 and SMMA7. If price passes its stop again, it goes dormant again.
  - **One sentence, one owner.** The monitor decides the state; the board maps that state to the sentence in ONE function with ONE constant, and both writers currently at `index.html:1477` and `index.html:2046` must call it.
- [x] **Auto-return (Chelsea, confirmed 2026-11-05).** When one side of a pair is invalidated or stopped, the OPPOSITE side goes back to Watching once price is within 6% of its trigger price (e.g. $100 trigger: $94 to $106). Watching is NOT triggered. The trigger is ALWAYS a 1-hour candle OPENING above (long) or below (short) the Simple and Smooth moving averages. A stopped trade is over and never comes back. (Supersedes the 10% figure asked about on 2026-10-29.) Verified 2026-11-05: engine already tests the 1H candle OPEN (monitor/engine.js:399, :58). No change needed.
- [x] **Written invalidation (Chelsea, 2026-11-05).** NO - it is a note only and does not override the strength meter. Add a visible warning on the card when price is past her written invalidation.
- [x] **"Not a live watch" wording (Chelsea, 2026-11-05).** One sentence, exactly: "This setup never triggered and is no longer valid. Shown for the record only - not something to watch." (Replaces both sentences currently live at `index.html` lines 1477 and 2046.)
- [x] **Split pair (Chelsea, 2026-11-05).** The two cards STAY TOGETHER - it shows students the "if this, then that".
- [x] **Old ChatGPT prompt (Chelsea, 2026-11-05).** Never used. No action.
- [ ] **Display words for each `card_state` (Chelsea, OPEN 2026-11-06).** Step 4 publishes a state and the board maps it to words in ONE table. Chelsea gives the exact words for each of the seven values, the way she gave the "Not a live watch" sentence. Proposed for DORMANT: "No longer a live watch." The other six are unwritten. The table is not built until she answers.
- [ ] **What `SIX_LINE_EXIT` maps to (OPEN 2026-11-06).** The lifecycle state appears in three separate "is it over" maps (`sheet.html:336`, `:1217`, `:1880`) and belongs to none of the seven `card_state` values. Most likely FINISHED_STOPPED, but it is a trade outcome a member reads, so it is Chelsea's answer, not a guess.
- [x] **A dead or dormant side NEVER leads (Ang, DECIDED 2026-11-06).** The live side - triggered and still running - always leads the card and the detail page, regardless of which side was published more recently. ADA is the worked example: the 2026-10-23 SHORT (triggered, TP1 and TP2 hit, still running) leads; the 2026-11-05 LONG (dormant) goes underneath. Agent B applies this to `card_state` ordering on BOTH pages, with a test using ADA.
  - **This does NOT contradict PLS-20 or PLS-20b, and they must not be weakened.** Both of those rank two sides that are BOTH FINISHED (`STOP_BOUNDARY_REACHED` / `OBJECTIVES_EXHAUSTED`), where nothing is running and recency rightly decides. This decision inserts a PRIOR test: **liveness first, recency only among equals.** A running side outranks a non-running one; when no side is running, the existing batch/recency rules decide exactly as they do today.
  - **One case this does not yet answer (flagged 2026-11-06, needs Ang):** when NEITHER side is running - e.g. BTC, whose short is FINISHED_WIN and whose long is DORMANT - "the live side leads" selects nothing. Today's reading is that the fallback is the existing recency rule, unchanged. Confirm before it is relied on.
- [ ] **What ends a triggered trade that never reaches its stop OR its last target? (Chelsea, OPEN 2026-11-06.)** Raised by ADA\|SHORT, live on the board for 14 days - see known problems 14. Today the answer is "nothing": the trade runs forever. Three candidates, none of them chosen: (a) nothing changes, a trade is open until the market resolves it; (b) a maximum age for a TRIGGERED trade, the way Watching has a 24-hour window; (c) when Chelsea publishes a new batch for an asset and does NOT republish a side, that side's old triggered instance retires at the new batch's publish time - which is what would have closed ADA\|SHORT on 2026-11-05, when she republished the ADA long and not the short. (c) is the only one that needs no new number. **Do not build any of them until she answers.**
- [ ] **CONFLICT - option (c) versus the live ADA short (Chelsea, OPEN 2026-11-06). DO NOT SWITCH ON OPTION (c) UNTIL THIS IS ANSWERED.** Option (c) would have retired this very ADA short on 2026-11-05, when Chelsea posted a new ADA long - and Ang has decided the opposite for display: that short is the live trade and must lead the card. The two cannot both be right. **The question for Chelsea: when you post a new setup for one side, does an already-running trade on the other side keep running, or close?** Until she answers, option (c) stays built and OFF, and the temporary ADA notice (known problem 17) stays on the board.


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
| 11 | Monitor replay gate read the board working folder’s local HEAD; fixed 2026-11-05 by comparing to origin/main | `scripts/sync-board-fixtures.js` | A board change committed locally and deliberately not pushed made the gate fail closed, and the 23:31 cycle published nothing. Guarded by BFS-7 |
| 12 | …and origin/main itself went stale: nothing fetches `C:\dev\levelup-sheets` any more, so once board work moved it froze one commit behind. Fixed 2026-11-06 - the guard reads whichever clone has the NEWEST origin/main | `scripts/sync-board-fixtures.js` | Reading one fixed path either blesses a stale fixture or reds the gate a cycle after every board push. Guarded by BFS-8 and BFS-9 |
| 13 | BFS-8 itself made its two git commits milliseconds apart and compared `%ct`, which is whole SECONDS, so the replay gate went red at random. Measured 2026-11-06: 1 run in 6, and 4 in 8 under load. Fixed the same day by pinning both commit dates | `test/board-fixture-sync.test.js` | A random red fails the cycle closed and publishes nothing - the same symptom as the 23:31 outage on 2026-11-05, a different cause. Found while building step 3, fixed as a separate commit |
| 14 | **ADA\|SHORT has read as a live short for 14 days and cannot end on its own.** Triggered 2026-10-23, TP1 and TP2 banked, TP3 never reached, stop never hit - so it sits at TARGETS_IN_PROGRESS and renders as "ACTIVE SHORT - TP2 REACHED". `monitor/lifecycle.js:176` only reaches EXPIRED_UNTRIGGERED on the no-trigger branch, so a TRIGGERED trade ends only by stop (`:171`), all targets (`:172`) or six-line exit (`:173`) - and `six_line_exit` is `false` in `config/monitor.config.json:37`, withdrawn by Chelsea. There is no fourth way out | `monitor/lifecycle.js:171-176`, `config/monitor.config.json:37` | A two-week-old short reads as a trade members could still be in. **Needs a product answer from Chelsea** - see the open decision added 2026-11-06 |
| 15 | **CORRECTED 2026-11-06 - this is bigger than first recorded, and member-visible.** SEVEN published receipts carry `outcome: SIX_LINE_EXIT` - ADA, AVAX, BTC, HYPE, ONDO, PEPE, XRP - and **all seven are `ready:true` and none is voided**, so they ARE surfaced. Two of them belong to the side's CURRENT live instance: ADA\|SHORT (receipt says SIX_LINE_EXIT, live state TARGETS_IN_PROGRESS) and **PEPE\|LONG, which reached OBJECTIVES_EXHAUSTED - every target hit - and is published as SIX_LINE_EXIT / CLOSED_WITH_PROGRESS, i.e. a completed win reported as an early exit.** Origin: the 2026-10-25 incident; `scripts/clear-erroneous-six-line-exits.js:21-23` reopened the lifecycles and deliberately left the receipts, deferring a void that was never done. `monitor/receipts.js` opens a receipt when a state FIRST becomes terminal and `appendEntries` refuses a second (`RECEIPT_EXISTS`), so each outcome froze at the word the withdrawn rule produced | `scripts/clear-erroneous-six-line-exits.js:21-23`, `monitor/receipts.js` | **My 2026-11-06 note that this was "cosmetic, renders nothing" was WRONG.** I read the LIVE lifecycle's `public_display` (`ready:false`); `monitor/public-feed.js:227` filters on the RECEIPT's own FROZEN `public_display`, which is `ready:true`. Fixing it means voiding seven member-visible records - Ang's call, not a cleanup |
| 16 | **Nothing notices.** A lifecycle that has been non-terminal for two weeks produces no alert of any kind. ADA\|SHORT was found by Ang reading the board, not by the monitor | no owner yet | The same blind spot as the stale-feed gap in fix plan step 8, one layer further in: step 8 notices a feed that stopped moving, nothing notices a trade that stopped moving |
| 17 | **Temporary ADA short notice (2026-11-06). Remove when option (c) ships.** An amber full-width sentence on the ADA\|SHORT card (`index.html`) and its detail page (`sheet.html`), shipped live 01:44 on 2026-11-06 while problem 14 waits on Chelsea. One constant, one function, one ticker per page, every piece marked TEMPORARY with its own removal condition. It reads no state and makes no decision, so it cannot drift from the monitor | `index.html` (`STALE_TRADE_NOTICE`, `applyStaleTradeNotices`), `sheet.html` (same two names, `ensureStaleTradeNotice`) | It is a hardcoded ticker on the live board - the same shape as the TURBO hardcode in problem 9, which is exactly why it carries an explicit removal condition instead of becoming permanent. The constant is declared in BOTH pages because there is no shared board-owned file yet; `levelup-words.js` (step 4) is where it should end up |

## Fix plan

Do these in order. Each step is done only when its check passes, and the result is recorded here.

- [x] **0. Stop extra writers.** Cloudflare dispatcher cron removed on 2026-11-05.
- [x] **0b. Remove the `monitor-shadow` hourly cron.** monitor-shadow hourly cron removed 2026-11-05 (d68b515); tests now assert no schedule.
- [x] **0c. Give Claude Code its own working folder.** Done 2026-11-05, both repos: `C:\dev\work\levelup-trade-monitor` and `C:\dev\work\levelup-sheets`, clones nothing else touches. The parked PLS-20b change moved to the board clone with it, and `C:\dev\levelup-sheets` was left clean.
- [ ] **0d. Review the 2026-11-04 stash in monitor-task\repo.** Done when it is kept or dropped.
- [ ] **0e. config/monitor.config.json target_cadence_minutes is still 60; real cadence is 15.** Decide and align (affects the staleness check).
- [x] **1. Answer the open decisions** (section above). Done 2026-11-05: every decision in that section now has a written answer and a date.
- [x] **2. Lock in past bugs as tests** - done 2026-11-05 except B4 and B6, which stay todo until built. BTC, HYPE, LINK, ADA and PEPE all have live regression tests (PLS-1, PFS-1, PLS-18, PLS-20b, PLS-19, WNR-1, NTL-1..6, A7), and Chelsea’s new rules are live as B1, B2, B3, B7 and B8. B5 is **done** - one "Not a live watch" sentence from one function, shipped 2026-11-05 (board d4c3e0c, monitor 976baab); the test is live. Still todo: **B4** (written invalidation never moves the strength meter, feed carries the warning flag) and **B6** (a pair’s two cards stay together).
  - Diamond comeback built 2026-11-05 (56902dc): `dormantFor()` in `monitor/engine.js`. Note: the 24h watch window still applies, so a dormant side can only come back within 24h of publication.
- [ ] **3. Staging board. DO THIS BEFORE STEP 4** (ordered 2026-11-06). A copy of the board where every change lands first. Done when Ang can open a staging link and approve before anything goes live.
  - **THE PREVIEW FOLDER IS `preview-c4e8de`** (random and unguessable by instruction, Ang 2026-11-06 - deliberately NOT "staging"). It is named in exactly two places, `scripts/publish-staging.js` and this line; nothing derives it. URL once published: `https://angiemcunningham-dot.github.io/levelup-sheets/preview-c4e8de/`
  - **Built 2026-11-06, NOT YET RUN, NOTHING PUSHED.** `scripts/publish-staging.js` (monitor repo) generates the folder in the board repo from the two WORKING TREES - the pages from `C:\dev\work\levelup-sheets`, the feed from this repo's freshly restored state via the same `buildFromDir` the live feed uses. That is what lets a monitor change and a board change be viewed together before either ships.
  - Every generated page gets a sticky full-width "PREVIEW - NOT THE LIVE BOARD" banner and its own noindex. The `.js` files are copied verbatim.
  - **Why it cannot disturb the live board.** The replay gate reads `git show origin/main:index.html` / `:sheet.html`, ROOT paths only (`scripts/sync-board-fixtures.js` PAGES and `readPage`), so a file at `preview-c4e8de/index.html` is invisible to it - asserted by STG-2, not assumed. The 15-minute runner hard-resets its own board clone and copies only `monitor-feed.json`, so it never writes here.
  - Guards: refuses any board clone but `C:\dev\work\levelup-sheets`; every write is checked to land inside the preview folder; `pull --rebase` with autostash before pushing (the runner pushes main every 15 minutes, and the clone carries the parked PLS-20b change); path-scoped `git add` and a commit WITHOUT `-a`, so PLS-20b can never be swept into a preview commit.
  - Covered by **STG-1 to STG-10** in `test/publish-staging.test.js`. STG-3 caught a real defect on the first run - the injected banner did not strip back out cleanly on `<body><div class="sheet">`, so a preview page was not the working-tree page plus the banner. Fixed before commit.
  - Still to do: review the diff, run it once, open the link. Then this step is done.
- [ ] **4. Make the monitor the only decider.** The feed states, per side: which side leads and what state it is in. The pages only display it. Done when the browser-side copies in step 5 have nothing left to decide.
  - **Designed and approved 2026-11-06 - see "Step 4 design" below.** BLOCKED on two things: step 3 (staging) must exist first, and Chelsea must supply the display words. Do not build before both.
- [ ] **5. Delete the browser copies.** Remove the duplicated side, state and warning logic from both `mech-feed` blocks. Done when `currentBatch`, `expiredFor` and both "Not a live watch" writers are gone from the pages.
- [ ] **6. One shared price fetch and one Sheet read per page.** Done when each page has one price timer and one Sheet fetch.
- [ ] **7. Clean up.** Commit or drop PLS-20b, rename the OneDrive clone to `_OLD_DO_NOT_USE`, and replace the TURBO hardcode with a Sheet status.
  - Rename `C:\dev\levelup-sheets` to `_OLD_DO_NOT_USE` (frozen since 2026-11-05) and remove it from the `boardDir()` candidates (`scripts/sync-board-fixtures.js:62`). Fewer copies, not smarter ones.
  - Delete the four dead `staging/*` folders in the monitor repo (`staging/board`, `staging/instance-safety-fix`, `staging/overnight-audit/board-ux-fixes`, `staging/overnight-2026-09-28`). Each is a hand-copied `index.html` + `sheet.html` + `monitor-feed.json` from a previous attempt at step 3 - four attempts, none of which stuck, because a hand-made copy of a page drifts. `preview-c4e8de` replaces all of them and is generated, never hand-made.
- [ ] **8. Stale-feed alert.** Notify Ang when the feed is more than 45 minutes old.
- [ ] **9. Morning "Expiring today" review for Chelsea.** When she logs into the intake app (~4 AM), show every setup expiring that day with Keep active (adds 24h) / Let it expire buttons. No click = expires as normal. Reuse `review-queue.js` and `morning-review.js`. Build after steps 3-6. Do not build now.

## Step 4 design (approved 2026-11-06)

Approved by Ang on 2026-11-06 from the BTC long card in `LEVELUP_AUDIT\preview_B5.png`, which carries three
contradicting labels at once: a WATCHING badge with "Long Watch", a red "never triggered" sentence, and a
"CANNOT TRIGGER - STOP BROKEN BEFORE ENTRY" chip.

**Why it happens.** Not three bugs. Five independent writers each answering a DIFFERENT question, none able to
see the others. The pill answers "what does the Sheet say". The chip answers "did the engine bar it". The
banner answers "did price close past the stop". The headline answers "did it trigger" - and for this card it
returns `null`, which is exactly why the stale Sheet pill survives. The fix is one question with one answer.

### The one field

`monitor-feed.json`, per side, always present, never null:

```
assets["BTC|LONG"].card_state = { value: "DORMANT", since: "2026-11-05T14:00:00.000Z" }
```

**Value and timestamp only - NO sentence** (Ang, 2026-11-06). The monitor decides the STATE; the board maps
state to words in ONE table in ONE function. `DEAD_WATCH_SENTENCE` (`index.html:474`) moves into that table.
This is the "one sentence, one owner" rule from the Diamond decision above, applied to all seven states.
**Where the table lives: a NEW board-only file, `levelup-words.js`** (Ang, 2026-11-06). Loaded by both pages
alongside `levelup-core.js` (`index.html:678`, `sheet.html:597`). Deliberately NOT inside `levelup-core.js`:
that file is GENERATED from the monitor repo by `scripts/sync-board-core.js`, so putting member-facing wording
in it would turn every wording change from Chelsea into a monitor commit, a replay-gate run and a fixture
resync. `levelup-words.js` is owned by the board repo, generated by nothing, and is the only place any state's
words exist. It holds words only - no states, no conditions, no logic.

### Which engine facts map to each value

| Value | Mapped from |
| --- | --- |
| `TRIGGERED` | `lifecycle.trigger.reached_at` set AND `state === 'TARGETS_IN_PROGRESS'` |
| `FINISHED_WIN` | `OBJECTIVES_EXHAUSTED`, or `STOP_BOUNDARY_REACHED` with `public_display.outcome === 'CLOSED_WITH_PROGRESS'` and `tps_reached_before_stop.length` - the exact line `index.html:2109` already draws, carried over unchanged |
| `FINISHED_STOPPED` | `STOP_BOUNDARY_REACHED` with zero TPs before the stop |
| `EXPIRED` | `state === 'EXPIRED_UNTRIGGERED'`. Final, never re-evaluated |
| `DORMANT` | `cannot_trigger != null`. That field already carries the comeback: `public-feed.js:166` returns null when `dormant === false`, which is `engine.js:412 dormantFor()` |
| `WATCHING` | has a lifecycle, no trigger, `cannot_trigger == null` |
| `NOT_TRACKED` | `not_tracked != null`, or no lifecycle at all (7 sides today) |

`NOT_TRACKED` is the seventh value, added 2026-11-06. Without it the board needs a seventh branch and a copy
comes straight back. `SIX_LINE_EXIT` maps to nothing yet - see the open decision above.

`cannot_trigger`, `stop_breached` and `not_tracked` STAY in the feed as evidence (`reason`, `at`, `note`). The
board stops reading them to decide anything.

**One gate moves with it.** Every board function listed below carries `if (cls !== 'WATCHING' && cls !==
'NO_TRADE') return null` (e.g. `index.html:1998`) - Chelsea's own Active Long/Short status wins over any
mechanical clock. That gate becomes part of computing `card_state`, or the board has kept a decision.

### Every status writer on that card, and its fate

`index.html`:

| file:line | Writes | Input | Fate |
| --- | --- | --- | --- |
| `:458`, `:546` | WATCHING pill | Sheet status string | **KEEP** - demoted for every non-WATCHING state, labelled `Chelsea status:` (`:2446`) |
| `:535`, `:541` | "Long Watch" headline | Sheet headline regex | **DELETE** - direction is already the side chip |
| `:543` | LONG side chip | board `side` | **UNTOUCHED** - direction, not status |
| `:546` | "status set ..." | Sheet timestamp | **UNTOUCHED** |
| `:1488` (`applyStopBreachFlags` :1401) | red dead-watch sentence | feed `stop_breached` | **DELETE this writer** |
| `:2056` (`applyCannotTriggerPanels` :2019) | the same sentence | feed `cannot_trigger` | **KEEP** - the single sentence writer, reads `card_state` |
| `:2003-2007` -> `:2455` | CANNOT TRIGGER chip | feed `cannot_trigger` | **DELETE** - same fact as the sentence, said twice, in operator words |
| `:2161-2200` -> `:2508` | strength strip | feed `confirmation_strength` | **KEEP** - gated on `card_state`, not just `expiredFor` (`:2175`) |
| `:2096-2121` -> `:2443` | `mech-headline` | feed lifecycle | **KEEP** - becomes THE status; must return text for DORMANT/EXPIRED/NOT_TRACKED instead of null |
| `:2493-2497` | "SHORT SIDE COMPLETE - in Previous Calls" | feed + DOM | **KEEP**, but **DELETE `:2487`**, which reads the other card's rendered text (`mate.innerText`) to guess its state |
| `:1939-1944`, `:2062-2066` | CONDITION NEVER MET / NOT TRACKED chips | feed | **DELETE** - become `card_state` values |
| `:2205-2216` | TP ladder, STOPPED, COMPLETE | feed lifecycle | **KEEP** - a fact ladder; renders only for TRIGGERED/FINISHED_* |
| `:1474`, `:2051` | `is-dead` / `ct-dead` classes | two passes | **COLLAPSE TO ONE** - the reason they are separate (the 2026-11-05 unresponsive-tab fight) disappears when one pass writes |

`sheet.html` - and note it has **no `cannot_trigger` reader at all**, so the detail page cannot show the
sentence or the chip today. The card and its own detail page already disagree about BTC long, before any of
this changes:

| file:line | Writes | Fate |
| --- | --- | --- |
| `:282`, `:446` | "WATCHING - NO TRIGGER YET" | **KEEP** - same treatment as the index pill |
| `:1469` -> `:1598-1613` | `mech-headline` + Sheet-status sub-line | **KEEP** - but `resolveCurrentState(asset)` takes no `side`; it must |
| `:1320`, `:1354` | sheet.html's OWN `mechanicalFor` / `expiredFor`, also side-blind | **DELETE** |
| `:1765-1786` | "Waiting on price to open above the floor" | **DELETE** for any state but WATCHING - it renders on a dormant side today |
| `:1868-1935` | "This side never triggered / is over / finished" from a LOCAL `OVER` map at `:1880` | **DELETE the local map**, map from `card_state` |
| `:2108-2122` | strength meter | **KEEP** - same gate as the index strip |

### What the BTC long card shows afterward

```
BTC  [LONG]
No longer a live watch.                       <- the ONE status (mech-headline), wording OPEN
This setup never triggered and is no longer
valid. Shown for the record only - not
something to watch.                           <- Chelsea's locked sentence, from the table,
                                                 in the existing .mech-headline-sub slot
Chelsea status: Watching                      <- demoted, labelled as her source status
SHORT SIDE  Complete - in Previous Calls
status set Nov 5, 7:05 AM EST
```

Gone: WATCHING as a status, "Long Watch", the CANNOT TRIGGER chip, the strength strip, the separate red box.
One status, one explanation. `sheet.html?asset=BTC&side=long` renders the identical `card_state`.

### Tests to add (prefix `OD-`, "one decider")

| ID | Where | Asserts |
| --- | --- | --- |
| OD-1 | `public-feed.test.js` | Every published side carries exactly one `card_state` from the fixed list, over the full 70-asset replay (BNB-7 style) |
| OD-2 | `cannot-trigger-feed.test.js` | BTC\|LONG on the 2026-11-05 fixture -> DORMANT; at a price inside the 6% band -> WATCHING. Ties `card_state` to `dormantFor()` |
| OD-3 | `board-dom.js` | **The screenshot test.** Render the BTC\|LONG card; text matching `/WATCHING\|DORMANT\|TRIGGERED\|COMPLETE\|STOPPED\|EXPIRED\|CANNOT TRIGGER\|Long Watch/` appears exactly ONCE |
| OD-4 | `board-dom.js` | That card has no `.mech-str-strip` and no `.mech-tick` |
| OD-5 | `board-dom.js` | HYPE's completed long -> FINISHED_WIN, never the dead sentence, pink not red (carries `winner-never-red` through the new field) |
| OD-6 | `board-dom.js`, both pages | The index card and `sheet.html?asset=BTC&side=long` show the same single status, same words. The direct guard for problem 1 |
| OD-7 | `board-dom.js` | The pair line names the other side's state from its `card_state`; `mate.innerText` is never read |
| OD-8 | source-level, like `board-fixture-sync` | Neither page still contains `expiredFor` / `stopBreachedFor` / `cannotTriggerFor` / `mechanicalFor` state logic. This is step 5's acceptance test and the only kind that stays true |
| OD-9 | `public-feed.test.js` | A side whose Sheet status is Active Long/Short is never published DORMANT - today's gate at `index.html:1998`, moved into the monitor |

### Why step 3 comes first

Ordered 2026-11-06. Four reasons, heaviest first:

1. **The acceptance criterion is visual.** "Exactly one status" is something Ang reads off a card. OD-3 counts labels in a harness; it cannot tell you the card reads right. No diff answers this.
2. **It changes all 70 sides and four surfaces at once.** The moment the headline stops returning null, every card's pill demotes. There is no tenth of this change to ship.
3. **This exact card has already taken the live board down.** `index.html:2019-2026` records it: the first cut of `applyCannotTriggerPanels` fought `applyStopBreachFlags` through the MutationObserver, the tab went unresponsive mid-market, and it was reverted. Step 4 deliberately merges those two passes - the riskiest possible edit at exactly that spot.
4. **The fixture gate makes a split landing impossible.** `scripts/sync-board-fixtures.js:62` compares the monitor's fixtures to the board's origin/main. A monitor change publishing `card_state` and a board change reading it must land together, or the replay gate fails closed and a cycle publishes nothing - which is what happened at 23:31 on 2026-11-05. Staging is the only place both halves can land and be looked at before the live gate sees them.

## Evidence

The full audit from 2026-11-05 is at `C:\Users\angie\LEVELUP_AUDIT`. Start with `INVENTORY.md`. It holds the claims check, loops, rewrites, skipped work and duplicates, with file and line for each.

- `AUTOMATION.md`: every scheduled writer and the data flow
- `REPOS.md`: all 8 repos and working folders
- `TIMELINE.md`: 113 sessions and 449 documents in date order
- `gitlog_*.txt` and `raw/`: the command output behind every claim

Two audit findings were corrected on review. The Chelsea intake works (the audit flagged it as possibly dead from a stale note). The two `mech-feed` blocks are not near-copies; they share only about 240 of roughly 1,000 lines.
