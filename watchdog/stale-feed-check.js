#!/usr/bin/env node
'use strict';
/* ================================================================================================
 * STALE-FEED ALERT — fix plan step 8. ONE script, run by BOTH layers (Ang, 2026-11-12).
 *
 * WHAT IT WATCHES. One number: the age of `generated_at` in the PUBLIC published feed —
 * https://angiemcunningham-dot.github.io/levelup-sheets/monitor-feed.json — which is literally what
 * a member's browser gets. That single number catches a failed replay gate, a rejected push, a
 * broken Pages build, a sleeping PC, a disabled task and a dead network, without enumerating any of
 * them. It deliberately does NOT read any local clone: a local clone reports the same number but
 * cannot see a Pages build failure, which is a real way for the board to go stale while every local
 * step logs `ok`.
 *
 * WHY TWO LAYERS, ONE SCRIPT.
 *   [cloud check] a scheduled GitHub Action in this PUBLIC repo. It is the AUTHORITY, because it
 *                 keeps working when the PC is off — the condition a local watchdog can never cover.
 *                 Public repo, so Actions minutes are free and unmetered (the private monitor repo
 *                 is metered, and "Actions minutes" is already on record as a cause of a board
 *                 freeze — see CURRENT_STATE.md problem 22/25 in the monitor repo).
 *   [PC check]    a Windows Task Scheduler entry running this same file every 15 minutes. It is the
 *                 PRECISION layer: GitHub's scheduled cron is queued and late, so only the local run
 *                 delivers a real 45-minute alarm. Both real outages (13h15m, 44h) happened with the
 *                 PC on, which is why this layer is worth having at all.
 * A duplicate alert from the two layers is acceptable; silence is not (Ang). Each message is tagged
 * with its layer so a duplicate is obviously a duplicate.
 *
 * WHAT IT MUST NEVER DO. Touch the monitor's publish path, the board pages, or main's index.html /
 * sheet.html. It writes nothing but its own state. It is never added to the monitor's replay gate:
 * a check on whether the board is healthy RIGHT NOW has no business deciding whether a commit may
 * publish — that confusion is known problem 22, and building the alarm the same way would repeat it.
 *
 * THE ALARM MUST NOT LIVE INSIDE THE THING IT WATCHES. The monitor's own gate is step 2 of
 * run-hourly.ps1; when it failed, every later step was skipped. A staleness check added to that
 * script would have been silenced by exactly the failure it exists to report. Hence: separate
 * schedule, separate process, separate state, sharing nothing with the runner but the URL.
 *
 * NO SENSITIVE DATA IN A MESSAGE. ntfy.sh is a third party, so a message carries an age, a duration
 * and the public board link — never a ticker, never a level, never any of Chelsea's published text.
 * The topic itself is never printed, never logged and never committed.
 * ================================================================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

/* ------------------------------------------------------------------------------------------------
 * THE THRESHOLD, AND THE ONE PLACE IT IS TYPED RATHER THAN DERIVED.
 *
 * 45 minutes = the monitor's `target_cadence_minutes` (15) x `thresholds.stale_monitor_multiplier`
 * (3), both in config/monitor.config.json IN THE MONITOR REPO. The original plan said to DERIVE it
 * so that changing the cadence moves the alarm with it. That is not reachable from here: this script
 * lives in the public board repo, the config lives in a private one, and the published feed carries
 * only `generated_at` and `last_successful_check_at` — no cadence, no thresholds. Publishing them
 * would mean changing the monitor's publish path, which this work is forbidden to touch.
 *
 * So it is typed, once, here — and `STALE-1` pins the arithmetic (15 x 3 = 45) so the derivation is
 * at least written down and tested. IF THE MONITOR'S CADENCE EVER CHANGES, THIS CONSTANT MUST BE
 * CHANGED TOO. There is no guard that can catch that across the two repos.
 * ---------------------------------------------------------------------------------------------- */
const CADENCE_MINUTES = 15;          // monitor config: target_cadence_minutes
const STALE_MULTIPLIER = 3;          // monitor config: thresholds.stale_monitor_multiplier
const STALE_MS = CADENCE_MINUTES * STALE_MULTIPLIER * 60000;      // 45 minutes

/* Once when it goes stale, then every 3 hours while it stays stale, then once on recovery (Ang,
   2026-11-12 — this replaces the earlier "again at 4 hours, then daily"). Thirteen hours at a
   15-minute cadence would be 53 identical alerts, which trains you to ignore it. */
const REMINDER_MS = 3 * 60 * 60 * 1000;

/* A fetch that fails is a THIRD state, neither fresh nor stale. Two strikes, so one flaky minute
   never wakes anyone, and the message says "cannot reach the board" rather than claiming staleness
   it has not established. */
const FAILURES_BEFORE_ALERT = 2;

const FEED_URL = 'https://angiemcunningham-dot.github.io/levelup-sheets/monitor-feed.json';
const BOARD_URL = 'https://angiemcunningham-dot.github.io/levelup-sheets/';

const LAYERS = { pc: '[PC check]', cloud: '[cloud check]' };

/* ================================================================================================
 * PURE CORE. No I/O, no clock, no network — every input is an argument, so the whole alerting policy
 * is testable on fixtures and the tests never touch the live feed.
 * ============================================================================================== */

const FRESH = 'fresh';
const STALE = 'stale';
const UNREACHABLE = 'unreachable';

function freshState() {
  return { state: FRESH, since: null, last_alert_at: null, consecutive_failures: 0 };
}

const mins = (ms) => Math.round(ms / 60000);
function human(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h + 'h' + (r ? String(r).padStart(2, '0') + 'm' : '');
}

/* decide() returns { next, alert } where alert is null or { title, message, priority, tags }.
 * `prev` may be null (first ever run). `fetched` is either {ok:true, generatedAtMs} or {ok:false}. */
function decide({ prev, fetched, nowMs, layer }) {
  const st = prev && prev.state ? Object.assign(freshState(), prev) : freshState();
  const tag = LAYERS[layer] || LAYERS.cloud;
  const next = Object.assign({}, st);
  let alert = null;

  if (!fetched || !fetched.ok) {
    next.consecutive_failures = (st.consecutive_failures || 0) + 1;
    if (next.consecutive_failures < FAILURES_BEFORE_ALERT) {
      /* strike one is silent on purpose */
      return { next, alert: null };
    }
    if (st.state !== UNREACHABLE) {
      next.state = UNREACHABLE;
      next.since = new Date(nowMs).toISOString();
      next.last_alert_at = new Date(nowMs).toISOString();
      alert = {
        title: tag + ' Cannot reach the board',
        message: 'The published feed could not be fetched on ' + next.consecutive_failures +
          ' checks in a row. This is not the same as a stale feed - the board may be fine and the' +
          ' check blind. ' + BOARD_URL,
        priority: 'default', tags: 'warning',
      };
      return { next, alert };
    }
    /* already unreachable - remind on the 3-hour cadence */
    const last = st.last_alert_at ? Date.parse(st.last_alert_at) : null;
    if (last == null || nowMs - last >= REMINDER_MS) {
      next.last_alert_at = new Date(nowMs).toISOString();
      alert = {
        title: tag + ' Still cannot reach the board',
        message: 'Unreachable for ' + human(nowMs - Date.parse(st.since || new Date(nowMs).toISOString())) +
          '. ' + BOARD_URL,
        priority: 'default', tags: 'warning',
      };
    }
    return { next, alert };
  }

  next.consecutive_failures = 0;
  const age = nowMs - fetched.generatedAtMs;

  if (age > STALE_MS) {
    if (st.state !== STALE) {
      next.state = STALE;
      next.since = new Date(nowMs).toISOString();
      next.last_alert_at = new Date(nowMs).toISOString();
      alert = {
        title: tag + ' Board feed is stale',
        message: 'The published feed is ' + human(age) + ' old (alarm at ' + mins(STALE_MS) +
          ' min). Members see Chelsea\'s levels as normal, but nothing mechanical is updating. ' + BOARD_URL,
        priority: 'high', tags: 'rotating_light',
      };
      return { next, alert };
    }
    const last = st.last_alert_at ? Date.parse(st.last_alert_at) : null;
    if (last == null || nowMs - last >= REMINDER_MS) {
      next.last_alert_at = new Date(nowMs).toISOString();
      alert = {
        title: tag + ' Board feed still stale',
        message: 'Still stale. The feed is now ' + human(age) + ' old. ' + BOARD_URL,
        priority: 'high', tags: 'rotating_light',
      };
    }
    return { next, alert };
  }

  /* fresh */
  if (st.state === STALE || st.state === UNREACHABLE) {
    const was = st.since ? nowMs - Date.parse(st.since) : null;
    next.state = FRESH;
    next.since = new Date(nowMs).toISOString();
    next.last_alert_at = null;
    alert = {
      title: tag + ' Board is back',
      message: (st.state === STALE ? 'Publishing again' : 'Reachable again') +
        (was != null ? ' - was ' + (st.state === STALE ? 'stale' : 'unreachable') + ' ' + human(was) : '') +
        '. The feed is ' + human(age) + ' old. ' + BOARD_URL,
      priority: 'default', tags: 'white_check_mark',
    };
    return { next, alert };
  }

  next.state = FRESH;
  if (!next.since) next.since = new Date(nowMs).toISOString();
  return { next, alert: null };
}

/* ================================================================================================
 * I/O EDGES. Thin on purpose - everything decidable lives in decide() above.
 * ============================================================================================== */

function getJson(url, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const u = url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    const req = https.get(u, { headers: { 'cache-control': 'no-cache' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, why: 'HTTP ' + res.statusCode }); return; }
      let s = '';
      res.on('data', (d) => { s += d; });
      res.on('end', () => {
        try { resolve({ ok: true, json: JSON.parse(s) }); }
        catch (e) { resolve({ ok: false, why: 'unparseable JSON' }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, why: e.code || e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, why: 'timeout' }); });
  });
}

/* ntfy publish. The topic is read from a file or an env var and is NEVER logged, NEVER echoed and
   NEVER written anywhere by this script. */
function notify(topic, alert, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const body = Buffer.from(alert.message, 'utf8');
    const req = https.request({
      host: 'ntfy.sh', path: '/' + topic, method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
        Title: alert.title,
        Priority: alert.priority || 'default',
        Tags: alert.tags || '',
      },
    }, (res) => { res.resume(); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }); });
    req.on('error', (e) => resolve({ ok: false, status: 0, why: e.code || e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 0, why: 'timeout' }); });
    req.end(body);
  });
}

function readState(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
function writeState(p, st) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(st, null, 1) + '\n');
}

function resolveTopic(opts) {
  if (opts.topicFile) {
    const t = fs.readFileSync(opts.topicFile, 'utf8').trim();
    if (!t) throw new Error('topic file is empty');
    return t;
  }
  const t = (process.env[opts.topicEnv || 'NTFY_TOPIC'] || '').trim();
  if (!t) throw new Error('no topic: pass --topic-file or set ' + (opts.topicEnv || 'NTFY_TOPIC'));
  return t;
}

function parseArgs(argv) {
  const o = { layer: 'cloud', state: null, topicFile: null, topicEnv: 'NTFY_TOPIC', dryRun: false, now: null, test: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--layer') o.layer = argv[++i];
    else if (a === '--state') o.state = argv[++i];
    else if (a === '--topic-file') o.topicFile = argv[++i];
    else if (a === '--topic-env') o.topicEnv = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--now') o.now = argv[++i];
    else if (a === '--send-test') o.test = true;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!LAYERS[o.layer]) { console.error('--layer must be pc or cloud'); process.exit(2); }
  const statePath = o.state || path.join(__dirname, 'state.json');
  const nowMs = o.now ? Date.parse(o.now) : Date.now();

  /* --send-test: one real notification, to prove the channel end to end. It reads the live feed for
     an honest age but makes no state change and no staleness claim. */
  if (o.test) {
    const topic = resolveTopic(o);
    const got = await getJson(FEED_URL);
    const age = got.ok && got.json && got.json.generated_at
      ? human(nowMs - Date.parse(got.json.generated_at)) : 'unknown';
    const r = await notify(topic, {
      title: LAYERS[o.layer] + ' Test alert',
      message: 'Step 8 is installed and this layer can reach your phone. The board feed is ' + age +
        ' old right now. This is a test - no alert condition was met. ' + BOARD_URL,
      priority: 'default', tags: 'test_tube',
    });
    console.log('test notification: ' + (r.ok ? 'sent (HTTP ' + r.status + ')' : 'FAILED ' + (r.why || r.status)));
    process.exit(r.ok ? 0 : 1);
  }

  const prev = readState(statePath);
  const got = await getJson(FEED_URL);
  let fetched = { ok: false };
  if (got.ok && got.json && got.json.generated_at && !isNaN(Date.parse(got.json.generated_at))) {
    fetched = { ok: true, generatedAtMs: Date.parse(got.json.generated_at) };
  }

  const { next, alert } = decide({ prev, fetched, nowMs, layer: o.layer });

  /* The log line carries no topic and no feed content - just the decision. */
  const ageTxt = fetched.ok ? human(nowMs - fetched.generatedAtMs) : 'n/a (' + (got.why || 'fetch failed') + ')';
  console.log([
    new Date(nowMs).toISOString(), o.layer,
    'feed_age=' + ageTxt,
    'state=' + (prev ? prev.state : 'none') + '->' + next.state,
    'failures=' + next.consecutive_failures,
    alert ? 'ALERT="' + alert.title + '"' : 'alert=none',
  ].join(' '));

  const changed = !prev || prev.state !== next.state ||
    prev.last_alert_at !== next.last_alert_at ||
    prev.consecutive_failures !== next.consecutive_failures;

  if (alert && !o.dryRun) {
    const topic = resolveTopic(o);
    const r = await notify(topic, alert);
    if (!r.ok) { console.error('ntfy publish FAILED: ' + (r.why || r.status)); process.exitCode = 1; }
  }

  if (!o.dryRun) writeState(statePath, next);

  /* STATE_CHANGED is what the workflow greps to decide whether to commit the orphan-branch state -
     "written only on state change" (Ang, 2026-11-12). */
  console.log('STATE_CHANGED=' + (changed ? '1' : '0'));
}

module.exports = {
  decide, freshState, human, STALE_MS, REMINDER_MS, FAILURES_BEFORE_ALERT,
  CADENCE_MINUTES, STALE_MULTIPLIER, FEED_URL, LAYERS,
};

if (require.main === module) {
  main().catch((e) => { console.error('watchdog failed: ' + (e && e.message)); process.exit(1); });
}
