import koffi from 'koffi';
export type GameWindow={found:boolean;focused:boolean;rect?:{x:number;y:number;width:number;height:number}};
// Query window metadata only. No ReadProcessMemory, hooks, input simulation or injection.
export class GameMonitor {
  private user=koffi.load('user32.dll');
  private kernel=koffi.load('kernel32.dll');
  private enumWindows=this.user.func('bool __stdcall EnumWindows(void *callback, intptr_t data)');
  private isVisible=this.user.func('bool __stdcall IsWindowVisible(void *hwnd)');
  private getPid=this.user.func('uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)');
  private foreground=this.user.func('void * __stdcall GetForegroundWindow()');
  private open=this.kernel.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)');
  private query=this.kernel.func('bool __stdcall QueryFullProcessImageNameW(void *handle, uint32_t flags, _Out_ char16_t *name, _Inout_ uint32_t *size)');
  private close=this.kernel.func('bool __stdcall CloseHandle(void *handle)');
  private rectType=koffi.struct('DHA_RECT',{left:'long',top:'long',right:'long',bottom:'long'});
  private getRect=this.user.func('GetWindowRect','bool',['void *',koffi.out(koffi.pointer(this.rectType))]);
  private callbackType=koffi.proto('bool __stdcall DHA_EnumProc(void *hwnd, intptr_t data)');
  inspect(executable:string):GameWindow {
    if(!executable)return {found:false,focused:false};
    let result:GameWindow={found:false,focused:false};
    const foreground=this.foreground();
    const callback=koffi.register((hwnd:unknown)=>{
      if(!this.isVisible(hwnd))return true;
      const pid=[0];this.getPid(hwnd,pid);
      const handle=this.open(0x1000,false,pid[0]);if(!handle)return true;
      const buffer=Buffer.alloc(32768*2),size=[32768];
      try {
        if(!this.query(handle,0,buffer,size))return true;
        const name=buffer.toString('utf16le',0,size[0]*2).split('\\').at(-1);
        if(name?.toLowerCase()!==executable.toLowerCase())return true;
        const rect={left:0,top:0,right:0,bottom:0};this.getRect(hwnd,rect);
        result={found:true,focused:koffi.address(hwnd as never)===koffi.address(foreground),rect:{x:rect.left,y:rect.top,width:rect.right-rect.left,height:rect.bottom-rect.top}};
        return false;
      } finally{this.close(handle);}
    },koffi.pointer(this.callbackType));
    try{this.enumWindows(callback,0);}finally{koffi.unregister(callback);}
    return result;
  }
}
