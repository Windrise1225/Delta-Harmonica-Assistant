import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const before = process.argv.includes('--before');
const output = path.resolve('artifacts/readability');
await mkdir(output, { recursive: true });
const data = await mkdtemp(path.join(output, 'test-data-'));
// Reuse test artwork seeds so before/after captures differ only in the UI treatment.
const fixtureLibrary = path.join(output, 'fixture-library.json');
if (!before) {
  try { await writeFile(path.join(data, 'library.json'), await readFile(fixtureLibrary)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const fixture = JSON.parse(await readFile('fixtures/TEST_eight_lanes.dhscore', 'utf8'));
const scores = ['TEST · 晶莹回响', 'TEST · 流动的留白', 'TEST · 雨后薰衣草'].map((name, i) => ({
  ...fixture, id: `00000000-0000-4000-8000-00000000001${i}`, name,
  createdAt: `2026-11-0${i + 1}T12:00:00.000Z`, lastUsed: `2026-11-0${i + 1}T13:00:00.000Z`,
}));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const report = [];
for (const scale of before ? [1] : [1, 1.25, 1.5]) {
  const env = { ...process.env, DHA_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DHA_DEV_URL;
  const app = await electron.launch({
    executablePath: path.resolve(pkg.build.directories.output, 'win-unpacked', 'Delta Harmonica Assistant.exe'),
    args: [`--force-device-scale-factor=${scale}`], cwd: process.cwd(), env, timeout: 45000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('.library-main');
    const boot = await page.evaluate(() => window.dha.call('bootstrap'));
    if (!boot.library.scores.length) {
      await page.evaluate(async scores => { for (const score of scores) await window.dha.call('score.save', score); }, scores);
      await page.reload();
    }
    await page.waitForSelector('.recent-card');
    if (before) await writeFile(fixtureLibrary, JSON.stringify((await page.evaluate(() => window.dha.call('bootstrap'))).library));
    for (const [width, height] of before ? [[1440, 960]] : [[1440, 960], [1040, 720]]) {
      const contentBounds=await app.evaluate(({ BrowserWindow }, bounds) => {
        const win=BrowserWindow.getAllWindows()[0];
        win.setContentBounds({x:0,y:0,...bounds});return win.getContentBounds();
      }, {width,height});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const actualWidth=await page.evaluate(()=>innerWidth);
      console.log(JSON.stringify({scale,requestedWidth:width,actualWidth,contentBounds}));
      assert.ok(actualWidth>=1040,'The desktop viewport must retain the supported minimum width');
      // Offscreen covers intentionally have no src. Scroll each into the
      // viewport so the test verifies lazy loading instead of waiting forever.
      for (const image of await page.locator('.cover-image').all()) {
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(image => image.complete && image.naturalWidth > 0, await image.elementHandle(), {timeout: 10000});
      }
      await page.locator('main').evaluate(main => { main.scrollTop = 0; });
      const prefix = `${before ? 'before' : 'after'}-${scale}-${width}`;
      await page.screenshot({ path: path.join(output, `${prefix}-library.png`) });
      const measurements = await page.evaluate(() => {
        const main = document.querySelector('main');
        const sizes = Object.fromEntries(['h1', '.sidebar nav button', '.recent-card h3', '.score-name b', '.numeric', '.table-header', '.now-playing b', '.seek-container>span'].map(selector => [selector, getComputedStyle(document.querySelector(selector)).fontSize]));
        return { dpr: devicePixelRatio, width: innerWidth, overflow: main.scrollWidth > main.clientWidth, sizes };
      });
      report.push({ scale, width, ...measurements });
      if (!before) {
        assert.equal(measurements.overflow, false, `${prefix}: horizontal overflow`);
        assert.equal(measurements.dpr, scale);
        for (const size of Object.values(measurements.sizes)) assert.ok(parseFloat(size) >= 14, `${prefix}: small functional text`);
        const contrast = await page.evaluate(() => {
          const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
          const luminance = values => values.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
          const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
          // Conservative tinted surface: darker than the normal white glass and row hover.
          const surface = [237, 226, 246];
          return Object.fromEntries(['.page-heading p:not(.eyebrow)', '.score-row .numeric', '.last-used', '.table-header', '.now-playing b', '.seek-container>span'].map(selector => [selector, ratio(rgb(getComputedStyle(document.querySelector(selector)).color), surface)]));
        });
        for (const [selector, ratio] of Object.entries(contrast)) assert.ok(ratio >= 4.5, `${prefix}: ${selector} contrast ${ratio}`);
        report.at(-1).contrast = contrast;
      }
      await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      await page.getByRole('button', { name: '游戏音高校准', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${prefix}-calibration.png`) });
      if (!before) {
        assert.equal(await page.locator('.mapping-grid input').count(), 8);
        assert.ok(await page.locator('.mapping-grid input').first().evaluate(input => parseFloat(getComputedStyle(input).fontSize) >= 16));
        assert.ok(await page.locator('.mapping-grid kbd').first().evaluate(key => parseFloat(getComputedStyle(key).fontSize) >= 19));
      }
      await page.getByRole('button', { name: '我的曲库', exact: false }).first().click();
    }
    if (!before) {
      const prefix = `after-${scale}-1040`;
      const capture = async name => {
        await page.screenshot({ path: path.join(output, `${prefix}-${name}.png`) });
        assert.equal(await page.evaluate(() => { const main = document.querySelector('main'); return main.scrollWidth > main.clientWidth || document.documentElement.scrollWidth > innerWidth; }), false, `${prefix}-${name}: overflow`);
      };
      await page.getByRole('button', { name: '偏好设置', exact: true }).click();
      for (const [name, tab] of [['appearance', '外观与音符'], ['overlay-settings', '覆盖窗口'], ['data-settings', '语言与数据']]) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await capture(name);
      }
      await page.getByRole('button', { name: '使用指南', exact: true }).click();
      await capture('help');
      await page.getByRole('button', { name: '演奏空间', exact: true }).click();
      await capture('performance');
      await page.getByRole('button', { name: '我的曲库', exact: false }).first().click();
      await page.locator('.score-row').first().getByRole('button', { name: /^More / }).click();
      const menu = await page.getByRole('menu').boundingBox();
      assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= 1040 && menu.y + menu.height <= 720, 'Menu must fit in the compact window');
      await capture('menu');
      await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
      await capture('rename');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve('fixtures/TEST_neon_timing.mid'));
      await page.getByRole('button', { name: '导入曲谱', exact: true }).click();
      await page.waitForSelector('.track-options');
      await capture('midi-import');
      assert.equal(await page.getByRole('button', { name: '保存到曲库', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: '返回曲库', exact: true }).click();
      await page.evaluate(async () => { const b = await window.dha.call('bootstrap'); await window.dha.call('settings', { ...b.library.settings, language: 'en' }); });
      await page.reload();
      await page.waitForSelector('.recent-card');
      await capture('english');
      await page.evaluate(async () => { const b = await window.dha.call('bootstrap'); await window.dha.call('settings', { ...b.library.settings, language: 'zh' }); });
    }
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
}
await writeFile(path.join(output, `${before ? 'before' : 'after'}-report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, before, report, isolatedData: data }, null, 2));
