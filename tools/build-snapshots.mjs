#!/usr/bin/env node
/* Rebuilds the offline snapshots (js/snapshot.js, js/college/snapshot.js, js/football/snapshot.js) from live data.
 *
 *   node tools/build-snapshots.mjs              all four boards
 *   node tools/build-snapshots.mjs nfl cfb      only these
 *   node tools/build-snapshots.mjs --dry        fetch and check, but don't write
 *
 * It loads the boards' own data layers, so the snapshot always matches what the boards read. A board whose data
 * can't be fetched, or fails its sanity checks, keeps its existing snapshot. Exit code 1 only if nothing could
 * be built. No keys or secrets are needed: every source is public. Needs Node 20 or newer.
 *
 * Optional: NCAA_BASE=https://your-copy.example.com to read college baseball from your own copy of the NCAA API. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), dry = args.includes('--dry');
const want = args.filter((a) => !a.startsWith('--'));
const ALL = ['mlb', 'college', 'nfl', 'cfb'];
const targets = want.length ? ALL.filter((t) => want.includes(t)) : ALL;
const baseFetch = globalThis.__snapshotFetch || globalThis.fetch;
if (!baseFetch) { console.error('Node 20 or newer is required (no fetch).'); process.exit(1); }

let requests = 0;
function context() {
  const store = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL, Promise, Date, Math, JSON, Intl,
    fetch: (u, o) => { requests++; return baseFetch(u, { ...(o || {}), headers: { Accept: 'application/json', 'User-Agent': 'live-board-snapshot/1.0', ...((o && o.headers) || {}) } }); },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: () => null, get length() { return store.size; } }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
function load(ctx, files) { for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); }

const stamp = new Date().toISOString().slice(0, 10);
function write(file, comment, body) {
  const text = '/* ' + comment + '\n * Rebuilt ' + stamp + ' by tools/build-snapshots.mjs — do not edit by hand. */\n' + body + '\n';
  if (dry) { console.log('  (dry run) would write ' + file + ' — ' + Math.round(text.length / 1024) + ' KB'); return; }
  fs.writeFileSync(path.join(ROOT, file), text);
  console.log('  wrote ' + file + ' — ' + Math.round(text.length / 1024) + ' KB');
}

const now = new Date();
let built = 0;
const failed = [];
async function attempt(name, fn) {
  const t0 = Date.now(), r0 = requests;
  try { const v = await fn(); built++; console.log('✓ ' + name + ' (' + (requests - r0) + ' requests, ' + Math.round((Date.now() - t0) / 1000) + ' s)'); return v; }
  catch (e) { failed.push(name); console.error('✗ ' + name + ': ' + (e && e.message ? e.message : e) + ' — keeping the existing snapshot'); return null; }
}

if (targets.includes('mlb')) {
  const ctx = context(); load(ctx, ['js/config.js', 'js/api.js', 'tools/snapshot-builders.js']);
  const snap = await attempt('MLB', () => ctx.SnapshotBuilders.mlb(ctx.MLBX, now));
  if (snap) write('js/snapshot.js', 'MLB Live Board — offline snapshot of MLB Stats API data. Used only when the live API can\'t be reached.',
    "(function () {\n  'use strict';\n  var X = (window.MLBX = window.MLBX || {});\n  X.SNAPSHOT = " + JSON.stringify(snap) + ';\n})();');
}

if (targets.includes('college')) {
  const ctx = context(); load(ctx, ['js/config.js', 'js/college/config.js', 'js/college/api.js', 'tools/snapshot-builders.js']);
  if (process.env.NCAA_BASE) ctx.MLBX.College.API.setBase(process.env.NCAA_BASE);
  let shown = 0;
  const snap = await attempt('College baseball', () => ctx.SnapshotBuilders.college(ctx.MLBX, now, (done, total) => { if (done - shown >= 25 || done === total) { shown = done; console.log('  scoreboards ' + done + '/' + total); } }));
  if (snap) write('js/college/snapshot.js', 'MLB Live Board · College mode — offline snapshot of NCAA API data. Used when the NCAA API can\'t be reached.',
    '(function () {\n  var C = ((window.MLBX = window.MLBX || {}).College = window.MLBX.College || {});\n  C.SNAPSHOT = ' + JSON.stringify(snap) + ';\n})();');
}

const fb = ['nfl', 'cfb'].filter((t) => targets.includes(t));
if (fb.length) {
  /* Both football boards share one file, so a league that isn't rebuilt keeps what the file already has. */
  let prev = {};
  try { const old = context(); load(old, ['js/football/snapshot.js']); prev = (old.MLBX.Football || {}).SNAPSHOT || {}; } catch (e) { /* no usable existing snapshot */ }
  const out = { nfl: prev.nfl, cfb: prev.cfb };
  let changed = false;
  for (const lid of fb) {
    const ctx = context(); load(ctx, ['js/config.js', 'js/football/config.js', 'js/football/api.js', 'tools/snapshot-builders.js']);
    const snap = await attempt(lid === 'nfl' ? 'NFL' : 'College football', () => ctx.SnapshotBuilders.football(ctx.MLBX, lid, now));
    if (snap) { out[lid] = snap; changed = true; }
  }
  if (changed && out.nfl && out.cfb) write('js/football/snapshot.js', 'MLB Live Board · Football modes — offline snapshot of ESPN data (NFL and FBS). Used when ESPN can\'t be reached.',
    '(function () {\n  var F = ((window.MLBX = window.MLBX || {}).Football = window.MLBX.Football || {});\n  F.SNAPSHOT = ' + JSON.stringify(out) + ';\n})();');
}

console.log('\n' + built + ' of ' + targets.length + ' snapshots rebuilt' + (failed.length ? '; kept the old one for: ' + failed.join(', ') : '') + '. ' + requests + ' requests.');
process.exit(built ? 0 : 1);
