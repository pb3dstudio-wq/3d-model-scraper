// Loads the page in a real (headless) browser, records every 3D model file it
// requests, also scans HTML/JS text for model paths, then downloads them to ./out
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const target = (process.env.TARGET_URL || '').trim();
const exts = (process.env.EXTS || 'glb|gltf').replace(/[^a-z0-9|]/gi, '');
const waitMs = (parseInt(process.env.WAIT_SECONDS || '8', 10) || 8) * 1000;
if (!/^https?:\/\//i.test(target)) { console.error('URL must start with http(s)://'); process.exit(1); }

const OUT = 'out';
fs.mkdirSync(OUT, { recursive: true });
const extRe = new RegExp(`\\.(${exts})$`, 'i');
const textRe = new RegExp(`[^\\s"'\`<>()\\\\,;{}\\[\\]|]+\\.(${exts})(\\?[^\\s"'\`<>()\\\\]*)?(?=["'\`\\s<>()\\\\,;#]|$)`, 'gi');
const MODEL_MIME = /^model\/|gltf|octet-stream.*glb/i;

const found = new Map();      // url -> {source, body?}
const isModelUrl = u => { try { return extRe.test(new URL(u).pathname); } catch { return false; } };
const add = (u, source, base) => {
  try {
    const abs = new URL(u.split('\\/').join('/'), base).href;
    if (!/^https?:/.test(abs)) return;
    if (new URL(abs).pathname.split('/').pop().startsWith('.')) return;
    if (!found.has(abs)) found.set(abs, { source });
  } catch {}
};

const browser = await chromium.launch();
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  viewport: { width: 1600, height: 1000 }
});
const page = await context.newPage();

page.on('response', async res => {
  const u = res.url();
  const ct = res.headers()['content-type'] || '';
  try {
    if (isModelUrl(u) || MODEL_MIME.test(ct)) {
      add(u, 'network', target);
      const body = await res.body().catch(() => null);
      if (body && found.has(u)) found.get(u).body = body;
    } else if (/javascript|json|html/i.test(ct) && res.ok()) {
      const txt = await res.text().catch(() => '');
      for (const m of txt.split('\\/').join('/').matchAll(textRe)) add(m[0], 'text:' + new URL(u).pathname.split('/').pop(), u);
    }
  } catch {}
});

console.log('Opening', target);
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('goto warning:', e.message));
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

// Try to dismiss cookie banners, then scroll the whole page so lazy viewers load
for (const label of ['Accept all', 'Accept All', 'Alle akzeptieren', 'Accept', 'Agree', 'OK', 'Allow all']) {
  const b = page.getByRole('button', { name: label, exact: false }).first();
  if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
}
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); }
  window.scrollTo(0, 0);
}).catch(() => {});
await page.waitForTimeout(waitMs);

// Final DOM scan (attributes + rendered HTML)
const html = await page.content().catch(() => '');
for (const m of html.split('\\/').join('/').matchAll(textRe)) add(m[0], 'page HTML', target);
await browser.close().catch(() => {});

// Download anything we only saw as text
const used = new Set();
const report = [];
for (const [u, info] of found) {
  let name = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'model');
  let n = 1, base = name; while (used.has(name)) { const p = path.parse(base); name = `${p.name}_${n++}${p.ext}`; } used.add(name);
  let body = info.body;
  if (!body) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: target } }); if (r.ok) body = Buffer.from(await r.arrayBuffer()); } catch {}
  }
  if (body && body.length) {
    fs.writeFileSync(path.join(OUT, name), body);
    // pull external .bin / textures for .gltf
    if (/\.gltf$/i.test(name)) {
      try {
        const j = JSON.parse(body.toString('utf8'));
        for (const x of [...(j.buffers || []), ...(j.images || [])]) {
          if (!x.uri || x.uri.startsWith('data:')) continue;
          const dep = new URL(x.uri, u).href, depPath = path.join(OUT, decodeURIComponent(x.uri));
          const r = await fetch(dep); if (r.ok) { fs.mkdirSync(path.dirname(depPath), { recursive: true }); fs.writeFileSync(depPath, Buffer.from(await r.arrayBuffer())); }
        }
      } catch {}
    }
    report.push({ ok: true, name, size: body.length, url: u, source: info.source });
  } else report.push({ ok: false, name, size: 0, url: u, source: info.source });
}

const lines = report.map(r => `${r.ok ? 'OK  ' : 'FAIL'}  ${(r.size / 1048576).toFixed(2).padStart(7)} MB  ${r.name}  <-  ${r.url}  [${r.source}]`);
fs.writeFileSync(path.join(OUT, 'models.txt'), `Scanned: ${target}\n\n` + (lines.join('\n') || 'No model files found.') + '\n');
console.log(lines.join('\n') || 'No model files found.');

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`## 3D models found on ${target}`, '', report.length ? '| Status | File | Size | Found via |\n|---|---|---|---|' : '_No model files found._',
    ...report.map(r => `| ${r.ok ? '✅' : '❌'} | [${r.name}](${r.url}) | ${(r.size / 1048576).toFixed(2)} MB | ${r.source} |`),
    '', 'Download everything from the **models** artifact at the bottom of this run page.'].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
