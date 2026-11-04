import { describe,it,expect } from 'vitest';
import { liquidCoverSvg,coverSource,cropRect } from '../src/core/artwork';
import { librarySchema,defaults,coverSchema } from '../src/core/schema';
import { Store } from '../electron/storage';
import { testScore } from '../src/core/demo';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { webpDimensions } from '../src/core/images';
describe('local procedural liquid flow art',()=>{
  it('is exactly deterministic for a saved seed and varies between seeds',()=>{const a=liquidCoverSvg('1234567890abcdef1234567890abcdef');expect(a).toBe(liquidCoverSvg('1234567890abcdef1234567890abcdef'));expect(a).not.toBe(liquidCoverSvg('fedcba0987654321fedcba0987654321'));expect(new Set(Array.from({length:50},(_,i)=>liquidCoverSvg(i.toString(16).padStart(32,'0')))).size).toBe(50);});
  it('uses square, text-free SVG paths without network assets or scripts',()=>{const svg=liquidCoverSvg('1234567890abcdef1234567890abcdef');expect(svg).toContain('viewBox="0 0 512 512"');expect(svg).toContain('<path');expect(svg).toContain('linearGradient');expect(svg).toContain('feDropShadow');expect(svg).not.toMatch(/<(?:script|text|image)|href=|onload=|https:\/\//);expect(svg.length).toBeLessThan(18000);});
  it('keeps the custom image protocol constrained to local PNG identities',()=>{expect(coverSchema.safeParse({kind:'custom',version:1,seed:'a'.repeat(32),file:'../../private.png'}).success).toBe(false);expect(coverSource({kind:'custom',version:1,seed:'a'.repeat(32),file:'b'.repeat(64)+'.png'})).toBe('dha-cover://image/'+'b'.repeat(64)+'.png');});
});
describe('square image cropping',()=>{
  it('centers a wide image without stretching it',()=>expect(cropRect(1200,600,1,.5,.5)).toEqual({x:300,y:0,size:600}));
  it('preserves square aspect and keeps pan/zoom inside image bounds',()=>{for(const zoom of [.5,1,2,4,8])for(const x of [-1,0,.5,1,2]){const crop=cropRect(400,1000,zoom,x,x);expect(crop.size).toBeGreaterThan(0);expect(crop.x).toBeGreaterThanOrEqual(0);expect(crop.y).toBeGreaterThanOrEqual(0);expect(crop.x+crop.size).toBeLessThanOrEqual(400);expect(crop.y+crop.size).toBeLessThanOrEqual(1000);}});
});
describe('local WebP compatibility',()=>{
  const header=(kind:string,size:number)=>{const bytes=Buffer.alloc(20+size);bytes.write('RIFF');bytes.writeUInt32LE(12+size,4);bytes.write('WEBP',8);bytes.write(kind,12);bytes.writeUInt32LE(size,16);return bytes;};
  it('reads extended and lossless WebP dimensions before decoding',()=>{const extended=header('VP8X',10);extended.writeUIntLE(799,24,3);extended.writeUIntLE(399,27,3);expect(webpDimensions(extended)).toEqual({width:800,height:400});const lossless=header('VP8L',5);lossless[20]=0x2f;lossless.writeUInt32LE(799|(399<<14),21);expect(webpDimensions(lossless)).toEqual({width:800,height:400});});
  it('reads lossy WebP and rejects truncated or invalid data',()=>{const lossy=header('VP8 ',10);lossy[23]=0x9d;lossy[24]=1;lossy[25]=0x2a;lossy.writeUInt16LE(800,26);lossy.writeUInt16LE(400,28);expect(webpDimensions(lossy)).toEqual({width:800,height:400});expect(()=>webpDimensions(lossy.subarray(0,25))).toThrow();expect(()=>webpDimensions(new Uint8Array(32))).toThrow();});
});
describe('artwork data compatibility',()=>{
  it('accepts legacy libraries without changing their score data',()=>{const score=testScore();const library=librarySchema.parse({settings:defaults,scores:[score]});expect(library.covers).toEqual({});expect(library.scores[0]).toEqual(score);});
  it('saves generated seeds and custom file identities across reloads',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'dha-artwork-test-'));try{const score=testScore(),store=new Store(directory),cover={kind:'generated' as const,version:1 as const,seed:'a'.repeat(32)};await store.save({settings:defaults,scores:[score],covers:{[score.id]:cover}});const first=await store.init();expect(first.covers[score.id]).toEqual(cover);expect(liquidCoverSvg(first.covers[score.id].seed)).toBe(liquidCoverSvg(cover.seed));const custom={kind:'custom' as const,version:1 as const,seed:cover.seed,file:'b'.repeat(64)+'.png'};await store.save({...first,covers:{[score.id]:custom}});expect((await store.init()).covers[score.id]).toEqual(custom);}finally{await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}});
});
