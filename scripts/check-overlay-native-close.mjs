// Interactive Windows verification: click the real X with native mouse input.
// No CDP click is used for the overlay. Each stage waits for a physical click.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('artifacts/overlay-native-close');
await mkdir(output,{recursive:true});
const data=await mkdtemp(path.join(output,'test-data-'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
const env={...process.env,DHA_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;delete env.DHA_DEV_URL;
const app=await electron.launch({executablePath:path.resolve(pkg.build.directories.output,'win-unpacked','Delta Harmonica Assistant.exe'),args:[],cwd:process.cwd(),env,timeout:45000});
const results=[];
try{
  const page=await app.firstWindow();await page.waitForSelector('.library-main');
  const score={version:1,id:'00000000-0000-4000-8000-000000000098',name:'TEST · 原生关闭按钮',createdAt:'2026-11-05T00:00:00.000Z',duration:180,sourceDuration:180,segment:[0,180],bpm:120,test:true,notes:[{key:'Z',mouse:'right',start:0,duration:180}]};
  await page.evaluate(score=>window.dha.call('score.save',score),score);
  await page.getByRole('button',{name:'演奏空间',exact:true}).click();
  for(const locked of [false,true]){
    await page.evaluate(async locked=>{const b=await window.dha.call('bootstrap');await window.dha.call('settings',{...b.library.settings,clickThrough:false,locked,overlayBounds:{x:120,y:100,width:640,height:360}});},locked);
    const appeared=app.waitForEvent('window',{timeout:10000});
    await page.evaluate(id=>window.dha.call('play',id),score.id);
    const overlay=await appeared;await overlay.waitForSelector('.overlay-close-button');
    await page.waitForFunction(async()=>(await window.dha.call('bootstrap')).transport.state==='playing');
    await overlay.evaluate(locked=>{document.title=`Delta Harmonica · Overlay · Native ${locked?'locked':'unlocked'}`;},locked);
    const native=await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(win=>win.getTitle().includes('Overlay'));return {focusable:win.isFocusable()};});
    assert.equal(native.focusable,true);
    const regions=await overlay.evaluate(()=>{const button=document.querySelector('.overlay-close-button').getBoundingClientRect();const drag=document.querySelector('.drag-surface')?.getBoundingClientRect();return {overlap:!!drag&&drag.right>button.left&&drag.bottom>button.top};});
    assert.equal(regions.overlap,false,'Native drag region must exclude the X');
    await overlay.screenshot({path:path.join(output,`${locked?'locked':'unlocked'}-before-click.png`),omitBackground:true});
    const before=(await page.evaluate(()=>window.dha.call('bootstrap'))).transport.position;
    console.log(`READY: native mouse click on ${locked?'locked':'unlocked'} overlay X`);
    await overlay.waitForEvent('close',{timeout:180000});
    const after=await page.evaluate(()=>window.dha.call('bootstrap'));
    assert.equal(after.overlay.open,false);assert.equal(after.transport.state,'paused');
    assert.ok(after.transport.position>=before);assert.ok(after.transport.position>0);
    await page.waitForTimeout(250);
    assert.equal((await page.evaluate(()=>window.dha.call('bootstrap'))).transport.position,after.transport.position,'Position must freeze after the X is clicked');
    await page.screenshot({path:path.join(output,`${locked?'locked':'unlocked'}-paused.png`)});
    results.push({locked,native,closePaused:true,frozenPosition:after.transport.position});
    console.log(`PASS: ${locked?'locked':'unlocked'} overlay closed and paused`);
  }
  await writeFile(path.join(output,'report.json'),JSON.stringify({ok:true,results,isolatedData:data},null,2));
  console.log(JSON.stringify({ok:true,results},null,2));
}finally{await app.close();}
