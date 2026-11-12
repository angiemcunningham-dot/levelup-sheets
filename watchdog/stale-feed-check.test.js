'use strict';
/* ================================================================================================
 * STALE-1 .. STALE-16   THE ALERTING POLICY, ON FIXTURES ONLY
 *
 * THE ONE PROHIBITION THESE TESTS HONOUR: they never touch the live feed. Every input is a made-up
 * `generated_at` and a made-up `now`, so the suite is deterministic and can never go red because of
 * something the market or the board did. That is the rule the 13h15m outage produced - a gate test
 * may block on what the CODE does, never on what the WORLD did - and it applies with double force
 * here, because this file tests the alarm itself. An alarm whose tests depend on current health is
 * not an alarm.
 *
 * These run in THIS repo, beside the script, and the workflow runs them before every check (Ang,
 * 2026-11-12: "it lives in levelup-sheets with its fixture tests beside it; the workflow runs those
 * tests itself. Nothing about the alert goes in the monitor's replay gate.")
 *
 *   node --test watchdog/
 * ============================================================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('./stale-feed-check.js');

const MIN = 60000;
const HOUR = 60 * MIN;
const T0 = Date.parse('2026-11-12T12:00:00.000Z');

/* a successful fetch of a feed generated `ageMs` before `now` */
const ok = (now, ageMs) => ({ ok: true, generatedAtMs: now - ageMs });
const fail = () => ({ ok: false });
const run = (prev, fetched, nowMs, layer) => W.decide({ prev, fetched, nowMs, layer: layer || 'cloud' });

/* ---------------------------------------------------------------------------------------------- */

test('STALE-1 the threshold IS the monitor cadence times the stale multiplier, written down', () => {
  /* The number cannot be derived across repos (see the long comment on STALE_MS), so the derivation
     is pinned here instead. If the monitor's cadence changes, this fails and names the problem. */
  assert.equal(W.CADENCE_MINUTES, 15);
  assert.equal(W.STALE_MULTIPLIER, 3);
  assert.equal(W.STALE_MS, 45 * MIN, '15 x 3 = 45 minutes');
  assert.equal(W.REMINDER_MS, 3 * HOUR, 'reminders every 3 hours (Ang, 2026-11-12)');
  assert.equal(W.FAILURES_BEFORE_ALERT, 2, 'two-strike on fetch failure (Ang, 2026-11-12)');
});

test('STALE-2 a fresh feed on a first-ever run says nothing at all', () => {
  const r = run(null, ok(T0, 7 * MIN), T0);
  assert.equal(r.alert, null, 'a healthy board must be silent, or the alarm is noise');
  assert.equal(r.next.state, 'fresh');
  assert.equal(r.next.consecutive_failures, 0);
});

test('STALE-3 exactly at the threshold is NOT stale - the alarm is "more than 45 minutes"', () => {
  /* The boundary is deliberate: an hourly feed is naturally up to a cadence old while it is simply
     forming, so a >= test would fire on a healthy board. */
  const r = run(null, ok(T0, 45 * MIN), T0);
  assert.equal(r.alert, null, '45 minutes exactly must not fire');
  assert.equal(r.next.state, 'fresh');
});

test('STALE-4 one minute past the threshold fires once, high priority', () => {
  const r = run(null, ok(T0, 46 * MIN), T0);
  assert.ok(r.alert, '46 minutes must fire');
  assert.equal(r.next.state, 'stale');
  assert.equal(r.alert.priority, 'high');
  assert.match(r.alert.title, /stale/i);
  assert.match(r.alert.message, /46 min/, 'the message states the real age');
});

test('STALE-5 the second check while still stale says NOTHING - no spam', () => {
  const first = run(null, ok(T0, 46 * MIN), T0);
  const t1 = T0 + 15 * MIN;
  const second = run(first.next, ok(t1, 61 * MIN), t1);
  assert.equal(second.alert, null, 'a 15-minute cadence must not produce a 15-minute alarm');
  assert.equal(second.next.state, 'stale');
});

test('STALE-6 ...and nothing for just under three hours', () => {
  const first = run(null, ok(T0, 46 * MIN), T0);
  const t1 = T0 + 3 * HOUR - MIN;
  const r = run(first.next, ok(t1, 46 * MIN + 3 * HOUR - MIN), t1);
  assert.equal(r.alert, null, '2h59m is not yet a reminder');
});

test('STALE-7 at three hours it reminds, once', () => {
  const first = run(null, ok(T0, 46 * MIN), T0);
  const t1 = T0 + 3 * HOUR;
  const r = run(first.next, ok(t1, 46 * MIN + 3 * HOUR), t1);
  assert.ok(r.alert, 'the 3-hour reminder must fire');
  assert.match(r.alert.title, /still stale/i);
  /* and then goes quiet again until the next 3 hours */
  const t2 = t1 + 15 * MIN;
  const r2 = run(r.next, ok(t2, 46 * MIN + 3 * HOUR + 15 * MIN), t2);
  assert.equal(r2.alert, null, 'the reminder must reset the clock, not repeat every run');
});

test('STALE-8 the 44-hour outage would have produced 1 alert + 14 reminders, not 175', () => {
  /* The real shape, replayed: 2026-11-09 11:03 ET to 2026-11-11 07:34 ET at a 15-minute cadence. */
  let st = null; let alerts = 0; let reminders = 0;
  const start = T0;
  const end = T0 + 44 * HOUR + 15 * MIN;
  for (let t = start; t <= end; t += 15 * MIN) {
    const r = run(st, ok(t, 46 * MIN + (t - start)), t);
    if (r.alert) { if (/still/i.test(r.alert.title)) reminders++; else alerts++; }
    st = r.next;
  }
  assert.equal(alerts, 1, 'exactly one "it went stale"');
  assert.equal(reminders, 14, '44 hours / 3 = 14 reminders');
  const cycles = Math.floor((end - start) / (15 * MIN)) + 1;
  assert.ok(cycles > 170, 'sanity: that really was ~177 checks');
});

test('STALE-9 recovery says so once, and carries how long it was out', () => {
  const first = run(null, ok(T0, 46 * MIN), T0);
  const t1 = T0 + 13 * HOUR + 15 * MIN;
  const r = run(first.next, ok(t1, 2 * MIN), t1);
  assert.ok(r.alert, 'recovery must be announced');
  assert.match(r.alert.title, /back/i);
  assert.match(r.alert.message, /13h15m/, 'the duration is the useful part of a recovery message');
  assert.equal(r.next.state, 'fresh');
  assert.equal(r.next.last_alert_at, null, 'recovery clears the reminder clock');
  /* and the run after recovery is silent */
  const t2 = t1 + 15 * MIN;
  assert.equal(run(r.next, ok(t2, 3 * MIN), t2).alert, null);
});

test('STALE-10 a single fetch failure is SILENT - strike one never wakes anyone', () => {
  const r = run(null, fail(), T0);
  assert.equal(r.alert, null, 'one flaky minute must not alert');
  assert.equal(r.next.consecutive_failures, 1);
  assert.equal(r.next.state, 'fresh', 'a failed fetch does not prove staleness, so no claim is made');
});

test('STALE-11 two consecutive failures fire, and say "cannot reach" not "stale"', () => {
  const one = run(null, fail(), T0);
  const t1 = T0 + 15 * MIN;
  const r = run(one.next, fail(), t1);
  assert.ok(r.alert, 'two strikes must fire');
  assert.equal(r.next.state, 'unreachable');
  assert.match(r.alert.title, /cannot reach/i);
  assert.doesNotMatch(r.alert.message, /\bis stale\b/i,
    'an unreachable check has NOT established staleness and must not claim it');
  assert.match(r.alert.message, /may be fine and the check blind/i);
});

test('STALE-12 a success between two failures resets the strike count', () => {
  const one = run(null, fail(), T0);
  assert.equal(one.next.consecutive_failures, 1);
  const t1 = T0 + 15 * MIN;
  const okRun = run(one.next, ok(t1, 5 * MIN), t1);
  assert.equal(okRun.next.consecutive_failures, 0, 'the counter must be consecutive, not cumulative');
  const t2 = t1 + 15 * MIN;
  const two = run(okRun.next, fail(), t2);
  assert.equal(two.alert, null, 'back to strike one');
});

test('STALE-13 unreachable reminds on the same 3-hour cadence, then recovers', () => {
  const one = run(null, fail(), T0);
  const t1 = T0 + 15 * MIN;
  const two = run(one.next, fail(), t1);
  const t2 = t1 + 3 * HOUR;
  const rem = run(two.next, fail(), t2);
  assert.ok(rem.alert, 'unreachable must also remind');
  assert.match(rem.alert.title, /still cannot reach/i);
  const t3 = t2 + 15 * MIN;
  const back = run(rem.next, ok(t3, 4 * MIN), t3);
  assert.ok(back.alert, 'coming back from unreachable is also announced');
  assert.match(back.alert.message, /Reachable again/);
  assert.equal(back.next.state, 'fresh');
});

test('STALE-14 unreachable -> fetch works but the feed IS stale: one stale alert, not two', () => {
  /* The transition that could double-fire. It must read as a single state change. */
  const one = run(null, fail(), T0);
  const t1 = T0 + 15 * MIN;
  const two = run(one.next, fail(), t1);
  const t2 = t1 + 15 * MIN;
  const r = run(two.next, ok(t2, 90 * MIN), t2);
  assert.ok(r.alert);
  assert.equal(r.next.state, 'stale');
  assert.match(r.alert.title, /stale/i);
  assert.doesNotMatch(r.alert.title, /back/i, 'it did not recover - it is stale');
});

test('STALE-15 every message is layer-labelled, and a duplicate is obviously a duplicate', () => {
  const pc = run(null, ok(T0, 46 * MIN), T0, 'pc');
  const cloud = run(null, ok(T0, 46 * MIN), T0, 'cloud');
  assert.match(pc.alert.title, /^\[PC check\] /);
  assert.match(cloud.alert.title, /^\[cloud check\] /);
  assert.equal(pc.alert.title.replace('[PC check] ', ''), cloud.alert.title.replace('[cloud check] ', ''),
    'same condition, same words - only the layer tag differs');
});

test('STALE-16 no message can carry a ticker, a level, or any of Chelsea’s text', () => {
  /* ntfy.sh is a third party. The only things allowed in a message are an age, a duration and the
     public board link. This asserts the shape rather than trusting the author. */
  const cases = [
    run(null, ok(T0, 46 * MIN), T0),
    run({ state: 'stale', since: new Date(T0).toISOString(), last_alert_at: new Date(T0).toISOString(), consecutive_failures: 0 }, ok(T0 + 3 * HOUR, 4 * HOUR), T0 + 3 * HOUR),
    run({ state: 'stale', since: new Date(T0).toISOString(), last_alert_at: null, consecutive_failures: 0 }, ok(T0 + HOUR, 2 * MIN), T0 + HOUR),
    run({ state: 'fresh', since: null, last_alert_at: null, consecutive_failures: 1 }, fail(), T0),
  ].filter((r) => r.alert).map((r) => r.alert);
  assert.ok(cases.length >= 3, 'sanity: this test must actually be examining messages');
  for (const a of cases) {
    const text = a.title + ' ' + a.message;
    assert.doesNotMatch(text, /\$[0-9]/, 'no price may appear in a third-party notification');
    assert.doesNotMatch(text, /\b(BTC|ETH|SOL|ZEC|AVAX|PEPE|SHIB|ADA|XRP|DOGE|LINK|HYPE|ONDO|BEAM|UNI)\b/,
      'no ticker may appear in a third-party notification');
    assert.doesNotMatch(text, /TP[123]|trigger|invalidation/i, 'no level language either');
    assert.ok(text.indexOf('angiemcunningham-dot.github.io/levelup-sheets') > -1,
      'the one link is the public board, which anyone can already open');
  }
});

test('STALE-17 human() reads the way a person reads a duration', () => {
  assert.equal(W.human(0), '0 min');
  assert.equal(W.human(46 * MIN), '46 min');
  assert.equal(W.human(60 * MIN), '1h');
  assert.equal(W.human(13 * HOUR + 15 * MIN), '13h15m');
  assert.equal(W.human(44 * HOUR), '44h');
});
