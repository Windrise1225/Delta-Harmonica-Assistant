import { contextBridge, ipcRenderer, webUtils } from 'electron';
contextBridge.exposeInMainWorld('dha',{
  call:async(method:string,payload:unknown)=>{
    const result=await ipcRenderer.invoke('dha:call',method,payload);
    if(!result.ok)throw new Error(result.error);
    return result.value;
  },
  onEvent:(callback:(event:unknown)=>void)=>{const listener=(_event:unknown,value:unknown)=>callback(value);ipcRenderer.on('dha:event',listener);return()=>ipcRenderer.removeListener('dha:event',listener);},
  filePath:(file:File)=>webUtils.getPathForFile(file)
});
