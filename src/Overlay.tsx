import { useEffect, useState } from 'react';
import { api } from './bridge';
import { defaults,emptyTransport,type Settings,type Transport } from './core/schema';
import { NoteField } from './components/NoteField';
import { testScore } from './core/demo';
import { X } from 'lucide-react';
export function Overlay(){
  const [settings,setSettings]=useState<Settings>(defaults),[transport,setTransport]=useState<Transport>(emptyTransport);
  useEffect(()=>{
    document.title='Delta Harmonica · Overlay';
    document.documentElement.classList.add('overlay-html');
    document.body.classList.add('overlay-body');
    const off=api.onEvent(event=>{if(event.type==='settings')setSettings(event.value);if(event.type==='transport')setTransport(event.value);});
    void api.call<{library:{settings:Settings};transport:Transport}>('bootstrap').then(s=>{setSettings(s.library.settings);setTransport(s.transport);});
    return off;
  },[]);
  return <div className="overlay-root">
    {!settings.locked&&!settings.clickThrough&&<div className="drag-surface"/>}
    {!settings.clickThrough&&<button className="overlay-close-button" aria-label={settings.language==='zh'?'关闭覆盖窗口':'Close overlay'} title={settings.language==='zh'?'关闭覆盖窗口并暂停曲谱':'Close overlay and pause the score'} onClick={()=>void api.call('overlay.close')}><X size={18}/></button>}
    <NoteField score={transport.score??testScore()} transport={transport} settings={settings}/>
    {!settings.locked&&!settings.clickThrough&&<div className="resize-grip" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);void api.call('overlay.resize');}} onPointerUp={()=>void api.call('overlay.resizeEnd')} onLostPointerCapture={()=>void api.call('overlay.resizeEnd')}/>}
  </div>;
}
