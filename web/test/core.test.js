// Tests for drumsplit-core.js with songs whose structure we know.
const DS = require("../src/core.js");
const fs = require("fs");

// ---- an independent MIDI writer, with the quirks real files have -------------------
function vlq(v) { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o; }
function writeSong({ ppq = 480, parts, seed = 1, jitter = 12, format1 = false, runningStatus = false, zeroVelOff = false, noMeta = false, channel = 9 }) {
  let r = seed; const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const notes = [], metas = [];
  let t = 0; const truth = [];
  const q = ppq;
  for (const p of parts) {
    const barLen = Math.round(p.num * 4 / p.den * q);
    if (!noMeta) metas.push({ t, bytes: [0xff, 0x58, 4, p.num, Math.log2(p.den), 24, 8] });
    if (!noMeta && p.bpm) { const us = Math.round(60e6 / p.bpm); metas.push({ t, bytes: [0xff, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255] }); }
    truth.push({ name: p.name, bars: p.bars });
    for (let b = 0; b < p.bars; b++) {
      for (const [beatPos, note, vel] of p.pattern(b, p.bars)) {
        const tt = Math.max(0, Math.round(t + beatPos * q + (rand() - 0.5) * 2 * jitter * ppq / 480));
        notes.push({ t: tt, note, vel: Math.max(1, Math.min(127, Math.round(vel + (rand() - 0.5) * 16))) });
      }
      t += barLen;
    }
  }
  const ev = [];
  for (const n of notes) { ev.push({ t: n.t, o: 1, bytes: [0x90 | channel, n.note, n.vel] }); ev.push({ t: n.t + 40, o: 0, bytes: zeroVelOff ? [0x90 | channel, n.note, 0] : [0x80 | channel, n.note, 64] }); }
  const enc = (list, name) => {
    list.sort((a, b) => a.t - b.t || a.o - b.o);
    const out = []; let now = 0, last = -1;
    if (name) { const b = Array.from(Buffer.from(name)); out.push(0, 0xff, 3, b.length, ...b); }
    for (const e of list) {
      out.push(...vlq(e.t - now)); now = e.t;
      if (runningStatus && e.bytes[0] < 0xf0 && e.bytes[0] === last) out.push(...e.bytes.slice(1));
      else { out.push(...e.bytes); last = e.bytes[0] < 0xf0 ? e.bytes[0] : -1; }
    }
    out.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, out.length >>> 24 & 255, out.length >>> 16 & 255, out.length >>> 8 & 255, out.length & 255, ...out];
  };
  const tracks = format1 ? [enc(metas.map((m) => ({ ...m, o: -1 })), "Tempo"), enc(ev, "Drums")] : [enc([...metas.map((m) => ({ ...m, o: -1 })), ...ev], "Drums")];
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format1 ? 1 : 0, 0, tracks.length, ppq >> 8, ppq & 255];
  return { buffer: new Uint8Array([...head, ...tracks.flat()]).buffer, truth };
}

// ---- drum patterns -------------------------------------------------------------------
const rock = (fillLast) => (b, n) => {
  const h = []; for (let i = 0; i < 8; i++) h.push([i / 2, 42, i % 2 ? 70 : 95]);
  const base = [...h, [0, 36, 110], [2.5, 36, 95], [1, 38, 105], [3, 38, 108]];
  if (fillLast && b === n - 1) return [[0, 36, 110], [0, 42, 90], [0.5, 42, 70], [1, 38, 105], [1.5, 42, 70], [2, 50, 100], [2.25, 48, 100], [2.5, 45, 100], [2.75, 43, 100], [3, 45, 105], [3.25, 43, 105], [3.5, 41, 105], [3.75, 41, 105]];
  return base;
};
const chorusPat = (b) => { const p = [[0, 51, 90], [1, 51, 90], [2, 51, 90], [3, 51, 90], [0, 36, 115], [0.5, 36, 100], [2, 36, 112], [2.5, 36, 98], [1, 38, 112], [3, 38, 115]]; if (b % 4 === 0) p.push([0, 49, 118]); return p; };
const halfTime = () => [[0, 36, 110], [2, 38, 110], [0, 42, 80], [1, 42, 80], [2, 42, 80], [3, 42, 80]];
const waltz = (b, n) => { const p = [[0, 36, 110], [1, 38, 90], [2, 38, 90], [0, 42, 80], [1, 42, 70], [2, 42, 70]]; if (b === n - 1) p.push([2.5, 43, 100]); return p; };
const waltzB = () => [[0, 36, 110], [1.5, 36, 90], [1, 38, 100], [2, 38, 100], [0, 51, 90], [1, 51, 90], [2, 51, 90]];
const sevenEight = () => [[0, 36, 110], [1.5, 38, 100], [2.5, 36, 100], [3, 38, 105], [0, 42, 75], [0.5, 42, 75], [1, 42, 75], [1.5, 42, 75], [2, 42, 75], [2.5, 42, 75], [3, 42, 75]];
const intro = () => [[0, 36, 100], [0, 42, 80], [0.5, 42, 80], [1, 42, 80], [1.5, 42, 80], [2, 42, 80], [2.5, 42, 80], [3, 42, 80], [3.5, 42, 80]];

const S44 = { num: 4, den: 4, bpm: 124 };
const songs = {
  "pop song (format 0)": { parts: [
    { name: "Intro", bars: 4, ...S44, pattern: intro },
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Omkvæd", bars: 8, ...S44, pattern: chorusPat },
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Omkvæd", bars: 8, ...S44, pattern: chorusPat },
    { name: "Bro 7/8", bars: 4, num: 7, den: 8, bpm: 116, pattern: sevenEight },
    { name: "Omkvæd", bars: 8, ...S44, pattern: chorusPat } ] },
  "format 1, running status, vel-0 note-offs, PPQ 96": { ppq: 96, format1: true, runningStatus: true, zeroVelOff: true, parts: [
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Halftime", bars: 8, ...S44, pattern: halfTime },
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Omkvæd", bars: 16, ...S44, pattern: chorusPat } ] },
  "heavy humanizing (+-30 ticks)": { jitter: 30, parts: [
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Omkvæd", bars: 8, ...S44, pattern: chorusPat },
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) } ] },
  "waltz, no tempo/time signature in file": { noMeta: true, parts: [
    { name: "A", bars: 8, num: 3, den: 4, pattern: waltz },
    { name: "B", bars: 8, num: 3, den: 4, pattern: waltzB },
    { name: "A", bars: 8, num: 3, den: 4, pattern: waltz } ] },
  "drums on channel 1 (not GM drum channel)": { channel: 0, parts: [
    { name: "Vers", bars: 8, ...S44, pattern: rock(true) },
    { name: "Omkvæd", bars: 8, ...S44, pattern: chorusPat } ] },
};

let failures = 0;
const fmt = (secs) => secs.map((s) => `${s.letter}${s.repeat}[${s.startBar + 1}-${s.endBar}]`).join(" ");
const SEEDS = +(process.env.SEEDS || 1);
for (let seed = 1; seed <= SEEDS; seed++) for (const [name0, cfg0] of Object.entries(songs)) { const name = name0 + (SEEDS > 1 ? " seed " + seed : ""); const cfg = { ...cfg0, seed: cfg0.seed ? cfg0.seed * seed : seed * 7919 };
  const { buffer, truth } = writeSong(cfg);
  const midi = DS.readMidi(buffer);
  const a = DS.analyse(midi);
  // expected boundaries
  let bar = 0; const expect = truth.map((p) => { const s = bar; bar += p.bars; return [s, bar]; });
  const got = a.sections.map((s) => [s.startBar, s.endBar]);
  const ok = JSON.stringify(expect) === JSON.stringify(got);
  // same truth name -> same letter
  const nameToLetter = new Map(); let lettersOk = ok;
  if (ok) truth.forEach((p, i) => { const L = a.sections[i].letter; if (nameToLetter.has(p.name) && nameToLetter.get(p.name) !== L) lettersOk = false; nameToLetter.set(p.name, L); });
  const distinct = new Set(truth.map((p) => p.name)).size === new Set(a.sections.map((s) => s.letter)).size;
  const pass = ok && lettersOk && distinct;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      expected: ${truth.map((p, i) => `${p.name}[${expect[i][0] + 1}-${expect[i][1]}]`).join(" ")}`);
  console.log(`      found:    ${fmt(a.sections)}`);
  console.log(`      tempo ${a.bpmMin.toFixed(0)}-${a.bpmMax.toFixed(0)} BPM (in file: ${a.hasTempo}), time signatures ${a.sigList.map((s) => s.sig + "@" + s.bar).join(", ")}${a.sigEstimated ? " (estimated)" : ""}, notes on grid ${(100 * a.gridFit).toFixed(0)}%`);
}

// ---- export round trip --------------------------------------------------------------
{
  const midi = DS.readMidi(DS.writeExampleMidi(7));
  const a = DS.analyse(midi);
  console.log(`\nexample song: ${fmt(a.sections)}  (${a.sections.length} sections, ${a.bars.length} bars)`);
  let total = 0, mism = 0;
  const files = [];
  for (const s of a.sections) {
    const bytes = DS.sectionToMidi(a, s, `${s.letter}${s.repeat}`);
    const back = DS.readMidi(bytes.buffer);
    const ons = back.tracks[0].events.filter((e) => e.kind === "on");
    const expected = a.notes.filter((n) => n.tick >= s.startTick - a.ppq / 8 && n.tick < s.endTick - a.ppq / 8).length;
    const metas = back.tracks[0].events.filter((e) => e.kind === "meta").map((e) => e.type);
    const ra = DS.analyse(back);
    if (ons.length !== expected) mism++;
    total += ons.length;
    console.log(`  section ${s.letter}${s.repeat}: ${s.bars} bars ${s.sig} ${s.bpm.toFixed(0)} BPM -> file ${bytes.length} bytes, ${ons.length}/${expected} notes, tempo ${metas.includes(0x51)}, timesig ${metas.includes(0x58)}, re-read: ${ra.bars.length} bars ${ra.sigList[0].sig} ${ra.bpmStart.toFixed(0)} BPM`);
    files.push({ name: `${String(s.number).padStart(2, "0")}_${s.letter}${s.repeat}.mid`, data: bytes });
  }
  console.log(`  notes exported ${total} of ${a.notes.length}, sections with wrong count: ${mism}`);
  if (total !== a.notes.length || mism) failures++;
  fs.writeFileSync("/tmp/claude-0/drumsplit_test.zip", DS.makeZip(files));
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
