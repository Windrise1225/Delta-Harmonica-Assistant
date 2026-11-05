import { app, BrowserWindow, ipcMain, dialog, screen, session, protocol, globalShortcut } from 'electron';
import path from 'node:path';
import { readFile, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
import { Store } from './storage';
import { userMessage } from './errors';
import { createHash, randomUUID } from 'node:crypto';
import { parseMidi } from '../src/core/midi';
import { GameMonitor } from './game';
import { defaults, librarySchema, scoreSchema, settingsSchema, emptyTransport, type Library, type Score, type Transport } from '../src/core/schema';
import { positionAt } from '../src/core/timeline';
import { testScore } from '../src/core/demo';
import { CoverFiles,ensureCovers,freshCover } from './covers';
import { coverSchema } from '../src/core/schema';
let main:BrowserWindow|null=null,overlay:BrowserWindow|null=null;
// A packaged portable app always loads its bundled files, even if a developer
// has left DHA_DEV_URL set in the environment.
const developmentUrl=app.isPackaged?undefined:process.env.DHA_DEV_URL;
const overlayCloseAccelerator='Control+Shift+F10';
let overlayCloseShortcutRegistered=false;
const overlayStatus=()=>({open:!!overlay&&!overlay.isDestroyed(),closeShortcut:overlayCloseShortcutRegistered?'Ctrl + Shift + F10':null});
let store:Store,coverFiles:CoverFiles,library:Library={settings:structuredClone(defaults),scores:[],covers:{}};
let transport:Transport=structuredClone(emptyTransport);
let game:GameMonitor|null=null, seenGame=false, gameFound=false, gameFocused=false;
let monitorTimer:NodeJS.Timeout, clockTimer:NodeJS.Timeout;
let quitting=false, dragTimer:NodeJS.Timeout|null=null;
let mutationTail:Promise<unknown>=Promise.resolve();
const broadcast=(type:string,value:unknown)=>{for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send('dha:event',{type,value});};
const emitTransport=()=>broadcast('transport',transport);
const fail=(message:string)=>{throw new Error(message);};
const save=()=>store.save(library);
const localized=(zh:string,en:string)=>library.settings.language==='en'?en:zh;
const dataRoot=process.env.DHA_DATA_DIR||path.join(app.isPackaged?path.dirname(app.getPath('exe')):app.getAppPath(),'data');
let startupError:unknown;
try{
  const runtime=path.join(dataRoot,'runtime');
  for(const directory of ['session','logs','crashes'])mkdirSync(path.join(runtime,directory),{recursive:true});
  app.setPath('userData',runtime);app.setPath('sessionData',path.join(runtime,'session'));
  app.setPath('crashDumps',path.join(runtime,'crashes'));app.setAppLogsPath(path.join(runtime,'logs'));
}catch(error){startupError=error;}
app.commandLine.appendSwitch('disable-component-update');
protocol.registerSchemesAsPrivileged([{scheme:'dha-cover',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const loadWindow=(win:BrowserWindow,overlayMode=false)=>{
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{const target=developmentUrl||'file://';if(!url.startsWith(target))event.preventDefault();});
  if(developmentUrl)void win.loadURL(developmentUrl+(overlayMode?'/?overlay=1':''));
  else void win.loadFile(path.join(__dirname,'../dist/index.html'),overlayMode?{query:{overlay:'1'}}:{});
};
function overlaySettings(){
  if(!overlay)return;
  const s=library.settings;
  overlay.setFocusable(!s.clickThrough);
  overlay.setSkipTaskbar(true);
  overlay.setIgnoreMouseEvents(s.clickThrough,{forward:true});
  overlay.setMovable(!s.locked&&!s.clickThrough);
  overlay.setAlwaysOnTop(true,'screen-saver');
  if(s.focusBehavior==='hide'&&gameFound&&!gameFocused)overlay.hide();
  else if(!overlay.isVisible())overlay.showInactive();
}
function closeOverlayAndPause(){
  changeTransport('pause');
  overlay?.close();
}
function openOverlay(){
  if(overlay){overlaySettings();return;}
  const s=library.settings;
  const found=s.displayId===null&&s.gameExecutable?game?.inspect(s.gameExecutable):null;
  const display=screen.getAllDisplays().find(d=>d.id===s.displayId) ?? (found?.rect?screen.getDisplayMatching(screen.screenToDipRect(null,found.rect)):screen.getPrimaryDisplay());
  const area=display.workArea;
  const proposed=s.overlayBounds??{x:area.x+Math.round(area.width*.15),y:area.y+30,width:Math.round(area.width*.7),height:Math.round(area.height*.68)};
  const visible=screen.getAllDisplays().some(d=>proposed.x+proposed.width>d.workArea.x&&proposed.x<d.workArea.x+d.workArea.width&&proposed.y+proposed.height>d.workArea.y&&proposed.y<d.workArea.y+d.workArea.height);
  const bounds=visible?proposed:{...proposed,x:area.x+30,y:area.y+30};
  overlay=new BrowserWindow({...bounds,minWidth:480,minHeight:280,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,show:false,focusable:!s.clickThrough,title:'Delta Harmonica · Overlay',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  // Only claim the global shortcut while the overlay exists. It works even
  // when the overlay is click-through and the game owns keyboard focus.
  overlayCloseShortcutRegistered=globalShortcut.register(overlayCloseAccelerator,closeOverlayAndPause);
  broadcast('overlay',overlayStatus());
  let moveSave:NodeJS.Timeout;
  overlay.on('moved',()=>{clearTimeout(moveSave);moveSave=setTimeout(()=>{if(overlay){library.settings.overlayBounds=overlay.getBounds();void save();broadcast('settings',library.settings);}},300);});
  overlay.on('closed',()=>{clearTimeout(moveSave);overlay=null;if(overlayCloseShortcutRegistered)globalShortcut.unregister(overlayCloseAccelerator);overlayCloseShortcutRegistered=false;broadcast('overlay',overlayStatus());});
  overlay.once('ready-to-show',()=>{overlaySettings();emitTransport();});
  loadWindow(overlay,true);
}
function changeTransport(action:string,value?:number){
  const now=Date.now();
  if(action==='pause'&&(transport.state==='playing'||transport.state==='countdown'))transport={...transport,position:positionAt(transport,now),state:'paused',anchor:now};
  if(action==='resume'&&transport.state==='paused')transport={...transport,state:'playing',anchor:now};
  if(action==='restart')transport={...transport,state:'countdown',position:0,countdownEnd:now+3000,anchor:now+3000};
  if(action==='seek'&&transport.score){const last=transport.score.notes.at(-1)!;transport={...transport,position:Math.max(0,Math.min(value??0,last.start+last.duration)),state:'playing',anchor:now};}
  emitTransport();
}
async function readJson(file:string,maximum=25*1024*1024){const info=await import('node:fs/promises').then(m=>m.stat(file));if(info.size>maximum)fail('文件过大，无法导入。');return JSON.parse(await readFile(file,'utf8'));}
async function importFile(file:string){
  const extension=path.extname(file).toLowerCase();
  if(extension==='.dhscore'){
    const score=scoreSchema.parse(await readJson(file));score.id=randomUUID();score.createdAt=new Date().toISOString();delete score.sourceId;
    const scores=await handle('score.save',score,false);return scores?{kind:'score',scores}:null;
  }
  if(!['.mid','.midi'].includes(extension))fail('请选择 .mid、.midi 或 .dhscore 曲谱文件。');
  const info=await stat(file);if(!info.isFile()||info.size>8*1024*1024)fail('MIDI 文件最多支持 8 MB。');
  const sourceId=createHash('sha256').update(await realpath(file)).digest('hex');
  const document=parseMidi(new Uint8Array(await readFile(file)),path.basename(file),sourceId);
  return {kind:'midi',document};
}
async function handle(method:string,payload:unknown,fromOverlay:boolean):Promise<unknown>{
  if(fromOverlay&&!['bootstrap','overlay.resize','overlay.resizeEnd','overlay.close'].includes(method))fail('覆盖窗口无权执行此操作。');
  switch(method){
    case 'bootstrap':return {library,transport,overlay:overlayStatus(),displays:screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`${d.size.width} × ${d.size.height}`,scaleFactor:d.scaleFactor})),version:app.getVersion(),dataPath:store.root,gameDetectionAvailable:game!==null};
    case 'cover.list':return library.covers;
    case 'settings':{
      const previous=library.settings;
      library.settings=settingsSchema.parse(payload);
      try{await save();}catch(e){library.settings=previous;throw e;}
      if(overlay&&library.settings.overlayBounds)overlay.setBounds(library.settings.overlayBounds);
      if(overlay&&!library.settings.overlayBounds&&(previous.overlayBounds!==null||previous.displayId!==library.settings.displayId)){overlay.close();openOverlay();}
      overlaySettings();broadcast('settings',library.settings);return library.settings;
    }
    case 'score.save':{
      const score=scoreSchema.parse(payload);
      const sourceMatch=score.sourceId?library.scores.find(s=>s.sourceId===score.sourceId):undefined;
      const collision=library.scores.find(s=>s.name===score.name&&s.id!==score.id&&s.id!==sourceMatch?.id);
      let replaceId=sourceMatch?sourceMatch.id:score.id;
      if(collision){
        const result=await dialog.showMessageBox(main!,{type:'question',title:localized('发现同名曲谱','Duplicate score'),message:localized('曲库中已有同名歌曲。覆盖旧曲谱，还是另存为新曲谱？','A score with this name already exists. Replace it or save a copy?'),buttons:[localized('另存为','Save a copy'),localized('覆盖','Replace'),localized('取消','Cancel')],cancelId:2,defaultId:0});
        if(result.response===2)return null;
        if(result.response===1)replaceId=collision.id;
        else {let number=2;const base=score.name;do{const suffix=` (${number++})`;score.name=base.slice(0,120-suffix.length)+suffix;}while(library.scores.some(s=>s.name===score.name));}
      }
      const covers={...library.covers};covers[score.id]=covers[replaceId]??freshCover();if(replaceId!==score.id)delete covers[replaceId];
      const next={...library,covers,scores:[...library.scores.filter(s=>s.id!==replaceId&&s.id!==score.id),score]};
      await store.save(next);library=next;return library.scores;
    }
    case 'score.rename':{
      const p=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(120)}).parse(payload);
      const next={...library,scores:library.scores.map(s=>s.id===p.id?{...s,name:p.name}:s)};await store.save(next);library=next;return library.scores;
    }
    case 'score.delete':{
      const score=library.scores.find(s=>s.id===z.string().parse(payload));if(!score)return library.scores;
      const result=await dialog.showMessageBox(main!,{type:'warning',title:localized('删除曲谱','Delete score'),message:localized(`确定删除「${score.name}」？此操作不会删除原始音频。`,`Delete “${score.name}”? The original audio will be preserved.`),buttons:[localized('取消','Cancel'),localized('删除','Delete')],cancelId:0,defaultId:0});
      if(result.response===1){const covers={...library.covers};delete covers[score.id];const next={...library,covers,scores:library.scores.filter(s=>s.id!==score.id)};await store.save(next);library=next;}return library.scores;
    }
    case 'score.export':{
      const score=library.scores.find(s=>s.id===payload);if(!score)return;
      const result=await dialog.showSaveDialog(main!,{defaultPath:score.name.replace(/[<>:"/\\|?*]/g,'_')+'.dhscore',filters:[{name:'Delta Harmonica Score',extensions:['dhscore']}]});
      if(!result.canceled&&result.filePath){const {sourceId:_,...exported}=score;exported.notes=score.notes.map(({key,start,duration,mouse})=>({key,start,duration,mouse}));await writeFile(result.filePath,JSON.stringify(exported,null,2));}return !result.canceled;
    }
    case 'score.import':{
      const result=await dialog.showOpenDialog(main!,{properties:['openFile'],filters:[{name:'Delta Harmonica Score',extensions:['dhscore']}]});
      if(result.canceled)return null;
      const score=scoreSchema.parse(await readJson(result.filePaths[0]));score.id=randomUUID();score.createdAt=new Date().toISOString();delete score.sourceId;
      return handle('score.save',score,false);
    }
    case 'backup':{
      const result=await dialog.showSaveDialog(main!,{defaultPath:'Delta-Harmonica-backup.json',filters:[{name:'Backup',extensions:['json']}]});
      if(!result.canceled&&result.filePath)await writeFile(result.filePath,JSON.stringify({format:'dhbackup',version:1,library,images:await coverFiles.backup(library)},null,2));return !result.canceled;
    }
    case 'restore':{
      const result=await dialog.showOpenDialog(main!,{properties:['openFile'],filters:[{name:'Backup',extensions:['json']}]});if(result.canceled)return null;
      const backup=z.object({format:z.literal('dhbackup'),version:z.literal(1),library:librarySchema,images:z.record(z.string().regex(/^[a-f0-9]{64}\.png$/),z.string().max(2*1024*1024)).default({})}).parse(await readJson(result.filePaths[0],200*1024*1024));
      const confirmation=await dialog.showMessageBox(main!,{type:'warning',message:localized(`恢复备份将替换当前设置及 ${library.scores.length} 首曲谱。继续吗？`,`Restore will replace your settings and ${library.scores.length} scores. Continue?`),buttons:[localized('取消','Cancel'),localized('恢复','Restore')],cancelId:0,defaultId:0});
      if(confirmation.response!==1)return null;
      await coverFiles.restore(backup.library,backup.images);ensureCovers(backup.library);
      await writeFile(path.join(store.root,'before-restore.json'),JSON.stringify({format:'dhbackup',version:1,library,images:await coverFiles.backup(library)}));
      await store.save(backup.library);library=backup.library;overlay?.close();transport=structuredClone(emptyTransport);emitTransport();broadcast('settings',library.settings);return library;
    }
    case 'file.open':{
      const result=await dialog.showOpenDialog(main!,{properties:['openFile'],filters:[{name:'MIDI / DHScore',extensions:['mid','midi','dhscore']}]});
      if(result.canceled)return null;return importFile(result.filePaths[0]);
    }
    case 'file.drop':return importFile(z.string().max(32768).parse(payload));
    case 'cover.pick':{
      const selection=await dialog.showOpenDialog(main!,{properties:['openFile'],filters:[{name:'Cover image',extensions:['png','jpg','jpeg','webp']}]});
      return selection.canceled?null:coverFiles.preview(selection.filePaths[0]);
    }
    case 'cover.custom':case 'cover.regenerate':case 'cover.auto':{
      const p=z.object({id:z.string().uuid(),data:z.string().max(2*1024*1024).optional()}).parse(payload);
      if(!library.scores.some(s=>s.id===p.id))fail('曲谱不存在，请刷新曲库。');
      let cover=library.covers[p.id]??freshCover();
      if(method==='cover.custom'){if(!p.data)fail('请选择封面图片。');cover={kind:'custom',version:1,seed:cover.seed,file:await coverFiles.saveCrop(p.data!)};}
      else if(method==='cover.regenerate')cover=freshCover();
      else cover={kind:'generated',seed:cover.seed,version:1};
      const next={...library,covers:{...library.covers,[p.id]:coverSchema.parse(cover)}};await store.save(next);library=next;return library.covers;
    }
    case 'overlay.open':openOverlay();return true;
    case 'overlay.close':closeOverlayAndPause();return;
    case 'overlay.resize':{
      if(!overlay||library.settings.locked||library.settings.clickThrough)return;
      if(dragTimer)clearInterval(dragTimer);
      const point=screen.getCursorScreenPoint(),bounds=overlay.getBounds(),started=Date.now();
      dragTimer=setInterval(()=>{if(!overlay||Date.now()-started>15000){if(dragTimer)clearInterval(dragTimer);return;}const cursor=screen.getCursorScreenPoint();overlay.setBounds({...bounds,width:Math.max(480,Math.min(7680,bounds.width+cursor.x-point.x)),height:Math.max(280,Math.min(4320,bounds.height+cursor.y-point.y))});},16);return;
    }
    case 'overlay.resizeEnd':{
      if(dragTimer){clearInterval(dragTimer);dragTimer=null;}if(overlay){library.settings.overlayBounds=overlay.getBounds();await save();broadcast('settings',library.settings);}return;
    }
    case 'play':{
      const score=payload==='test'?testScore():library.scores.find(s=>s.id===payload);if(!score)fail('曲谱不存在，请重新选择。');
      if(!score!.test){const next={...library,scores:library.scores.map(s=>s.id===score!.id?{...s,lastUsed:new Date().toISOString()}:s)};await store.save(next);library=next;}
      const now=Date.now();transport={score:score!,state:'countdown',position:0,anchor:now+3000,countdownEnd:now+3000};openOverlay();emitTransport();return transport;
    }
    case 'transport':{const p=z.object({action:z.enum(['pause','resume','restart','seek']),value:z.number().finite().min(0).max(86400).optional()}).parse(payload);changeTransport(p.action,p.value);return transport;}
    case 'window.minimize':main?.minimize();return;
    case 'window.maximize':main?.isMaximized()?main.unmaximize():main?.maximize();return;
    case 'window.close':main?.close();return;
    default:fail('不支持此操作。');
  }
}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{main?.restore();main?.focus();});
  app.whenReady().then(async()=>{
    const root=dataRoot;
    try{
      if(startupError)throw startupError;
      await mkdir(root,{recursive:true});store=new Store(root);library=await store.init();
      coverFiles=new CoverFiles(path.join(root,'covers'));
      if(ensureCovers(library))await save();
      protocol.handle('dha-cover',async request=>{
        try{const url=new URL(request.url);if(url.hostname!=='image')return new Response(null,{status:404});const bytes=await coverFiles.read(url.pathname.slice(1));return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable'}});}catch{return new Response(null,{status:404});}
      });
      try{game=new GameMonitor();}catch(e){await store.log('游戏窗口检测不可用',e);}
      session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
      const connectPolicy=developmentUrl?"'self' http://127.0.0.1:5173 ws://127.0.0.1:5173":"'none'";
      session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: dha-cover:; connect-src ${connectPolicy}; media-src 'none'; object-src 'none'`]}}));
      session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const url=new URL(details.url);callback({cancel:['http:','https:','ws:','wss:'].includes(url.protocol)&&!(developmentUrl&&url.hostname==='127.0.0.1'&&url.port==='5173')});});
      main=new BrowserWindow({width:1440,height:960,minWidth:1040,minHeight:720,frame:false,backgroundColor:'#F9F7FC',show:false,icon:path.join(__dirname,'../assets/icon.png'),title:'Delta Harmonica Assistant',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
      main.once('ready-to-show',()=>main?.show());
      main.on('closed',()=>{main=null;overlay?.destroy();app.quit();});
      loadWindow(main);
      ipcMain.handle('dha:call',async(event,method:string,payload:unknown)=>{
        if(event.sender!==main?.webContents&&event.sender!==overlay?.webContents)return {ok:false,error:'未知窗口请求。'};
        try{
          const fromOverlay=event.sender===overlay?.webContents;
          if(!fromOverlay&&/^(settings|score\.(save|rename|delete|import)|file\.(open|drop)|cover\.(custom|regenerate|auto)|restore|backup|play)$/.test(method)){
            const operation=mutationTail.catch(()=>{}).then(()=>handle(method,payload,false));mutationTail=operation;return {ok:true,value:await operation};
          }
          return {ok:true,value:await handle(method,payload,fromOverlay)};
        }
        catch(e){await store.log(`操作失败: ${method}`,e);const error=e instanceof z.ZodError?'文件格式或参数无效，请检查后重试。':userMessage(e);return {ok:false,error};}
      });
      clockTimer=setInterval(()=>{
        const now=Date.now();
        if(transport.state==='countdown'&&now>=transport.countdownEnd){transport={...transport,state:'playing',anchor:transport.countdownEnd};emitTransport();}
        if(transport.state==='playing'&&transport.score){const end=transport.score.notes.at(-1)!;if(positionAt(transport,now)>=end.start+end.duration){transport={...transport,state:'ended',position:Math.max(0,end.start+end.duration-.001),anchor:now};emitTransport();}}
      },50);
      monitorTimer=setInterval(()=>{
        if(!game||!library.settings.gameExecutable)return;
        try{
          const current=game.inspect(library.settings.gameExecutable);gameFound=current.found;gameFocused=current.focused;
          broadcast('game',{found:gameFound,focused:gameFocused});
          if(seenGame&&!gameFound){overlay?.close();changeTransport('pause');seenGame=false;}
          if(gameFound){seenGame=true;if(!gameFocused&&library.settings.focusBehavior==='pause')changeTransport('pause');overlaySettings();}
        }catch(e){void store.log('游戏窗口状态获取失败',e);}
      },1500);
    }catch(e){dialog.showErrorBox('Delta Harmonica Assistant',userMessage(e));app.quit();}
  });
}
app.on('before-quit',event=>{
  if(overlayCloseShortcutRegistered)globalShortcut.unregister(overlayCloseAccelerator);
  overlayCloseShortcutRegistered=false;
  if(quitting)return;
  quitting=true;event.preventDefault();clearInterval(clockTimer);clearInterval(monitorTimer);if(dragTimer)clearInterval(dragTimer);
  void mutationTail.catch(()=>{}).then(()=>store?.flush()).catch(()=>{}).finally(()=>app.quit());
});
app.on('window-all-closed',()=>app.quit());
