import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const before = process.argv.includes('--before');
const output = path.resolve('artifacts/note-labels');
await mkdir(output, { recursive: true });
const data = await mkdtemp(path.join(output, 'test-data-'));
// Dedicated verification input; production demos and existing scores are never edited.
const notes = [
  ['Z', 'none', .2, .12], ['V', 'none', .45, .12], [',', 'none', .7, .12],
  ['Z', 'left', .95, .12], ['C', 'middle', 1.2, .12], ['V', 'right', 1.45, .12],
  ['Z', 'none', 1.7, .12], ['Z', 'none', 1.95, .12],
  ['V', 'left', 2.2, .12], ['V', 'left', 2.45, .12],
  ['C', 'none', 3, 1.5], ['V', 'right', 4.6, 1.5], ['C', 'middle', 6.2, .015],
  ...Array.from({ length: 6 }, (_, i) => ['Z', i < 3 ? 'none' : 'left', 6.4 + i * .09, .07]),
].map(([key, mouse, start, duration]) => ({ key, mouse, start, duration }));
const score = { version: 1, id: '00000000-0000-4000-8000-000000000099', name: 'TEST · 键盘与鼠标标识验证', createdAt: '2026-11-05T00:00:00.000Z', duration: 8, sourceDuration: 8, segment: [0, 8], bpm: 120, test: true, notes };
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const env = { ...process.env, DHA_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DHA_DEV_URL;
const app = await electron.launch({ executablePath: path.resolve(pkg.build.directories.output, 'win-unpacked', 'Delta Harmonica Assistant.exe'), args: [], cwd: process.cwd(), env, timeout: 45000 });
const report = [];
try {
  const page = await app.firstWindow();
  const traceCanvas = () => {
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      this.canvas.recordedFrames ??= [];
      if (this.canvas.noteFrame) this.canvas.recordedFrames.push(this.canvas.noteFrame);
      if (this.canvas.recordedFrames.length > 240) this.canvas.recordedFrames.shift();
      this.canvas.noteFrame = { texts: [], started: performance.now() };
      this.canvas.frameTimes ??= [];
      this.canvas.frameTimes.push(performance.now());
      if (this.canvas.frameTimes.length > 240) this.canvas.frameTimes.shift();
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
      this.canvas.noteFrame?.texts.push({ value, x, y, font: this.font });
      return text.call(this, value, x, y, ...rest);
    };
  };
  await app.context().addInitScript(traceCanvas);
  await page.reload();
  await page.waitForSelector('.library-main');
  await page.evaluate(async score => {
    const b = await window.dha.call('bootstrap');
    await window.dha.call('settings', { ...b.library.settings, leadTime: 3 });
    await window.dha.call('score.save', score);
  }, score);
  await page.reload();
  await page.locator('.score-row .row-play').click();
  await page.waitForSelector('.performance-canvas canvas');
  await page.evaluate(() => window.dha.call('transport', { action: 'pause' }));
  const overlay = app.windows().find(window => window !== page) ?? await app.waitForEvent('window', { timeout: 10000 });
  assert.ok(overlay);
  await overlay.waitForSelector('canvas');
  const seek = async (position, leadTime = 3) => {
    await page.evaluate(async ({ position, leadTime }) => {
      const b = await window.dha.call('bootstrap');
      await window.dha.call('settings', { ...b.library.settings, leadTime });
      await window.dha.call('transport', { action: 'seek', value: position });
      await window.dha.call('transport', { action: 'pause' });
    }, { position, leadTime });
    for (const view of [page, overlay]) await view.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  };
  const labels = async view => view.locator('canvas').evaluate(canvas => {
    const line = canvas.clientHeight - 80;
    return canvas.noteFrame.texts.filter(text => text.y >= 14 && text.y < line && !text.value.includes('BPM') && !text.value.includes('TEST') && !text.value.includes('测试') && !text.value.includes('暂停') && !text.value.includes('持续'));
  });
  await seek(0);
  for (const [name, view] of [['performance', page], ['overlay', overlay]]) {
    await view.screenshot({ path: path.join(output, `${before ? 'before' : 'after'}-${name}.png`), omitBackground: name === 'overlay' });
    const drawn = await labels(view);
    report.push({ name, drawn });
    if (!before) {
      for (const key of ['Z', 'V', ',', 'C']) assert.ok(drawn.some(text => text.value === key), `${name}: missing keyboard ${key}`);
      for (const mouse of ['L', 'M', 'R']) assert.ok(drawn.some(text => text.value === mouse), `${name}: missing mouse ${mouse}`);
      for (const marker of drawn.filter(text => ['L', 'M', 'R'].includes(text.value))) assert.ok(drawn.some(key => ['Z', 'C', 'V'].includes(key.value) && Math.abs(key.y - marker.y) < 1 && key.x < marker.x), `${name}: mouse must be beside a keyboard key`);
    }
  }
  if (!before) {
    for (const [name, position, key, marker] of [['long-normal', 3.7, 'C', null], ['long-special', 5.5, 'V', 'R'], ['tiny', 6.205, 'C', 'M']]) {
      await seek(position, .5);
      for (const view of [page, overlay]) {
        const drawn = await labels(view);
        assert.ok(drawn.some(text => text.value === key), `${name}: keyboard absent during hold`);
        if (marker) assert.ok(drawn.some(text => text.value === marker), `${name}: mouse absent during hold`);
        if (!marker) assert.ok(drawn.every(text => !['L', 'M', 'R'].includes(text.value)), 'Ordinary hold must not show a mouse marker');
      }
      await page.screenshot({ path: path.join(output, `after-${name}.png`) });
    }
    await seek(6.35, .5);
    const rapid = await labels(page);
    assert.equal(rapid.filter(text => text.value === 'Z').length, 6, 'Every rapid note keeps its own key');
    assert.equal(rapid.filter(text => text.value === 'L').length, 3, 'Only special rapid notes receive mouse markers');
    const rapidKeys = rapid.filter(text => text.value === 'Z').map(text => text.y).sort((a, b) => a - b);
    rapidKeys.slice(1).forEach((y, i) => assert.ok(y - rapidKeys[i] >= 26, 'Rapid note labels must not overlap at field entry'));
    await page.screenshot({ path: path.join(output, 'after-rapid.png') });
    await seek(4.55, 2);
    await page.evaluate(() => window.dha.call('transport', { action: 'resume' }));
    await page.waitForTimeout(1200);
    const timing = await page.locator('canvas').evaluate(canvas => {
      const times = canvas.frameTimes.slice(-50);
      const gaps = times.slice(1).map((time, i) => time - times[i]);
      const frames = canvas.recordedFrames.slice(-50);
      return { frames: times.length, averageIntervalMs: gaps.reduce((a, b) => a + b, 0) / gaps.length, maxIntervalMs: Math.max(...gaps), heldLabelsStable: frames.every(frame => ['V', 'R'].every(value => frame.texts.some(text => text.value === value && text.y < canvas.clientHeight - 80))) };
    });
    assert.equal(timing.heldLabelsStable, true, 'Keyboard and mouse must remain present on every sampled held frame');
    report.push({ animation: timing });
    await page.evaluate(() => window.dha.call('transport', { action: 'pause' }));
    await seek(6.13, .5);
    assert.ok((await labels(page)).every(text => text.value !== 'R'), 'Finished notes must release their labels');
    await seek(5.5, .5);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle().includes('Overlay')).setBounds({ x: 0, y: 0, width: 480, height: 280 }));
    await overlay.waitForFunction(() => innerWidth === 480);
    await overlay.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await overlay.screenshot({ path: path.join(output, 'after-overlay-minimum.png'), omitBackground: true });
    const narrow = await labels(overlay);
    assert.ok(narrow.some(text => text.value === 'V') && narrow.some(text => text.value === 'R'));
    const stored = (await page.evaluate(() => window.dha.call('bootstrap'))).library.scores.find(value => value.id === score.id);
    assert.deepEqual(stored.notes, notes, 'Rendering must never mutate stored notes');
  }
  await writeFile(path.join(output, `${before ? 'before' : 'after'}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, before, report, isolatedData: data }, null, 2));
} finally { await app.close(); }
