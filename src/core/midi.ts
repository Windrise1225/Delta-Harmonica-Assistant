import { Midi } from '@tonejs/midi';
import type { PitchNote, Timing, Settings, Score } from './schema';
import { mapMelody } from './mapping';
export type MidiTrack={index:number;name:string;instrument:string;percussion:boolean;noteCount:number;rating:number;notes:PitchNote[];discarded:number};
export type MidiDocument={name:string;sourceId:string;duration:number;bpm:number;timing:Timing;tracks:MidiTrack[];recommended:number;warnings:string[];test:boolean};
export function decodeMidiText(text:string){
  if(!/[\u0080-\u00ff]/.test(text)||[...text].some(c=>c.charCodeAt(0)>255))return text;
  const bytes=Uint8Array.from(text,c=>c.charCodeAt(0));
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{
    try{return new TextDecoder('gb18030',{fatal:true}).decode(bytes);}catch{return text;}
  }
}
export function melodyFromNotes(input:PitchNote[]):PitchNote[]{
  // Highest active voice is a deterministic melody heuristic, not instrument/AI recognition.
  // Sweep exact note-on/off events; repeated onsets always retain their own identity.
  const notes=input.filter(n=>n.duration>0&&n.confidence>0);
  const events=notes.flatMap((n,id)=>[{time:n.start,id,on:true},{time:n.start+n.duration,id,on:false}]).sort((a,b)=>a.time-b.time||Number(a.on)-Number(b.on));
  const active=new Set<number>();const output:(PitchNote&{source:number})[]=[];
  let index=0;
  while(index<events.length){
    const time=events[index].time;
    while(index<events.length&&Math.abs(events[index].time-time)<1e-9){const e=events[index++];e.on?active.add(e.id):active.delete(e.id);}
    if(active.size>256)throw new Error('MIDI 同时发声数量过多，请先简化曲谱。');
    const end=events[index]?.time;if(end===undefined||end<=time||!active.size)continue;
    let best=-1;
    for(const id of active){if(best===-1||notes[id].midi>notes[best].midi||notes[id].midi===notes[best].midi&&notes[id].start>notes[best].start)best=id;}
    const previous=output.at(-1);
    if(previous?.source===best&&Math.abs(previous.start+previous.duration-time)<1e-8)previous.duration=end-previous.start;
    else output.push({...notes[best],start:time,duration:end-time,source:best});
  }
  return output.map(({source:_,...n})=>n);
}
export function parseMidi(data:Uint8Array,fileName:string,sourceId:string):MidiDocument{
  if(data.byteLength>8*1024*1024)throw new Error('MIDI 文件最多支持 8 MB，请先精简曲谱。');
  if(data.length<14||String.fromCharCode(...data.slice(0,4))!=='MThd')throw new Error('这不是有效的标准 MIDI 文件。');
  if(data[8]!==0||data[9]>1)throw new Error('暂不支持 MIDI Type 2，请转换为 Type 0 或 Type 1。');
  if(data[12]&128)throw new Error('暂不支持 SMPTE 时间编码，请转换为 PPQ 时间编码。');
  let midi:Midi;
  try{midi=new Midi(data);}catch{throw new Error('MIDI 文件无法解析，可能损坏或不完整。');}
  if(midi.header.tempos.some(t=>!Number.isFinite(t.bpm)||t.bpm<=0||t.bpm>10000))throw new Error('MIDI 的速度信息无效。');
  // SMF defaults apply before the first explicit event, even if it occurs later.
  // Insert before reading note time getters: upstream uses the first tempo retroactively.
  if(!midi.header.tempos.length||midi.header.tempos[0].ticks>0)midi.header.tempos.unshift({ticks:0,bpm:120});
  if(!midi.header.timeSignatures.length||midi.header.timeSignatures[0].ticks>0)midi.header.timeSignatures.unshift({ticks:0,timeSignature:[4,4]});
  midi.header.update();
  const total=midi.tracks.reduce((sum,t)=>sum+t.notes.length,0);
  if(!total)throw new Error('没有可用的旋律轨道，MIDI 中没有音符。');
  if(total>100000||midi.tracks.length>256)throw new Error('MIDI 音符或轨道过多，请先精简曲谱。');
  if(!Number.isFinite(midi.duration)||midi.duration>86400)throw new Error('MIDI 时长无效，或超过 24 小时。');
  const warnings:string[]=[];
  if(midi.tracks.some(t=>t.pitchBends.length))warnings.push('存在弯音事件；当前仅转换原始 MIDI 音高，不应用弯音。');
  if(midi.tracks.some(t=>t.controlChanges[64]?.length))warnings.push('存在延音踏板；音符时长按 MIDI Note Off 计算。');
  const timing:Timing={ppq:midi.header.ppq,
    tempos:midi.header.tempos.map(t=>({ticks:t.ticks,time:midi.header.ticksToSeconds(t.ticks),bpm:t.bpm})),
    meters:midi.header.timeSignatures.map(t=>({ticks:t.ticks,numerator:t.timeSignature[0],denominator:t.timeSignature[1]}))};
  if(!timing.tempos.length||timing.tempos[0].ticks>0)timing.tempos.unshift({ticks:0,time:0,bpm:120});
  if(!timing.meters.length||timing.meters[0].ticks>0)timing.meters.unshift({ticks:0,numerator:4,denominator:4});
  const tracks:MidiTrack[]=midi.tracks.map((track,index)=>{
    const notes:PitchNote[]=track.notes.map(n=>({start:n.time,duration:n.duration,midi:n.midi,confidence:n.velocity})).filter(n=>Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.start>=0&&n.duration>0&&n.confidence>0);
    const melody=melodyFromNotes(notes);
    const sounding=melody.reduce((sum,n)=>sum+n.duration,0),combined=notes.reduce((sum,n)=>sum+n.duration,0);
    const average=notes.reduce((sum,n)=>sum+n.midi,0)/Math.max(1,notes.length);
    const name=decodeMidiText(track.name);
    const melodicName=/melody|lead|vocal|solo|flute|violin|口琴|主旋律|人声/i.test(name+' '+track.instrument.name);
    const bass=/bass|pad|accomp|伴奏|贝斯/i.test(name+' '+track.instrument.name);
    const rating=notes.length?(sounding/Math.max(.01,combined)*45+Math.min(notes.length,80)/4+(average>=55&&average<=90?15:0)+(melodicName?35:0)-(bass?40:0)-(track.instrument.percussion?200:0)):-1000;
    return {index,name:name||`Track ${index+1}`,instrument:track.instrument.name,percussion:track.instrument.percussion,noteCount:notes.length,rating,notes:melody,discarded:Math.max(0,notes.length-melody.length)};
  }).filter(t=>t.noteCount&&!t.percussion).sort((a,b)=>b.rating-a.rating);
  if(!tracks.length)throw new Error('没有可用的旋律轨道；纯打击乐 MIDI 无法转换为口琴曲谱。');
  return {name:(decodeMidiText(midi.name)||fileName.replace(/\.midi?$/i,'')).slice(0,120),sourceId,duration:midi.duration,bpm:timing.tempos[0].bpm,timing,tracks,recommended:tracks[0].index,warnings,test:/^TEST[_ -]/i.test(fileName)};
}
export function convertMidi(document:MidiDocument,trackIndex:number,settings:Settings,id:string,createdAt:string){
  const track=document.tracks.find(t=>t.index===trackIndex);if(!track)throw new Error('请选择有效的 MIDI 旋律轨道。');
  const mapped=mapMelody(track.notes,settings);
  const score:Score={version:1,id,name:document.name,sourceId:document.sourceId,createdAt,duration:document.duration,sourceDuration:document.duration,segment:[0,document.duration],bpm:document.bpm,timing:document.timing,test:document.test,notes:mapped.notes};
  return {...mapped,score,track};
}
