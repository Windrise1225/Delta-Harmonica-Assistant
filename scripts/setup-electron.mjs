// Development-only repair for interrupted Electron downloads. Never runs in the product.
// Release bytes are verified against the checksum embedded in Electron's official npm package.
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {version}=require('electron/package.json');
const name=`electron-v${version}-win32-x64.zip`;
const expected=require('electron/checksums.json')[name];
if(!expected)throw new Error('No trusted checksum for this runtime.');
const url=process.argv.includes('--mirror')?`https://npmmirror.com/mirrors/electron/${version}/${name}`:`https://github.com/electron/electron/releases/download/v${version}/${name}`;
await mkdir('.cache/electron',{recursive:true});
const cache=path.resolve('.cache/electron',name);
let archive;
try{archive=await readFile(cache);if(createHash('sha256').update(archive).digest('hex')!==expected)archive=undefined;}catch{}
if(!archive){
  const probe=await fetch(url,{headers:{Range:'bytes=0-0'},signal:AbortSignal.timeout(30000)});
  const range=probe.headers.get('content-range');await probe.body.cancel();
  if(probe.status!==206||!range)throw new Error('Official server did not support a resumable download.');
  const total=Number(range.split('/')[1]);
  if(!Number.isSafeInteger(total)||total<1000000||total>300000000)throw new Error('Unexpected runtime archive size.');
  archive=Buffer.alloc(total);const size=4*1024*1024;let next=0,completed=0;
  async function download(){
    while(next<total){const start=next;next+=size;const end=Math.min(total-1,start+size-1);let error;
      for(let retry=0;retry<3;retry++){
        try{
          const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(45000)});
          if(response.status!==206)throw new Error(`HTTP ${response.status}`);
          const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==end-start+1)throw new Error('Incomplete chunk.');
          archive.set(bytes,start);completed+=bytes.length;console.log(`Electron runtime: ${(completed/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MB`);error=null;break;
        }catch(e){error=e;}
      }
      if(error)throw error;
    }
  }
  await Promise.all([download(),download(),download()]);
  if(createHash('sha256').update(archive).digest('hex')!==expected)throw new Error('Runtime checksum mismatch.');
  await writeFile(cache+'.part',archive);await rename(cache+'.part',cache);
}
const {extract}=require('@electron-internal/extract-zip');
await extract(cache,{dir:path.resolve('node_modules/electron/dist')});
await writeFile('node_modules/electron/path.txt','electron.exe');
console.log(`Verified Electron ${version} is ready inside this project.`);
