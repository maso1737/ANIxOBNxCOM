/* =====================================================================
 * single-html-verify — 統合ランナー（v2: 2パス分離）
 * ---------------------------------------------------------------------
 * Pass 1 = 決定論VRT: inject.js を本体より先に注入（乱数/時間/rAF/DPRをモック）。
 *          seek/render を手動ステップしてスクショ→pixelmatch。perfは取らない（仮想時間で無意味）。
 * Pass 2 = 実クロックperf: inject.js を注入せず、ツール本来の時間軸で自走させ、
 *          perf.js の LoAF＋renderer.info ピークサンプリングで実測→budget判定。別ブラウザ起動。
 * → summary.json は frames[]=Pass1 / perf=Pass2 をマージ。
 *
 * 使い方:  node harness/runner.mjs [config.json]
 * 承認(baseline更新): UPDATE_BASELINE=1 node harness/runner.mjs
 * SwiftShader:        HARNESS_GL=swiftshader node harness/runner.mjs
 *   ※鉄則: baseline と actual は必ず同一GLバックエンドで撮ること。
 * ===================================================================== */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const HARNESS_DIR = path.dirname(url.fileURLToPath(import.meta.url));

/* ---- config ---------------------------------------------------------- */
const cfgPath = process.argv[2] || './verify.config.json';
const DEFAULT_CFG = {
  tool: 'untitled',
  root: '.', html: 'index.html', canvasFallbackFullPage: true,
  seeks: [
    { label: 'start_t0', timeMs: 0 },
    { label: 'mid_t500', timeMs: 500 },
    { label: 'end_t1500', timeMs: 1500 }
  ],
  vrt: { colorThreshold: 0.1, allowedPixelRatio: 0.005 }, // AAは includeAA:false で無視
  perfPass: { enabled: true, sampleMs: 1500, samples: 8 },
  budget: {
    maxTTFFms: 500, maxLongestFrameMs: 50, maxLongAnimationFrames: null,
    maxDrawCalls: null, maxTriangles: null, maxVramBytes: null
  },
  timeoutMs: 15000
};
let cfg = DEFAULT_CFG;
if (fs.existsSync(cfgPath)) { cfg = deepMerge(DEFAULT_CFG, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); console.log(`[cfg] ${cfgPath}`); }
else console.log('[cfg] using built-in defaults');
function deepMerge(a, b) {
  if (Array.isArray(a)) return b !== undefined ? b : a;
  const out = { ...a };
  for (const k of Object.keys(b || {})) out[k] = (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && typeof b[k] === 'object') ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

const ROOT = path.resolve(cfg.root);
const BASE_DIR = path.resolve('./baselines');
const ART_DIR = path.resolve('./artifacts');
[BASE_DIR, ART_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
const UPDATE = process.env.UPDATE_BASELINE === '1';
const SWIFT = process.env.HARNESS_GL === 'swiftshader';
const glArgs = SWIFT ? ['--use-gl=swiftshader'] : ['--use-gl=angle']; // 実GPU確認=angle / 可搬=swiftshader
const commonArgs = [...glArgs, '--ignore-gpu-blocklist', '--disable-gpu-sandbox'];

/* ---- ephemeral static server（file:// のCORS回避） ------------------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.gltf': 'application/json', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/' + cfg.html;
  const fp = path.join(ROOT, rel);
  if (!fp.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

/* ---- diff region抽出（赤=実差分。AAの黄は無視される） --------------- */
function extractRegions(diff, ratio) {
  const { width, height, data } = diff;
  let x1 = width, y1 = height, x2 = 0, y2 = 0, red = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) { red++; if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y; }
  }
  if (!red) return [];
  const area = (x2 - x1 + 1) * (y2 - y1 + 1);
  const sev = ratio > 0.02 ? 'HIGH' : ratio > 0.005 ? 'MEDIUM' : 'LOW';
  return [{ boundingBox: { x1, y1, x2, y2 }, severity: sev, mismatchRatioInRegion: +(red / area).toFixed(3), reasoningPattern: 'pixel_mismatch' }];
}
const rel = p => './' + path.relative(process.cwd(), p).split(path.sep).join('/');

/* ===================================================================== */
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = `http://localhost:${PORT}/${cfg.html}`;
console.log(`[host] http://localhost:${PORT}/  (GL=${SWIFT ? 'swiftshader' : 'angle'})`);

const result = {
  schemaVersion: 1, tool: cfg.tool, timestamp: new Date().toISOString(),
  environment: { headless: true, renderBackend: SWIFT ? 'swiftshader' : 'angle' },
  summary: { status: 'PASS', framesTested: 0, failedFrames: 0, errors: [] },
  perf: null, frames: []
};

/* ---------------- PASS 1: 決定論VRT（inject有） ---------------------- */
try {
  const b1 = await chromium.launch({ headless: true, args: commonArgs });
  const p = await b1.newPage();
  await p.addInitScript({ path: path.join(HARNESS_DIR, 'inject.js') }); // ★本体より先
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.version >= 1, null, { timeout: cfg.timeoutMs });
  await p.evaluate(async () => { await window.__HARNESS__.ready(); });
  result.environment.engine = await p.evaluate(() => window.__HARNESS__.kind || 'unknown');
  const canvasSel = await p.evaluate(() => window.__HARNESS__.canvas || null);
  console.log('--- PASS 1: deterministic VRT ---');
  for (const s of cfg.seeks) {
    result.summary.framesTested++;
    await p.evaluate(({ t }) => { window.__HARNESS__.seek(t); window.__HARNESS__.render(); }, { t: s.timeMs });
    const actualBuf = (canvasSel && await p.$(canvasSel)) ? await p.locator(canvasSel).screenshot() : await p.screenshot();
    const actualPath = path.join(ART_DIR, `${s.label}_actual.png`);
    fs.writeFileSync(actualPath, actualBuf);
    const basePath = path.join(BASE_DIR, `${s.label}.png`);
    const fr = { label: s.label, timeMs: s.timeMs, colorThreshold: cfg.vrt.colorThreshold, allowedPixelRatio: cfg.vrt.allowedPixelRatio, artifacts: { actual: rel(actualPath) } };
    if (!fs.existsSync(basePath) || UPDATE) {
      fs.writeFileSync(basePath, actualBuf); fr.verdict = 'BASELINE_CREATED'; fr.artifacts.baseline = rel(basePath);
      result.frames.push(fr); console.log(`  [base] ${s.label} baseline ${UPDATE ? 'updated' : 'created'}`); continue;
    }
    const a = PNG.sync.read(actualBuf), b = PNG.sync.read(fs.readFileSync(basePath));
    if (a.width !== b.width || a.height !== b.height) {
      fr.verdict = 'FAIL'; fr.mismatchPixelRatio = 1; result.summary.failedFrames++;
      result.summary.errors.push(`${s.label}: size mismatch`); result.frames.push(fr); continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const mm = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: cfg.vrt.colorThreshold, includeAA: false });
    const ratio = mm / (a.width * a.height); fr.mismatchPixelRatio = +ratio.toFixed(5);
    if (ratio > cfg.vrt.allowedPixelRatio) {
      const dP = path.join(ART_DIR, `${s.label}_diff.png`); fs.writeFileSync(dP, PNG.sync.write(diff));
      fr.verdict = 'FAIL'; fr.artifacts.baseline = rel(basePath); fr.artifacts.diff = rel(dP);
      fr.unstableRegions = extractRegions(diff, ratio); result.summary.failedFrames++;
      result.summary.errors.push(`${s.label}: mismatch ${(ratio * 100).toFixed(3)}% > ${(cfg.vrt.allowedPixelRatio * 100).toFixed(3)}%`);
      console.log(`  [FAIL] ${s.label} ${(ratio * 100).toFixed(3)}%`);
    } else { fr.verdict = 'PASS'; console.log(`  [ok]   ${s.label} ${(ratio * 100).toFixed(3)}%`); }
    result.frames.push(fr);
  }
  await b1.close();
} catch (e) { result.summary.status = 'FAIL'; result.summary.errors.push('pass1 error: ' + e.message); console.error('[pass1]', e); }

/* ---------------- PASS 2: 実クロックperf（inject無） ------------------ */
if (cfg.perfPass.enabled && result.summary.errors.every(e => !e.startsWith('pass1 error'))) {
  try {
    const b2 = await chromium.launch({ headless: true, args: commonArgs });
    const p = await b2.newPage();
    await p.addInitScript({ path: path.join(HARNESS_DIR, 'perf.js') }); // injectは入れない＝実時間
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__HARNESS__ && window.__HARNESS__.version >= 1, null, { timeout: cfg.timeoutMs });
    await p.evaluate(async () => { await window.__HARNESS__.ready(); if (window.__PERF__) window.__PERF__.markFirstFrame(); });
    console.log('--- PASS 2: real-clock perf ---');
    // ツールは __TEST_MODE__ 無しで自走。その間に renderer.info ピークをサンプリング
    let peak = null;
    const iv = Math.max(1, Math.floor(cfg.perfPass.sampleMs / cfg.perfPass.samples));
    for (let i = 0; i < cfg.perfPass.samples; i++) {
      await p.waitForTimeout(iv);
      const info = await p.evaluate(() => (window.__HARNESS__.info && window.__HARNESS__.info()) || null);
      if (info) { peak = peak || {}; for (const k of Object.keys(info)) peak[k] = Math.max(peak[k] || 0, info[k] || 0); }
    }
    if (peak && (peak.geometries != null || peak.textures != null))
      peak.vramBytesEstimate = (peak.geometries || 0) * 100 * 1024 + (peak.textures || 0) * 2048 * 2048 * 4;
    const snap = await p.evaluate(() => window.__PERF__ ? window.__PERF__.snapshot() : null);
    if (snap) {
      const renderer = peak || snap.renderer;
      const bud = cfg.budget, violated = {};
      const chk = (key, val, max) => { if (max != null && val != null && val > max) { violated[key] = true; result.summary.errors.push(`budget ${key}: ${val} exceeds ${max}`); } };
      chk('timeToFirstFrameMs', snap.timeToFirstFrameMs, bud.maxTTFFms);
      chk('longestFrameMs', snap.longestFrameMs, bud.maxLongestFrameMs);
      chk('longAnimationFrames', snap.longAnimationFrames, bud.maxLongAnimationFrames);
      if (renderer) { chk('drawCalls', renderer.drawCalls, bud.maxDrawCalls); chk('triangles', renderer.triangles, bud.maxTriangles); chk('vramBytesEstimate', renderer.vramBytesEstimate, bud.maxVramBytes); }
      result.perf = { ...snap, renderer, pass: 'realclock', budget: violated };
      console.log(`  TTFF=${snap.timeToFirstFrameMs}ms longestFrame=${snap.longestFrameMs}ms LoAF=${snap.longAnimationFrames}` + (renderer ? ` drawCalls=${renderer.drawCalls}` : ''));
      if (Object.keys(violated).length) console.log(`  [budget] exceeded: ${Object.keys(violated).join(', ')}`);
    }
    await b2.close();
  } catch (e) { result.summary.errors.push('pass2 error: ' + e.message); console.error('[pass2]', e); }
}

server.close();
const hardFail = result.summary.failedFrames > 0 ||
  (result.perf && result.perf.budget && Object.keys(result.perf.budget).length > 0) ||
  result.summary.errors.some(e => e.includes('error:'));
result.summary.status = hardFail ? 'FAIL' : 'PASS';

const outPath = path.join(ART_DIR, 'summary.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\n===== ${result.summary.status} =====  (${rel(outPath)})`);
if (result.summary.errors.length) console.log('  - ' + result.summary.errors.join('\n  - '));
process.exit(result.summary.status === 'PASS' ? 0 : 1);
