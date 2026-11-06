/* GENERATED FILE - DO NOT EDIT.
 * Copied verbatim from levelup-trade-monitor core/levelup-core.js by scripts/sync-board-core.js.
 * Edit the canonical file and re-run the script. test/board-core-sync.test.js fails if this drifts.
 */
/*
 * LevelUp shared core — the ONE implementation of:
 *   Sheet CSV -> rows -> row classification -> source-row selection -> level extraction.
 * Used by the price monitor (Node) and intended for the board (browser).
 * Pure functions, no I/O, no network. The Google Sheet is the only source of Chelsea's levels.
 * It never invents a value: anything it cannot read with certainty is marked absent/ambiguous.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LevelUpCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- hashing (sync, browser + Node) ---------------- */
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const hash = (s) => cyrb53(String(s), 1).toString(16).padStart(14, '0') + cyrb53(String(s), 2).toString(16).padStart(14, '0');

  /* ---------------- CSV / rows ---------------- */
  function parseCSV(t) {
    const rows = []; let row = [], cur = '', inq = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (inq) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
      else {
        if (c === '"') inq = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += c;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  function loadRows(csvText) {
    const all = parseCSV(csvText);
    if (!all.length) return [];
    const header = all[0].map((x) => x.trim().toLowerCase());
    const rows = all.slice(1).map((r, i) => {
      const o = {};
      header.forEach((k, j) => { o[k] = (r[j] || '').trim(); });
      Object.defineProperty(o, '__i', { value: i, enumerable: false });
      return o;
    });
    // Durable row identity (T-01): the row's own content, never its position. Timestamp (parsed instant, else its normalized text) + asset.
    // True duplicates of the same (timestamp, asset) key are numbered #2, #3... in relative CSV order; __idn counts rows sharing the key.
    const seen = {};
    rows.forEach((o) => {
      const ts = _get(o, 'timestamp'); const p = parseSheetTimestamp(ts);
      const asset = _get(o, 'asset').trim().replace(/\s+/g, ' ').toUpperCase();
      const base = 'ts:' + (p.utcMs !== null && p.utcMs !== undefined ? p.utcMs + ':' + p.precision : 'raw:' + ts.trim().replace(/\s+/g, ' ').toLowerCase()) + '|' + asset;
      seen[base] = (seen[base] || 0) + 1;
      Object.defineProperty(o, '__key', { value: base, enumerable: false });
      Object.defineProperty(o, '__id', { value: seen[base] > 1 ? base + '#' + seen[base] : base, enumerable: false });
    });
    rows.forEach((o) => Object.defineProperty(o, '__idn', { value: seen[o.__key], enumerable: false }));
    return rows;
  }
  // Estimated Sheet row number (row 1 = header, row 2 = stray leftover row that the CSV export folds into the header)
  const rowRef = (o) => 'R' + (o.__i + 3);
  // Durable identity of a Sheet row (content-based). row_ref above is a position estimate for DISPLAY ONLY.
  const rowId = (o) => o.__id;

  const _get = (o, ...keys) => { for (const k of keys) { const h = Object.keys(o).find((x) => x.includes(k)); if (h && o[h]) return o[h]; } return ''; };
  const F = {
    asset: (o) => _get(o, 'asset').trim().toUpperCase(),
    status: (o) => _get(o, 'status'),
    headline: (o) => _get(o, 'headline'),
    timestamp: (o) => _get(o, 'timestamp'),
    why: (o) => _get(o, 'why'),
    warning: (o) => _get(o, 'warning'),
    confidence: (o) => _get(o, 'confidence'),
    trigger: (o, n) => (n === 3 ? _get(o, 'trigger 3', 'tigger 3') : _get(o, 'trigger ' + n)),
    targets: (o) => { const k = Object.keys(o).find((h) => h.includes('tp1') && h.includes('tp2')); return (k && o[k]) || _get(o, 'tp1'); },
    stop: (o) => _get(o, 'stop', 'stp'),
    safety: (o) => _get(o, 'safety'),
    sourceType: (o) => _get(o, 'source type'),
  };

  /* ---------------- timestamps: Sheet times are America/New_York ---------------- */
  const _etFmt = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }) : null;
  function etOffsetMs(utcMs) { // wall-clock(ET) minus UTC, in ms (negative)
    const p = {}; _etFmt.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = x.value; });
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return wall - Math.floor(utcMs / 1000) * 1000;
  }
  function etWallToUtcMs(y, mo, d, h, mi, s) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    let t = guess - etOffsetMs(guess); t = guess - etOffsetMs(t); return t;
  }
  function parseSheetTimestamp(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return { valid: false, utcMs: null, precision: null, iso: null };
    const precision = m[4] === undefined ? 'date' : 'second';
    const ms = etWallToUtcMs(+m[3], +m[1], +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return { valid: true, utcMs: ms, precision, iso: new Date(ms).toISOString() };
  }

  /* ---------------- row classification (same rules as the deployed board) ---------------- */
  const isPC = (o) => { const s = F.sourceType(o); return s ? /price/i.test(s) : /^\s*price[- ]?check/i.test(F.headline(o)); };
  const hasLevels = (o) => !!(F.trigger(o, 1) || F.trigger(o, 2) || F.trigger(o, 3) || F.targets(o) || F.stop(o) || F.safety(o));
  function srcType(o) {
    const s = (F.sourceType(o) || '').toLowerCase();
    if (s.includes('chelsea')) return 'CHELSEA SETUP';
    if (s.includes('admin')) return 'ADMIN STATUS';
    if (s.includes('price')) return 'PRICE CHECK';
    if (s) return 'OTHER / UNKNOWN';
    if (isPC(o)) return 'PRICE CHECK';
    if (!F.status(o)) return 'OTHER / UNKNOWN';
    if (/reactivat|^\s*no update since|^\s*triggered\b|not a new call from chelsea/i.test(F.headline(o) + ' ' + F.warning(o))) return 'ADMIN STATUS';
    return (hasLevels(o) || F.why(o)) ? 'CHELSEA SETUP' : 'ADMIN STATUS';
  }
  function statusClass(text) {
    const s = String(text || '').toLowerCase();
    if (/closed/.test(s)) return 'CLOSED';
    if (/invalid/.test(s)) return 'INVALIDATED';
    if (/no trade/.test(s)) return 'NO_TRADE';
    if (/watch/.test(s)) return 'WATCHING';
    if (/short/.test(s)) return 'ACTIVE_SHORT';
    if (/active|long/.test(s)) return 'ACTIVE_LONG';
    return 'UNKNOWN';
  }

  /* ---------------- number scanning ---------------- */
  const TF = /^\s*(?:h|hr|hrs|hour|hours|m|min|d|w|r)\b/i; // timeframe / ratio suffix after a number (1H, 1 HR, 1.2R)
  function scanNumbers(text) {
    const out = []; const re = /\$?\s*(\d[\d,]*(?:\.\d+)?)/g; let m;
    while ((m = re.exec(text))) {
      const idx = m.index + m[0].lastIndexOf(m[1]); const end = idx + m[1].length;
      const before = text[idx - 1]; const after = text.slice(end);
      if (before && /[A-Za-z]/.test(before)) continue;      // TP1, H1 style tokens
      if (TF.test(after)) continue;                          // 1H, 1 HR, 1.2R
      out.push({ v: parseFloat(m[1].replace(/,/g, '')), idx, end, dollar: /\$/.test(m[0]) });
    }
    return out;
  }
  function zoneAt(nums, i, text) {
    const a = nums[i], b = nums[i + 1];
    if (b && /^\s*[–—-]\s*\$?\s*$/.test(text.slice(a.end, b.idx))) {
      return { low: Math.min(a.v, b.v), high: Math.max(a.v, b.v), point: null, next: i + 2 };
    }
    return { low: a.v, high: a.v, point: a.v, next: i + 1 };
  }
  const firstZone = (text) => { const n = scanNumbers(text || ''); return n.length ? zoneAt(n, 0, text) : null; };

  /* ---------------- level objects ---------------- */
  function mkLevel(id, kind, label, zone, field, raw, state, extra) {
    return Object.assign({
      id, kind, label, zone: zone ? { low: zone.low, high: zone.high } : null, point: zone ? zone.point : null,
      state, field, raw: raw || '', review: false, notes: [],
    }, extra || {});
  }

  // 2026-10-07 fix (ARB/DOGE, Angela-reported via "should DOGE have triggered" - both were stuck
  // direction 'ambiguous' and never mechanically evaluated at all): a SHORT trigger phrased as
  // "fails to reclaim above $X" / "rather than reclaiming above $X" (price failing to get back
  // above a level - bearish) was voting 'long' just because the bare word "above" appears,
  // creating a false conflict against the correct headline+geometry 'short' evidence. A short
  // trigger legitimately uses "above" when describing the ceiling price must fail to reclaim, so
  // the word alone is not a safe signal - only treat it as 'long' when it is NOT governed by a
  // failure/negation marker (fails/failing/unable, rather than) on reclaim/hold/break.
  function dirHintFromText_(conditionSource) {
    const failureAbove = /\b(?:fails?|failing|unable)\s+(?:to\s+)?(?:reclaim|hold|break)(?:ing)?\s+above\b/i.test(conditionSource)
      || /\brather\s+than\s+reclaiming\s+above\b/i.test(conditionSource);
    if (failureAbove || /\b(loss of|below|lower[\s-]?high)\b/i.test(conditionSource)) return 'short';
    if (/\b(higher low|above)\b/i.test(conditionSource)) return 'long';
    return null;
  }

  function parseTrigger(text, n) {
    const out = { trigger: null, entry: null, dirHint: null };
    const id = 'TRIGGER_' + n;
    if (!text) { out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, null, 'Trigger ' + n, '', 'absent'); return out; }
    // entry zone phrase (may live in any trigger field)
    const em = text.match(/entry\s+zone\s+(?:approx\w*\s+)?/i);
    if (em) {
      const rest = text.slice(em.index + em[0].length); const nums = scanNumbers(rest);
      if (nums.length && nums[0].idx <= 3) out.entry = mkLevel('ENTRY_ZONE', 'entry', 'Entry zone', zoneAt(nums, 0, rest), 'Trigger ' + n, text, 'present');
    }
    const startsEntry = /^\s*entry\s+zone/i.test(text);
    const advisory = /^\s*(missed it|wait for|don'?t chase)/i.test(text);
    if (startsEntry && out.entry) { out.trigger = null; return out; }
    if (advisory) {
      const has = scanNumbers(text).length > 0;
      out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, null, 'Trigger ' + n, text, has ? 'ambiguous' : 'absent',
        { notes: [has ? 'advisory text with an embedded number - not a level definition' : 'text only - no numeric level'], advisory: true });
      return out;
    }
    // Condition-connector markers Chelsea uses when a numeric anchor needs more than a bare price touch
    // before it counts as a completed trigger (see the detailed note below, where this is first applied).
    const CONDITION_SPLIT = /\b(?:followed by|then)\b|→|->|\+|\band\s+(?=(?:a\s+)?(?:successful|confirmed|defended)\s+retest\b)/i;
    // "open-and-hold above/below <price>" (number must be close behind the direction word)
    // 2026-10-01 fix (LINK, Angela-reported board audit): this branch grabs the first number within 40 chars
    // of "hold above/below" as a simple, mechanically-evaluated trigger - deliberately unconditional on
    // whether confirmation wording like "+ defended retest" or "followed by a defended retest" follows (see
    // HBAR/SOL/ONDO in test/chelsea-2026-09-28-trigger-parsing.test.js, commit a7f99c6: that distinction was
    // examined already and is intentionally left alone here - do not "fix" it without a separate, explicit
    // product decision, since it would retroactively change how every live setup using this shape mechanically
    // evaluates, not just the one bug below). The real, narrower bug: when NO number exists anywhere in the
    // leading clause (e.g. "...above both Simple and Smooth. Entry Zone: $14.16-$14.26 after confirmation" -
    // LINK's exact case, nothing numeric before "Entry Zone"), the 40-char lookahead reached straight past the
    // sentence boundary into the Entry Zone clause and grabbed a mangled fragment of that instead of the real
    // zone. Fix: cap the number search at the "Entry Zone:" boundary; if that leaves no number, fall through
    // to the conditional/entry-zone-anchor handling below (same path ETH/ZEC already use correctly) instead of
    // fabricating a point from text that was never part of this clause.
    const hm = text.match(/(?:open[\s-]+and[\s-]+hold|open[\s-]*&[\s-]*hold|\bhold)\s+(above|below)\b/i);
    if (hm) {
      out.dirHint = hm[1].toLowerCase() === 'above' ? 'long' : 'short';
      const after = text.slice(hm.index + hm[0].length);
      const entryIdx = after.search(/entry\s+zone/i);
      const leadingClause = after.slice(0, entryIdx >= 0 ? entryIdx : after.length);
      // 2026-10-04 (SHIB, Angela-reported: no TP badges despite a real TP1 hit): the OLD code sliced the
      // leading clause down to 40 chars BEFORE scanning for a number - for a small-decimal price like
      // "$0.00000573" that starts close to "hold above" (within the 40-char proximity window the test suite's
      // XRP case depends on) but whose own digits run past char 40, this truncated the number mid-digit,
      // producing a {0,0} zone. The fix scans the FULL leading clause (never truncates a number's own digits)
      // but still only trusts a number whose START is within that same 40-char proximity window - XRP's decoy
      // "defending the 1.485-1.490 zone" number starts well past char 40 and is still correctly rejected in
      // favor of its real Entry-Zone anchor (CHELSEA-0930 XRP test, unchanged).
      const nums = scanNumbers(leadingClause).filter((x) => x.idx < 40);
      if (nums.length) {
        const z = zoneAt(nums, 0, after);
        out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, z, 'Trigger ' + n, text, 'present', { hold: hm[1].toLowerCase() });
        return out;
      }
    }
    const nums = scanNumbers(text);
    if (nums.length && nums[0].idx <= 3) {   // text starts with the price / zone
      out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, zoneAt(nums, 0, text), 'Trigger ' + n, text, 'present');
      return out;
    }
    /* 2026-10-21 (Angela-reported, found live): a PLAINLY LABELLED price. VVV, posted that morning, read
       "Entry: $27.54" and CRV read "Trigger: $0.390. Entry: $0.390" - and both parsed as 'ambiguous' with no
       zone, so the board rendered targets and a stop with NO entry level and the monitor could not track
       either. The branch directly above only catches text that STARTS with the number (idx <= 3); a label
       like "Entry: " pushes the first digit to index 8, past that window, and with no connector word there is
       nothing for the conditional branch below to match either. So the simplest phrasing Chelsea can write
       was the one shape that fell through everything.

       Deliberately narrow:
         - It only fires when the text BEGINS with the label, so a number mentioned mid-sentence is untouched.
         - It requires the number to follow the label immediately, so "Entry: after the retest, $27.54" does
           not qualify.
         - It is guarded on CONDITION_SPLIT. "Entry: $27.54, followed by a defended retest" still falls
           through to the conditional branch below and stays mechanically inert, because flattening a stated
           confirmation into a simple numeric trigger is the one thing this parser must never do.
       Verified against the full live Sheet: of 58 setups, exactly VVV and CRV change - every other
       fingerprint is byte-identical, so no live instance is re-keyed. */
    const LABELLED_PRICE = /^\s*(?:entry|trigger|execution|buy)(?:\s+(?:price|level|zone))?\s*[:\-–—]\s*/i;
    const labelled = text.match(LABELLED_PRICE);
    if (labelled && !CONDITION_SPLIT.test(text)) {
      const afterLabel = text.slice(labelled[0].length);
      const labelledNums = scanNumbers(afterLabel);
      if (labelledNums.length && labelledNums[0].idx <= 3) {
        out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, zoneAt(labelledNums, 0, afterLabel), 'Trigger ' + n, text, 'present',
          { notes: ['stated as a plainly labelled price with no confirmation wording'] });
        return out;
      }
    }
    // Conditional / multi-step trigger (e.g. "Failed 1H reclaim of approximately $X-$Y, followed by an
    // open-and-hold back below the MAs" or "Decisive loss of $X, followed by failed reclaim/lower high";
    // 2026-09-29: also "$X-$Y area + 1H open-and-hold back below the moving-average structure" ('+' as a
    // conjunction), "through $X-$Y and successful retest" ('and ... retest' as a confirmation marker), and
    // "<condition> -> <condition> -> ... through $X-$Y" where the numeric anchor comes AFTER the condition
    // arrows rather than before them):
    // Chelsea has stated a real numeric anchor, but the trigger is not a simple "touch this zone" condition -
    // it requires additional confirmation. Representing this as 'present' would let the mechanical engine
    // (monitor/engine.js line ~176, `if (level.state !== 'present' ...) continue`) silently treat a bare wick
    // touch of the anchor as a completed Chelsea trigger, which is not what she said. Representing it as the
    // old 'ambiguous'/no-zone fallback would silently DISCARD the real number she gave. Neither is acceptable,
    // so this is its own state: the numeric anchor and her confirmation wording are both preserved as
    // structured data, but `state !== 'present'` keeps every existing mechanical consumer (lifecycle.js,
    // engine.js, receipts.js all gate on `state === 'present'`) correctly inert on it - no lifecycle/trigger
    // rule changes anywhere, this asset simply stays out of mechanical evaluation until a human/product
    // decision defines how a conditional trigger should be evaluated.
    const splitAt = CONDITION_SPLIT.exec(text);
    if (nums.length && splitAt) {
      // 2026-09-29: the anchor is the first zone/number found anywhere BEFORE an "Entry Zone:" sentence
      // (parsed separately as out.entry, above) - not necessarily before the first condition-split marker,
      // since Chelsea sometimes states her confirmation steps first and the numeric anchor last (e.g. ALGO:
      // "Defense of the reload zone -> higher low -> 1H reclaim/open-and-hold through $0.130-$0.132").
      const entryIdx = text.search(/entry\s+zone/i);
      const anchorScanEnd = entryIdx >= 0 ? entryIdx : text.length;
      const anchorNums = nums.filter((x) => x.idx < anchorScanEnd);
      if (anchorNums.length) {
        const z = zoneAt(anchorNums, 0, text);
        const conditionSource = text.slice(0, anchorScanEnd);
        const conditions = conditionSource.split(CONDITION_SPLIT)
          .map((s) => s.replace(/^[\s,.→+-]+|[\s,.→+-]+$/g, '')).filter(Boolean);
        out.dirHint = dirHintFromText_(conditionSource);
        out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, z, 'Trigger ' + n, text, 'conditional', {
          review: true,
          conditions,
          notes: ['conditional/multi-step trigger: a numeric anchor is present, but Chelsea requires additional confirmation (see conditions) before this is a completed trigger - not mechanically evaluated as a simple level touch'],
        });
        return out;
      }
    }
    // 2026-09-30 fix (BNB/ETH/XRP, Angela-reported: the Trigger Readiness box was missing): unlike the branch
    // just above, sometimes Chelsea's leading condition sentence carries NO recognised connector marker at all
    // (no arrow/+/followed-by/and-retest) - the only real number lives in a trailing "Entry Zone: NNN-NNN"
    // clause, e.g. BNB: "Completed 1H hold above both Simple and Smooth plus a defending wick under the body.
    // Entry Zone: 754-761, only after confirmation." Anchoring here on "Entry Zone" itself (rather than on
    // Chelsea's ever-varying condition wording) is deliberately general: nearly every setup states an Entry
    // Zone regardless of how the leading sentence is phrased, so this covers phrasings not seen yet, not just
    // these three tickers. The whole leading clause is kept as ONE condition - never sub-split on bare
    // "and"/"with"/"plus", since those words appear constantly inside real condition text (e.g. "Simple and
    // Smooth") and splitting on them would mangle it - plus a second, explicit "Entry Zone $X-$Y" condition so
    // the existing price-check UI (which looks for a "$" in a condition string) keeps working unmodified even
    // when Chelsea's own text had no "$" sign at all.
    const ezm = /entry\s+zone\s*:?\s*(?:approx\w*\s+)?/i.exec(text);
    if (nums.length && ezm) {
      const ezNums = scanNumbers(text.slice(ezm.index + ezm[0].length));
      if (ezNums.length && ezNums[0].idx <= 3) {
        const z = zoneAt(ezNums, 0, text.slice(ezm.index + ezm[0].length));
        const conditionSource = text.slice(0, ezm.index).replace(/^[\s,.→+-]+|[\s,.→+-]+$/g, '');
        out.dirHint = dirHintFromText_(conditionSource);
        // 2026-10-04 (Angela, explicit, after the six-line trigger rule build): promoted from 'conditional' to
        // 'present'. The board's own att-ui addon (index.html's entryZoneAnchoredTrigger/approxTriggerProximity,
        // added 2026-10-02) already treats this EXACT shape as "zero ambiguity" - an explicit "Entry Zone: $X-$Y"
        // clause is a real, unambiguous Chelsea-stated zone, unlike the OTHER conditional shape just above (an
        // anchor picked from free text before a condition connector, which can grab a stray non-price number -
        // e.g. AVAX's "200" in "200 MA"). That other shape is untouched; this one no longer needs human review
        // before mechanical evaluation - it was the reason none of this session's "1H open and hold above both
        // Simple and Smooth. Entry Zone: $X-$Y"-phrased setups could ever reach rulesFor('trigger') in engine.js,
        // under the old rule or the new six-line one. conditions/review dropped - a 'present' trigger has neither.
        out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, z, 'Trigger ' + n, text, 'present', {
          notes: ['numeric anchor taken from an explicit "Entry Zone: $X-$Y" clause (promoted from conditional 2026-10-04 - see board\'s entryZoneAnchoredTrigger precedent)'],
        });
        return out;
      }
    }
    if (nums.length) { out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, null, 'Trigger ' + n, text, 'ambiguous', { review: true, notes: ['numbers found inside prose; no level definition recognised'], candidates: nums.map((x) => x.v) }); return out; }
    out.trigger = mkLevel(id, 'trigger', 'Trigger ' + n, null, 'Trigger ' + n, text, 'absent', { notes: ['text only - no numeric level'] });
    return out;
  }

  function parseTargets(text) {
    const res = { tps: [null, null, null], extended: null, state: 'absent', notes: [] };
    if (!text) return res;
    let t = text;
    const pm = t.match(/\(\s*extended\s*([^)]*)\)/i);
    if (pm) { res.extended = firstZone(pm[1]); t = t.replace(pm[0], ' '); }
    const labelled = [...t.matchAll(/(TP\s*([123])|Extended|Ext\.?)\s*:\s*([^|]*)/gi)];
    if (labelled.length) {
      labelled.forEach((m) => { const z = firstZone(m[3]); if (m[2]) res.tps[+m[2] - 1] = z; else if (z) res.extended = z; });
      res.state = 'present';
    } else if (t.includes('/')) {
      const segs = t.split('/').map((s) => s.trim()).filter(Boolean);
      segs.slice(0, 3).forEach((s, i) => { res.tps[i] = firstZone(s); });
      res.state = segs.length === 3 ? 'present' : 'ambiguous';
      if (segs.length !== 3) res.notes.push('expected 3 targets, found ' + segs.length);
    } else {
      const nums = scanNumbers(t);
      if (nums.length === 3 && /^\s*[–—-]\s*$/.test(t.slice(nums[0].end, nums[1].idx)) && /^\s*[–—-]\s*$/.test(t.slice(nums[1].end, nums[2].idx))) {
        nums.forEach((n, i) => { res.tps[i] = { low: n.v, high: n.v, point: n.v }; }); res.state = 'present';
      } else { res.state = nums.length ? 'ambiguous' : 'absent'; res.notes.push(nums.length ? 'target format not recognised' : 'no numeric targets'); }
    }
    return res;
  }

  /* 2026-10-22: a price that parses to zero or below is not a published level - it is a formatting
     casualty, and treating it as real is worse than having none. Chelsea's PEPE rows carried "$0.00" in
     the Stp field (PEPE trades near $0.0000045, so two-decimal rounding erased it); the engine recorded a
     stop breach against zero and, since a short is invalidated while price sits above its stop, barred
     PEPE|SHORT from ever triggering. `ambiguous` + review is the honest state: a number was written, so
     this is not `absent`, and every mechanical consumer gates on `present`, so it stays inert until the
     row is fixed. The raw text is preserved verbatim and no level is ever guessed. */
  function nonPositiveZone(z) {
    if (!z) return false;
    const vals = [z.low, z.high, z.point].filter((v) => v != null);
    if (!vals.length) return false;
    return vals.some((v) => !isFinite(v) || v <= 0);
  }
  function parseStop(text) {
    if (!text) return mkLevel('STOP', 'stop', 'Stop', null, 'Stp', '', 'absent');
    const nums = scanNumbers(text);
    if (!nums.length) return mkLevel('STOP', 'stop', 'Stop', null, 'Stp', text, 'absent', { notes: ['text only - no numeric level'] });
    let i = 0;
    if (nums[0].idx > 3) { const d = nums.findIndex((n) => n.dollar); if (d >= 0) i = d; }
    const stopZone = zoneAt(nums, i, text);
    if (nonPositiveZone(stopZone)) {
      return mkLevel('STOP', 'stop', 'Stop', null, 'Stp', text, 'ambiguous',
        { review: true, notes: ['stop price parsed as zero or negative - not a usable level, left mechanically inert'] });
    }
    return mkLevel('STOP', 'stop', 'Stop', stopZone, 'Stp', text, 'present');
  }

  function parseSafety(text) {
    if (!text) return mkLevel('SAFETY', 'safety', 'Safety net', null, 'Safety Net', '', 'absent');
    const nums = scanNumbers(text); const dollars = nums.filter((n) => n.dollar);
    const cands = dollars.length ? dollars : nums; const distinct = [...new Set(cands.map((c) => c.v))];
    const core = /\b(core|hard)\b/i.test(text);
    const id = core ? 'CORE_INVALIDATION' : 'SAFETY'; const kind = core ? 'core' : 'safety'; const label = core ? 'Core / hard invalidation' : 'Safety net / soft invalidation';
    if (!distinct.length) return mkLevel(id, kind, label, null, 'Safety Net', text, 'absent', { notes: ['text only - no numeric level'] });
    if (distinct.length > 1) return mkLevel(id, kind, label, null, 'Safety Net', text, 'ambiguous', { review: true, candidates: distinct, notes: ['several different numbers - level not chosen'] });
    return mkLevel(id, kind, label, { low: distinct[0], high: distinct[0], point: distinct[0] }, 'Safety Net', text, 'present', { qualifier: text });
  }

  /* 2026-10-19 (Angela-reported). Chelsea writes a per-setup invalidation on nearly every card - "Invalidation:
     1H close below 7.10" - in the WARNING column. Until now that text was only ever scanned into
     free_text_refs below, for human review, and even there any number matching another level's edge was
     filtered out - so AVAX's "1H close below 9.40", which is also its stop low, vanished entirely. The audit:
     50 of 54 live setups state an invalidation; exactly ONE produced a monitorable level, and only because its
     Safety Net column happened to contain the word "core".
     Her stated price is its own number and cannot be derived from the stop zone - of 17 "1H close below X"
     rules, 7 are exactly the stop low, 5 the stop high, 4 sit inside the zone and 1 is above it.
     Asked which standard governs where her written rule and the moving-average rule disagree, Angela:
     "the written governs."
     Only the unambiguous shape is parsed: an explicit 1H CLOSE below/under/above ONE price. Her standard is a
     close on the hourly, never a wick - Sep 23: "if you don't break it on the higher time frames, at least the
     hourly, you're not really breaking that level. You're testing it." Text that states an invalidation in any
     other form ("sustained loss beneath approximately $1.365", "failure to reclaim") is marked
     ambiguous + review so it reaches a human rather than being silently dropped - DS-25, "human eyes ...
     because AI can't spot a wonky one".
     The level is deliberately NOT in cfg.lifecycle.stop_boundary_kinds: it records evidence and notifies, and
     does not promote a setup to a terminal state. Doing that is a separate, larger decision - 29 of the 32
     cards currently showing a STOP were stopped by a 1-MINUTE wick, none by a close. */
  const WRITTEN_INVAL = /invalidation\s*[:–-]?\s*(?:a\s+)?1\s*h(?:our|r)?\s*close\s+(?:back\s+)?(below|under|above|over)\s*\$?\s*([\d][\d,]*\.?\d*)/i;
  /* 2026-11-05 (Angela, PEPE). The regex above only reads the "1H close below $X" phrasing. PEPE's two rows
     of 2026-10-22 instead say, on their own line and with nothing else on it:

         Invalidation: $0.000005050

     A plainly labelled single price - the SAME shape the trigger parser already accepts without complaint
     ("stated as a plainly labelled price with no confirmation wording"). Refusing it here cost real money of
     attention: both PEPE rows also had Stp "$0.00", so with the written price discarded too there was no
     usable stop at all, the short triggered on 10/22 and could never reach a terminal state, and it sat on
     the board as a live ACTIVE SHORT for fourteen days. Price closed through her stated invalidation on
     10/23, the very next day.

     Deliberately strict: the price must be the ENTIRE line after the label, so prose that merely mentions
     an invalidation and happens to contain a number ("sustained loss beneath approximately $1.365") still
     falls through to the human-judgment branch below, exactly as before. One number, nothing else, or it is
     not this shape.

     No side is stated, so none is recorded. `stated_side` stays null and the consumer reads the setup's own
     direction - a long is invalidated below its price, a short above it. That is not an inference about
     Chelsea's meaning, it is the definition of the word for a directional setup. */
  const WRITTEN_INVAL_BARE = /^invalidation\s*[:–-]\s*\$?\s*([\d][\d,]*\.?\d*)\s*\.?$/i;
  const WI = ['WRITTEN_INVALIDATION', 'written_invalidation', "Chelsea's written invalidation"];
  function parseWrittenInvalidation(text) {
    const t = (text || '').trim();
    if (!t) return mkLevel(...WI, null, 'Warning', '', 'absent');
    const m = t.match(WRITTEN_INVAL);
    if (!m) {
      const bare = t.split(/\r?\n/).map((ln) => ln.trim()).map((ln) => ln.match(WRITTEN_INVAL_BARE)).find(Boolean);
      if (bare) {
        const bv = parseFloat(bare[1].replace(/,/g, ''));
        if (isFinite(bv) && bv > 0) {
          return mkLevel(...WI, { low: bv, high: bv, point: bv }, 'Warning', t, 'present',
            { qualifier: t, stated_side: null, notes: ['stated as a plainly labelled price with no direction word - the side follows the setup direction'] });
        }
        return mkLevel(...WI, null, 'Warning', t, 'ambiguous', { review: true, notes: ['unparseable invalidation price'] });
      }
      if (!/invalidat/i.test(t)) return mkLevel(...WI, null, 'Warning', '', 'absent');
      /* She stated an invalidation, in prose. ABSENT, not ambiguous, and deliberately NOT review:true:
         "sustained loss beneath approximately $1.365" is a normal judgment call, not a data-quality defect,
         and flagging 31 of 54 assets as AMBIGUOUS_LEVEL would say the Sheet is broken when it is not. The raw
         text is preserved here, and the existing free_text_refs / FREE_TEXT_INVALIDATION_REFERENCE mechanism
         below already carries this kind of sentence to a human. */
      return mkLevel(...WI, null, 'Warning', t, 'absent',
        { notes: ['states an invalidation, but not as a mechanically testable 1H close - human judgment (DS-25)'] });
    }
    const v = parseFloat(m[2].replace(/,/g, ''));
    if (!isFinite(v) || v <= 0) return mkLevel(...WI, null, 'Warning', t, 'ambiguous', { review: true, notes: ['unparseable invalidation price'] });
    const side = /below|under/i.test(m[1]) ? 'below' : 'above';
    return mkLevel(...WI, { low: v, high: v, point: v }, 'Warning', t, 'present', { qualifier: t, stated_side: side });
  }

  const mid = (l) => (l && l.zone ? (l.zone.low + l.zone.high) / 2 : null);
  function inferDirection(row, levels, dirHints) {
    const votes = { long: [], short: [] };
    const head = F.headline(row), st = F.status(row);
    /* A TRIGGER-WORDING HINT MAY NOT CONTRADICT AN EXPLICIT HEADLINE (2026-11-02, Angela: "qnt watching
       but no strength level"). dirHintFromText_ returns 'short' for a bare "below" anywhere in the
       condition text, and Chelsea's prose is full of the word in senses that have nothing to do with a
       trigger. QNT on 10/30 read "Entry 203.38, but below key resistance so wait for confirmation before
       entering" - "below" describing where price sits against resistance, not a rule. That lone hint
       collided with a headline saying "Long Watch" and with target-versus-stop geometry pointing the same
       way; inferDirection returned null for conflicting evidence, and with no direction the engine built
       NO lifecycle at all - no trigger, no targets, no readiness, no strength meter. QNT sat on the board
       for three days with nothing mechanical on it.
       HBAR is ALSO direction-ambiguous and is deliberately NOT fixed by this: there the headline says
       long and the target GEOMETRY says short, which is a real disagreement inside Chelsea's own numbers
       and belongs to a human, not to a parser rule. Geometry is not a dirHint and never passes through
       the filter below. (APT and KAS resolve their direction fine; whatever stops those two is
       elsewhere.)
       This is the rule the setup-phrase fallback below already states for itself - it "can never
       contradict or outvote an explicit headline" - applied to the other soft signal. Deliberately
       narrow: the hint is dropped ONLY where the headline names one direction unambiguously and the hint
       disagrees. A headline naming neither, or both, leaves the hint exactly as it was, and a hint that
       AGREES still votes - so nothing that resolved before resolves differently now. Level extraction is
       untouched; this changes which evidence is admitted, not how a level is read. */
    const headShort = /\bshort\b/i.test(head), headLong = /\blong\b/i.test(head);
    const headDir = headShort !== headLong ? (headShort ? 'short' : 'long') : null;
    dirHints.forEach((h) => { if (headDir && h !== headDir) return; votes[h].push('trigger wording (open-and-hold above/below)'); });
    if (/\bshort\b/i.test(head)) votes.short.push('headline'); if (/\blong\b/i.test(head)) votes.long.push('headline');
    if (/short/i.test(st)) votes.short.push('status'); else if (/active long|\blong\b/i.test(st)) votes.long.push('status');
    /* 2026-10-22 (Angela, live: NEAR opened above both MAs at 6:00 and 7:00 AM on 10-21 and the board never
       knew). Chelsea's ADMIN UPDATE rows carry the direction in the BODY rather than the headline:
         headline: "NEAR - ADMIN UPDATE - Revised Levels for Diamond Pattern Breakout Entry"
         warning:  "Chelsea has updated the published NEAR long watch setup with new numbers..."
       The word "long" is right there, stated by Chelsea, and the headline never says it - so NEAR had exactly
       one direction source (target geometry), fell under the two-agreeing-sources bar, and came out
       DIRECTION_AMBIGUOUS. Without a direction the engine cannot say which side of a level counts as "beyond",
       so it built no lifecycle at all: no trigger, no targets, no strength meter, nothing on the board.

       This is explicit WORDING, not geometry - the thing the rules say decides direction. Two deliberate
       limits keep it narrow:
         1. FALLBACK ONLY. Skipped entirely whenever the headline or status already voted, so it can never
            contradict or outvote an explicit headline, and can never turn a clean setup ambiguous.
         2. A SETUP PHRASE, never a bare word. "long watch", "short setup", "long trade setup". Chelsea's prose
            is full of "short-term", "long-term", "as long as" and "shorts" - matching a bare long in a
            paragraph of market commentary would invent direction from nothing, which is worse than refusing.
            The pattern is anchored on the noun for exactly that reason. */
    if (!votes.long.length && !votes.short.length) {
      const SETUP_DIRECTION_PHRASE = /\b(long|short)[\s-]+(?:watch|setup|trade|position|idea|call)\b/gi;
      const body = [F.why(row), F.warning(row)].filter(Boolean).join('  ');
      const seen = { long: false, short: false };
      let m;
      while ((m = SETUP_DIRECTION_PHRASE.exec(body)) !== null) seen[m[1].toLowerCase()] = true;
      // Both named in one body says nothing usable; stay silent rather than pick one.
      if (seen.long !== seen.short) votes[seen.long ? 'long' : 'short'].push('setup wording in the row body (the headline states no direction)');
    }
    const trig = levels.find((l) => l.kind === 'trigger' && l.state === 'present'), tp1 = levels.find((l) => l.id === 'TP1' && l.state === 'present'), stop = levels.find((l) => l.id === 'STOP' && l.state === 'present');
    // Geometry is only informative when the two prices actually differ. When Chelsea's TP1 sits at exactly the
    // same price as the trigger/stop (e.g. ONDO 2026-09-28: trigger $0.587, TP1 $0.587 - both numbers are hers,
    // preserved exactly, not changed here), `mid(tp1) > mid(trig)` is neither true nor meaningfully false - the
    // old code silently voted 'short' via the ternary's else-branch, which could outvote two genuine explicit
    // signals (headline + trigger wording) and force the whole setup to direction: null. A tie casts no vote at
    // all; it is recorded as a diagnostic instead so the conflict stays visible without being fabricated evidence.
    const EPS = 1e-9;
    let geometryTie = false;
    if (trig && tp1) { const a = mid(tp1), b = mid(trig); if (Math.abs(a - b) < EPS) geometryTie = true; else (a > b ? votes.long : votes.short).push('target geometry'); }
    else if (stop && tp1) { const a = mid(tp1), b = mid(stop); if (Math.abs(a - b) < EPS) geometryTie = true; else (a > b ? votes.long : votes.short).push('target vs stop geometry'); }
    const tieNote = geometryTie ? ['DIRECTION_EXPLICIT_GEOMETRY_CONFLICT: TP1 is priced at exactly the same level as the trigger/stop, so target geometry could not vote on direction - explicit wording (headline/trigger/status) decided it instead'] : [];
    const L = votes.long.length, S = votes.short.length;
    if (L >= 2 && S === 0) return { value: 'long', status: 'present', evidence: votes.long, notes: tieNote };
    if (S >= 2 && L === 0) return { value: 'short', status: 'present', evidence: votes.short, notes: tieNote };
    if (L && S) return { value: null, status: 'ambiguous', evidence: votes, notes: ['conflicting direction evidence'] };
    return { value: null, status: (L + S) ? 'ambiguous' : 'absent', evidence: votes, notes: ['fewer than two agreeing direction sources', ...tieNote] };
  }

  /* near / far edges as price approaches the level in the direction of the trade */
  function edges(level, direction) {
    if (!level.zone) return null;
    const { low, high } = level.zone; const d = direction;
    /* Her written invalidation is evaluated literally - the side comes from her own words (stated_side),
       never from the trade's direction, so "1H close below X" on a long and on a short both mean the same
       test. A point zone, so near === far === her price. */
    if (level.kind === 'written_invalidation') {
      /* 2026-11-05: the bare "Invalidation: $X" form states no side, so there are no words to be literal
         about and the fallback below ("close below her price") would be silently wrong for every SHORT -
         a short is invalidated ABOVE its price, not below it. Where she named a side it still governs
         exactly as before; where she did not, the direction does, which is the same orientation
         stop/safety/core already use at the end of this function. */
      if (!level.stated_side) return d === 'long' ? { near: high, far: low, pre: 'above' } : { near: low, far: high, pre: 'below' };
      return level.stated_side === 'above' ? { near: low, far: high, pre: 'below' } : { near: high, far: low, pre: 'above' };
    }
    if (level.kind === 'trigger') return d === 'long' ? { near: low, far: high, pre: 'below' } : { near: high, far: low, pre: 'above' };
    if (level.kind === 'entry') return d === 'long' ? { near: low, far: high, pre: 'below' } : { near: high, far: low, pre: 'above' };
    if (level.kind === 'tp' || level.kind === 'extended') return d === 'long' ? { near: low, far: high, pre: 'below' } : { near: high, far: low, pre: 'above' };
    // stop / safety / core sit against the trade: long -> below entry (price falls into it)
    return d === 'long' ? { near: high, far: low, pre: 'above' } : { near: low, far: high, pre: 'below' };
  }

  function extractLevels(row) {
    const levels = []; const dirHints = []; const flags = [];
    let entry = null;
    for (let n = 1; n <= 3; n++) {
      const r = parseTrigger(F.trigger(row, n), n);
      if (r.trigger) levels.push(r.trigger);
      if (r.dirHint) dirHints.push(r.dirHint);
      if (r.entry && !entry) entry = r.entry; else if (r.entry && entry && (r.entry.zone.low !== entry.zone.low || r.entry.zone.high !== entry.zone.high)) { entry.state = 'ambiguous'; entry.review = true; entry.notes.push('conflicting entry zones'); }
    }
    levels.push(entry || mkLevel('ENTRY_ZONE', 'entry', 'Entry zone', null, 'Trigger 1-3', '', 'absent'));
    const tg = parseTargets(F.targets(row));
    for (let i = 0; i < 3; i++) {
      const z = tg.tps[i];
      levels.push(z ? mkLevel('TP' + (i + 1), 'tp', 'TP' + (i + 1), z, 'TP field', F.targets(row), 'present') : mkLevel('TP' + (i + 1), 'tp', 'TP' + (i + 1), null, 'TP field', F.targets(row), tg.state === 'ambiguous' ? 'ambiguous' : 'absent', { notes: tg.notes }));
    }
    levels.push(tg.extended ? mkLevel('EXTENDED', 'extended', 'Extended', tg.extended, 'TP field', F.targets(row), 'present') : mkLevel('EXTENDED', 'extended', 'Extended', null, 'TP field', '', 'absent'));
    levels.push(parseStop(F.stop(row)));
    const sf = parseSafety(F.safety(row)); levels.push(sf);
    if (sf.id === 'SAFETY') levels.push(mkLevel('CORE_INVALIDATION', 'core', 'Core / hard invalidation', null, 'Safety Net', '', 'absent'));
    else levels.push(mkLevel('SAFETY', 'safety', 'Safety net / soft invalidation', null, 'Safety Net', '', 'absent'));
    levels.push(parseWrittenInvalidation(F.warning(row)));
    const direction = inferDirection(row, levels, dirHints);
    // free-text invalidation references (never monitored, always for human review)
    const known = levels.filter((l) => l.zone).flatMap((l) => [l.zone.low, l.zone.high]);
    const refs = [];
    [['WHY', F.why(row)], ['Warning', F.warning(row)], ['Confidence', F.confidence(row)]].forEach(([field, text]) => {
      (text || '').split(/(?<=[.!?])\s+|\n+/).forEach((sent) => {
        if (!/invalidat|soft\s+invalid|hard\s+invalid|core\s+(?:structural\s+)?level|\bstop\b/i.test(sent)) return;
        const nums = scanNumbers(sent).map((n) => n.v).filter((v) => !known.some((k) => Math.abs(k - v) < 1e-12));
        if (nums.length) refs.push({ field, snippet: sent.trim().slice(0, 200), numbers: [...new Set(nums)] });
      });
    });
    return { levels, direction, free_text_refs: refs, flags };
  }

  /* WRITTEN_INVALIDATION is excluded on purpose (2026-10-19). The fingerprint identifies Chelsea's published
     TRADE levels - trigger, targets, stop - and a change to it means she has published a different setup, which
     resets state and supersedes the receipt. Her Warning-column invalidation is a condition on the same trade,
     not a different trade. It is also newly parsed: including it would have re-keyed 19 of the 54 live
     instances the moment this shipped, mass-superseding receipts for setups nobody had republished. */
  const FINGERPRINT_EXCLUDED = ['WRITTEN_INVALIDATION'];
  function levelFingerprint(ex) {
    const parts = ex.levels.filter((l) => l.state === 'present' && l.zone && !FINGERPRINT_EXCLUDED.includes(l.id)).map((l) => l.id + ':' + l.zone.low + '-' + l.zone.high);
    return hash((ex.direction.value || '?') + '|' + parts.join(','));
  }

  /* ---------------- per-asset selection (identical semantics to the repaired board) ---------------- */
  function groupByAsset(rows) {
    const m = {}; rows.forEach((r) => { const a = F.asset(r); if (a) (m[a] = m[a] || []).push(r); }); return m;
  }
  function sortRows(rows) {
    return rows.slice().sort((a, b) => {
      const ta = parseSheetTimestamp(F.timestamp(a)).utcMs, tb = parseSheetTimestamp(F.timestamp(b)).utcMs;
      const x = ta === null ? -Infinity : ta, y = tb === null ? -Infinity : tb;
      return x === y ? a.__i - b.__i : (x < y ? -1 : 1);
    });
  }
  const tsInfo = (o) => { const p = parseSheetTimestamp(F.timestamp(o)); return { ts_text: F.timestamp(o), iso: p.iso, utcMs: p.utcMs, precision: p.precision }; };

  function selectRows(assetRows) {
    const rs = sortRows(assetRows);
    const auth = rs.filter((o) => !isPC(o) && F.status(o));
    const cur = auth[auth.length - 1] || rs[rs.length - 1];
    const upto = rs.slice(0, rs.indexOf(cur) + 1).reverse().filter((o) => !isPC(o));
    // T-07: a Chelsea setup row must not replace a valid level-bearing setup merely because it contains WHY. Prefer the most
    // recent Chelsea setup row that actually HAS levels; only fall back to a WHY-only Chelsea row if none ever has levels.
    const S = upto.find((o) => srcType(o) === 'CHELSEA SETUP' && hasLevels(o)) || upto.find((o) => srcType(o) === 'CHELSEA SETUP' && F.why(o)) || upto.find(hasLevels) || upto.find((o) => F.why(o)) || cur;
    // 2026-09-29 fix: a PRICE CHECK row belongs to the CURRENT setup instance's own monitoring window only - never
    // a prior, superseded instance's. Scoped by timestamp (>= the current instance's own setup row S), since a
    // price-check row carries no level fingerprint of its own to compare directly. A row with an unparseable
    // timestamp is excluded rather than guessed into either window. Real case this fixes: LINK/TAO's fresh
    // 2026-09-29 setups were showing a "last price check" from their OLD instance, ~9 days earlier.
    const sMs = tsInfo(S).utcMs;
    const lastPC = [...rs].reverse().find((o) => { if (!isPC(o)) return false; const ms = tsInfo(o).utcMs; return ms !== null && sMs !== null && ms >= sMs; }) || null;
    return { rows: rs, cur, S, lastPC, carried: S !== cur };
  }

  function buildSetup(asset, assetRows) {
    const sel = selectRows(assetRows);
    const ex = extractLevels(sel.S);
    const fp = levelFingerprint(ex);
    // publication time = earliest non-price-check row carrying the identical level set
    const same = sel.rows.filter((o) => !isPC(o) && hasLevels(o) && levelFingerprint(extractLevels(o)) === fp);
    const pubRow = same[0] || sel.S;
    // SETUP INSTANCE = the actual published call. levelFingerprint (above) identifies the level configuration only and is deliberately unchanged.
    // Instance time = the CHELSEA SETUP row that carries the levels (NOT `publication`, which collapses re-posts onto the earliest identical-levels row),
    // so a later admin/status row that merely restates the levels is not a new call, while a new Chelsea setup row with identical levels is.
    const iti = tsInfo(sel.S);
    const itsPart = iti.utcMs !== null ? String(iti.utcMs) : 'raw:' + String(iti.ts_text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const earlierInstances = new Set(sel.rows.filter((o) => !isPC(o) && srcType(o) === 'CHELSEA SETUP' && hasLevels(o) && levelFingerprint(extractLevels(o)) === fp).map((o) => tsInfo(o).utcMs).filter((ms) => ms !== null && iti.utcMs !== null && ms < iti.utcMs));
    const stClass = statusClass(F.status(sel.cur));
    const flags = [];
    const present = ex.levels.filter((l) => l.state === 'present' && l.zone).length;
    // A 'conditional' trigger (see parseTrigger) still carries a real Chelsea-stated numeric anchor - NO_NUMERIC_TRIGGER
    // would be false for it. It is intentionally its own, separate flag rather than being folded into NO_NUMERIC_TRIGGER
    // or silently treated the same as a simple present trigger.
    if (!ex.levels.some((l) => l.kind === 'trigger' && l.zone && (l.state === 'present' || l.state === 'conditional'))) flags.push('NO_NUMERIC_TRIGGER');
    if (ex.levels.some((l) => l.kind === 'trigger' && l.state === 'conditional')) flags.push('CONDITIONAL_TRIGGER');
    if (ex.direction.status !== 'present') flags.push('DIRECTION_' + ex.direction.status.toUpperCase());
    if (ex.direction.notes && ex.direction.notes.some((nt) => nt.startsWith('DIRECTION_EXPLICIT_GEOMETRY_CONFLICT'))) flags.push('DIRECTION_EXPLICIT_GEOMETRY_CONFLICT');
    if (ex.levels.some((l) => l.review)) flags.push('AMBIGUOUS_LEVEL');
    if (ex.free_text_refs.length) flags.push('FREE_TEXT_INVALIDATION_REFERENCE');
    if (!present) flags.push('NO_MONITORABLE_LEVELS');
    if (tsInfo(pubRow).precision === 'date') flags.push('PUBLICATION_DATE_ONLY');
    // Row-identity data quality (T-01): the status/setup row shares its (timestamp, asset) key with another row, or its time cannot be read.
    if (sel.cur.__idn > 1 || sel.S.__idn > 1) flags.push('DUPLICATE_ROW_IDENTITY');
    if (tsInfo(sel.cur).utcMs === null || tsInfo(sel.S).utcMs === null) flags.push('UNPARSEABLE_ROW_TIMESTAMP');
    return {
      asset,
      status: { text: F.status(sel.cur), class: stClass, row_ref: rowRef(sel.cur), row_id: rowId(sel.cur), source_type: srcType(sel.cur), ...tsInfo(sel.cur) },
      setup_row: { row_ref: rowRef(sel.S), row_id: rowId(sel.S), source_type: srcType(sel.S), ...tsInfo(sel.S) },
      carried: sel.carried,
      publication: { row_ref: rowRef(pubRow), row_id: rowId(pubRow), rows_with_same_levels: same.map(rowRef), ...tsInfo(pubRow) },
      direction: ex.direction,
      levels: ex.levels,
      free_text_refs: ex.free_text_refs,
      fingerprint: fp,
      setup_instance: { key: asset + '|' + itsPart + '|' + fp, asset, published_ms: iti.utcMs, published_iso: iti.iso, ts_text: iti.ts_text, row_id: rowId(sel.S), levels_fingerprint: fp, ordinal: earlierInstances.size },
      last_price_check: sel.lastPC ? { row_ref: rowRef(sel.lastPC), ...tsInfo(sel.lastPC), headline: F.headline(sel.lastPC) } : null,
      row_counts: sel.rows.reduce((a, o) => { const t = srcType(o); a[t] = (a[t] || 0) + 1; a.total++; return a; }, { total: 0 }),
      history_row_refs: sel.rows.map(rowRef),
      data_quality_flags: flags,
      reasoning_reference: { asset, setup_row: rowRef(sel.S), setup_timestamp: F.timestamp(sel.S), board: 'sheet.html?asset=' + asset },
      // Verbatim copy of Chelsea's published words for the setup row (used by journal receipts; never rewritten or summarised)
      published_text: {
        source_row_ref: rowRef(sel.S), source_row_id: rowId(sel.S), timestamp_text: F.timestamp(sel.S), headline: F.headline(sel.S), why: F.why(sel.S), warning: F.warning(sel.S), confidence: F.confidence(sel.S),
        triggers: [1, 2, 3].map((n) => F.trigger(sel.S, n)), targets: F.targets(sel.S), stop: F.stop(sel.S), safety: F.safety(sel.S),
      },
    };
  }

  /* The direction a SINGLE row implies, read from that row alone - never from the asset's other rows.
     Rows without levels (admin status, price checks, WHY-only) have no direction of their own. */
  function directionProbe(row) {
    if (!row || !hasLevels(row)) return null;
    try { const d = extractLevels(row).direction; return (d && d.value) || null; } catch (e) { return null; }
  }

  /*
   * 2026-10-20 (Angela-reported). Chelsea published FOUR setups that morning - a long AND a short on both AVAX
   * and UNI, the two sides of a diamond - and the board showed two. selectRows deliberately picks ONE source
   * row per asset, because a newer row normally SUPERSEDES an older one (a republish). It had no way to tell
   * "a new version of the AVAX setup" from "a second, different AVAX setup", so the AVAX short and the UNI
   * long were silently discarded.
   *
   * DIRECTION is the discriminator: a republish keeps its direction, a genuinely separate setup does not.
   * Parsed in isolation the four rows that morning were unambiguous - AVAX short at 9.062 and AVAX long at
   * 9.27, UNI long at 7.369 and UNI short at 6.74 - and the headlines said "Short Watch" / "Long Watch".
   *
   * KEYING. An asset with one direction keeps its bare key, so nothing re-keys for the ~50 single-sided
   * setups and no receipt is mass-superseded (the hazard that nearly fired on 2026-10-19 when a new level
   * was briefly included in the fingerprint). A two-sided asset gets BOTH sides suffixed - AVAX|LONG and
   * AVAX|SHORT - rather than one of them arbitrarily holding the bare key, since a pair has no primary.
   * setup.asset stays the plain symbol and setup_instance.key is unchanged, so only the COLLECTION key moves.
   *
   * Non-directional rows go to both sides: a "No Trade" status or a price check applies to the asset, so it
   * should reach whichever side is still live.
   */
  /* A pair is two setups published TOGETHER. Chelsea posts a batch each morning - the 2026-10-20 pairs were
     five seconds apart. A direction change WEEKS apart is not a pair, it is a republish that supersedes, and
     treating it as a pair would resurrect setups Chelsea had long since replaced (caught by the 17-asset
     replay fixture, where AVAX legitimately flipped long to short across September). Two hours is far wider
     than a morning batch and far narrower than any real republish gap. */
  const PAIR_WINDOW_MS = 2 * 60 * 60 * 1000;

  function groupBySetup(rows) {
    const byAsset = groupByAsset(rows); const out = {};
    Object.keys(byAsset).forEach((a) => {
      const rs = byAsset[a];
      const dirs = [...new Set(rs.map(directionProbe).filter(Boolean))];
      const single = () => { out[a] = { asset: a, direction: dirs.length === 1 ? dirs[0] : null, rows: rs }; };
      if (dirs.length <= 1) return single();

      /* A pair exists if ANY row of one direction was ever published within the window of ANY row of the
         other - not just the newest of each. Comparing only the newest rows looked right and was worse than
         the bug it fixed: correcting ONE side later in the day (Chelsea's AVAX short stop needed its upper
         bound back on 2026-10-20) pushed the two newest rows outside the window, so the pair dissolved and
         the untouched LONG was silently superseded. Anchoring on the original batch means a later correction
         cannot retire its own sibling. A genuine republish weeks later still has no pair of rows within the
         window in any combination, so that case is unchanged. */
      const timesOf = (d) => rs.filter((r) => directionProbe(r) === d).map((r) => tsInfo(r).utcMs).filter((v) => v !== null);
      const paired = dirs.some((a, i) => dirs.slice(i + 1).some((b) =>
        timesOf(a).some((ta) => timesOf(b).some((tb) => Math.abs(ta - tb) <= PAIR_WINDOW_MS))));
      if (!paired) return single();

      const shared = rs.filter((r) => directionProbe(r) === null);
      dirs.sort().forEach((d) => {
        out[a + '|' + d.toUpperCase()] = { asset: a, direction: d, rows: rs.filter((r) => directionProbe(r) === d).concat(shared) };
      });
    });
    return out;
  }

  /* ---------------- collection keys ----------------

     `buildAll` keys a two-sided asset `AVAX|LONG` / `AVAX|SHORT` and a single-sided one by its bare symbol.
     Consumers therefore have to move between a COLLECTION KEY and the ASSET it belongs to, and doing that by
     hand is how the board came to build the exchange symbol `BTC|LONGUSDT` and lose every paired price. These
     three are the only sanctioned way to do it. */
  const KEY_SEP = '|';
  const assetOf = (key) => String(key).split(KEY_SEP)[0];
  const sideOf = (key) => { const p = String(key).split(KEY_SEP); return p[1] ? p[1].toLowerCase() : null; };
  const keyOf = (asset, side) => (side ? String(asset).toUpperCase() + KEY_SEP + String(side).toUpperCase() : String(asset).toUpperCase());

  function buildAll(csvText) {
    const rows = loadRows(csvText); const by = groupBySetup(rows); const out = {};
    Object.keys(by).sort().forEach((k) => { out[k] = buildSetup(by[k].asset, by[k].rows); });
    /* Pair the two sides so each knows its sibling. Angela, 2026-10-20: "they are a pair, one fires and the
       other is retired" - the retirement itself lives in the lifecycle, this only records the relationship. */
    Object.keys(out).forEach((k) => {
      const sib = Object.keys(by).find((o) => o !== k && by[o].asset === by[k].asset);
      out[k].setup_key = k;
      out[k].paired_with = sib || null;
    });
    return out;
  }

  /*
   * THE BOARD'S SHAPE, FROM THIS PARSE (2026-11-05).
   *
   * The board pages carried their own copy of this parser for weeks, hand-resynced on notice, and the copies
   * drifted in both directions. Every incident report since 2026-10-09 has asked for one parser: *"this is
   * the third time a mismatched resync has caused a real miss (LINK, SHIB, now ZRO/INJ). There's no automated
   * check that the two copies agree."* Measured on the live sheet on 2026-11-05 the drift had reached:
   *
   *   - WRITTEN_INVALIDATION read on 46 of 70 entries here and on none of them there, and
   *   - QNT, whose direction this parser resolves to long and the board's copy calls ambiguous. That changes
   *     QNT's level fingerprint, so the board computed the instance key
   *     `QNT|1793353172000|043f8a5f…` while the feed - written by THIS parser - carried `…|0ced4504…`.
   *     Confirmed live: `mechanicalFor('QNT', …)` returned null, so QNT's mechanical overlay could not
   *     resolve at all. The board's parser disagreed with the feed on exactly that one asset; this one agrees
   *     on all 70.
   *
   * The ONLY thing the board needed its own copy for is the collection key. It keys every asset by its bare
   * symbol and hangs a two-sided asset's two builds off `.sides`, because its cards, its pair rendering and
   * its mechanical overlay are all written against that shape. That is a view concern, not a parsing one, so
   * it is produced here from this parse rather than by keeping a second parser alive.
   *
   * The pair rule is `groupBySetup`'s - the same published-within-the-window rule, not a copy of it - and on
   * the live sheet it names the same twelve paired assets the board's `pairSides` did.
   */
  function buildAllByAsset(csvText) {
    const rows = loadRows(csvText);
    const by = groupByAsset(rows);
    const bySetup = groupBySetup(rows);
    const out = {};
    Object.keys(by).sort().forEach((a) => {
      const entry = buildSetup(a, by[a]);
      const sideKeys = Object.keys(bySetup).filter((k) => assetOf(k) === a && sideOf(k)).sort();
      if (sideKeys.length > 1) {
        /* Both sides, each built from its OWN rows, under the same asset key. Every side carries the
           setup_key the monitor and the feed use, so the render and the mechanical overlay line up. */
        entry.sides = {};
        sideKeys.forEach((k) => {
          const side = buildSetup(a, bySetup[k].rows);
          side.setup_key = k;
          side.paired_with = sideKeys.find((o) => o !== k) || null;
          entry.sides[sideOf(k)] = side;
        });
        entry.paired = true;
        /* Which side the asset-level entry itself speaks for - the board shows it when it has no reason to
           pick a side. A pair has no primary, so this is whatever the combined parse resolved, or null. */
        entry.primary_side = (entry.direction && entry.direction.value) || null;
        entry.setup_key = a;
        entry.paired_with = null;
      } else {
        entry.setup_key = sideKeys.length === 1 ? sideKeys[0] : a;
        entry.paired_with = null;
      }
      out[a] = entry;
    });
    return out;
  }

  /* ================================================================================================
   * WHICH SIDE OF A PAIR SPEAKS FOR IT - ONE IMPLEMENTATION (2026-11-06)
   *
   * This was CURRENT_STATE.md known problem 2: "which side leads a pair" decided three ways, in
   * sheet.html's base render, sheet.html's mech-feed and index.html's mech-feed, with the same
   * explanatory comment pasted at each site and the instruction that no one of them be changed alone.
   * It caused the BTC, LINK, HYPE and ADA side bugs - eight rounds in thirteen days. A comment cannot
   * keep three implementations in step, so there is now one, here, and the pages call it.
   *
   * It lives in the shared core rather than on the board because the board's other shared file,
   * levelup-words.js, holds member-facing WORDS only, and because this is testable in the monitor
   * repo where the regressions that named it (PLS-*) already live.
   *
   * LIVENESS FIRST, RECENCY ONLY AMONG EQUALS (Ang, 2026-11-06, from ADA):
   *
   *   1. A side that is RUNNING - card_state TRIGGERED - outranks every side that is not, whatever
   *      the clock says. ADA's 2026-10-23 short had triggered, banked TP1 and TP2 and was still
   *      running; her 2026-11-05 long was dormant. The long led both surfaces, because the two-hour
   *      batch window below dropped the thirteen-day-old short before anything ranked it. A dead or
   *      dormant side never leads a card or a page.
   *   2. When NO side is running, the batch window and the ranking below decide exactly as they did
   *      before - unchanged. That is deliberately where PLS-20 and PLS-20b land: both of those rank
   *      two FINISHED sides, nothing is running, so recency rightly decides and rule 1 never reaches
   *      them. If this function ever makes those two fail, this rule is wrong, not those tests.
   *
   * THE RANKING AND TIE-BREAKS, carried over verbatim from the three copies it replaces:
   *
   *   3  STILL RUNNING  triggered and not finished.  Among several, the EARLIEST trigger - the trade
   *                     a member has actually been in longest.
   *   2  STILL OPEN     not finished, not yet triggered.  Among several, the NEWEST publication.
   *   1  FINISHED       stopped, every target reached, exited back through the six lines, or expired
   *                     without ever triggering.  Among several, the earliest trigger; one with no
   *                     trigger defers.
   *   0  NOTHING KNOWN  the engine is not measuring this side, or has not reached it.
   *
   * THE CALLER OWNS THE CLOCK. `published_ms` is passed in, never read off the feed here: the SHEET
   * is the authority on when Chelsea published a side and the feed is only as current as the last
   * monitor run. On 2026-10-30 a five-hour-stale feed made "the newest batch" resolve to yesterday's
   * HYPE short and dropped the 5:08 AM long a member had come to read. That fix stays the caller's,
   * which is the only place that can see the Sheet.
   *
   * Pure: it takes plain numbers and a card_state value, touches no DOM, no feed shape and no fetch.
   * ============================================================================================ */
  const PAIR_BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
  const RUNNING_RANK = 3;
  const CARD_STATE_RANK = {
    TRIGGERED: 3,
    WATCHING: 2, DORMANT: 2,
    FINISHED_WIN: 1, FINISHED_STOPPED: 1, EXPIRED: 1,
    NOT_TRACKED: 0,
  };
  /* An UNMAPPED terminal state - today only SIX_LINE_EXIT, whose display words are an open decision
     waiting on Chelsea - still ranks as a side that has ENDED, which is exactly what all three copies
     this replaces already did with it. That is an ORDERING fact and was never the open question; what
     a member READS off such a card is, and this function says nothing about that. */
  const UNMAPPED_TERMINAL_RANK = 1;
  function pairSideRank(state) {
    if (state === null || state === undefined) return UNMAPPED_TERMINAL_RANK;
    return Object.prototype.hasOwnProperty.call(CARD_STATE_RANK, state) ? CARD_STATE_RANK[state] : UNMAPPED_TERMINAL_RANK;
  }
  const finiteOrNull = (v) => (v === null || v === undefined || !isFinite(v) ? null : Number(v));
  /* Only the CURRENT batch is a candidate. Chelsea republishes one side without the other constantly:
     on 2026-10-21 AVAX's long was that morning's fresh call while its short was the previous day's,
     already stopped - and reporting the stopped side put "STOPPED" on a card whose actual call of the
     day had not even triggered. A side with no publication time is never dropped. */
  function pairBatch(cands, windowMs) {
    const w = windowMs == null ? PAIR_BATCH_WINDOW_MS : windowMs;
    const times = cands.map((c) => finiteOrNull(c.published_ms)).filter((t) => t !== null);
    if (!times.length) return cands;
    const newest = Math.max.apply(null, times);
    const keep = cands.filter((c) => { const t = finiteOrNull(c.published_ms); return t === null || (newest - t) <= w; });
    return keep.length ? keep : cands;
  }
  /* `a` preferred over `b` within the SAME rank, per the tie-breaks above. */
  function pairBeatsAtRank(a, b, rank) {
    if (rank === 3 || rank === 1) {
      const ta = finiteOrNull(a.trigger_ms), tb = finiteOrNull(b.trigger_ms);
      if (ta !== null && tb !== null) return ta < tb;
      if (ta !== null) return true;
      if (tb !== null) return false;
    }
    const pa = finiteOrNull(a.published_ms), pb = finiteOrNull(b.published_ms);
    return (pa !== null && pb !== null) ? pa > pb : false;
  }
  /* cands: [{ id, state, trigger_ms, published_ms }] - `state` is that side's card_state value from
     the feed, `id` whatever the caller wants back ('long', 'BTC|LONG', an object). Returns the chosen
     candidate, or null when there is nothing to choose from. */
  function pickPairSide(cands, opts) {
    const all = (cands || []).filter(Boolean);
    if (!all.length) return null;
    if (all.length === 1) return all[0];
    const o = opts || {};
    /* RULE 1. The running sides are considered on their own and the batch window is not applied to
       them: that window is what dropped ADA's running short for being thirteen days old. */
    const running = all.filter((c) => pairSideRank(c.state) === RUNNING_RANK);
    const pool = running.length > 1 ? running
      : running.length === 1 ? [running[0]]
      : pairBatch(all, o.windowMs);
    if (pool.length === 1) return pool[0];
    let best = null, bestRank = -1;
    for (let i = 0; i < pool.length; i++) {
      const r = pairSideRank(pool[i].state);
      if (!best || r > bestRank) { best = pool[i]; bestRank = r; continue; }
      if (r === bestRank && pairBeatsAtRank(pool[i], best, r)) best = pool[i];
    }
    return best;
  }

  return {
    hash, parseCSV, loadRows, rowRef, rowId, F, srcType, isPC, hasLevels, statusClass,
    parseSheetTimestamp, scanNumbers, firstZone, parseTrigger, parseTargets, parseStop, parseSafety,
    extractLevels, levelFingerprint, edges, groupByAsset, groupBySetup, directionProbe, selectRows, buildSetup,
    buildAll, buildAllByAsset, assetOf, sideOf, keyOf, KEY_SEP,
    PAIR_BATCH_WINDOW_MS, CARD_STATE_RANK, pairSideRank, pairBatch, pickPairSide,
  };
});
