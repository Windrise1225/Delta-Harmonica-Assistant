import { nativeImage } from 'electron';
import { createHash,randomBytes } from 'node:crypto';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import path from 'node:path';
import type { Cover } from '../src/core/artwork';
import type { Library } from '../src/core/schema';
import { webpDimensions } from '../src/core/images';
export const freshCover=():Cover=>({kind:'generated',version:1,seed:randomBytes(16).toString('hex')});
export function ensureCovers(library:Library){let changed=false;for(const score of library.scores){if(!library.covers[score.id]){library.covers[score.id]=freshCover();changed=true;}}return changed;}
const validFile=(file:string)=>/^[a-f0-9]{64}\.png$/.test(file);
export class CoverFiles{
  constructor(public directory:string){}
  async preview(file:string){
    if(!['.png','.jpg','.jpeg','.webp'].includes(path.extname(file).toLowerCase()))throw new Error('请选择 PNG、JPG / JPEG 或 WebP 封面。');
    if((await stat(file)).size>20*1024*1024)throw new Error('封面图片最多支持 20 MB。');
    const bytes=await readFile(file);
    if(path.extname(file).toLowerCase()==='.webp'){
      const {width,height}=webpDimensions(bytes);if(width<1||height<1||width*height>40000000)throw new Error('图片分辨率无效或超过 4000 万像素。');
      // Chromium decodes WebP locally; nativeImage's input decoder supports PNG/JPEG.
      return 'data:image/webp;base64,'+bytes.toString('base64');
    }
    let image=nativeImage.createFromBuffer(bytes);
    if(image.isEmpty())throw new Error('图片无法读取，请尝试其他 PNG、JPG 或 WebP 文件。');
    const {width,height}=image.getSize();if(width*height>40000000)throw new Error('图片分辨率过高，请缩小到 4000 万像素以内。');
    if(Math.max(width,height)>2048)image=image.resize(width>=height?{width:2048}:{height:2048});
    return image.toDataURL();
  }
  async saveCrop(data:string){
    if(!data.startsWith('data:image/png;base64,')||data.length>2*1024*1024)throw new Error('封面裁剪数据无效或过大。');
    const image=nativeImage.createFromBuffer(Buffer.from(data.split(',')[1],'base64'));
    const {width,height}=image.getSize();
    if(image.isEmpty()||width!==height||width<1||width>1024)throw new Error('封面需要裁剪成正方形。');
    const png=image.resize({width:512,height:512}).toPNG();
    const file=createHash('sha256').update(png).digest('hex')+'.png';
    await mkdir(this.directory,{recursive:true});await writeFile(path.join(this.directory,file),png);return file;
  }
  async read(file:string){if(!validFile(file))throw new Error('无效的封面文件。');return readFile(path.join(this.directory,file));}
  async backup(library:Library){
    const images:Record<string,string>={};let size=0;
    for(const cover of Object.values(library.covers))if(cover.kind==='custom'&&!images[cover.file]){
      const image=await this.read(cover.file);size+=image.length;
      if(size>128*1024*1024)throw new Error('自定义封面总量超过 128 MB，当前备份无法完成。请减少自定义封面后重试。');
      images[cover.file]=image.toString('base64');
    }
    return images;
  }
  async restore(library:Library,images:Record<string,string>){
    const validated=new Map<string,Buffer>();
    for(const cover of Object.values(library.covers))if(cover.kind==='custom'){
      const encoded=images[cover.file];
      if(!encoded||encoded.length>2*1024*1024)throw new Error('备份缺少自定义封面，或封面文件过大。');
      const bytes=Buffer.from(encoded,'base64');if(createHash('sha256').update(bytes).digest('hex')+'.png'!==cover.file)throw new Error('备份封面校验失败，原有数据未被替换。');
      const image=nativeImage.createFromBuffer(bytes),size=image.getSize();if(image.isEmpty()||size.width!==512||size.height!==512)throw new Error('备份中的封面图片无效。');validated.set(cover.file,bytes);
    }
    await mkdir(this.directory,{recursive:true});for(const [file,bytes] of validated)await writeFile(path.join(this.directory,file),bytes);
  }
}
