import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runPowerShell, sha256 } from './release-zip.mjs';
const require=createRequire(import.meta.url);
const unzipper=require('unzipper'),asar=require('@electron/asar');
const pkg=JSON.parse(await readFile('package.json','utf8'));
const output=path.resolve(pkg.build.directories.output);
const portable=path.join(output,`Delta-Harmonica-Assistant-${pkg.version}-win-x64.zip`);
const sourceZip=path.join(output,`Delta-Harmonica-Assistant-${pkg.version}-source.zip`);
const archive=await unzipper.Open.file(portable);
const entries=archive.files.filter(file=>file.type==='File');
const names=entries.map(file=>file.path.replaceAll('\\','/'));
const prefix='win-unpacked/';
for(const required of ['Delta Harmonica Assistant.exe','resources/app.asar','chrome_100_percent.pak','icudtl.dat','resources.pak','v8_context_snapshot.bin','locales/en-US.pak','locales/zh-CN.pak','VERSION.json','README.md','CHANGELOG.md','KNOWN_ISSUES.md','LICENSE'])assert.ok(names.includes(prefix+required),`Missing runtime resource: ${required}`);
// Electron's graphics DLL layout changes between majors. Check the actual
// checksum-verified distribution, rather than requiring DLL names from v40.
for(const file of await readdir('node_modules/electron/dist',{withFileTypes:true})){
  if(file.isFile()&&/\.(?:dll|pak|dat|bin|json)$/.test(file.name)){
    assert.ok(names.includes(prefix+file.name),`Missing official Electron resource: ${file.name}`);
    assert.equal(await sha256(path.join(output,'win-unpacked',file.name)),await sha256(path.join('node_modules/electron/dist',file.name)));
  }
}
for(const name of names){
  assert.ok(name.startsWith(prefix)&&!name.includes('..'),`Unsafe ZIP entry: ${name}`);
  assert.ok(!name.startsWith(prefix+'data/'),'Portable ZIP must not contain user data');
  assert.ok(!/\.(?:wav|mp3|flac|m4a|log|tmp|bak|map)$/i.test(name),`Unexpected release file: ${name}`);
  assert.ok(!/(?:^|\/)(?:\.git|\.cache|artifacts|tests|src)(?:\/|$)/.test(name),`Development material in ZIP: ${name}`);
}
assert.ok(names.some(name=>/app\.asar\.unpacked\/node_modules\/koffi\/.*win32_x64.*\.node$/.test(name)),'Missing Windows x64 koffi runtime');
const appAsar=path.join(output,'win-unpacked/resources/app.asar');
const packedFiles=asar.listPackage(appAsar).map(file=>file.replaceAll('\\','/'));
assert.ok(packedFiles.includes('/dist/index.html'));
assert.ok(packedFiles.includes('/dist-electron/main.cjs'));
assert.ok(packedFiles.every(file=>!file.endsWith('.map')),'Source maps must not be shipped');
assert.ok(packedFiles.filter(file=>file.startsWith('/node_modules/')).every(file=>file==='/node_modules/koffi'||file.startsWith('/node_modules/koffi/')),'Unexpected production dependency');
assert.equal(JSON.parse(asar.extractFile(appAsar,'package.json').toString()).version,pkg.version);
await mkdir('artifacts',{recursive:true});
const extracted=await mkdtemp(path.resolve('artifacts','发布解压验收-'));
const quote=value=>`'${path.resolve(value).replace(/'/g,"''")}'`;
await runPowerShell(`$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${quote(portable)} -DestinationPath ${quote(extracted)} -Force`);
for(const file of entries){
  const relative=file.path.replaceAll('\\','/');
  assert.equal(await sha256(path.join(extracted,relative)),await sha256(path.join(output,relative)),`ZIP round trip mismatch: ${relative}`);
}
const exe=path.join(extracted,'win-unpacked','Delta Harmonica Assistant.exe');
const binary=await readFile(exe);assert.equal(binary.readUInt16LE(binary.readUInt32LE(0x3c)+4),0x8664,'EXE must be Windows x64');
const env={...process.env,PATH:`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`,DHA_DEV_URL:'http://127.0.0.1:65534'};
for(const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH','DHA_DATA_DIR'])delete env[key];
const launch=()=>electron.launch({executablePath:exe,args:[],cwd:path.dirname(exe),env,timeout:45000});
let instance=await launch();let startup;
try{
  const page=await instance.firstWindow();await page.waitForSelector('.library-main');
  startup=await page.evaluate(()=>window.dha.call('bootstrap'));
  assert.equal(startup.version,pkg.version);assert.equal(startup.library.scores.length,0);
  assert.deepEqual(startup.library.settings.mapping,Array(8).fill(null));
  assert.deepEqual(startup.library.settings.offsets,{left:null,middle:null,right:null});
  assert.equal(path.resolve(startup.dataPath),path.join(path.dirname(exe),'data'));
  assert.equal(startup.gameDetectionAvailable,true,'Bundled native module must load');
  assert.ok(page.url().startsWith('file:'),'Packaged app must ignore DHA_DEV_URL');
  const blocked=await page.evaluate(async()=>{try{await fetch('https://example.com/release-connect-test');return false;}catch{return true;}});
  assert.equal(blocked,true,'Packaged renderer must block external connections');
  await page.screenshot({path:'artifacts/release-fresh-start.png'});
  await page.getByRole('button',{name:'演奏空间',exact:true}).click();
  const opened=instance.waitForEvent('window',{timeout:10000});
  await page.getByRole('button',{name:'开始动画测试',exact:true}).click();
  const overlay=await opened;await overlay.waitForSelector('canvas');
  await page.getByRole('button',{name:'关闭覆盖窗口',exact:true}).click();
  const paused=await page.evaluate(()=>window.dha.call('bootstrap'));
  assert.equal(paused.transport.state,'paused');assert.equal(paused.overlay.open,false);
  await page.evaluate(async()=>{const b=await window.dha.call('bootstrap');await window.dha.call('settings',{...b.library.settings,language:'en'});});
}finally{await instance.close();}
instance=await launch();
try{
  const page=await instance.firstWindow();await page.waitForSelector('.library-main');
  const reopened=await page.evaluate(()=>window.dha.call('bootstrap'));
  assert.equal(reopened.library.settings.language,'en');
  assert.deepEqual(reopened.library.settings.mapping,Array(8).fill(null));
}finally{await instance.close();}
const source=await unzipper.Open.file(sourceZip);
const manifest=JSON.parse(await readFile(path.join(output,'SOURCE_MANIFEST.json'),'utf8'));
const sourcePrefix=`Delta-Harmonica-Assistant-${pkg.version}-source/`;
const sourceFiles=source.files.filter(file=>file.type==='File');
assert.equal(sourceFiles.length,manifest.files.length);
const {createHash}=await import('node:crypto');
for(const entry of manifest.files){
  const file=sourceFiles.find(file=>file.path.replaceAll('\\','/')===sourcePrefix+entry.path);
  assert.ok(file,`Missing source: ${entry.path}`);
  assert.equal(createHash('sha256').update(await file.buffer()).digest('hex'),entry.sha256,`Source ZIP content mismatch: ${entry.path}`);
}
const report={version:pkg.version,ok:true,portableZip:path.relative(process.cwd(),portable),portableBytes:(await stat(portable)).size,runtimeFiles:entries.length,sourceFiles:sourceFiles.length,sourceZip:path.relative(process.cwd(),sourceZip),zipRoundTripHashesMatch:true,unpackedExeStarted:true,windowsX64:true,cleanPathWithoutNode:true,portableStorageAndRestart:true,defaultCalibrationBlank:true,externalConnectionsBlocked:true,packagedDevUrlIgnored:true,nativeModuleLoaded:true,overlayClosePauses:true,extractedExe:path.relative(process.cwd(),exe)};
await writeFile(path.join(output,'RELEASE-CHECKS.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
