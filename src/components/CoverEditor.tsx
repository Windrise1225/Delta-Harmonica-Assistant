import { useEffect,useRef,useState } from 'react';
import { ImagePlus,RotateCcw,RefreshCw,Check,X,Move,ZoomIn } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../bridge';
import { cropRect,type Cover } from '../core/artwork';
import type { Score } from '../core/schema';
import type { Translate } from './SettingsPanel';
import { CoverImage } from './CoverImage';
export function CoverEditor({score,cover,t,onClose,onSaved,onError}:{score:Score;cover?:Cover;t:Translate;onClose:()=>void;onSaved:(covers:Record<string,Cover>)=>void;onError:(message:string)=>void}){
  const [source,setSource]=useState(''),[image,setImage]=useState<HTMLImageElement|null>(null),[zoom,setZoom]=useState(1),[position,setPosition]=useState({x:.5,y:.5}),[busy,setBusy]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus();};},[busy]);
  useEffect(()=>{
    if(!source){setImage(null);return;}const img=new Image();setImage(null);
    img.onload=()=>{
      if(img.width*img.height>40000000){onError(t('图片分辨率过高，请缩小后重试。','This image is too large. Resize it and try again.'));setSource('');return;}
      if(Math.max(img.width,img.height)>2048){const preview=document.createElement('canvas'),ratio=2048/Math.max(img.width,img.height);preview.width=Math.round(img.width*ratio);preview.height=Math.round(img.height*ratio);preview.getContext('2d')!.drawImage(img,0,0,preview.width,preview.height);setSource(preview.toDataURL('image/png'));return;}
      setImage(img);
    };
    img.onerror=()=>{onError(t('封面图片无法解码，请选择其他图片。','The cover image could not be decoded. Choose another image.'));setSource('');};img.src=source;
    return()=>{img.onload=null;img.onerror=null;};
  },[source]);
  useEffect(()=>{if(!image||!canvas.current)return;const node=canvas.current;node.width=640;node.height=640;const ctx=node.getContext('2d')!;const crop=cropRect(image.width,image.height,zoom,position.x,position.y);ctx.clearRect(0,0,640,640);ctx.drawImage(image,crop.x,crop.y,crop.size,crop.size,0,0,640,640);ctx.strokeStyle='#ffffff80';ctx.lineWidth=1;for(const value of [640/3,640*2/3]){ctx.beginPath();ctx.moveTo(value,0);ctx.lineTo(value,640);ctx.stroke();ctx.beginPath();ctx.moveTo(0,value);ctx.lineTo(640,value);ctx.stroke();}},[image,zoom,position]);
  const pick=async()=>{setBusy(true);try{const result=await api.call<string|null>('cover.pick');if(result){setSource(result);setZoom(1);setPosition({x:.5,y:.5});}}catch(e){onError((e as Error).message);}finally{setBusy(false);}};
  const update=async(method:string,data?:string)=>{setBusy(true);try{onSaved(await api.call<Record<string,Cover>>(method,{id:score.id,data}));setSource('');onClose();}catch(e){onError((e as Error).message);}finally{setBusy(false);}};
  const saveCrop=()=>{if(!image)return;const output=document.createElement('canvas');output.width=512;output.height=512;const ctx=output.getContext('2d')!;const crop=cropRect(image.width,image.height,zoom,position.x,position.y);ctx.drawImage(image,crop.x,crop.y,crop.size,crop.size,0,0,512,512);void update('cover.custom',output.toDataURL('image/png'));};
  const drag=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    e.currentTarget.setPointerCapture(e.pointerId);const node=e.currentTarget,rect=node.getBoundingClientRect();
    // Keep screen coordinates separate from normalized crop coordinates.
    const initialX=e.clientX,initialY=e.clientY,initial={...position};
    const moveCrop=(event:PointerEvent)=>{if(!image)return;const size=Math.min(image.width,image.height)/zoom;setPosition({x:Math.max(0,Math.min(1,initial.x-(event.clientX-initialX)/rect.width*size/Math.max(1,image.width-size))),y:Math.max(0,Math.min(1,initial.y-(event.clientY-initialY)/rect.height*size/Math.max(1,image.height-size)))});};
    const end=()=>{node.removeEventListener('pointermove',moveCrop);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);};
    node.addEventListener('pointermove',moveCrop);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
  };
  return createPortal(<div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className="modal cover-editor glass-thick" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cover-editor-title"><div className="section-heading"><div><p className="eyebrow">YOUR OWN EXPRESSION</p><h2 id="cover-editor-title">{t('编辑艺术封面','Edit artwork')}</h2></div><button className="icon-button" aria-label="Close cover editor" disabled={busy} onClick={onClose}><X size={19}/></button></div><p className="cover-song-name">{score.name}</p><div className="cover-editor-preview">{source?<canvas ref={canvas} aria-label="Square crop preview" onPointerDown={drag}/>:<CoverImage cover={cover} id={score.id} eager/>}</div>
    {source?<><div className="crop-hint"><Move size={14}/>{t('拖动图片调整构图','Drag to compose your cover')}</div><label className="crop-zoom"><ZoomIn size={17}/><input aria-label="Crop zoom" type="range" min="1" max="4" step=".01" value={zoom} onChange={e=>setZoom(+e.target.value)}/><span>{zoom.toFixed(1)}×</span></label><div className="crop-position"><label>{t('水平位置','Horizontal')}<input aria-label="Crop horizontal position" type="range" min="0" max="1" step=".01" value={position.x} onChange={e=>setPosition({...position,x:+e.target.value})}/></label><label>{t('垂直位置','Vertical')}<input aria-label="Crop vertical position" type="range" min="0" max="1" step=".01" value={position.y} onChange={e=>setPosition({...position,y:+e.target.value})}/></label></div><div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>void pick()}>{t('更换图片','Choose another')}</button><button className="button primary" disabled={busy||!image} onClick={saveCrop}><Check size={16}/>{t('保存封面','Save cover')}</button></div></>:<><button className="button secondary full-width" disabled={busy} onClick={()=>void pick()}><ImagePlus size={17}/>{t('上传自定义封面','Upload custom cover')}<span>PNG · JPG · WebP</span></button><div className="cover-editor-actions"><button className="button ghost" disabled={busy} onClick={()=>void update('cover.regenerate')}><RefreshCw size={15}/>{t('重新生成','Regenerate')}</button><button className="button ghost" disabled={busy||cover?.kind!=='custom'} onClick={()=>void update('cover.auto')}><RotateCcw size={15}/>{t('恢复自动封面','Restore generated cover')}</button></div><p className="cover-editor-note">{t('艺术封面在本地生成并保存。你的选择会一直保留。','Artwork is generated and saved locally. Your choice stays with the song.')}</p></>}
    </div></div>,document.body);
}
