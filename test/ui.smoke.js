// UI smoke run (npm run test:ui): the dashboard against the mock (test/webdev.js) in headless Chrome for Testing, as an admin
// and as a member. Every page must show its heading, with no console error, no uncaught exception and no error screen.
// Not in npm test, which gates the script deploys: this one needs the browser build playwright-core expects, once:
// npx playwright-core install chromium-headless-shell
const { spawn } = require('child_process'), path = require('path');
const { chromium } = require('playwright-core');

const API = 3311, UI = 5311, ROOT = path.join(__dirname, '..');
const ADMIN = ['/', '/alerts', '/binomes', '/interviewees', '/team', '/my-binome', '/schedule', '/analytics', '/maintenance', '/help',
  '/settings/general', '/settings/timing', '/settings/sharing', '/settings/emails', '/settings/screening', '/settings/connections',
  '/settings/account', '/settings/appearance', '/settings/history'];
const MEMBER = ['/', '/settings/account', '/settings/appearance', '/help'];
const ROLES = [['admin@g.enp.edu.dz', ADMIN], ['adminmember', ['/my-binome']], ['member', MEMBER]];

// Start a server and resolve once its output says it is up; stdout and stderr are kept for a failure report.
function start(cmd, args, opts, ready) {
  const p = spawn(cmd, args, opts);
  p.log = '';
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(cmd + ' did not start in 120 s:\n' + p.log.slice(-2000))), 120e3);
    const on = d => { p.log += d; if (ready.test(p.log)) { clearTimeout(t); res(p); } };
    p.stdout.on('data', on); p.stderr.on('data', on);
    p.on('exit', c => { clearTimeout(t); rej(new Error(cmd + ' exited ' + c + ':\n' + p.log.slice(-2000))); });
  });
}
const stop = p => { if (p && p.exitCode === null) { p.removeAllListeners('exit'); process.platform === 'win32' ? spawn('taskkill', ['/pid', p.pid, '/T', '/F']) : p.kill(); } };

(async () => {
  let api, ui, browser, failed = 0;
  try {
    api = await start('node', ['test/webdev.js', String(API)], { cwd: ROOT }, /Mock API on/);
    ui = await start('node', ['node_modules/vite/bin/vite.js', '--port', String(UI), '--strictPort'], { cwd: path.join(ROOT, 'frontend'),
      env: Object.assign({}, process.env, { VIC_API: 'http://localhost:' + API, NO_COLOR: '1' }) }, new RegExp('localhost:' + UI));
    browser = await chromium.launch(); // headless: playwright-core's chromium-headless-shell
    for (const [as, pages] of ROLES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
      let errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`http://localhost:${UI}/dev-login?as=${as}`, { timeout: 90e3 });
      for (const url of pages) {
        errs = [];
        let why = '';
        try {
          await page.goto(`http://localhost:${UI}${url}`, { timeout: 90e3 });
          await page.locator('h1').first().waitFor({ timeout: 60e3 }); // the page's heading, or an error screen's or the gate's
          await page.waitForTimeout(1500); // late renders and their console errors
          if (await page.locator('#error-title, #gate-title').count()) why = 'error screen: ' + await page.locator('#error-title, #gate-title').first().innerText();
          else if (errs.length) why = 'console: ' + errs.slice(0, 3).join(' | ');
        } catch (e) { why = (e.message.split('\n')[0]) + (errs.length ? ' | console: ' + errs.slice(0, 3).join(' | ') : ''); }
        if (why) failed++;
        console.log((why ? 'FAIL ' : 'ok   ') + as.split('@')[0].padEnd(12) + url + (why ? '  ' + why : ''));
      }
      await ctx.close();
    }
  } catch (e) {
    failed++;
    console.log('FAIL setup: ' + e.message);
  } finally {
    if (browser) await browser.close();
    stop(ui); stop(api);
  }
  console.log(failed ? `UI SMOKE: ${failed} failed` : 'UI SMOKE OK');
  process.exit(failed ? 1 : 0);
})();
