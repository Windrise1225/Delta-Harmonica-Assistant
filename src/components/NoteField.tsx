import { useEffect, useRef } from 'react';
import { KEYS, type Score, type Settings, type Transport } from '../core/schema';
import { formatTime, noteGeometry, positionAt } from '../core/timeline';
import { beatLines, bpmAt } from '../core/beats';
import { mouseHolds } from '../core/mapping';
type Props={score:Score;settings:Settings;transport?:Transport;preview?:boolean;surface?:'light'|'overlay'};
export function NoteField({score,settings,transport,preview=false,surface='overlay'}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const state=useRef({score,settings,transport,preview,surface});state.current={score,settings,transport,preview,surface};
  useEffect(()=>{
    const node=canvas.current!;const ctx=node.getContext('2d',{alpha:true})!;
    let width=0,height=0,raf=0,last=0,origin=performance.now();
    let previousScore:Score|undefined,previousContinuous:boolean|undefined,holds:ReturnType<typeof mouseHolds>=[];
    const observer=new ResizeObserver(([entry])=>{width=entry.contentRect.width;height=entry.contentRect.height;const ratio=Math.min(window.devicePixelRatio||1,2);node.width=Math.round(width*ratio);node.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);});observer.observe(node);
    function draw(now:number){
      raf=requestAnimationFrame(draw);if(now-last<1000/60)return;last=now-(now-last)%(1000/60);
      const {score:s,settings:p,transport:t,preview:isPreview,surface:surfaceType}=state.current;
      const light=surfaceType==='light';
      if(previousScore!==s||previousContinuous!==p.continuousMouse){holds=mouseHolds(s.notes,p.continuousMouse);previousScore=s;previousContinuous=p.continuousMouse;}
      if(width<1||height<1)return;
      const at=t?positionAt(t,Date.now()):((now-origin)/1000)%16;
      const line=height-80,top=isPreview?14:85,padding=isPreview?12:30;
      const lane=(width-padding*2)/8;
      ctx.clearRect(0,0,width,height);
      ctx.fillStyle=light?`rgba(243,236,250,${p.backgroundOpacity})`:`rgba(13,12,24,${p.backgroundOpacity})`;ctx.fillRect(0,0,width,height);
      for(let i=0;i<8;i++){
        const x=padding+i*lane;
        ctx.fillStyle=p.laneColors[i]+Math.round(p.trackOpacity*255).toString(16).padStart(2,'0');ctx.fillRect(x+2,top,lane-4,line-top);
        ctx.strokeStyle=light?'rgba(167,123,209,.14)':'rgba(200,167,234,.09)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,line);ctx.stroke();
      }
      for(const beat of beatLines(s,at,at+p.leadTime)){
        const y=line-(beat.time-at)*(line-top)/p.leadTime;if(y<top||y>line)continue;
        ctx.strokeStyle=beat.downbeat?'rgba(167,123,209,.3)':'rgba(167,123,209,.1)';ctx.beginPath();ctx.moveTo(padding,y);ctx.lineTo(width-padding,y);ctx.stroke();
        if(beat.downbeat&&!isPreview){ctx.fillStyle='#b99bea';ctx.font='10px Segoe UI';ctx.fillText('◆',7,y+3);}
      }
      const active=new Set<number>();
      ctx.save();ctx.beginPath();ctx.rect(padding,top,width-padding*2,line-top+1);ctx.clip();
      let low=0,high=s.notes.length;
      while(low<high){const mid=(low+high)>>>1;const note=s.notes[mid];if(note.start+note.duration<at)low=mid+1;else high=mid;}
      const visible=s.notes.slice(low,low+256);
      for(const note of visible){
        if(note.start>at+p.leadTime+.2)break;
        const g=noteGeometry(note.start,note.duration,at,p.leadTime,line,top);
        if(g.bottom<top-30||g.y>line+30)continue;
        const i=KEYS.indexOf(note.key),x=padding+i*lane+lane*.16,w=lane*.68,color=p.noteColor??p.laneColors[i];
        const hit=note.start<=at&&note.start+note.duration>=at;if(hit)active.add(i);
        // Render the real duration. Even a tiny note is never stretched into a longer hold.
        const y=g.y,h=g.height;
        ctx.globalAlpha=p.noteOpacity;
        const trail=ctx.createLinearGradient(0,y-32,0,y);trail.addColorStop(0,color+'00');trail.addColorStop(1,color+'32');ctx.fillStyle=trail;ctx.fillRect(x+3,y-32,w-6,32);
        const glass=ctx.createLinearGradient(x,y,x+w,y+h);glass.addColorStop(0,color+'df');glass.addColorStop(.48,color+'65');glass.addColorStop(1,color+'b0');
        ctx.shadowColor=color;ctx.shadowBlur=isPreview?4:7;ctx.fillStyle=glass;ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(6,h/2));ctx.fill();ctx.shadowBlur=0;
        ctx.strokeStyle=color+'ed';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#ffffff7a';ctx.fillRect(x+3,y+2,Math.max(0,w-6),Math.min(2,Math.max(0,h-3)));
        if(note.mouse!=='none'){
          const my=Math.min(line-15,Math.max(top+10,g.bottom-11)),mx=x+w/2;
          ctx.globalAlpha=1;ctx.fillStyle=light?'#ffffffeb':'#302436d9';ctx.strokeStyle=note.mouse==='left'?'#c391bb':note.mouse==='right'?'#a785c9':'#b29aa4';ctx.lineWidth=1;
          ctx.beginPath();ctx.roundRect(mx-14,my-9,28,17,4);ctx.fill();ctx.stroke();
          ctx.fillStyle=ctx.strokeStyle;ctx.font=`600 ${isPreview?8:10}px Segoe UI`;ctx.textAlign='center';ctx.fillText(note.mouse==='left'?'L ↓':note.mouse==='right'?'R ↑':'M ±',mx,my+3);
        }
      }
      ctx.restore();ctx.globalAlpha=1;
      const breathe=.65+.25*Math.sin(now/750);
      ctx.shadowColor=p.theme;ctx.shadowBlur=6+(active.size?4:0);ctx.strokeStyle=p.theme;ctx.globalAlpha=p.lineOpacity*breathe;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(padding,line);ctx.lineTo(width-padding,line);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;
      for(let i=0;i<8;i++){
        const x=padding+i*lane+lane*.14,w=lane*.72,color=p.laneColors[i],hit=active.has(i);
        ctx.fillStyle=color+(hit?'66':'13');ctx.strokeStyle=color+(hit?'ef':'69');ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,line+13,w,37,7);ctx.fill();ctx.stroke();
        if(hit){ctx.shadowColor=color;ctx.shadowBlur=9;ctx.stroke();ctx.shadowBlur=0;}
        ctx.fillStyle=light?'#8056ac':color;ctx.font=`600 ${isPreview?12:18}px Segoe UI`;ctx.textAlign='center';ctx.fillText(KEYS[i],x+w/2,line+38);
      }
      if(!isPreview){
        ctx.textAlign='left';ctx.font='600 12px Segoe UI';ctx.fillStyle=p.theme;ctx.fillText(s.test?(p.language==='zh'?'测试曲谱 · 仅用于动画与操作提示验证':'TEST SCORE · VISUAL VERIFICATION ONLY'):s.name,30,25);
        ctx.font='12px Segoe UI';ctx.fillStyle=light?'#82778c':'#e8dcee';ctx.fillText(`${formatTime(s.segment[0]+at)} / ${formatTime(s.sourceDuration)}     ${bpmAt(s,at)?.toFixed(1).replace('.0','')??'—'} BPM`,30,46);
        let holdLow=0,holdHigh=holds.length;
        while(holdLow<holdHigh){const mid=(holdLow+holdHigh)>>>1;if(holds[mid].end<=at)holdLow=mid+1;else holdHigh=mid;}
        const hold=holds[holdLow]?.start<=at?holds[holdLow]:undefined;
        if(hold){ctx.font='600 11px Segoe UI';ctx.fillStyle=light?'#956eac':'#dbc1ed';ctx.fillText((p.language==='zh'?'鼠标持续按住：':'HOLD MOUSE: ')+(hold.mouse==='left'?'L ↓':hold.mouse==='right'?'R ↑':'M ±'),30,67);}
        ctx.fillStyle='#ffffff22';ctx.fillRect(width*.6,21,width*.34,3);ctx.fillStyle=p.theme;ctx.fillRect(width*.6,21,width*.34*(s.segment[0]+at)/s.sourceDuration,3);
        if(t?.state==='countdown'){ctx.font='600 70px Segoe UI';ctx.fillStyle=light?'#a77bd1':'#f4eafa';ctx.textAlign='center';ctx.shadowColor=p.theme;ctx.shadowBlur=10;ctx.fillText(String(Math.max(1,Math.ceil((t.countdownEnd-Date.now())/1000))),width/2,height/2);ctx.shadowBlur=0;}
        if(t?.state==='paused'||t?.state==='ended'){ctx.textAlign='center';ctx.font='600 20px Segoe UI';ctx.fillStyle=light?'#a77bd1':'#f4eafa';ctx.fillText(t.state==='paused'?(p.language==='zh'?'已暂停':'PAUSED'):(p.language==='zh'?'演奏结束':'FINISHED'),width/2,70);}
      }
    }
    raf=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(raf);observer.disconnect();};
  },[]);
  return <canvas ref={canvas} className="note-canvas" aria-label={settings.language==='zh'?'八轨音符下落预览':'Eight-lane falling notes'}/>;
}
