/** Read WebP canvas dimensions without decoding the image or allocating its pixels. */
export function webpDimensions(bytes:Uint8Array):{width:number;height:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(at:number,count:number)=>String.fromCharCode(...bytes.slice(at,at+count));
  if(bytes.length<20||text(0,4)!=='RIFF'||text(8,4)!=='WEBP')throw new Error('WebP 图片格式无效。');
  let at=12;
  while(at+8<=bytes.length){
    const kind=text(at,4),length=view.getUint32(at+4,true),start=at+8;
    if(start+length>bytes.length)throw new Error('WebP 图片文件不完整。');
    if(kind==='VP8X'&&length>=10){const u24=(i:number)=>bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16;return {width:u24(start+4)+1,height:u24(start+7)+1};}
    if(kind==='VP8L'&&length>=5&&bytes[start]===0x2f){const packed=view.getUint32(start+1,true);return {width:(packed&0x3fff)+1,height:(packed>>>14&0x3fff)+1};}
    if(kind==='VP8 '&&length>=10&&bytes[start+3]===0x9d&&bytes[start+4]===1&&bytes[start+5]===0x2a)return {width:view.getUint16(start+6,true)&0x3fff,height:view.getUint16(start+8,true)&0x3fff};
    at=start+length+(length%2);
  }
  throw new Error('WebP 图片没有有效的尺寸信息。');
}
