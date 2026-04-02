import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5000';
const OUT = path.join(__dirname, '../client/public');
const CHROME = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});

// ── Helper: log in via API and set cookies ─────────────────
async function loginViaAPI(page) {
  const res = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/login/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: 'schooladmin', password: 'FuturePath2025!' }),
    });
    return { status: r.status, ok: r.ok };
  }, BASE);
  console.log('Login response:', res);
  return res.ok;
}

// ── 1. Results page ─────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(`${BASE}/results?assessmentId=33c6814c-3193-4e21-af21-29349309f1e6`, { waitUntil: 'networkidle2', timeout: 40000 });
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/wp-results.png` });
  console.log('Saved wp-results.png');
  await page.close();
}

// ── 2. Admin dashboard (log in first via API) ─────────────
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });

  // Navigate to app first to establish session context
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);

  // Log in via the API directly
  const ok = await loginViaAPI(page);
  console.log('Login ok:', ok);
  await sleep(1500);

  // Navigate to admin dashboard
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/wp-admin.png` });
  console.log('Saved wp-admin.png');

  // Navigate to student progress
  await page.goto(`${BASE}/student-progress`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/wp-progress.png` });
  console.log('Saved wp-progress.png');

  await page.close();
}

await browser.close();
console.log('All screenshots done.');
