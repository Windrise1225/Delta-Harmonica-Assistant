import type { Settings, Transport } from './core/schema';
export type OverlayStatus={open:boolean;closeShortcut:string|null};
export type AppEvent={type:'transport';value:Transport}|{type:'settings';value:Settings}|{type:'game';value:{found:boolean;focused:boolean}}|{type:'overlay';value:OverlayStatus};
export interface Bridge {
  call<T=unknown>(method:string,payload?:unknown):Promise<T>;
  onEvent(callback:(event:AppEvent)=>void):()=>void;
  filePath(file:File):string;
}
declare global {interface Window {dha:Bridge}}
export const api=window.dha;
