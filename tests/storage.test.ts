import { it,expect } from 'vitest';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../electron/storage';
import { defaults } from '../src/core/schema';
import { testScore } from '../src/core/demo';
it('serializes atomic writes and reloads settings and scores',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'dha-store-test-'));try{const store=new Store(directory);expect((await store.init()).scores).toEqual([]);await Promise.all([store.save({settings:defaults,scores:[]}),store.save({settings:{...defaults,language:'en'},scores:[testScore()]})]);await store.flush();const loaded=await store.init();expect(loaded.settings.language).toBe('en');expect(loaded.scores).toHaveLength(1);expect(JSON.parse(await readFile(path.join(directory,'library.json'),'utf8')).scores).toHaveLength(1);}finally{await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}});
it('preserves corrupt storage instead of silently overwriting',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'dha-corrupt-test-'));try{const file=path.join(directory,'library.json');await writeFile(file,'broken');await expect(new Store(directory).init()).rejects.toThrow('损坏');expect(await readFile(file,'utf8')).toBe('broken');}finally{await rm(directory,{recursive:true,force:true});}});
