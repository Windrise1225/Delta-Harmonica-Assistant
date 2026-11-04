import midiPackage from '@tonejs/midi';
import { mkdir, writeFile } from 'node:fs/promises';
const { Midi }=midiPackage;
const midi=new Midi();midi.header.name='TEST - Neon Timing';
const ppq=midi.header.ppq;
midi.header.tempos=[{ticks:0,bpm:120},{ticks:ppq*8,bpm:90}];
midi.header.timeSignatures=[{ticks:0,timeSignature:[4,4]},{ticks:ppq*16,timeSignature:[3,4]}];midi.header.update();
const lead=midi.addTrack();lead.name='Lead melody - TEST';lead.instrument.number=22;
for(const n of [{midi:60,ticks:ppq,durationTicks:ppq/2},{midi:60,ticks:ppq*1.5,durationTicks:ppq/2},{midi:62,ticks:ppq*2,durationTicks:ppq/4},{midi:64,ticks:ppq*3,durationTicks:ppq*3},{midi:61,ticks:ppq*7,durationTicks:ppq/2},{midi:59,ticks:ppq*8,durationTicks:ppq},{midi:72,ticks:ppq*10,durationTicks:ppq},{midi:72,ticks:ppq*11,durationTicks:ppq},{midi:67,ticks:ppq*30,durationTicks:ppq*2}])lead.addNote({...n,velocity:.85});
// A lower note under a lead note verifies chord reduction.
lead.addNote({midi:48,ticks:ppq*3,durationTicks:ppq,velocity:.7});
const bass=midi.addTrack();bass.name='Bass accompaniment - TEST';bass.instrument.number=33;
for(let i=0;i<16;i++)bass.addNote({midi:36+i%3,ticks:i*ppq,durationTicks:ppq*.8,velocity:.6});
const drums=midi.addTrack();drums.name='Drums - TEST';drums.channel=9;for(let i=0;i<8;i++)drums.addNote({midi:36,ticks:i*ppq,durationTicks:60,velocity:.9});
await mkdir('fixtures',{recursive:true});await writeFile('fixtures/TEST_neon_timing.mid',Buffer.from(midi.toArray()));
const keys=['Z','X','C','V','B','N','M',','];
const score={version:1,id:'00000000-0000-4000-8000-000000000002',name:'TEST · 八轨与鼠标提示验证',createdAt:'2026-01-01T00:00:00.000Z',duration:18,sourceDuration:18,segment:[0,18],bpm:120,test:true,notes:[
 ...keys.map((key,i)=>({key,start:1+i*.5,duration:.2,mouse:['none','left','middle','right'][i%4]})),
 {key:'Z',start:5,duration:.15,mouse:'none'},{key:'Z',start:5.15,duration:.15,mouse:'none'},
 {key:'C',start:6,duration:1,mouse:'left'},{key:'V',start:7,duration:1,mouse:'left'},
 {key:'M',start:15,duration:2,mouse:'right'}]};
await writeFile('fixtures/TEST_eight_lanes.dhscore',JSON.stringify(score,null,2));
console.log('Created clearly labeled test MIDI and DHScore fixtures.');
