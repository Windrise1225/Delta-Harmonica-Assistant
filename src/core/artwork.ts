export type GeneratedCover={kind:'generated';seed:string;version:1};
export type CustomCover={kind:'custom';seed:string;version:1;file:string};
export type Cover=GeneratedCover|CustomCover;
function random(seed:string){let value=2166136261;for(const c of seed)value=Math.imul(value^c.charCodeAt(0),16777619);return()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return((n^n>>>14)>>>0)/4294967296;};}
const round=(n:number)=>Math.round(n*100)/100;
/** Pure, versioned, deterministic artwork. No song data, network or raster assets. */
export function liquidCoverSvg(seed:string):string{
  const rng=random(seed),rotation=round(rng()*140-70),mode=Math.floor(rng()*4),count=2+Math.floor(rng()*2);
  const hue=274+rng()*18,light=65+rng()*12;
  const paths=[
    'M 45 148 C 80 4 444 4 450 150 C 456 284 72 238 88 370 C 100 482 388 486 466 338',
    'M 338 35 C 96 24 36 214 170 276 C 360 364 470 154 342 132 C 220 110 156 364 340 478',
    'M 74 420 C 168 468 390 398 386 228 C 382 70 94 48 108 200 C 124 370 458 338 440 94',
    'M 20 304 C 100 444 452 438 442 238 C 434 82 188 64 174 208 C 160 346 316 456 502 368'
  ];
  let ribbons='';
  for(let i=0;i<count;i++){
    const dx=round((rng()-.5)*65),dy=round((rng()-.5)*85),angle=round((rng()-.5)*24),width=round(36+rng()*43);
    const opacity=round(.52+rng()*.34),path=paths[(mode+i)%paths.length];
    ribbons+=`<g transform="translate(${dx} ${dy}) rotate(${angle} 256 256)" opacity="${opacity}"><path d="${path}" fill="none" stroke="url(#depth${i})" stroke-width="${width+4}" stroke-linecap="round"/><path d="${path}" fill="none" stroke="url(#ribbon${i})" stroke-width="${width}" stroke-linecap="round"/><path d="${path}" transform="translate(-${round(width*.18)} -${round(width*.2)})" fill="none" stroke="url(#edge)" stroke-width="2.4" stroke-linecap="round"/><path d="${path}" fill="none" stroke="url(#shine)" stroke-width="${round(width*.23)}" stroke-linecap="round"/></g>`;
  }
  const gradients=Array.from({length:count},(_,i)=>`<linearGradient id="ribbon${i}" x1="${i%2?'0':'1'}" y1="0" x2="${i%2?'1':'0'}" y2="1"><stop stop-color="white" stop-opacity=".95"/><stop offset=".16" stop-color="hsl(${round(hue)},45%,${round(light)}%)" stop-opacity=".46"/><stop offset=".36" stop-color="#fbf6ff" stop-opacity=".9"/><stop offset=".51" stop-color="#9561b9" stop-opacity=".55"/><stop offset=".66" stop-color="#e9d4f5" stop-opacity=".2"/><stop offset=".85" stop-color="white" stop-opacity=".96"/><stop offset="1" stop-color="#ac7acb" stop-opacity=".68"/></linearGradient><linearGradient id="depth${i}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#baa0cd" stop-opacity=".06"/><stop offset=".46" stop-color="#ab8ac1" stop-opacity=".25"/><stop offset=".76" stop-color="white" stop-opacity=".8"/><stop offset="1" stop-color="#b18acb" stop-opacity=".13"/></linearGradient>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>${gradients}<radialGradient id="pearl" cx=".25" cy=".12" r="1.1"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#f6f0f9"/><stop offset="1" stop-color="#e9ddf2"/></radialGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".28" stop-color="white"/><stop offset=".68" stop-color="#fefbff" stop-opacity=".05"/><stop offset="1" stop-color="white"/></linearGradient><linearGradient id="shine" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="white" stop-opacity=".8"/><stop offset=".22" stop-color="white" stop-opacity="0"/><stop offset=".65" stop-color="white" stop-opacity=".1"/><stop offset=".85" stop-color="white" stop-opacity=".55"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><filter id="shadow" x="-.3" y="-.3" width="1.6" height="1.6"><feDropShadow dx="0" dy="13" stdDeviation="10" flood-color="#8e6aa6" flood-opacity=".16"/></filter></defs><rect width="512" height="512" fill="url(#pearl)"/><g transform="rotate(${rotation} 256 256) translate(${round((rng()-.5)*35)} ${round((rng()-.5)*25)})" filter="url(#shadow)">${ribbons}</g><rect x="1" y="1" width="510" height="510" rx="1" fill="none" stroke="white" stroke-opacity=".75"/></svg>`;
}
export function coverSource(cover:Cover){return cover.kind==='custom'?`dha-cover://image/${cover.file}`:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(liquidCoverSvg(cover.seed))}`;}
export function cropRect(width:number,height:number,zoom:number,x:number,y:number){
  const size=Math.min(width,height)/Math.max(1,Math.min(4,zoom));
  return {x:Math.max(0,Math.min(1,x))*(width-size),y:Math.max(0,Math.min(1,y))*(height-size),size};
}
