import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { defaults, librarySchema, type Library } from '../src/core/schema';
import type { z } from 'zod';
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public root: string) {}
  async init(): Promise<Library> {
    await mkdir(this.root, {recursive:true});
    try {
      const library=librarySchema.parse(JSON.parse(await readFile(path.join(this.root,'library.json'),'utf8')));
      const previous=['#b292ff','#9887ff','#7d91ff','#6ba9ff','#64caff','#62dddf','#7be3c4','#b5e7ab'];
      if(library.settings.theme.toLowerCase()==='#ad88ff'&&library.settings.laneColors.every((c,i)=>c.toLowerCase()===previous[i])){
        library.settings.theme=defaults.theme;library.settings.laneColors=[...defaults.laneColors];await this.save(library);
      }
      return library;
    }
    catch(e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        await this.log('存储文件无法读取，已保留原文件', e);
        // Never overwrite a damaged library silently.
        throw new Error('本地数据损坏或不可访问，请先备份 data/library.json 后修复或恢复备份。');
      }
      return {settings:structuredClone(defaults),scores:[],covers:{}};
    }
  }
  save(library: z.input<typeof librarySchema>) {
    const checked=librarySchema.parse(library);
    const operation=this.queue.catch(()=>{}).then(async()=>{
      const file=path.join(this.root,'library.json');
      const temporary=path.join(this.root,'library.json.tmp');
      await writeFile(temporary,JSON.stringify(checked,null,2),'utf8');
      await rename(temporary,file);
    });
    this.queue=operation; return operation;
  }
  async flush(){await this.queue;}
  async log(message:string,error?:unknown) {
    await appendFile(path.join(this.root,'app.log'),`${new Date().toISOString()} ${message} ${error instanceof Error?error.message:''}\n`).catch(()=>{});
  }
}
