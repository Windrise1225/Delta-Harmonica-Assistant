import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('artifacts/overlay-controls');
await mkdir(output,{recursive:true});
const data=await mkdtemp(path.join(output,'test-data-'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
const env={...process.env,DHA_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;delete env.DHA_DEV_URL;
const app=await electron.launch({executablePath:path.resolve(pkg.build.directories.output,'win-unpacked','Delta Harmonica Assistant.exe'),args:[],cwd:process.cwd(),env,timeout:45000});
try{
  const page=await app.firstWindow();await page.waitForSelector('.library-main');
  // Observe the real native registration and retain its handler in this test
  // process only, allowing deterministic testing without sending keys to a game.
  await app.evaluate(({globalShortcut})=>{
    const original=globalShortcut.register.bind(globalShortcut);
    globalThis.testOriginalRegister=original;
    globalShortcut.register=(accelerator,handler)=>{globalThis.testOverlayCloseHandler=handler;return original(accelerator,handler);};
  });
  const boot=()=>page.evaluate(()=>window.dha.call('bootstrap'));
  await page.getByRole('button',{name:'演奏空间',exact:true}).click();
  assert.equal((await boot()).overlay.open,false);
  const open=async()=>{
    const appeared=app.waitForEvent('window',{timeout:10000});
    await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).click();
    const overlay=await appeared;await overlay.waitForSelector('canvas');
    await page.getByRole('button',{name:'关闭覆盖窗口',exact:true}).waitFor();
    assert.equal((await boot()).overlay.open,true);
    return overlay;
  };
  let overlay=await open();
  await page.getByRole('button',{name:'开始动画测试',exact:true}).click();
  await page.evaluate(async()=>{await window.dha.call('transport',{action:'seek',value:2.8});await window.dha.call('transport',{action:'pause'});});
  await overlay.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(output,'performance-controls.png')});
  await overlay.screenshot({path:path.join(output,'pearl-labels.png'),omitBackground:true});
  const transport=(await boot()).transport;
  const resume=()=>page.evaluate(()=>window.dha.call('transport',{action:'resume'}));
  const assertPaused=async()=>{
    const after=(await boot()).transport;
    assert.equal(after.state,'paused');assert.equal(after.score.id,transport.score.id);assert.ok(after.position>=transport.position);
    await page.waitForTimeout(100);assert.equal((await boot()).transport.position,after.position);
  };
  const nativeRegistered=await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Shift+F10'));
  assert.equal(!!(await boot()).overlay.closeShortcut,nativeRegistered);
  await resume();
  await page.getByRole('button',{name:'关闭覆盖窗口',exact:true}).click();
  await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).waitFor();
  await assertPaused();
  assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Control+Shift+F10')),false);
  overlay=await open();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getTitle().includes('Overlay')).minimize());
  await resume();
  await app.evaluate(()=>globalThis.testOverlayCloseHandler());
  await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).waitFor();
  assert.equal((await boot()).overlay.open,false);
  await assertPaused();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());
  overlay=await open();
  await page.evaluate(async()=>{const b=await window.dha.call('bootstrap');await window.dha.call('settings',{...b.library.settings,clickThrough:false,locked:true});});
  await overlay.getByRole('button',{name:'关闭覆盖窗口',exact:true}).waitFor();
  await overlay.screenshot({path:path.join(output,'overlay-close-button.png'),omitBackground:true});
  await resume();
  await overlay.getByRole('button',{name:'关闭覆盖窗口',exact:true}).click();
  await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).waitFor();
  assert.equal((await boot()).overlay.open,false);
  await assertPaused();
  // A shortcut claimed by another app must leave a fully usable close button.
  await app.evaluate(({globalShortcut})=>{globalShortcut.register=()=>false;});
  await open();
  assert.equal((await boot()).overlay.closeShortcut,null);
  assert.ok(await page.getByText('快捷键不可用，请使用关闭按钮',{exact:true}).isVisible());
  await resume();
  await page.getByRole('button',{name:'关闭覆盖窗口',exact:true}).click();
  await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).waitFor();
  await page.getByRole('button',{name:'偏好设置',exact:true}).click();
  await page.getByRole('button',{name:'覆盖窗口',exact:true}).click();
  await open();
  await resume();
  await page.getByRole('button',{name:'关闭覆盖窗口',exact:true}).click();
  await page.getByRole('button',{name:'打开覆盖窗口',exact:true}).waitFor();
  await assertPaused();
  console.log(JSON.stringify({ok:true,nativeShortcutRegistered:nativeRegistered,closeModes:['performance toggle','registered shortcut handler while minimized','overlay close while locked','settings toggle','shortcut conflict fallback'],closePausesAndFreezes:true,isolatedData:data},null,2));
}finally{await app.close();}
