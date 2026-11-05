import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();await mkdir('artifacts',{recursive:true});const data=await mkdtemp(path.join(root,'artifacts','lavender-ui-'));
const {defaults}=await import('../.cache/ui-test-core.mjs');
const fixture=JSON.parse(await readFile('fixtures/TEST_eight_lanes.dhscore','utf8'));
const scores=['TEST · 晶莹回响','TEST · 流动的留白','TEST · 雨后薰衣草'].map((name,i)=>({...fixture,id:`00000000-0000-4000-8000-00000000001${i}`,name,createdAt:`2026-11-0${i+1}T12:00:00.000Z`,lastUsed:`2026-11-0${i+1}T13:00:00.000Z`}));
// A legacy library without cover metadata verifies additive migration without changing notes.
await writeFile(path.join(data,'library.json'),JSON.stringify({settings:defaults,scores}));
const env={...process.env,DHA_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;delete env.DHA_DEV_URL;
const packaged=process.argv.includes('--packaged');const pkg=JSON.parse(await readFile('package.json','utf8'));
const launch=async(scale=1)=>electron.launch({...(packaged?{executablePath:path.resolve(pkg.build.directories.output,'win-unpacked','Delta Harmonica Assistant.exe'),args:[`--force-device-scale-factor=${scale}`]}:{args:['.',`--force-device-scale-factor=${scale}`]}),cwd:root,env,timeout:30000});
let instance=await launch();let expected;
try{
  const page=await instance.firstWindow();await page.waitForSelector('.recent-card');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.cover-image')).every(i=>i.complete&&i.naturalWidth>0));
  let boot=await page.evaluate(()=>window.dha.call('bootstrap'));assert.deepEqual(boot.library.scores,scores);assert.equal(Object.keys(boot.library.covers).length,3);assert.equal(new Set(Object.values(boot.library.covers).map(c=>c.seed)).size,3);
  await page.screenshot({path:'artifacts/lavender-library.png'});
  await page.getByRole('textbox',{name:'搜索曲谱',exact:true}).fill('留白');assert.equal(await page.locator('.score-row').count(),1);await page.getByRole('textbox',{name:'搜索曲谱',exact:true}).fill('');
  const score=scores[0],original=boot.library.covers[score.id];
  const openEditor=async()=>{await page.locator('.score-row').filter({hasText:score.name}).getByRole('button',{name:`More ${score.name}`,exact:true}).click();await page.getByRole('menuitem',{name:'更换封面',exact:true}).click();await page.getByRole('dialog',{name:'编辑艺术封面'}).waitFor();};
  await openEditor();await page.screenshot({path:'artifacts/cover-editor.png'});
  const wideImage=path.join(data,'TEST_crop_source.png');
  const widePng=await instance.evaluate(({nativeImage})=>{const width=800,height=400,bitmap=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;bitmap[i]=200+x/16;bitmap[i+1]=160+y/8;bitmap[i+2]=210-x/16;bitmap[i+3]=255;}return nativeImage.createFromBitmap(bitmap,{width,height}).toDataURL().split(',')[1];});await writeFile(wideImage,Buffer.from(widePng,'base64'));
  const formats=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=300;canvas.height=200;const c=canvas.getContext('2d');const gradient=c.createLinearGradient(0,0,300,200);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(1,'#C8A7EA');c.fillStyle=gradient;c.fillRect(0,0,300,200);return {jpg:canvas.toDataURL('image/jpeg').split(',')[1],webp:canvas.toDataURL('image/webp').split(',')[1]};});
  for(const [extension,bytes] of Object.entries(formats)){const file=path.join(data,`TEST_image.${extension}`);await writeFile(file,Buffer.from(bytes,'base64'));await instance.evaluate(({dialog},name)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[name]});},file);const preview=await page.evaluate(()=>window.dha.call('cover.pick'));assert.ok(preview);assert.equal(await page.evaluate(source=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.width===300&&image.height===200);image.onerror=()=>resolve(false);image.src=source;}),preview),true);}
  await instance.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},wideImage);
  await page.getByRole('button',{name:'上传自定义封面',exact:false}).click();await page.getByLabel('Square crop preview').waitFor();
  await page.getByLabel('Crop zoom',{exact:true}).press('End');await page.getByLabel('Crop horizontal position',{exact:true}).press('End');await page.getByLabel('Crop vertical position',{exact:true}).press('Home');
  await page.screenshot({path:'artifacts/cover-crop.png'});await page.getByRole('button',{name:'保存封面',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  boot=await page.evaluate(()=>window.dha.call('bootstrap'));const custom=boot.library.covers[score.id];assert.equal(custom.kind,'custom');assert.equal(custom.seed,original.seed);
  await page.waitForFunction(id=>Array.from(document.querySelectorAll('.cover-image')).some(i=>i.src.includes(id)&&i.complete&&i.naturalWidth===512),custom.file);
  const image=await readFile(path.join(data,'covers',custom.file));assert.ok(image.length>0);
  // Backups include actual custom image bytes, never temporary source paths.
  const backup=path.join(data,'artwork-backup.json');await instance.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},backup);await page.evaluate(()=>window.dha.call('backup'));const backupJson=JSON.parse(await readFile(backup,'utf8'));assert.equal(Buffer.from(backupJson.images[custom.file],'base64').length,image.length);
  await openEditor();await page.getByRole('button',{name:'恢复自动封面',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.deepEqual((await page.evaluate(()=>window.dha.call('bootstrap'))).library.covers[score.id],original);
  await page.locator('.score-row').filter({hasText:score.name}).getByRole('button',{name:`More ${score.name}`,exact:true}).click();await page.getByRole('menuitem',{name:'重新生成封面',exact:true}).click();
  await page.waitForFunction(async({id,seed})=>(await window.dha.call('bootstrap')).library.covers[id].seed!==seed,{id:score.id,seed:original.seed});
  await instance.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},backup);await page.evaluate(()=>window.dha.call('restore'));await page.reload();await page.waitForSelector('.recent-card');expected=(await page.evaluate(()=>window.dha.call('bootstrap'))).library.covers;assert.equal(expected[score.id].kind,'custom');
  for(const [width,height] of [[1040,720],[1440,960],[1920,1080]]){
    await instance.evaluate(({BrowserWindow},{width,height})=>{BrowserWindow.getAllWindows()[0].setBounds({x:0,y:0,width,height});},{width,height});
    await page.waitForFunction(width=>window.innerWidth===width,width);const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth>innerWidth,content:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth}));assert.deepEqual(overflow,{body:false,content:false});await page.screenshot({path:`artifacts/layout-${width}.png`});
  }
  await page.getByRole('button',{name:'偏好设置',exact:true}).click();await page.getByRole('button',{name:'覆盖窗口',exact:true}).click();await page.screenshot({path:'artifacts/lavender-overlay-settings.png'});
  console.log('Artwork UI: crop, upload, regenerate, restore, backup and responsive layouts passed.');
}finally{await instance.close();}
for(const scale of [1.5,2]){
  console.log(`Checking packaged artwork after restart at DPI ${scale}`);
  instance=await launch(scale);instance.process().once('exit',(code,signal)=>console.log(`DPI ${scale} process exit: ${code}, ${signal}`));try{const page=await instance.firstWindow();page.once('crash',()=>console.error(`DPI ${scale} renderer crashed`));page.on('pageerror',error=>console.error(`DPI ${scale} page error: ${error.message}`));await page.waitForSelector('.recent-card');const boot=await page.evaluate(()=>window.dha.call('bootstrap'));assert.deepEqual(boot.library.covers,expected);assert.deepEqual(boot.library.scores,scores);assert.equal(await page.evaluate(()=>window.devicePixelRatio),scale);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(`DPI ${scale} image visibility:`,JSON.stringify(await page.locator('.cover-image').evaluateAll(images=>images.map(image=>({sourceAssigned:!!image.getAttribute('src'),loaded:image.complete&&image.naturalWidth>0,top:Math.round(image.getBoundingClientRect().top)})))));for(const image of await page.locator('.cover-image').all()){await image.scrollIntoViewIfNeeded();await page.waitForFunction(image=>image.complete&&image.naturalWidth>0,await image.elementHandle(),{timeout:10000});}await page.locator('main').evaluate(main=>{main.scrollTop=0;});await page.screenshot({path:`artifacts/dpi-${scale}.png`});}finally{await instance.close();}
}
console.log(JSON.stringify({ok:true,packaged,artworkStableAfterRestart:true,dpiScales:[1,1.5,2],isolatedData:data},null,2));
