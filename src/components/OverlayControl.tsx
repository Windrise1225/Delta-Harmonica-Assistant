import { Monitor, X } from 'lucide-react';
import type { OverlayStatus } from '../bridge';
import type { Translate } from './SettingsPanel';

export function OverlayControl({status,run,t}:{status:OverlayStatus;run:(method:string)=>Promise<unknown>;t:Translate}){
  return <div className="overlay-controls">
    <button className="button secondary" aria-pressed={status.open}
      title={status.open?t('关闭覆盖窗口并暂停曲谱','Close the overlay and pause the score'):t('显示透明下落音符窗口','Show the transparent falling-note overlay')}
      onClick={()=>void run(status.open?'overlay.close':'overlay.open')}>
      {status.open?<X size={16}/>:<Monitor size={16}/>}
      {status.open?t('关闭覆盖窗口','Close overlay'):t('打开覆盖窗口','Open overlay')}
    </button>
    {status.open&&<small>{status.closeShortcut
      ?t(`关闭并暂停：${status.closeShortcut}`,`Close and pause: ${status.closeShortcut}`)
      :t('快捷键不可用，请使用关闭按钮','Shortcut unavailable; use the close button')}</small>}
  </div>;
}
