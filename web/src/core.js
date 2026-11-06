/*
  DrumSplit core: reads a MIDI file, finds tempo, time signature and bars,
  groups bars with the same groove, detects fills, splits the song into
  sections and writes one MIDI file per section (bundled in a zip).

  No DOM, no dependencies: runs in the browser and in Node (for tests).
*/
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // MIDI reading

  function readMidi(buffer) {
    const d = new Uint8Array(buffer);
    let p = 0;
    const u32 = () => { const v = (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0; p += 4; return v; };
    const u16 = () => { const v = d[p] << 8 | d[p + 1]; p += 2; return v; };
    const str = (n) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p + i]); p += n; return s; };
    const vlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    if (str(4) !== "MThd") throw new Error("Det er ikke en MIDI-fil (mangler 'MThd').");
    const hlen = u32();
    const format = u16(), nTracks = u16(), division = u16();
    p = 8 + hlen;
    if (division & 0x8000) throw new Error("MIDI-filen bruger SMPTE-tid, som ikke understøttes. Gem den med takter/beats (PPQ).");
    const ppq = division;

    const tracks = [], chunks = [];
    const headerEnd = 8 + hlen;
    for (let t = 0; t < nTracks && p < d.length; t++) {
      const chunkStart = p;
      const id = str(4), len = u32(), end = Math.min(d.length, p + len);
      if (id !== "MTrk") { chunks.push({ start: chunkStart, end, track: null }); p = end; t--; continue; }
      const events = [];
      let tick = 0, status = 0, name = "";
      while (p < end) {
        tick += vlq();
        const start = p;
        let b = d[p];
        if (b === 0xff) {
          p++;
          const type = d[p++], l = vlq();
          const data = d.slice(p, p + l); p += l;
          events.push({ tick, kind: "meta", type, data, raw: d.slice(start, p) });
          if (type === 0x03 && !name) name = new TextDecoder("latin1").decode(data);
          if (type === 0x2f) break;
        } else if (b === 0xf0 || b === 0xf7) {
          p++;
          const l = vlq(); p += l;
          events.push({ tick, kind: "sysex", raw: d.slice(start, p) });
        } else {
          if (b & 0x80) { status = b; p++; }      // otherwise running status
          const type = status & 0xf0, ch = status & 0x0f;
          const a = d[p++];
          const two = !(type === 0xc0 || type === 0xd0);
          const bb = two ? d[p++] : 0;
          if (type === 0x90 && bb > 0) events.push({ tick, kind: "on", ch, note: a, vel: bb, pos: p - 1, status }); // pos = velocity byte in the file
          else if (type === 0x80 || (type === 0x90 && bb === 0)) events.push({ tick, kind: "off", ch, note: a, status, b: bb });
          else events.push({ tick, kind: "other", status, a, b: bb, two });
        }
      }
      p = end;
      chunks.push({ start: chunkStart, end, track: tracks.length });
      tracks.push({ index: tracks.length, name, events });
    }
    return { format, ppq, tracks, chunks, headerEnd };
  }

  // ---------------------------------------------------------------------------
  // Tempo and time signature maps

  function buildMaps(midi) {
    const tempos = [], sigs = [], markers = [];
    for (const tr of midi.tracks)
      for (const e of tr.events) {
        if (e.kind !== "meta") continue;
        if (e.type === 0x51 && e.data.length >= 3) tempos.push({ tick: e.tick, usPerQ: (e.data[0] << 16) | (e.data[1] << 8) | e.data[2] });
        if (e.type === 0x58 && e.data.length >= 2) sigs.push({ tick: e.tick, num: e.data[0], den: 1 << e.data[1] });
        if (e.type === 0x06) markers.push({ tick: e.tick, text: new TextDecoder("latin1").decode(e.data) });
      }
    const byTick = (a, b) => a.tick - b.tick;
    tempos.sort(byTick); sigs.sort(byTick);
    const dedupe = (arr) => arr.filter((x, i) => i === arr.length - 1 || arr[i + 1].tick !== x.tick);
    return { tempos: dedupe(tempos), sigs: dedupe(sigs), markers, hasTempo: tempos.length > 0, hasSig: sigs.length > 0 };
  }

  function tickToSeconds(tick, tempos, ppq) {
    let sec = 0, lastTick = 0, us = 500000;          // MIDI default: 120 BPM
    for (const t of tempos) {
      if (t.tick >= tick) break;
      sec += (t.tick - lastTick) / ppq * us / 1e6;
      lastTick = t.tick; us = t.usPerQ;
    }
    return sec + (tick - lastTick) / ppq * us / 1e6;
  }

  function tempoAt(tick, tempos) {
    let us = 500000;
    for (const t of tempos) { if (t.tick > tick) break; us = t.usPerQ; }
    return 60e6 / us;
  }

  // ---------------------------------------------------------------------------
  // Drum notes

  // General MIDI drum groups (weight = how much it says about the groove)
  const GROUPS = [
    { key: "kick",  label: "Stortromme", notes: [35, 36], weight: 1.0 },
    { key: "snare", label: "Lilletromme", notes: [37, 38, 39, 40], weight: 1.0 },
    { key: "hat",   label: "Hihat", notes: [42, 44], weight: 0.6 },
    { key: "open",  label: "Åben hihat", notes: [46], weight: 0.6 },
    { key: "tom",   label: "Tam-tam", notes: [41, 43, 45, 47, 48, 50], weight: 1.0 },
    { key: "crash", label: "Crash", notes: [49, 52, 55, 57], weight: 0.35 },
    { key: "ride",  label: "Ride", notes: [51, 53, 59], weight: 0.6 },
    { key: "perc",  label: "Percussion", notes: [], weight: 0.4 },
  ];
  const NOTE_GROUP = new Array(128).fill(GROUPS.length - 1);
  GROUPS.forEach((g, i) => g.notes.forEach((n) => (NOTE_GROUP[n] = i)));

  // ---- note maps (which drum each MIDI note plays) --------------------------------
  const GI = Object.fromEntries(GROUPS.map((g, i) => [g.key, i]));
  const GM_NAMES = { 35: "Kick 2", 36: "Kick", 37: "Side stick", 38: "Snare", 39: "Hand clap", 40: "Snare 2",
    41: "Floor tom low", 42: "Hi-hat closed", 43: "Floor tom", 44: "Hi-hat pedal", 45: "Tom low", 46: "Hi-hat open",
    47: "Tom mid", 48: "Tom high", 49: "Crash", 50: "Tom highest", 51: "Ride", 52: "China", 53: "Ride bell",
    54: "Tambourine", 55: "Splash", 56: "Cowbell", 57: "Crash 2", 59: "Ride 2" };

  // Superior Drummer 3, default mapping
  const SD3_NAMES = { 1: "Sn Sidestick", 2: "Sn Sidestick", 3: "Sn Sidestick", 4: "Sn Thump", 6: "Sn Zone Trigger",
    7: "HH Edge Trigger", 8: "HH Tip Trigger", 9: "HH Shaft Trigger", 10: "HH Closed Pedal", 11: "HH Closed Tip",
    12: "HH Open Tip 0", 13: "HH Open Tip 1", 14: "HH Open Tip 2", 15: "HH Open Tip 3", 16: "HH Open Tip 4", 17: "HH Open Tip 5",
    18: "HH Edge Trigger", 19: "HH Tip Trigger", 20: "HH Bell Trigger", 21: "HH Closed Pedal", 22: "HH Closed Edge",
    23: "HH Open Pedal", 24: "HH Open Edge 1", 25: "HH Open Edge 2", 26: "HH Open Edge 3", 27: "Cy 2 Bow Tip",
    28: "Cy 2 Bell Shank", 29: "Ri Bow Shank", 30: "Ri Bell Shank", 31: "Cy 4 Bow Tip", 32: "Cy 4 Bell Shank",
    33: "Sn Edge", 34: "Ki Open", 35: "Ki Hit", 36: "Ki Open", 37: "Sn Sidestick", 38: "Sn Center", 39: "Sn Ruff",
    40: "Sn Rimshot", 41: "Ft 2 Center", 42: "HH Closed Tip", 43: "Ft 1 Center", 44: "HH Closed Pedal", 45: "Rt 3 Center",
    46: "HH Open Edge 2", 47: "Rt 2 Center", 48: "Rt 1 Center", 49: "Cy 2 Crash", 50: "Cy 2 Mute Hit", 51: "Ri Bow Tip",
    52: "Cy 5 Crash", 53: "Ri Bell Shank", 54: "Cy 5 Mute Hit", 55: "Cy 3 Crash", 56: "Cy 3 Mute Hit", 57: "Cy 4 Crash",
    58: "Cy 4 Mute Hit", 59: "Ri Crash", 60: "HH Open Edge 4", 61: "HH Closed Tip", 62: "HH Tight Edge", 63: "HH Tight Tip",
    64: "HH Open Edge 0", 65: "HH Sequenced Hits", 66: "Sn Backward Swirl", 67: "Sn Forward Swirl", 68: "Sn Muted",
    69: "Sn Flam", 71: "Sn Rim Only", 72: "Ft 2 Rim Only", 73: "Ft 2 Rimshot", 74: "Ft 1 Rim Only", 75: "Ft 1 Rimshot",
    76: "Ri Crescendo", 77: "Rt 3 Rim Only", 78: "Rt 3 Rimshot", 79: "Rt 2 Rim Only", 80: "Rt 2 Rimshot", 81: "Rt 1 Rim Only",
    82: "Rt 1 Rimshot", 83: "Cy 1 Mute Hit", 84: "Cy 1 Bow Tip", 85: "Cy 1 Bell Shank", 86: "Cy 1 Crash", 87: "Cy 1 Bow Shank",
    88: "Cy 1 Bell Tip", 89: "Cy 2 Bow Tip", 90: "Cy 2 Bell Shank", 91: "Cy 2 Crash", 92: "Cy 2 Bow Shank", 93: "Cy 2 Bell Tip",
    94: "Cy 2 Mute Hit", 95: "Cy 3 Mute Hit", 96: "Cy 3 Bow Tip", 97: "Cy 3 Bell Shank", 98: "Cy 3 Crash", 99: "Cy 3 Bow Shank",
    100: "Cy 3 Bell Tip", 101: "Cy 4 Bow Tip", 102: "Cy 4 Bell Shank", 103: "Cy 4 Crash", 104: "Cy 4 Bow Shank",
    105: "Cy 4 Bell Tip", 106: "Cy 4 Mute", 107: "Cy 5 Mute", 108: "Cy 5 Bow Tip", 109: "Cy 5 Bell Shank", 110: "Cy 5 Crash",
    111: "Cy 5 Bow Shank", 112: "Cy 5 Bell Tip", 113: "Ri Bow Tip", 114: "Ri Bell Shank", 115: "Ri Crash", 116: "Ri Bow Shank",
    117: "Ri Bell Tip", 118: "Ri Mute Hit", 119: "HH Closed Bell", 120: "HH Open Bell 0", 121: "HH Open Bell 1",
    122: "HH Open Bell 2", 123: "HH Open Bell 3", 124: "HH Open Bell 4", 125: "Sn Mid Center", 126: "Sn Backward Brushtrig",
    127: "Sn Forward Brushtrig" };
  const SD3_GROUP = new Array(128).fill(GI.perc);
  for (const [k, name] of Object.entries(SD3_NAMES)) {
    const n = +k;
    SD3_GROUP[n] = name.startsWith("Ki") ? GI.kick
      : name.startsWith("Sn") ? GI.snare
      : name.startsWith("HH") ? (/Open/.test(name) ? GI.open : GI.hat)
      : /^(Rt|Ft)/.test(name) ? GI.tom
      : name.startsWith("Ri") ? GI.ride
      : name.startsWith("Cy") ? GI.crash : GI.perc;
  }
  const MAPS = {
    gm:  { label: "General MIDI", groups: NOTE_GROUP, names: GM_NAMES },
    sd3: { label: "Superior Drummer 3", groups: SD3_GROUP, names: SD3_NAMES },
  };

  /** A note map: preset groups, with the user's own changes on top ({ note: groupIndex }). */
  function makeNoteMap(kind, overrides) {
    const base = (MAPS[kind] || MAPS.gm).groups.slice();
    for (const [n, g] of Object.entries(overrides || {})) if (+n >= 0 && +n < 128 && g >= 0 && g < GROUPS.length) base[+n] = g;
    return base;
  }
  const noteName = (kind, note) => (MAPS[kind] || MAPS.gm).names[note] || "";

  /** Guesses the note map from the notes used: SD3 puts hi-hats and cymbals on notes GM does not use. */
  function detectMapKind(notes) {
    if (!notes.length) return "gm";
    const sd3Only = (n) => (n >= 1 && n <= 26) || (n >= 61 && n <= 64) || (n >= 82 && n <= 127);
    const k = notes.filter((x) => sd3Only(x.note)).length;
    return k / notes.length > 0.02 ? "sd3" : "gm";
  }

  /** Tracks that contain notes, with a guess at which one holds the drums. */
  function listNoteTracks(midi) {
    const out = [];
    for (const tr of midi.tracks) {
      const ons = tr.events.filter((e) => e.kind === "on");
      if (!ons.length) continue;
      const ch10 = ons.filter((e) => e.ch === 9).length;
      out.push({ index: tr.index, name: tr.name || `Spor ${tr.index + 1}`, notes: ons.length, drumChannelNotes: ch10 });
    }
    out.sort((a, b) => (b.drumChannelNotes - a.drumChannelNotes) || (b.notes - a.notes));
    return out;
  }

  /** Note-ons and note-offs of one track (paired into notes with lengths). */
  function collectNotes(midi, trackIndex) {
    const tr = midi.tracks.find((t) => t.index === trackIndex);
    const notes = [], open = new Map();
    for (const e of tr.events) {
      const k = e.ch * 128 + e.note;
      if (e.kind === "on") {
        if (open.has(k)) { const n = open.get(k); n.end = e.tick; }
        const n = { tick: e.tick, end: e.tick + Math.round(midi.ppq / 8), ch: e.ch, note: e.note, vel: e.vel, pos: e.pos, onEv: e, offEv: null };
        notes.push(n); open.set(k, n);
      } else if (e.kind === "off" && open.has(k)) {
        const n = open.get(k);
        n.end = Math.max(n.tick + 1, e.tick); n.offEv = e; open.delete(k);
      }
    }
    notes.sort((a, b) => a.tick - b.tick);
    return notes;
  }

  // ---------------------------------------------------------------------------
  // Bars

  function barTicks(sig, ppq) { return Math.round(sig.num * (4 / sig.den) * ppq); }

  /** Bar boundaries from the time signature map, until lastTick. */
  function buildBars(sigs, ppq, lastTick) {
    const list = sigs.length ? sigs.slice() : [{ tick: 0, num: 4, den: 4 }];
    if (list[0].tick > 0) list.unshift({ tick: 0, num: 4, den: 4 });
    const bars = [];
    for (let s = 0; s < list.length; s++) {
      const sig = list[s], len = barTicks(sig, ppq);
      const stop = s + 1 < list.length ? list[s + 1].tick : Math.max(lastTick + 1, sig.tick + len);
      for (let t = sig.tick; t < stop; t += len) {
        bars.push({ start: t, end: Math.min(t + len, s + 1 < list.length ? stop : t + len), num: sig.num, den: sig.den });
        if (bars.length > 5000) return bars;
      }
    }
    return bars;
  }

  const STEPS_PER_QUARTER = 12;   // fits 16ths (3 steps) and 8th triplets (4 steps)

  /** One feature vector per bar: drum group x grid step, with velocity. */
  function barFeatures(bars, notes, ppq, map) {
    map = map || NOTE_GROUP;
    const tol = ppq / 8;                 // a hit up to a 32nd early belongs to the next bar
    const feats = bars.map((b) => {
      const steps = Math.max(1, Math.round((b.end - b.start) / ppq * STEPS_PER_QUARTER));
      return { steps, v: new Float32Array(GROUPS.length * steps), hits: 0, toms: 0, crashDown: false, notes: [] };
    });
    let bi = 0;
    for (const n of notes) {
      while (bi + 1 < bars.length && n.tick >= bars[bi + 1].start - tol) bi++;
      const b = bars[bi], f = feats[bi];
      let step = Math.round((n.tick - b.start) / ppq * STEPS_PER_QUARTER);
      step = Math.min(f.steps - 1, Math.max(0, step));
      const g = map[n.note];
      const w = GROUPS[g].weight * (0.4 + 0.6 * n.vel / 127);
      const idx = g * f.steps + step;
      f.v[idx] = Math.max(f.v[idx], w);
      f.hits++;
      if (GROUPS[g].key === "tom") f.toms++;
      if (GROUPS[g].key === "crash" && step <= 1) f.crashDown = true;
      f.notes.push(n);
    }
    // Blur along time, so hits played a little early or late still match
    // (up to about a 32nd note either way)
    const spread = [1, 0.7, 0.35];
    for (const f of feats) {
      const out = new Float32Array(f.v.length);
      for (let g = 0; g < GROUPS.length; g++)
        for (let s = 0; s < f.steps; s++) {
          const v = f.v[g * f.steps + s];
          if (!v) continue;
          for (let k = -2; k <= 2; k++) {
            const t = s + k;
            if (t < 0 || t >= f.steps) continue;
            const i = g * f.steps + t;
            out[i] = Math.max(out[i], v * spread[Math.abs(k)]);
          }
        }
      f.b = out;
    }
    return feats;
  }

  function similarity(a, b) {
    if (a.steps !== b.steps) return 0;
    if (!a.hits && !b.hits) return 1;
    if (!a.hits || !b.hits) return 0;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.b.length; i++) { ab += a.b[i] * b.b[i]; aa += a.b[i] * a.b[i]; bb += b.b[i] * b.b[i]; }
    return ab / Math.sqrt(aa * bb);
  }

  /** Similarity of the first half of two bars (to spot fills that start like the groove). */
  function firstHalfSimilarity(a, b) {
    if (a.steps !== b.steps || !a.hits || !b.hits) return 0;
    const half = Math.floor(a.steps / 2);
    let ab = 0, aa = 0, bb = 0;
    for (let g = 0; g < GROUPS.length; g++)
      for (let s = 0; s < half; s++) {
        const i = g * a.steps + s;
        ab += a.b[i] * b.b[i]; aa += a.b[i] * a.b[i]; bb += b.b[i] * b.b[i];
      }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  }

  /** Groups bars that sound alike. Returns a cluster id per bar. */
  function clusterBars(feats, threshold) {
    const reps = [];   // { sum: Float32Array, n, steps, ...feature }
    const ids = feats.map((f) => {
      let best = -1, bestSim = threshold;
      for (let c = 0; c < reps.length; c++) {
        const s = similarity(f, reps[c]);
        if (s >= bestSim) { bestSim = s; best = c; }
      }
      if (best < 0) {
        reps.push({ sum: Float32Array.from(f.b), n: 1, steps: f.steps, hits: f.hits, b: Float32Array.from(f.b) });
        return reps.length - 1;
      }
      const r = reps[best];
      for (let i = 0; i < r.sum.length; i++) r.sum[i] += f.b[i];
      r.n++; r.hits += f.hits;
      for (let i = 0; i < r.sum.length; i++) r.b[i] = r.sum[i] / r.n;
      return best;
    });
    return { ids, reps };
  }

  // ---------------------------------------------------------------------------
  // Sections

  function analyse(midi, opts) {
    opts = Object.assign({ trackIndex: null, sensitivity: 0.8 }, opts || {});
    const maps = buildMaps(midi);
    const tracks = listNoteTracks(midi);
    if (!tracks.length) throw new Error("MIDI-filen indeholder ingen noder.");
    const trackIndex = opts.trackIndex ?? tracks[0].index;
    const notes = collectNotes(midi, trackIndex);
    const ppq = midi.ppq;
    const mapKind = opts.mapKind === "auto" || !opts.mapKind ? detectMapKind(notes) : opts.mapKind;
    const noteMap = makeNoteMap(mapKind, (opts.mapOverrides || {})[mapKind]);
    const lastTick = notes.length ? notes[notes.length - 1].tick : 0;

    // Time signature: from the file, otherwise estimated
    let sigs = maps.sigs, sigEstimated = false;
    if (!maps.hasSig) {
      sigs = [estimateSignature(notes, ppq, lastTick, noteMap)];
      sigEstimated = true;
    }

    const bars = buildBars(sigs, ppq, lastTick + Math.ceil(ppq / 8));
    // Drop empty bars after the last note
    while (bars.length > 1 && bars[bars.length - 1].start - ppq / 8 > lastTick) bars.pop();

    const feats = barFeatures(bars, notes, ppq, noteMap);
    const { ids, reps } = clusterBars(feats, opts.sensitivity);
    const counts = new Map();
    ids.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));

    // A fill: a rare bar whose first half still sounds like the bar before it,
    // or a bar busy with toms
    const isFill = feats.map((f, i) => {
      if (!f.hits || i === 0) return false;
      const rare = counts.get(ids[i]) <= 2 && ids[i] !== ids[i - 1];
      const startsLikePrev = firstHalfSimilarity(f, feats[i - 1]) >= 0.7;
      const tomHeavy = f.toms >= 3;
      const standsAlone = ids[i] !== ids[i - 1] && (i + 1 >= feats.length || ids[i] !== ids[i + 1]);
      return (rare && (startsLikePrev || tomHeavy)) || (tomHeavy && standsAlone);
    });

    // Hard boundaries: time signature or tempo changes
    const hard = new Set();
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].num !== bars[i - 1].num || bars[i].den !== bars[i - 1].den) hard.add(i);
      const t0 = tempoAt(bars[i - 1].start, maps.tempos), t1 = tempoAt(bars[i].start, maps.tempos);
      if (Math.abs(t1 - t0) > 0.5) hard.add(i);
    }

    // Main groove of a stretch: the most common non-fill cluster in the next bars
    const dominantFrom = (i) => {
      const tally = new Map();
      for (let j = i; j < Math.min(bars.length, i + 4); j++) {
        if (j > i && hard.has(j)) break;
        if (isFill[j]) continue;
        tally.set(ids[j], (tally.get(ids[j]) || 0) + (j === i ? 0.9 : 1));
      }
      let best = ids[i], bestN = -1;
      for (const [c, n] of tally) if (n > bestN) { best = c; bestN = n; }
      return best;
    };

    const sections = [];
    let i = 0;
    while (i < bars.length) {
      const start = i;
      const dom = dominantFrom(i);
      i++;
      // A bar belongs to the groove if it is in the groove's cluster, or if it is a
      // one-off (loose playing) that still sounds close to the groove
      const belongs = (b) => ids[b] === dom ||
        (counts.get(ids[b]) <= 2 && similarity(feats[b], reps[dom]) >= opts.sensitivity - 0.12);
      while (i < bars.length && !hard.has(i)) {
        if (belongs(i)) { i++; continue; }
        // A short detour that comes back to the groove (variation or fill) stays in
        let j = i;
        while (j < bars.length && !belongs(j) && j - i < 3 && !hard.has(j)) j++;
        if (j < bars.length && belongs(j) && j - i <= 2 && !hard.has(j)) { i = j; continue; }
        // The groove changes for good. A fill right before it ends this section.
        if (isFill[i] && !hard.has(i)) i++;
        break;
      }
      sections.push({ startBar: start, endBar: i, cluster: dom });
    }

    // Merge sections of a single bar into a neighbour (count-ins, single hits)
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      if (sec.endBar - sec.startBar > 1 || sections.length === 1) continue;
      const prev = sections[s - 1], next = sections[s + 1];
      if (prev && !hard.has(sec.startBar)) { prev.endBar = sec.endBar; sections.splice(s, 1); s--; }
      else if (next && !hard.has(next.startBar)) { next.startBar = sec.startBar; sections.splice(s, 1); s--; }
    }

    // Letters: sections built on the same groove share a letter
    const letterOf = new Map();
    let nextLetter = 0;
    const letterFor = (c) => {
      // a groove close to one we already named gets that letter
      for (const [known, L] of letterOf) if (similarity(reps[known], reps[c]) >= opts.sensitivity - 0.05) return L;
      const L = String.fromCharCode(65 + (nextLetter++ % 26));
      letterOf.set(c, L);
      return L;
    };
    const seen = new Map();
    sections.forEach((sec, n) => {
      sec.letter = letterFor(sec.cluster);
      seen.set(sec.letter, (seen.get(sec.letter) || 0) + 1);
      sec.repeat = seen.get(sec.letter);
      sec.number = n + 1;
      sec.startTick = bars[sec.startBar].start;
      sec.endTick = bars[sec.endBar - 1].end;
      sec.bars = sec.endBar - sec.startBar;
      sec.sig = `${bars[sec.startBar].num}/${bars[sec.startBar].den}`;
      sec.bpm = tempoAt(sec.startTick, maps.tempos);
      sec.startSec = tickToSeconds(sec.startTick, maps.tempos, ppq);
      sec.endSec = tickToSeconds(sec.endTick, maps.tempos, ppq);
      sec.fills = 0;
      for (let b = sec.startBar; b < sec.endBar; b++) if (isFill[b]) sec.fills++;
      sec.hits = 0;
      for (let b = sec.startBar; b < sec.endBar; b++) sec.hits += feats[b].hits;
    });
    const total = new Map();
    sections.forEach((s) => total.set(s.letter, (total.get(s.letter) || 0) + 1));
    sections.forEach((s) => (s.timesUsed = total.get(s.letter)));

    // Groove letter per bar (for the song map)
    const barLetters = ids.map((c) => {
      for (const [known, L] of letterOf) if (known === c || similarity(reps[known], reps[c]) >= opts.sensitivity - 0.05) return L;
      return null;
    });

    // How well the notes sit on the grid (tells if the tempo map fits the playing)
    let onGrid = 0;
    const g16 = ppq / 4, g12 = ppq / 3;
    for (const n of notes) {
      const d16 = Math.abs(n.tick - Math.round(n.tick / g16) * g16), d12 = Math.abs(n.tick - Math.round(n.tick / g12) * g12);
      if (Math.min(d16, d12) <= ppq / 16) onGrid++;
    }

    // Tempo summary
    const bpms = maps.tempos.length ? maps.tempos.filter((t) => t.tick <= lastTick || t.tick === 0).map((t) => 60e6 / t.usPerQ) : [120];
    const sigList = (maps.hasSig ? maps.sigs : sigs).filter((s) => s.tick <= lastTick || s.tick === 0)
      .map((s) => ({ bar: barIndexAt(bars, s.tick) + 1, sig: `${s.num}/${s.den}` }));

    return {
      ppq, trackIndex, tracks, notes, bars, feats, ids, isFill, barLetters, sections, mapKind, noteMap,
      tempos: maps.tempos, hasTempo: maps.hasTempo, sigEstimated, sigList,
      bpmMin: Math.min(...bpms), bpmMax: Math.max(...bpms), bpmStart: tempoAt(0, maps.tempos),
      lengthSec: bars.length ? tickToSeconds(bars[bars.length - 1].end, maps.tempos, ppq) : 0,
      gridFit: notes.length ? onGrid / notes.length : 1,
    };
  }

  /**
   * How much of section s is already played in section o: bars of s are compared
   * with the bars of o from the start (looping o when s is longer).
   */
  function coverage(analysis, o, s, threshold) {
    const { feats, bars } = analysis;
    let m = 0;
    for (let k = 0; k < s.bars; k++) {
      const A = bars[o.startBar + (k % o.bars)], B = bars[s.startBar + k];
      if (A.num === B.num && A.den === B.den &&
          similarity(feats[o.startBar + (k % o.bars)], feats[s.startBar + k]) >= threshold) m++;
    }
    return m;
  }

  /**
   * Finds sections that repeat an earlier one. Per section: { of, near, matched }
   *   of      index of the section it repeats (-1 = keep it)
   *   near    for kept sections: the earlier section it resembles most (or -1)
   *   matched how many of its bars are found in that section
   * mode "same":    same length and every bar plays alike
   * mode "similar": at least 75 % of its bars are already played in an earlier section
   *                 (a different fill, an extra bar, or a chorus played twice still counts)
   * mode "groove":  every section after the first with the same groove letter
   * mode "keep":    nothing is removed
   */
  function repeatInfo(analysis, mode, threshold) {
    const { sections } = analysis;
    threshold = threshold ?? 0.9;
    const out = [];
    sections.forEach((s, i) => {
      let of = -1, near = -1, best = 0, matched = 0;
      for (let j = 0; j < i; j++) {
        if (out[j].of >= 0) continue;                    // compare with kept sections only
        const o = sections[j];
        const m = coverage(analysis, o, s, threshold);
        if (m > best) { best = m; near = j; }
        if (of >= 0 || mode === "keep") continue;
        if (mode === "groove" && o.letter === s.letter) { of = j; matched = m; }
        if (mode === "same" && m === s.bars && o.bars === s.bars && Math.abs(o.bpm - s.bpm) <= 0.5) { of = j; matched = m; }
        if (mode === "similar" && m >= 0.75 * s.bars) { of = j; matched = m; }
      }
      if (of >= 0) out.push({ of, near: of, matched });
      else out.push({ of: -1, near: best >= Math.max(1, 0.5 * s.bars) ? near : -1, matched: best });
    });
    return out;
  }
  const findRepeats = (analysis, mode, threshold) => repeatInfo(analysis, mode, threshold).map((r) => r.of);

  // How hard a bar is played: loud kick/snare, crashes and ride count more than hi-hat
  const ENERGY = { kick: 1, snare: 1, hat: 0.4, open: 0.8, tom: 0.8, crash: 1.6, ride: 0.7, perc: 0.4 };
  function barEnergy(analysis, b) {
    const f = analysis.feats[b], bar = analysis.bars[b];
    let e = 0;
    for (const n of f.notes) e += ENERGY[GROUPS[(analysis.noteMap || NOTE_GROUP)[n.note]].key] * (0.5 + n.vel / 127);
    return e / ((bar.end - bar.start) / analysis.ppq);       // per quarter note
  }

  /**
   * Guesses a name per groove letter: Intro, Vers, Pre-omkvæd, Omkvæd, Bro, Break,
   * Fill, Outro. Returns { letter: { name, why } }.
   */
  function suggestNames(analysis) {
    const { sections, isFill } = analysis;
    const info = new Map();
    let songE = 0, songN = 0;
    sections.forEach((s, i) => {
      if (!info.has(s.letter)) info.set(s.letter, { letter: s.letter, idx: [], bars: 0, e: 0, n: 0, fillBars: 0 });
      const x = info.get(s.letter);
      x.idx.push(i); x.bars += s.bars;
      for (let b = s.startBar; b < s.endBar; b++) {
        if (isFill[b]) { x.fillBars++; continue; }
        const e = barEnergy(analysis, b);
        x.e += e; x.n++; songE += e; songN++;
      }
    });
    const avg = songN ? songE / songN : 1;
    const L = [...info.values()];
    L.forEach((x) => (x.energy = x.n ? x.e / x.n / avg : 0));
    const last = sections.length - 1;
    const out = {};
    const used = new Map();
    const give = (x, name, why) => {
      const k = (used.get(name) || 0) + 1; used.set(name, k);
      out[x.letter] = { name: k > 1 ? `${name} ${k}` : name, why };
    };

    // Recurring grooves: the strongest is the chorus, the earliest other one the verse
    const rec = L.filter((x) => x.idx.length >= 2);
    let chorus = null, verse = null;
    if (rec.length >= 2) {
      // a little extra for grooves that come late in the song (choruses usually end songs)
      const score = (x) => x.energy + 0.15 * (x.idx[x.idx.length - 1] / Math.max(1, last));
      chorus = rec.reduce((a, b) => (score(b) > score(a) ? b : a));
      verse = rec.filter((x) => x !== chorus).sort((a, b) => a.idx[0] - b.idx[0])[0];
    } else if (rec.length === 1) verse = rec[0];

    for (const x of L) {
      const first = x.idx[0], s0 = sections[first];
      if (x === chorus) { give(x, "Omkvæd", "kommer igen og spilles kraftigst"); continue; }
      if (x === verse) { give(x, "Vers", rec.length >= 2 ? "kommer igen, roligere end omkvædet" : "den groove der kommer igen"); continue; }
      const short = x.bars / x.idx.length <= 2;
      if (short && x.fillBars + (x.bars - x.n - x.fillBars) >= x.bars / 2) { give(x, "Fill", "kort og mest fills"); continue; }
      if (x.idx.length >= 2) {
        const beforeChorus = chorus && x.idx.every((i) => sections[i + 1] && sections[i + 1].letter === chorus.letter);
        if (beforeChorus) give(x, "Pre-omkvæd", "kommer hver gang lige før omkvædet");
        else give(x, "Mellemspil", "kommer igen, men hverken vers eller omkvæd");
        continue;
      }
      if (first === 0) { give(x, "Intro", "første del, spilles kun én gang"); continue; }
      if (first === last) { give(x, "Outro", "sidste del, spilles kun én gang"); continue; }
      if (x.energy < 0.6) { give(x, "Break", "spilles kun én gang og meget roligere"); continue; }
      if (s0.bars <= 2) { give(x, "Fill", "kort del der kun kommer én gang"); continue; }
      give(x, "Bro", "spilles kun én gang, midt i sangen");
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Humanizing velocity
  //
  // Same rules as the DrumHumanize plugin:
  //  - a hit soon after another on the same drum group is softer than a single hit
  //    (the first hit of a run stays full; after a quiet ghost note there is no softening)
  //  - in fast runs every second hit is a little softer (the weaker hand)
  //  - beats are stronger than 8ths, 8ths stronger than 16ths (mostly hi-hat and cymbals)
  //  - random variation per hit plus a slow drift over a couple of bars
  //  - the same settings and "variation nr." always give the same result

  const HUM_GROUPS = ["Stortromme", "Lilletromme", "Hihat", "Tam-tams", "Bækkener", "Percussion"];
  const HUM_OF_GROUP = { kick: 0, snare: 1, hat: 2, open: 2, tom: 3, crash: 4, ride: 4, perc: 5 };
  const HUM_ACCENT_WEIGHT = [0.5, 0.3, 1.0, 0.5, 0.9, 0.8];
  const HUM_DEFAULTS = {
    variation: [8, 10, 12, 10, 12, 12], level: [100, 100, 100, 100, 100, 100],
    fast: 50, fastMs: 160, hands: 35, accent: 50, maxVel: 127, minVel: 12, seed: 1,
    mishit: true, mishitRate: 0.7, mishitDepth: 35,      // rate: % of hits, depth: % softer
    keepLow: true, keepLowVel: 100,                       // hits below this velocity are left as programmed
  };
  // Mishits only happen on hits played with sticks: snare, hi-hat, toms, cymbals.
  // Kick, hi-hat pedal and percussion are left alone. Hi-hat and toms most likely.
  const HUM_MISHIT_WEIGHT = [0, 1.0, 1.3, 1.3, 0.6, 0];
  const PEDAL_NOTES = { gm: new Set([44]), sd3: new Set([10, 21, 23, 44]) };
  const humGroupOfNote = (note, map) => HUM_OF_GROUP[GROUPS[(map || NOTE_GROUP)[note]].key];

  // 32-bit hashing for repeatable "random" numbers
  function hash32(a, b, c) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c ^ 0x165667b1, 0x27d4eb2f);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function gaussHash(a, b, c) {
    const u1 = Math.max(1e-12, hash32(a, b, c)), u2 = hash32(c, a ^ 0x5bd1e995, b);
    return Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)));
  }
  function smoothNoise(a, b, x) {
    const i = Math.floor(x), f = x - i;
    const p = hash32(a, b, i) * 2 - 1, q = hash32(a, b, i + 1) * 2 - 1;
    const s = f * f * (3 - 2 * f);
    return p + (q - p) * s;
  }

  /** Returns a Map from note position (velocity byte in the file) to the new velocity. */
  function humanize(analysis, settings) {
    const s = Object.assign({}, HUM_DEFAULTS, settings || {});
    const { notes, bars, ppq, tempos } = analysis;
    const out = new Map();
    out.mishits = new Set();
    const raw = new Map(), candidates = [];
    const last = [], run = [], lastIn = [];
    for (let g = 0; g < 6; g++) { last[g] = null; run[g] = 0; lastIn[g] = 127; }
    const fastSec = s.fastMs / 1000;

    // seconds per tick, walked along with the notes (notes are sorted)
    for (const n of notes) {
      const g = humGroupOfNote(n.note, analysis.noteMap);
      const t = tickToSeconds(n.tick, tempos, ppq);

      // fast hits
      const dt = last[g] === null ? 1e9 : t - last[g];
      const together = dt >= 0 && dt < 0.008;
      let fastness = 0, weak = false;
      if (!together) {
        if (dt >= 0.008 && dt < fastSec) {
          run[g]++;
          fastness = Math.max(0, Math.min(1, (fastSec - dt) / (fastSec - fastSec * 0.35)));
          weak = run[g] % 2 === 1;
        } else run[g] = 0;
        fastness *= Math.max(0, Math.min(1, lastIn[g] / Math.max(1, n.vel)));
        last[g] = t; lastIn[g] = n.vel;
      }
      const fastRed = s.fast / 100 * 0.35 * fastness;
      const handRed = weak ? s.hands / 100 * 0.12 * Math.min(1, fastness * 2) : 0;

      // beat accent
      const bi = barIndexAt(bars, n.tick), bar = bars[bi];
      const compound = bar.den === 8 && bar.num % 3 === 0 && bar.num > 3;
      const beatLen = compound ? 1.5 : 4 / bar.den;
      const beats = (n.tick - bar.start) / ppq / beatLen;
      const frac = beats - Math.floor(beats), tol = 0.06;
      const near = (x) => Math.abs(frac - x) < tol;
      let red;
      if (near(0) || near(1)) red = beats + tol < 1 ? 0 : 0.06;
      else if (compound ? (near(1 / 3) || near(2 / 3)) : near(0.5)) red = 0.18;
      else if (!compound && (near(0.25) || near(0.75))) red = 0.30;
      else red = 0.22;
      const accentRed = s.accent / 100 * HUM_ACCENT_WEIGHT[g] * red;

      // variation
      const v = s.variation[g] / 100;
      const barPos = bi + (n.tick - bar.start) / Math.max(1, bar.end - bar.start);
      const g1 = gaussHash(s.seed * 1000003, n.note * 7919 + n.ch, n.tick);
      const drift = smoothNoise(s.seed * 31 + g, 77, barPos / 2);
      const rnd = (1 - 0.6 * v) + 0.5 * v * g1 + 0.35 * v * drift;

      // Mishit candidates: stick hits that are not quiet ghost notes. More likely in fast
      // runs and on the weaker hand. Decided after the loop, so the rate matches the setting.
      const kept = s.keepLow && n.vel < s.keepLowVel;     // programmed quiet hits stay exactly as they are
      if (kept) { raw.set(n.pos, { vel: n.vel, orig: n.vel, kept: true }); continue; }
      const pedal = (PEDAL_NOTES[analysis.mapKind] || PEDAL_NOTES.gm).has(n.note);
      if (s.mishit && s.mishitRate > 0 && n.vel >= 40 && !pedal && HUM_MISHIT_WEIGHT[g] > 0)
        candidates.push({ n, w: HUM_MISHIT_WEIGHT[g] * (1 + 1.5 * fastness) * (weak ? 1.4 : 1) });

      const shape = Math.max(0.05, 1 - fastRed - handRed - accentRed);
      const vel = n.vel * (s.level[g] / 100) * (s.maxVel / 127) * shape * rnd;
      raw.set(n.pos, { vel, orig: n.vel });
    }

    // Mishits: on average mishitRate % of the stick hits, struck badly and clearly softer
    if (candidates.length) {
      const meanW = candidates.reduce((x, k) => x + k.w, 0) / candidates.length;
      for (const { n, w } of candidates) {
        const p = Math.min(0.9, s.mishitRate / 100 * w / meanW);
        if (hash32(s.seed * 7 + 11, n.note * 131 + n.ch, n.tick) < p) {
          raw.get(n.pos).vel *= 1 - s.mishitDepth / 100 * (0.75 + 0.5 * hash32(n.tick, s.seed, n.note));
          out.mishits.add(n.pos);
        }
      }
    }
    out.kept = 0;
    for (const [pos, { vel, orig, kept }] of raw) {
      if (kept) { out.set(pos, orig); out.kept++; continue; }
      const v = Math.max(vel, Math.min(s.minVel, orig));
      out.set(pos, Math.max(1, Math.min(127, Math.round(v))));
    }
    out.stickHits = candidates.length;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Humanizing timing
  //
  // Each hit moves a few milliseconds:
  //  - a random spread per drum group (kick tightest, hi-hat loosest by default)
  //  - the whole track can sit a little ahead of or behind the beat
  //  - a slow wander over the bars (the time feel breathes)
  //  - fast runs (blasts, double kick, rolls) have their own looseness that can
  //    go from tight to loose, loose to tight, stay random, or stay tight,
  //    either jumping randomly or swaying smoothly back and forth (wave)
  const TIMING_DEFAULTS = {
    timing: true, timeGroup: [3, 4, 6, 6, 5, 6], timeAhead: 0, timeDrift: 3,
    fastMode: "tightLoose", fastLoose: 6, fastRamp: 16, fastWave: 50, timeMax: 40,
    fastMs: 160, seed: 1,
    timeLock: [false, false, false, false, false, false],   // locked drums stay exactly on the grid
  };

  /** Returns a Map from note position to a shift in ticks (+ = later). */
  function humanizeTiming(analysis, settings) {
    const s = Object.assign({}, TIMING_DEFAULTS, settings || {});
    const { notes, bars, ppq, tempos } = analysis;
    const out = new Map();
    out.maxMs = 0; out.avgMs = 0;
    if (!s.timing) return out;
    const fastSec = s.fastMs / 1000;
    const last = [], run = [], runStart = [];
    for (let g = 0; g < 6; g++) { last[g] = null; run[g] = 0; runStart[g] = 0; }
    let sumAbs = 0;
    for (const n of notes) {
      const g = humGroupOfNote(n.note, analysis.noteMap);
      const t = tickToSeconds(n.tick, tempos, ppq);
      const dt = last[g] === null ? 1e9 : t - last[g];
      if (!(dt >= 0 && dt < 0.008)) {
        if (dt >= 0.008 && dt < fastSec) run[g]++;
        else { run[g] = 0; runStart[g] = n.tick; }
        last[g] = t;
      }
      const k = run[g];
      const bi = barIndexAt(bars, n.tick), bar = bars[bi];
      const barPos = bi + (n.tick - bar.start) / Math.max(1, bar.end - bar.start);

      // fast runs: how loose at this point of the run (0..1)
      let runLoose = 0, baseScale = 1;
      if (k > 0) {
        const r = Math.min(1, k / Math.max(1, s.fastRamp));
        runLoose = s.fastMode === "tightLoose" ? r
          : s.fastMode === "looseTight" ? 1 - r
          : s.fastMode === "random" ? 0.35 + 0.65 * hash32(s.seed + 5, runStart[g], k)
          : 0;
        baseScale = s.fastMode === "tight" ? 0.4 : 0.4 + 0.6 * runLoose;
      }

      let ms = s.timeGroup[g] * gaussHash(s.seed * 7919 + 3, n.note * 31 + n.ch, n.tick) * baseScale;
      ms += s.timeAhead;
      ms += s.timeDrift * smoothNoise(s.seed * 17 + 1, 99, barPos / 1.5);
      if (k > 0 && s.fastLoose > 0) {
        const wave = s.fastWave / 100;
        const sway = smoothNoise(s.seed * 13 + g, runStart[g], k / 5);
        const jump = gaussHash(s.seed + 101, runStart[g] + g, k);
        ms += s.fastLoose * runLoose * (wave * sway * 1.4 + (1 - wave) * jump);
      }
      // a locked drum is not moved at all: no spread, no ahead/behind, no drift, no fast-run looseness
      if (s.timeLock && s.timeLock[g]) ms = 0;
      ms = Math.max(-s.timeMax, Math.min(s.timeMax, ms));

      // milliseconds -> ticks at the local tempo
      let us = 500000;
      for (const tp of tempos) { if (tp.tick > n.tick) break; us = tp.usPerQ; }
      const ticks = Math.round(ms / 1000 * 1e6 / us * ppq);
      const shift = Math.max(-n.tick, ticks);
      out.set(n.pos, shift);
      const realMs = shift * us / ppq / 1000;
      sumAbs += Math.abs(realMs); out.maxMs = Math.max(out.maxMs, Math.abs(realMs));
    }
    out.avgMs = notes.length ? sumAbs / notes.length : 0;
    return out;
  }

  /**
   * Writes the file with new velocities and moved hits. Only the drum track is
   * rewritten; other tracks and chunks are copied byte for byte. Inside the drum
   * track every other event (CC, pedal, text, sysex) keeps its time.
   */
  function writeHumanized(buffer, analysis, velMap, shiftMap) {
    if (!shiftMap || !shiftMap.size) return applyVelocities(buffer, velMap || new Map());
    const src = new Uint8Array(buffer);
    const midi = readMidi(buffer);
    const tr = midi.tracks[analysis.trackIndex];
    const chunk = midi.chunks.find((c) => c.track === analysis.trackIndex);

    // new tick for every event in the drum track
    const notes = collectNotes(midi, analysis.trackIndex);
    const newTick = new Map();
    // per channel+note, so a moved note-off never lands after the next hit on the same note
    const byKey = new Map();
    for (const n of notes) {
      const key = n.ch * 128 + n.note;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(n);
    }
    for (const list of byKey.values()) {
      list.sort((a, b) => a.tick - b.tick);
      for (let i = 0; i < list.length; i++) {
        const n = list[i], sh = shiftMap.get(n.pos) || 0;
        const on = Math.max(0, n.tick + sh);
        newTick.set(n.onEv, on);
        if (n.offEv) {
          let off = n.offEv.tick + sh;
          const next = list[i + 1];
          if (next) off = Math.min(off, Math.max(0, next.tick + (shiftMap.get(next.pos) || 0)));
          newTick.set(n.offEv, Math.max(on + 1, off));
        }
      }
    }
    const events = tr.events.filter((e) => !(e.kind === "meta" && e.type === 0x2f));
    const eot = tr.events.find((e) => e.kind === "meta" && e.type === 0x2f);
    const order = (e) => (e.kind === "off" ? 0 : e.kind === "on" ? 2 : 1);   // offs before ons at the same tick
    const list = events.map((e, i) => ({ e, i, t: newTick.has(e) ? newTick.get(e) : e.tick }));
    list.sort((a, b) => a.t - b.t || order(a.e) - order(b.e) || a.i - b.i);

    const bytes = [];
    let now = 0;
    for (const { e, t } of list) {
      bytes.push(...vlqBytes(t - now)); now = t;
      if (e.kind === "on") bytes.push(e.status, e.note, (velMap && velMap.has(e.pos)) ? velMap.get(e.pos) : e.vel);
      else if (e.kind === "off") bytes.push(e.status, e.note, e.b);
      else if (e.kind === "other") { bytes.push(e.status, e.a); if (e.two) bytes.push(e.b); }
      else bytes.push(...e.raw);
    }
    const endTick = Math.max(now, eot ? eot.tick : 0);
    bytes.push(...vlqBytes(endTick - now), 0xff, 0x2f, 0x00);

    const len = bytes.length;
    const newChunk = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...bytes];
    const parts = [src.slice(0, chunk.start), new Uint8Array(newChunk), src.slice(chunk.end)];
    const outLen = parts.reduce((x, p) => x + p.length, 0);
    const outBytes = new Uint8Array(outLen);
    let o = 0; for (const p of parts) { outBytes.set(p, o); o += p.length; }
    return outBytes;
  }

  /** The original file with only the note velocities changed (everything else byte for byte). */
  function applyVelocities(buffer, velMap) {
    const bytes = new Uint8Array(buffer.slice(0));
    for (const [pos, vel] of velMap) if (pos > 0 && pos < bytes.length) bytes[pos] = vel;
    return bytes;
  }

  /** How many hits share the most common velocity (1 = all the same). */
  function velocitySpread(notes) {
    const count = new Map();
    for (const n of notes) count.set(n.vel, (count.get(n.vel) || 0) + 1);
    let top = 0, topVel = 0;
    for (const [v, k] of count) if (k > top) { top = k; topVel = v; }
    return { share: notes.length ? top / notes.length : 0, velocity: topVel, distinct: count.size };
  }

  function barIndexAt(bars, tick) {
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].start <= tick) lo = m; else hi = m - 1; }
    return lo;
  }

  /** No time signature in the file: try common ones and keep the one where bars repeat best. */
  function estimateSignature(notes, ppq, lastTick, map) {
    const candidates = [[4, 4], [3, 4], [6, 8], [5, 4], [7, 8], [12, 8]];
    let best = { num: 4, den: 4, score: -1 };
    for (const [num, den] of candidates) {
      const bars = buildBars([{ tick: 0, num, den }], ppq, lastTick);
      if (bars.length < 4) continue;
      const feats = barFeatures(bars, notes, ppq, map);
      let s = 0, n = 0, kickOnOne = 0, withKick = 0;
      for (let i = 1; i < feats.length; i++) { if (feats[i].hits && feats[i - 1].hits) { s += similarity(feats[i], feats[i - 1]); n++; } }
      for (const f of feats) {
        let k = 0; for (let st = 0; st < f.steps; st++) k += f.v[0 * f.steps + st];
        if (k) { withKick++; if (f.v[0] || f.v[1]) kickOnOne++; }
      }
      // compound meters (6/8, 12/8) only win if the hits sit on triplets
      const score = (n ? s / n : 0) + 0.3 * (withKick ? kickOnOne / withKick : 0) - (den === 8 && num % 3 === 0 ? 0.02 : 0);
      if (score > best.score + 0.01) best = { num, den, score };
    }
    return { tick: 0, num: best.num, den: best.den };
  }

  // ---------------------------------------------------------------------------
  // MIDI writing

  function vlqBytes(v) {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  }

  /** One section as a type-0 MIDI file: tempo, time signature and the notes, moved to start at 0. */
  function sectionToMidi(analysis, sec, trackName, velMap) {
    const ppq = analysis.ppq, start = sec.startTick, end = sec.endTick, tol = ppq / 8;
    const events = [];
    const text = (type, s) => { const b = Array.from(new TextEncoder().encode(s)); return [0xff, type, ...vlqBytes(b.length), ...b]; };
    events.push({ t: 0, o: 0, bytes: text(0x03, trackName) });

    // Tempo at the start and any changes inside
    const us = Math.round(60e6 / tempoAt(start, analysis.tempos));
    events.push({ t: 0, o: 1, bytes: [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
    for (const tp of analysis.tempos)
      if (tp.tick > start && tp.tick < end)
        events.push({ t: tp.tick - start, o: 1, bytes: [0xff, 0x51, 0x03, (tp.usPerQ >> 16) & 255, (tp.usPerQ >> 8) & 255, tp.usPerQ & 255] });

    // Time signature at the start and changes inside
    let lastSig = "";
    for (let b = sec.startBar; b < sec.endBar; b++) {
      const bar = analysis.bars[b], key = bar.num + "/" + bar.den;
      if (key === lastSig) continue;
      lastSig = key;
      events.push({ t: bar.start - start, o: 2, bytes: [0xff, 0x58, 0x04, bar.num, Math.log2(bar.den), 24, 8] });
    }

    // Notes (hits up to a 32nd early belong to the section)
    for (const n of analysis.notes) {
      if (n.tick < start - tol || n.tick >= end - tol) continue;
      const on = Math.max(0, n.tick - start);
      const off = Math.max(on + 1, Math.min(n.end, end) - start);
      const vel = (velMap && velMap.has(n.pos)) ? velMap.get(n.pos) : n.vel;
      events.push({ t: on, o: 4, bytes: [0x90 | n.ch, n.note, vel] });
      events.push({ t: off, o: 3, bytes: [0x80 | n.ch, n.note, 0] });
    }
    events.sort((a, b) => a.t - b.t || a.o - b.o);

    const trk = [];
    let now = 0;
    for (const e of events) { trk.push(...vlqBytes(e.t - now), ...e.bytes); now = e.t; }
    trk.push(...vlqBytes(Math.max(0, end - start - now)), 0xff, 0x2f, 0x00);

    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255];
    const len = trk.length;
    return new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...trk]);
  }

  // ---------------------------------------------------------------------------
  // Zip (stored, no compression: MIDI files are tiny)

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function makeZip(files) {
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = new TextEncoder().encode(f.name), data = f.data, crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Example song (so the page opens with something to look at)

  function writeExampleMidi(seed, quantized) {
    const ppq = 480;
    let rnd = seed || 7;
    const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ev = [];   // {t, bytes}
    const hit = (t, note, vel) => {
      const jt = (rand() - 0.5) * 16;
      const tt = Math.max(0, Math.round(t + (quantized ? 0 : jt)));
      const v = Math.max(1, Math.min(127, Math.round(vel + (rand() - 0.5) * 14)));
      ev.push({ t: tt, o: 1, bytes: [0x99, note, v] }, { t: tt + 60, o: 0, bytes: [0x89, note, 0] });
    };
    const meta = (t, bytes) => ev.push({ t, o: -1, bytes });
    const tempo = (t, bpm) => { const us = Math.round(60e6 / bpm); meta(t, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]); };
    const sig = (t, n, d) => meta(t, [0xff, 0x58, 4, n, Math.log2(d), 24, 8]);
    const q = ppq, e8 = ppq / 2, s16 = ppq / 4;
    let t = 0;
    const bar44 = (fn) => { fn(t); t += 4 * q; };
    const verse = (b, fill) => { for (let i = 0; i < 8; i++) hit(b + i * e8, 42, i % 2 ? 70 : 95); hit(b, 36, 110); hit(b + 2.5 * q, 36, 95); hit(b + q, 38, 105); hit(b + 3 * q, 38, 108);
      if (fill) { for (let i = 0; i < 4; i++) hit(b + 2 * q + i * s16, [50, 48, 45, 43][i], 100); for (let i = 0; i < 4; i++) hit(b + 3 * q + i * s16, [45, 43, 41, 41][i], 105); } };
    const chorus = (b, crash) => { for (let i = 0; i < 4; i++) hit(b + i * q, 51, 90); hit(b, 36, 115); hit(b + e8, 36, 100); hit(b + 2 * q, 36, 112); hit(b + 2.5 * q, 36, 98); hit(b + q, 38, 112); hit(b + 3 * q, 38, 115); if (crash) hit(b, 49, 118); };
    const intro = (b) => { for (let i = 0; i < 8; i++) hit(b + i * e8, 42, 80); hit(b, 36, 100); };
    sig(0, 4, 4); tempo(0, 124);
    for (let i = 0; i < 4; i++) bar44((b) => intro(b));
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 8; i++) bar44((b) => verse(b, i === 7));
      for (let i = 0; i < 8; i++) bar44((b) => chorus(b, i === 0 || i === 4));
    }
    // Bridge in 7/8, a bit slower
    sig(t, 7, 8); tempo(t, 116);
    for (let i = 0; i < 4; i++) { const b = t; hit(b, 36, 110); hit(b + 1.5 * q, 38, 100); hit(b + 2.5 * q, 36, 100); hit(b + 3 * q, 38, 105); for (let k = 0; k < 7; k++) hit(b + k * e8, 42, 75); t += 3.5 * q; }
    sig(t, 4, 4); tempo(t, 124);
    for (let i = 0; i < 8; i++) bar44((b) => chorus(b, i === 0 || i === 4));
    hit(t, 49, 120); hit(t, 36, 120); t += 4 * q;

    ev.sort((a, b) => a.t - b.t || a.o - b.o);
    const trk = [];
    let now = 0;
    const name = Array.from(new TextEncoder().encode("Trommer (eksempel)"));
    trk.push(0, 0xff, 0x03, name.length, ...name);
    for (const x of ev) { trk.push(...vlqBytes(x.t - now), ...x.bytes); now = x.t; }
    trk.push(0, 0xff, 0x2f, 0);
    const len = trk.length;
    return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255,
      0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...trk]).buffer;
  }

  const api = { readMidi, analyse, humanizeTiming, writeHumanized, TIMING_DEFAULTS, makeNoteMap, noteName, detectMapKind, MAPS, humanize, applyVelocities, velocitySpread, HUM_GROUPS, HUM_DEFAULTS, humGroupOfNote, findRepeats, repeatInfo, suggestNames, barEnergy, similarity, sectionToMidi, makeZip, crc32, writeExampleMidi, GROUPS, tickToSeconds };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DrumSplit = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
