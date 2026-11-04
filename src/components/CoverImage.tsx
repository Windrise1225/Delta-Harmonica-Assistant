import { memo,useMemo,useRef,useState,useEffect } from 'react';
import { coverSource,type Cover } from '../core/artwork';
const cache=new Map<string,string>();
export const CoverImage=memo(function CoverImage({cover,id,className='',eager=false}:{cover?:Cover;id:string;className?:string;eager?:boolean}){
  const image=useRef<HTMLImageElement>(null),[visible,setVisible]=useState(eager);
  useEffect(()=>{if(eager||visible)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'300px'});if(image.current)observer.observe(image.current);return()=>observer.disconnect();},[eager,visible]);
  const source=useMemo(()=>{
    if(!visible&&!eager)return undefined;
    const value=cover??{kind:'generated' as const,version:1 as const,seed:id.replace(/-/g,'')};const key=value.kind==='custom'?value.file:value.seed;
    let result=cache.get(key);if(!result){result=coverSource(value);if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,result);}return result;
  },[visible,eager,cover?.seed,cover?.kind,cover?.kind==='custom'?cover.file:'',id]);
  return <img ref={image} className={`cover-image ${className}`} src={source} alt="" draggable={false} loading={eager?'eager':'lazy'} decoding="async"/>;
});
