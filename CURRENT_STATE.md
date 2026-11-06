# Level Up Board — Current State

Nov 5, 2026 · @Ang

**Next session starts with: rename `C:\dev\levelup-sheets` to `_OLD_DO_NOT_USE_levelup-sheets` (blocked 2026-11-06 by a stale bash handle; nothing reads it, BCS-14 enforces that), then fix plan step 5 - delete what is left of the browser copies. Still open: option (c) and the SIX_LINE_EXIT words (Chelsea), B4, B6, the "Original Chelsea published status" wording. A side-by-side pair layout for `sheet.html` is waiting in the PREVIEW for Ang's verdict - see "Pairs side by side on the detail page" below; nothing is pushed.**

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
- [ ] **Display words for each `card_state` (Chelsea, STILL OPEN 2026-11-06).** The table is BUILT and live in `levelup-words.js`, but every entry except one is a clearly-marked **placeholder**, not her words. What she has given: the DORMANT sub-line, verbatim, from 2026-11-05. What is proposed but not hers: the DORMANT headline "No longer a live watch." What is a placeholder: TRIGGERED, FINISHED_WIN, FINISHED_STOPPED, EXPIRED, NOT_TRACKED - though EXPIRED's two strings are the wording already live on the board, carried over unchanged rather than rewritten. WATCHING deliberately has no status at all: her own pill is the status for an ordinary watch. `LevelUpWords.provisionalStates()` lists what is still waiting, and OD-8b fails if that list is ever quietly emptied. When she answers, the only file that changes is `levelup-words.js`.
- [ ] **What `SIX_LINE_EXIT` maps to (STILL OPEN 2026-11-06).** It belongs to none of the seven `card_state` values and was NOT guessed. A side in that state publishes `card_state: { value: null, since, ended: true, awaiting: 'SIX_LINE_EXIT' }` - a null value routes the card down the board's existing "no claim" path, the same one a feed outage takes, so Chelsea's own status stays primary and nothing is invented. `ended` says only that the instance is OVER, which the monitor knows for certain; it carries no wording and names no outcome, and the one thing the board uses it for is to stop the live-price row pulsing under a finished trade. Nothing live can reach the state (`config/monitor.config.json` has the exit rule off), and OD-1 measures that the real replay has zero of them. Still Chelsea's answer: most likely FINISHED_STOPPED, but it is a trade outcome a member reads.
- [ ] **When NEITHER side of a pair is running, which leads? (Ang, OPEN 2026-11-06.)** The liveness rule below answers "a running side always leads". It says nothing about BTC's shape today - short FINISHED_WIN, long DORMANT, neither running - and that case falls to the EXISTING batch-window-and-recency rule, unchanged, which today puts the DORMANT long in front of the finished short. That is not a new decision and nothing was built on it; it is flagged so Ang can confirm it is what she wants.
- [ ] **What ends a triggered trade that never reaches its stop OR its last target? (Chelsea, OPEN 2026-11-06.)** Raised by ADA\|SHORT, live on the board for 14 days - see known problems 14. Today the answer is "nothing": the trade runs forever. Three candidates, none of them chosen: (a) nothing changes, a trade is open until the market resolves it; (b) a maximum age for a TRIGGERED trade, the way Watching has a 24-hour window; (c) when Chelsea publishes a new batch for an asset and does NOT republish a side, that side's old triggered instance retires at the new batch's publish time - which is what would have closed ADA\|SHORT on 2026-11-05, when she republished the ADA long and not the short. (c) is the only one that needs no new number. **Do not build any of them until she answers.**
- [ ] **CONFLICT - option (c) versus the live ADA short (Chelsea, OPEN 2026-11-06). DO NOT SWITCH ON OPTION (c) UNTIL THIS IS ANSWERED.** Option (c) would have retired this very ADA short on 2026-11-05, when Chelsea posted a new ADA long - and Ang has decided the opposite for display: that short is the live trade and must lead the card. The two cannot both be right. **The question for Chelsea: when you post a new setup for one side, does an already-running trade on the other side keep running, or close?** Until she answers, option (c) stays built and OFF, and the temporary ADA notice (known problem 17) stays on the board.
  - **(c) IS BUILT AND SWITCHED OFF (2026-11-06).** `lifecycle.batch_retirement` in `config/monitor.config.json`, `false`, with the same `_`-prefixed explanation convention as `_six_line_exit`. One gate (`monitor/run.js`, where the evidence is gathered), one decider (`monitor/lifecycle.js` `batchRetirementMs` + the state chain in `derive()`) and one new terminal state, `RETIRED_BY_NEW_BATCH`, which makes **no public claim** because the words a member reads are Chelsea's. Tests RSC-3..RSC-9; RSC-3 is the todo that goes live when the flag flips. It needs no window constant: the gate is "the batch was published strictly after this side's trigger candle", which excludes a batch-mate by construction (BTC's live pair is 3 seconds apart, PEPE's 20).
  - **AND IT CONTRADICTS THE 2026-11-06 DISPLAY DECISION.** Ang decided the same day that a dead or dormant side never leads a card and the live side always does, using ADA as the worked example: the 2026-10-23 SHORT (triggered, TP1+TP2 banked, still running) must LEAD the ADA card, with the 2026-11-05 LONG underneath. Option (c) would have retired that exact short on 2026-11-05. Both cannot be right. **The question for Chelsea, verbatim: "When you post a new setup for one side, does an already-running trade on the other side keep running, or close?"** Measured with the flag on in memory only: ADA\|SHORT is the ONLY side on the whole board option (c) would retire, and it is the running trade in question - so her answer costs exactly one card either way. Full list: `LEVELUP_AUDIT\overnight\agent_a_option_c_dryrun.md`.

## Known problems, ranked

The root cause is one decision made in several places that drift apart. Problems 1 to 4 are versions of it.

| # | Problem | Where | Why it matters |
| --- | --- | --- | --- |
| 1 | `mech-feed` exists twice and has diverged: 72 KB in `index.html`, 83 KB in `sheet.html`, only about 240 lines shared | both pages | The card and the detail page can tell a member different things |
| 2 | ~~"Which side leads a pair" is decided 3 ways~~ **FIXED 2026-11-06**: one implementation, `LevelUpCore.pickPairSide` in `core/levelup-core.js`, called by all three surfaces. Each caller still supplies its own CLOCK - sheet.html's base render passes the SHEET's publication time, the two mech layers pass the feed's - which is deliberate and is what known problem 18 is about | `core/levelup-core.js` | Caused the BTC, LINK, HYPE and ADA side bugs (8 rounds in 13 days) |
| 3 | ~~"Is this trade over" is decided in the monitor and again in both pages~~ **FIXED 2026-11-06** by `card_state`. Four separate terminal-state lists across the two pages are gone; OD-8 fails if one comes back | `monitor/public-feed.js` | Caused the HYPE red box |
| 4 | ~~Two code paths write "Not a live watch"~~ **FIXED 2026-11-06**: one pass, `applyDeadWatchPanels`, one class `.dead-watch-flag`, and the sentence itself is in `levelup-words.js`, which BOTH pages load. Neither page contains the sentence any more (B5 asserts it) | `index.html`, `levelup-words.js` | Members don't understand it; the same warning reads two ways |
| 5 | Live price fetched by 4 separate timers per page | `sheet.html:574, 787, 1555, 1686` | Different prices on screen at once |
| 6 | Whole detail page rebuilt every 60 seconds | `sheet.html:560, 587` | Restarts the voice memo and closes open sections |
| 7 | Every change ships straight to the live board | process | No safe place to test; "APPROVED & FROZEN" on 2026-09-29 was followed by 270+ commits |
| 8 | Uncommitted fix (PLS-20b) parked in the board work clone since 2026-11-04. **2026-11-06: it is now UNMERGEABLE and probably OBSOLETE - decide it before step 4 lands.** It patches `currentBatchDirs` at `sheet.html:373`, and Agent B's step-4 branch DELETES that function outright (only a tombstone remains at `:332`). Verified directly. So it can be neither committed nor rebased onto step 4 | working folder vs `overnight/b-board` | PLS-20b the TEST still passes unmodified on B's branch, so the bug it guards is covered by the single `pickPairSide` that replaced three implementations - which suggests the parked DIFF is superseded and should be DROPPED, not merged. The concern it encoded (one clock for all sides) now lives on as known problem 18 / PLS-20c, at the call sites rather than inside this function. **Ang decides: drop it, or re-apply its intent at the new call sites** |
| 9 | TURBO hidden by a hardcoded list in 4 places, still present in the data | `index.html:467` and others | Fragile; the file's own comment warns against it |
| 10 | Intake posts sometimes arrive slowly | intake app to Sheet | Not urgent; investigate after the fix plan |
| 11 | Monitor replay gate read the board working folder’s local HEAD; fixed 2026-11-05 by comparing to origin/main | `scripts/sync-board-fixtures.js` | A board change committed locally and deliberately not pushed made the gate fail closed, and the 23:31 cycle published nothing. Guarded by BFS-7 |
| 12 | …and origin/main itself went stale: nothing fetches `C:\dev\levelup-sheets` any more, so once board work moved it froze one commit behind. Fixed 2026-11-06 - the guard reads whichever clone has the NEWEST origin/main | `scripts/sync-board-fixtures.js` | Reading one fixed path either blesses a stale fixture or reds the gate a cycle after every board push. Guarded by BFS-8 and BFS-9 |
| 13 | BFS-8 itself made its two git commits milliseconds apart and compared `%ct`, which is whole SECONDS, so the replay gate went red at random. Measured 2026-11-06: 1 run in 6, and 4 in 8 under load. Fixed the same day by pinning both commit dates | `test/board-fixture-sync.test.js` | A random red fails the cycle closed and publishes nothing - the same symptom as the 23:31 outage on 2026-11-05, a different cause. Found while building step 3, fixed as a separate commit |
| 14 | **ADA\|SHORT has read as a live short for 14 days and cannot end on its own.** Triggered 2026-10-23, TP1 and TP2 banked, TP3 never reached, stop never hit - so it sits at TARGETS_IN_PROGRESS and renders as "ACTIVE SHORT - TP2 REACHED". `monitor/lifecycle.js:176` only reaches EXPIRED_UNTRIGGERED on the no-trigger branch, so a TRIGGERED trade ends only by stop (`:171`), all targets (`:172`) or six-line exit (`:173`) - and `six_line_exit` is `false` in `config/monitor.config.json:37`, withdrawn by Chelsea. There is no fourth way out | `monitor/lifecycle.js:171-176`, `config/monitor.config.json:37` | A two-week-old short reads as a trade members could still be in. **Needs a product answer from Chelsea** - see the open decision added 2026-11-06 |
| 15 | **CORRECTED 2026-11-06 - this is bigger than first recorded, and member-visible.** SEVEN published receipts carry `outcome: SIX_LINE_EXIT` - ADA, AVAX, BTC, HYPE, ONDO, PEPE, XRP - and **all seven are `ready:true` and none is voided**, so they ARE surfaced. Two of them belong to the side's CURRENT live instance: ADA\|SHORT (receipt says SIX_LINE_EXIT, live state TARGETS_IN_PROGRESS) and **PEPE\|LONG, which reached OBJECTIVES_EXHAUSTED - every target hit - and is published as SIX_LINE_EXIT / CLOSED_WITH_PROGRESS, i.e. a completed win reported as an early exit.** Origin: the 2026-10-25 incident; `scripts/clear-erroneous-six-line-exits.js:21-23` reopened the lifecycles and deliberately left the receipts, deferring a void that was never done. `monitor/receipts.js` opens a receipt when a state FIRST becomes terminal and `appendEntries` refuses a second (`RECEIPT_EXISTS`), so each outcome froze at the word the withdrawn rule produced | `scripts/clear-erroneous-six-line-exits.js:21-23`, `monitor/receipts.js` | **My 2026-11-06 note that this was "cosmetic, renders nothing" was WRONG.** I read the LIVE lifecycle's `public_display` (`ready:false`); `monitor/public-feed.js:227` filters on the RECEIPT's own FROZEN `public_display`, which is `ready:true`. Fixing it means voiding seven member-visible records - Ang's call, not a cleanup |
| 16 | **Nothing notices.** A lifecycle that has been non-terminal for two weeks produces no alert of any kind. ADA\|SHORT was found by Ang reading the board, not by the monitor | no owner yet | The same blind spot as the stale-feed gap in fix plan step 8, one layer further in: step 8 notices a feed that stopped moving, nothing notices a trade that stopped moving |
| 17 | **Temporary ADA short notice (2026-11-06). Remove when option (c) ships.** An amber full-width sentence on the ADA\|SHORT card (`index.html`) and its detail page (`sheet.html`), shipped live 01:44 on 2026-11-06 while problem 14 waits on Chelsea. One constant, one function, one ticker per page, every piece marked TEMPORARY with its own removal condition. It reads no state and makes no decision, so it cannot drift from the monitor | `index.html` (`STALE_TRADE_NOTICE`, `applyStaleTradeNotices`), `sheet.html` (same two names, `ensureStaleTradeNotice`) | It is a hardcoded ticker on the live board - the same shape as the TURBO hardcode in problem 9, which is exactly why it carries an explicit removal condition instead of becoming permanent. The constant is declared in BOTH pages because there is no shared board-owned file yet; `levelup-words.js` (step 4) is where it should end up |
| 19 | **LIVE NOW, harmless but real: `att-ui`'s `loadSheet` calls two `mech-feed` functions by BARE NAME across separate `<script>` closures, so every Sheet load throws a swallowed `ReferenceError`.** `index.html:1509` calls `applyCannotTriggerPanels(); applyStaleTradeNotices();` but both are declared inside the `mech-feed` IIFE (`index.html:1639+`), invisible to `att-ui` (`:841-1638`) - the file's own comment at `:1019` says these are separate closures. The exception lands in `loadSheet`'s `.catch`, which sets `sheetErr = true` and is read nowhere. **Nothing a member sees is broken** - mech-feed's own pass at `:2618` calls both correctly, which is why the ADA notice renders (verified live 2026-11-06 02:5x). Pre-existing: the bare `applyCannotTriggerPanels()` shipped 2026-11-05 in `d1435ea`; the ADA notice commit added a second bare name to the same already-broken line | `index.html:1509` vs `:1639`, `:2618` | An error swallowed on every Sheet load is exactly how a real failure hides. Fix is one line - call through `window.__mechFeed` as `:2618`'s neighbours already do. **Agent B has fixed it on `overnight/b-board`; it is NOT on the live board.** Numbered 19 deliberately: Agent B's branch already adds a problem 18 (two clocks / PLS-20c) |
| 20 | **A board change cannot be fully tested until it is deployed somewhere - this is what fix plan step 3 is for, measured 2026-11-06.** The replay gate reads `git show origin/main:index.html` from whichever clone has the newest origin/main, so a board change that has not shipped cannot satisfy it. Agent B's step-4 branch therefore shows **27 failures** (including PLS-20 and PLS-20b) when run normally, and 0 only when `LEVELUP_SHEETS_DIR` points the gate at its own board copy. Measured: `boardDir()` from that worktree picks `C:/dev/monitor-task/sheets`, whose page carries tonight's ADA notice (deployed) but not `cardStateFor` (not deployed) | `scripts/sync-board-fixtures.js` `readPage()`/`boardDir()` | **This is the gate working as designed, not a weak suite** - `main` runs 1102/1099/0 fail in place, and BFS-7 exists precisely so an unpushed board change cannot bless a fixture. The consequence is real though: **step 4 cannot be visually or mechanically verified end-to-end until its board half is deployed**, which is exactly the gap the staging board closes. Step 3 before step 4 was the right call. (Agent D reported this as a "dead default clone"; the dead clone is NOT the one chosen - corrected here) |
| 21 | **One-line fix outstanding on Agent B's step-4 branch before it is merged.** `index.html:1694` (branch `overnight/b-board`) says "All five of those functions are DELETED" naming `expiredFor, stopBreachedFor, cannotTriggerFor, notTrackedFor and mechanicalFor`. Four are gone; **`mechanicalFor` is still declared at `:1786` and called 21 times** - correctly, the design says KEEP it as a fact reader. Verified directly 2026-11-06. Prose only: no behavioural or test consequence, and MF-17 already pins the real change (its key list shrank 7 to 4 as its three state booleans were removed) | `index.html:1694` on `overnight/b-board` | Replace with: *"Four of those five are DELETED. `mechanicalFor` stays, stripped of the three state booleans it used to hand out (`stopped`, `complete`, `outcome` - see MF-17): it reads ladder facts and decides nothing."* Recorded rather than sent back - Ang's rule was one send-back then report, and a 2,100-line change that is otherwise correct, measured and green should not be held over one inaccurate word in a comment |

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
  - **RSC-1 and RSC-2 added 2026-11-06** (`test/receipt-state-consistency.test.js`), the first tests of the journal-versus-state class. RSC-1 sweeps the whole live feed: no published receipt may carry an `outcome` its own side's live `lifecycle.state` contradicts. It excludes two things on principle, both asserted rather than assumed - a receipt for a PAST instance (history, nothing live to contradict; RSC-1c) and a side whose lifecycle is `null` (absence of a state, not a conflicting one; RSC-1d, which is TURBO and APT today). RSC-2 proves a retroactive void withdraws the claim and writes nothing to the lifecycle, so ADA\|SHORT still reads TARGETS_IN_PROGRESS afterwards.
- [ ] **3. Staging board. DO THIS BEFORE STEP 4** (ordered 2026-11-06). A copy of the board where every change lands first. Done when Ang can open a staging link and approve before anything goes live.
  - **THE PREVIEW FOLDER IS `preview-c4e8de`** (random and unguessable by instruction, Ang 2026-11-06 - deliberately NOT "staging"). It is named in exactly two places, `scripts/publish-staging.js` and this line; nothing derives it. URL once published: `https://angiemcunningham-dot.github.io/levelup-sheets/preview-c4e8de/`
  - **Built 2026-11-06, NOT YET RUN, NOTHING PUSHED.** `scripts/publish-staging.js` (monitor repo) generates the folder in the board repo from the two WORKING TREES - the pages from `C:\dev\work\levelup-sheets`, the feed from this repo's freshly restored state via the same `buildFromDir` the live feed uses. That is what lets a monitor change and a board change be viewed together before either ships.
  - Every generated page gets a sticky full-width "PREVIEW - NOT THE LIVE BOARD" banner and its own noindex. The `.js` files are copied verbatim.
  - **Why it cannot disturb the live board.** The replay gate reads `git show origin/main:index.html` / `:sheet.html`, ROOT paths only (`scripts/sync-board-fixtures.js` PAGES and `readPage`), so a file at `preview-c4e8de/index.html` is invisible to it - asserted by STG-2, not assumed. The 15-minute runner hard-resets its own board clone and copies only `monitor-feed.json`, so it never writes here.
  - Guards: refuses any board clone but `C:\dev\work\levelup-sheets`; every write is checked to land inside the preview folder; `pull --rebase` with autostash before pushing (the runner pushes main every 15 minutes, and the clone carries the parked PLS-20b change); path-scoped `git add` and a commit WITHOUT `-a`, so PLS-20b can never be swept into a preview commit.
  - Covered by **STG-1 to STG-10** in `test/publish-staging.test.js`. STG-3 caught a real defect on the first run - the injected banner did not strip back out cleanly on `<body><div class="sheet">`, so a preview page was not the working-tree page plus the banner. Fixed before commit.
  - Still to do: review the diff, run it once, open the link. Then this step is done.
- [x] **4. Make the monitor the only decider. LIVE 2026-11-06 08:57** (board `e576b69`, monitor `e49dc6a`); the 09:01 cycle passed its gate and published. One `card_state` per side, Ang's lead order (TRIGGERED > WATCHING > FINISHED > DORMANT > EXPIRED) in one `pickPairSide`, the grey non-WATCHING pill, and the duplicated browser deciders deleted, not wrapped.
  - **IT FAILED AND WAS ROLLED BACK ONCE FIRST, 08:06-08:19, and the cause is the lesson.** `test/helpers.js` `boardCoreScript()` / `boardWordsScript()` defaulted to `C:/dev/levelup-sheets`, the frozen clone. `levelup-core.js` EXISTS there and is OLD, so with no env var the tests silently loaded a parser frozen before step 4 - no `pickPairSide` - and 30-odd tests returned null. My pre-push run was green only under `LEVELUP_SHEETS_DIR` pointing at a mirror of the new board. **The runner sets no such variable.** That was the THIRD copy of that hardcoded dead path; `sync-board-core.js:37` was the second, fixed the same day.
  - **THE RULE THAT CAME OUT OF IT: verify with `node --test` and NO env var, against the board as actually pushed. Nothing else counts.** Push the board FIRST, re-verify, then push the monitor, with `STOP` in place so no cycle lands in the gap.
  - A revert needs TWO steps: `git checkout <old> -- <paths>` does NOT delete files ADDED since. Always check `git diff --name-only --diff-filter=A <old> HEAD`.
  - Beware: editing the board WORK clone changes what the live gate reads (`boardDir()` picks the newest `origin/main`). A local reproduction there broke the 08:46 cycle. Never simulate `origin/main` in a clone the runner can choose.
  - **THE TWO HALVES MUST LAND TOGETHER.** `scripts/sync-board-fixtures.js` compares the monitor's fixtures to the board's origin/main, so a monitor change publishing `card_state` and a board change reading it have to be pushed in the same window or the replay gate fails closed and a cycle publishes nothing - which is what happened at 23:31 on 2026-11-05. Neither direction actually breaks on its own: an old board ignores the new field, and a new board reading an old feed shows no mechanical status at all and leaves Chelsea's pill primary. Both are degraded, neither is wrong.
  - **Built before step 3 rather than after**, which is not the order the design set. The work was done in dedicated worktrees against a locally served copy of the board instead, with four screenshots in `LEVELUP_AUDIT\overnight\`. Nothing was pushed, so the live board is untouched - but the visual acceptance step 3 exists to provide has been done on a local server, not a preview link.
  - **Chelsea's words are still open** (see the decision above). The wording lives in one file and nothing else changes when she answers.
- [ ] **5. Delete the browser copies.** Remove the duplicated side, state and warning logic from both `mech-feed` blocks. Done when `currentBatch`, `expiredFor` and both "Not a live watch" writers are gone from the pages.
  - **Mostly done by step 4** (2026-11-06), because the copies could not be left behind once one field answered them. Gone from both pages: `expiredFor`, `stopBreachedFor`, `cannotTriggerFor`, `notTrackedFor`, `expiredBadgeHtml`, `cannotTriggerBadgeHtml`, `notTrackedBadgeHtml`, `applyStopBreachFlags`, `currentBatch`, `activityRank`, `beatsAtRank`, `sideFinished`, `sideRank`, `sideOver`, `pickSide`, `currentBatchDirs`, and the three state booleans `mechanicalFor` used to hand out. OD-8 is the guard and reads the pages with their comments stripped, so a tombstone comment cannot satisfy it. What is LEFT for step 5: the two `mech-feed` blocks are still two blocks (known problem 1), which is a different job from removing the duplicated decisions.
- [ ] **6. One shared price fetch and one Sheet read per page.** Done when each page has one price timer and one Sheet fetch.
- [ ] **7. Clean up.** Commit or drop PLS-20b, rename the OneDrive clone to `_OLD_DO_NOT_USE`, and replace the TURBO hardcode with a Sheet status.
  - [x] **Frozen clone retired in CODE, 2026-11-06 (`9d81e04`).** It is gone from the `boardDir()` candidate list and from every active default: `scripts/sync-board-fixture.js` DEFAULT_SOURCE and `test/att-module.test.js` BOARD_DIR now point at the work clone. The refusal lists in `sync-board-core.js` / `publish-staging.js` and the tests asserting the refusal deliberately still name it. **BCS-14 enforces it**: the path may appear in a comment or a denial list, never as a value. The runner needed no change - it uses its own `monitor-task\sheets`.
  - [ ] **The folder itself is NOT yet renamed.** `C:\dev\levelup-sheets` still exists: Windows refuses the rename because a lingering `bash.exe` from the overnight agents holds a directory handle on it. Four attempts, two shells. Nothing reads it any more, so it is inert - but finish the job from a fresh session with: `Rename-Item C:\dev\levelup-sheets _OLD_DO_NOT_USE_levelup-sheets`.
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


## What step 4 actually changed (2026-11-06)

Built on `overnight/b` (monitor) and `overnight/b-board` (board). **Nothing pushed.** The spec is the "Step 4
design" section above; this records what landed, and the five places the build deviated from it.

### The monitor

`monitor/public-feed.js` grew `cardState()` and publishes `assets[key].card_state = { value, since }` for every
side. Seven values, always present, never null for a mapped state. Chelsea's-status gate (`clockOverruledBySheet`)
moved here from four separate places in the browser; it gates only DORMANT and EXPIRED, which is exactly the set
those four copies gated, and measured against the live 70-side feed on 2026-11-06 it gates nothing.

`core/levelup-core.js` grew `pickPairSide()` - the one pair-side ordering, replacing three. Liveness first,
recency only among equals (Ang, 2026-11-06, from ADA): a side whose `card_state` is TRIGGERED outranks every side
that is not running, whatever the clock says; when no side is running the batch window and the existing ranking
decide exactly as before. PLS-20 and PLS-20b rank two FINISHED sides, so rule 1 never reaches them and both still
pass untouched.

### The board

`levelup-words.js` is NEW and board-owned: the one table from `card_state` to words, plus the temporary ADA
notice sentence. Both pages load it beside `levelup-core.js` as `<script id="att-words">`. It holds words only.

Deleted from `index.html`: `expiredFor`, `stopBreachedFor`, `cannotTriggerFor`, `notTrackedFor`,
`expiredBadgeHtml`, `cannotTriggerBadgeHtml`, `notTrackedBadgeHtml`, `applyStopBreachFlags`, `currentBatch`,
`activityRank`, `beatsAtRank`, `sideFinished`, and the `.stop-breach-flag` / `.ct-dead` classes with their CSS.
Deleted from `sheet.html`: its own `expiredFor`, `SIDE_OVER_STATES`, `sideOver`, `sideRank`, `currentBatchDirs`,
`pickSide`, `SIDE_FINISHED_STATES`, `activityRank`, `beatsAtRank`, `currentBatch`, and the local `OVER` map in
`ensureSideTruth`. `mechanicalFor` survives on both pages as a reader of FACTS - which targets were reached, what
was banked before a stop, when it fired - with `stopped`, `complete` and `outcome` removed.

### WHICH LIVE CARDS CHANGE, measured not assumed (2026-11-06)

Built against `monitor-data/shadow`, 70 sides, every one of them given a `card_state`:

| value | count | |
| --- | --- | --- |
| FINISHED_STOPPED | 25 | |
| FINISHED_WIN | 21 | |
| EXPIRED | 11 | |
| DORMANT | 5 | ADA\|LONG, BTC\|LONG, DOGE\|LONG, ONDO\|LONG, XRP\|LONG |
| NOT_TRACKED | 5 | HBAR, KAS, ZZTEST, SHIB\|LONG, SHIB\|SHORT |
| TRIGGERED | 2 | ADA\|SHORT, ZEC |
| WATCHING | 1 | |

**The NOT_TRACKED five are not one group, and only one of them is a real change.**

- **SHIB\|LONG, SHIB\|SHORT** carry `not_tracked` (IMPLAUSIBLE_LEVEL_SCALE) and already showed a NOT TRACKED
  chip on main - the 2026-11-03 "please fix shib" fix. Same claim, different words.
- **HBAR, KAS, ZZTEST** have NO `not_tracked` flag, Sheet status "No Trade", no lifecycle and no matching
  receipt. **On main these carried no mechanical claim at all.** They now gain a NOT TRACKED status line and
  the NOT_TRACKED sub-sentence - and that sentence is **the one genuinely invented piece of member-facing
  wording in `levelup-words.js`**. Everything else in that file is either Chelsea's or wording already live
  on the board, carried over.

ZZTEST is a test row, so the cards a member can actually see change on are **HBAR and KAS**, both of which
Chelsea has already marked No Trade. They also drop out of Live Attention, which is the 2026-11-03 SHIB rule
generalised from "the engine refused this" to "the engine has produced no lifecycle for this".

**If Ang or Chelsea would rather those two stayed silent**, the change is `NOT_TRACKED.status = null` in
`levelup-words.js` and nothing else moves - the same mechanism WATCHING already uses. Pinned by NLC-1..NLC-4
in `test/mechanical-feed-board.test.js`, which name the assets rather than describing them.

### Two things the deletions dropped, recorded rather than quietly lost

**1. The "RETIRED <date>" line on an expired card.** `expiredBadgeHtml` drew `○ CONDITION NEVER MET` plus
`RETIRED 14h AGO`. The design deletes that chip because the first half duplicated the status line - but the
DATE half had no duplicate, and nothing displays it now. The data is still published, as `card_state.since`,
dated from the moment the watch window actually closed rather than the run that noticed. Putting the line
back is one entry in `levelup-words.js` and one read of `card_state.since`; it was not done here because it
is wording, and wording is Chelsea's. The reader that existed for it was removed rather than left unused.

**2. The near-edge stop warning, for a side the engine has NOT barred.** `stop_breached` and `cannot_trigger`
come from different engine facts and the sets genuinely differ - measured 2026-11-06, **APT carries
`stop_breached` with no `cannot_trigger`**, and SHIB\|SHORT the reverse. `stop_breached` is the NEAR edge
(price closed into the stop zone; it describes); `cannot_trigger` is the FAR edge (a 1H close through the
stop; it gates). Step 4 deletes the writer that spoke for the near edge.

For a never-triggered, still-firable side that is the RIGHT outcome: the old sentence said "this setup never
triggered and is no longer valid" about a side the engine had not barred and which could still fire, which
was simply false. What is dropped and not replaced is the quieter half - that the distance-to-trigger on such
a card no longer means much once price has been inside the stop zone. Nothing says that now. Pinned by SBO-1
and SBO-2 in `test/att-ui.test.js`. Today's only instance, APT, is unaffected: it is terminal through the
receipt fallback and reads FINISHED_STOPPED.

### Five deviations from the design, each deliberate

1. **`SIX_LINE_EXIT` was not mapped**, because its words are Chelsea's and still open. It publishes a null value
   with `awaiting` and `ended`. See the open decision above.
2. **The "Long Watch" headline is SUPPRESSED, not deleted.** The design's table says delete the writer at
   `index.html:535`. `cardHtml()` also serves every ordinary watch card, where that label is the only thing on
   the tile naming a direction (Angela, 2026-10-21: "where did the red and green go"). It is blanked in the same
   decorate pass, at the same moment and on the same condition as the pill demotion - and restored if the
   mechanical layer stops speaking.
3. **`card_state` falls back to a READY RECEIPT** when a side's lifecycle has gone. APT, HBAR and TURBO are in
   that shape today, and both pages' `mechanicalFor` already did this (ONDO's case). Without it those cards
   would read NOT_TRACKED over a trade that finished and has a receipt proving how.
4. **A null lifecycle with no receipt is NOT_TRACKED**, which is what the design says, and it is the one place
   this changes behaviour for cards that are not broken: such a side now drops out of Live Attention and carries
   a NOT TRACKED status line. Seven sides today, all of them odd or old (SHIB x2, HBAR, KAS, APT, TURBO, ZZTEST).
5. **The dead-watch panel is still a red box.** The design's "what the card shows afterward" has the sentence in
   the headline's sub-line, and index cards have no such slot. It is the single sentence writer the design's own
   keep/delete table says to keep, so it stays a panel on the card; `sheet.html` does put it in the sub-line.

### Tests

`OD-1`, `OD-1b` (`public-feed.test.js`), `OD-2`, `OD-2b`, `OD-2c` (`cannot-trigger-feed.test.js`), `OD-3` to
`OD-8b` (new `test/one-decider.test.js`), `OD-9` (`public-feed.test.js`). `PLS-23`, `PLS-24`, `PLS-25` pin the
liveness rule on both surfaces using ADA's real shape. `node --test`: 1119 tests, 1116 pass, 0 fail, 3 todo (B4,
B6/IPC-9 and PLS-20c, all pre-existing).

Two harness changes were needed and are worth knowing about. `test/board-dom.js` now builds each card with the
pill and Sheet headline `cardHtml()` really writes, and parses a single-element `innerHTML` assignment - without
both, `decorate()` threw into its own catch and the entire status pass silently did nothing in every DOM test.
And `H.withCardStates()` stamps every hand-built test feed using the MONITOR'S OWN `cardStateForEntry`, so a
fixture cannot drift from what production publishes.

### Known problem 18, new

`PLS-20c` is still a todo and step 4 did not fix it: the three surfaces now share ONE ordering but still feed it
different CLOCKS. `sheet.html`'s base render passes the Sheet's publication time (the 2026-10-30 HYPE fix); both
mech layers pass the feed's. When the monitor is behind, the card and the detail page can still name different
sides. The ordering is one function now, so this is a one-line argument change at two call sites rather than a
third implementation - but it is a real decision about which clock is right, and it is not made here.
## Pairs side by side on the detail page (2026-11-06)

**Ang, 2026-11-06: pairs show side by side on the detail page, no dropdown.**

IN THE PREVIEW ONLY. Nothing is pushed to the live board. Preview:
`https://angiemcunningham-dot.github.io/levelup-sheets/preview-c4e8de/sheet.html?asset=BTC` and `...?asset=ADA`.

### What changed on `sheet.html`

- `sideFlip()` and its `<details class="sideflip">` are **DELETED**, not hidden, and so are the `.sideflip`
  stylesheet rules, `details.sideflip{counter-reset:sect}` and the `#sideflip-retired` note the mech-feed layer
  wrote into the dropdown's body. `FINISHED_CARD_STATES` went with them: its only consumer was `isRetired()`,
  which fed that note, so a fifth terminal-state list on the page is gone rather than left unused.
- A pair renders as `<div class="sidepair">` holding two `<section class="sidecol" data-dir="long|short">`.
  Two columns at desktop width, one column at 860px and below, both sides fully open in both.
- **The order is the lead order and nothing decides it twice.** Columns are emitted in `pairedSides()`
  primary-then-quiet, which is `leadSide()` -> `LevelUpCore.pickPairSide` -> `CARD_STATE_RANK`
  (TRIGGERED > WATCHING > FINISHED > DORMANT > EXPIRED). The phone stack is pure source order: no CSS `order`
  property anywhere in a `.sidepair`/`.sidecol` rule, asserted by SBS-11, so the phone cannot disagree with the
  desktop about which side leads.
- **Per column:** its own direction tag, its own publication time, its own status, its own levels, its own
  ladder and its own live price.
- **Once for the page:** the chart, Chelsea's voice note (both already from `media()`), and the disclaimers.
  The "Levels are structure, not instructions" line and the `.dyor` "Not financial advice" block moved OUT of
  `setupHTML()` - emitted there, they printed twice in two columns - and are now emitted once by `bodyHTML()`
  beneath both columns, which is also where a member stops reading.

### The column status adds no second writer of a sentence

`sideStatusHTML(dir)` reads that side's own `card_state` off the feed and words it from
`LevelUpWords.CARD_STATE_WORDS` - the one table both pages load. Only `{DIR}` is filled. `TRIGGERED` and
`FINISHED_WIN` carry fragments for banked targets (`{PROGRESS}`, `{BANKED}`) and those are **deliberately left
at their no-progress form**: the page-top headline already composes the full sentence for the leading side by
reading the lifecycle, and composing it again here would be a second writer of one sentence. A column says WHICH
STATE its side is in; the headline says how far that side has got. `WATCHING` has `status: null` in the table on
purpose, so an ordinary watch gets no strip at all and Chelsea's own pill stays the status (SBS-7b).

Tone classes (`tone-active/complete/stopped/expired/closed`) mirror the table's `tone` one-to-one. That is what
carries the 2026-10-29 HYPE rule - a side that won is never painted red - now that the dropdown note which used
to carry it is gone.

### Two mech-feed passes became per-ladder, which removed an assumption

`ensureNowRowTruth()` and `ensureLadderHits()` read `getElementById('ladder')` and resolved the side through
`feedEntryFor()`/`WANT_SIDE` - sound while the page drew one ladder, wrong the moment both are open, because the
trailing column's ladder would be asked about the LEADING side's lifecycle. That is the 2026-10-24 BTC bug
(one side's `reached_at` stamped onto the other side's prices). Each ladder now carries `data-dir` and
`ladderSides()` / `entryForLadder()` answer it from its own side's feed entry. Single-sided pages have no
`data-dir` and fall through to `feedEntryFor()` exactly as before (SBS-12). No new decision: the state is still
the monitor's `card_state` and the hits are still that side's own lifecycle.

`livePrice()` likewise places a NOW row in **every** ladder from **one** `fetchPrices()` call - two sides of one
asset is one price - so the trailing column has a live price where it had none. `#nowp`/`#nowts` became the
classes `.now-px`/`.now-ts`, because two elements cannot share an id. This is the direction of step 6, not
against it.

The `mech-sidetruth` mismatch guard is KEPT and reworded: its last clause told a member to open a disclosure
that no longer exists, and now points at the labelled column.

### Tests: 1155 run, 1151 pass, 0 fail, 4 todo (the same 4 as before), `node --test` with NO env var

`test/pair-side-by-side.test.js` is new and is the single home of the side-by-side contract: **SBS-1 to SBS-12**.
It reads the board WORK clone's `sheet.html`, taking the path from `scripts/publish-staging.js` `BOARD_DIR`
rather than writing it out again - the 08:06 step-4 rollback was caused by a third hand-copied board path in
`test/helpers.js` silently resolving to the frozen clone.

**Why it does not read `test/fixtures/board/`, unlike every other board test.** That fixture comes from
`git show origin/main:sheet.html`, the DEPLOYED page. This layout is deliberately not deployed, so a
fixture-based test could only assert the old page. When the layout ships, the file keeps working unchanged: the
work clone is where board work is pushed from, so its working tree and its origin/main agree on push.

Four assertions were written against the dropdown and could only be satisfied by it. Each is **deleted at its old
site with a note naming its replacement**, so the contract has one home instead of four:

| Deleted | What it asserted | Replaced by |
| --- | --- | --- |
| `PP-4` (`parity-pair`) | `<details>` and `<summary>` exist | SBS-1, SBS-3, SBS-4 |
| `OD-5` (`board-option-d-legibility`) | `details.sideflip{counter-reset:sect}` | SBS-8, on `.sidecol` |
| `WNR-4` (`winner-never-red`) | the flip note's colour follows the result (a win is not red) | SBS-7, both directions |
| `WNR-5` (`winner-never-red`) | a side that never triggered says exactly that | SBS-6 |

`PP-3` and `WNR-1/2/3` are untouched and still pass - neither subject moved.

One finding worth keeping: the first draft of the SBS feed fixture set `lifecycle: null` on both sides, and
SBS-4 failed while the page was behaving exactly as it always has. `pairedSides()` only consults the lead order
when `haveMech()` is true, and `haveMech()` asks for a **lifecycle**, not a `card_state`. A hand-built feed
missing a field the board gates on tests the degradation path and reports nothing - the same trap
`H.withCardStates()` exists to close for `card_state`.

### Still open on this change

- **The column wording is PROVISIONAL, like every other `card_state` string.** `levelup-words.js` flags it:
  only the DORMANT sub-line is Chelsea's. The columns inherit that table, so when she answers, her words
  replace these and nothing in the layout changes.
- **Not reconciled with the "split pair" decision of 2026-11-05** ("the two cards STAY TOGETHER - it shows
  students the 'if this, then that'"), which was about `index.html`'s cards. This change is the detail page only
  and reads as consistent with it, but it has not been checked against the landing page.
- `index.html` is untouched. A card still links to `sheet.html?asset=X&side=Y`; the detail page now shows both
  sides whichever side was clicked, and `WANT_SIDE` still decides which one LEADS.

## Evidence

The full audit from 2026-11-05 is at `C:\Users\angie\LEVELUP_AUDIT`. Start with `INVENTORY.md`. It holds the claims check, loops, rewrites, skipped work and duplicates, with file and line for each.

- `AUTOMATION.md`: every scheduled writer and the data flow
- `REPOS.md`: all 8 repos and working folders
- `TIMELINE.md`: 113 sessions and 449 documents in date order
- `gitlog_*.txt` and `raw/`: the command output behind every claim

Two audit findings were corrected on review. The Chelsea intake works (the audit flagged it as possibly dead from a stale note). The two `mech-feed` blocks are not near-copies; they share only about 240 of roughly 1,000 lines.
