import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Midi } from '@tonejs/midi';
import { parseMidi, melodyFromNotes, convertMidi } from '../src/core/midi';
import { defaults, scoreSchema, type PitchNote } from '../src/core/schema';
import { beatLines, bpmAt, ticksToSeconds, secondsToTicks } from '../src/core/beats';
const load=()=>parseMidi(new Uint8Array(readFileSync('fixtures/TEST_neon_timing.mid')),'TEST_neon_timing.mid','fixture');
const note=(midi:number,start:number,duration:number):PitchNote=>({midi,start,duration,confidence:.8});
describe('real binary MIDI import',()=>{
  it('reads tempo changes, meter changes and excludes drums',()=>{const d=load();expect(d.tracks).toHaveLength(2);expect(d.timing.tempos.map(t=>Math.round(t.bpm))).toEqual([120,90]);expect(d.timing.meters.map(t=>t.numerator)).toEqual([4,3]);expect(d.test).toBe(true);});
  it('recommends lead melody over bass accompaniment',()=>{const d=load();expect(d.tracks.find(t=>t.index===d.recommended)?.name).toContain('Lead melody');});
  it('preserves short, long and consecutive same-pitch notes',()=>{const d=load(),notes=d.tracks[0].notes;expect(notes[0].start).toBeCloseTo(.5);expect(notes[0].duration).toBeCloseTo(.25);expect(notes[1].midi).toBe(60);expect(notes[1].start).toBeCloseTo(.75);expect(notes.find(n=>n.midi===64)?.duration).toBeCloseTo(1.5);expect(notes.find(n=>n.midi===59)?.duration).toBeCloseTo(2/3);});
  it('generates no keys for uncalibrated defaults',()=>{const d=load();expect(convertMidi(d,d.recommended,defaults,crypto.randomUUID(),new Date().toISOString()).notes).toHaveLength(0);expect(defaults.mapping.every(n=>n===null)).toBe(true);});
  it('converts only measured pitches and validates the saved format',()=>{const d=load();const settings={...defaults,mapping:[60,62,64,65,67,69,71,72],offsets:{left:-1,middle:1,right:12}};const c=convertMidi(d,d.recommended,settings,crypto.randomUUID(),new Date().toISOString());expect(c.notes.some(n=>n.mouse==='left')).toBe(true);expect(c.notes.some(n=>n.mouse==='middle')).toBe(true);expect(scoreSchema.safeParse(c.score).success).toBe(true);expect(c.score.test).toBe(true);});
  it('rejects invalid header, unsupported type and SMPTE',()=>{expect(()=>parseMidi(new Uint8Array([1,2]),'bad.mid','x')).toThrow();const bytes=new Uint8Array(readFileSync('fixtures/TEST_neon_timing.mid'));bytes[9]=2;expect(()=>parseMidi(bytes,'bad.mid','x')).toThrow('Type 2');bytes[9]=1;bytes[12]=128;expect(()=>parseMidi(bytes,'bad.mid','x')).toThrow('SMPTE');});
  it('rejects empty/percussion-only MIDI',()=>{const m=new Midi();expect(()=>parseMidi(m.toArray(),'empty.mid','x')).toThrow('旋律轨道');});
  it('uses SMF default tempo before a delayed first tempo event',()=>{const m=new Midi();m.header.tempos=[{ticks:1920,bpm:90}];m.header.update();m.addTrack().addNote({midi:60,ticks:480,durationTicks:480,velocity:.8});const d=parseMidi(m.toArray(),'delayed.mid','x');expect(d.tracks[0].notes[0].start).toBeCloseTo(.5);expect(d.tracks[0].notes[0].duration).toBeCloseTo(.5);expect(d.timing.tempos[1].time).toBeCloseTo(2);});
});
describe('monophonic melody reduction',()=>{
  it('selects the highest chord voice',()=>expect(melodyFromNotes([note(48,0,1),note(60,0,1),note(67,0,1)])).toEqual([note(67,0,1)]));
  it('keeps repeated same-pitch onsets separate',()=>{const n=melodyFromNotes([note(60,0,.1),note(60,.1,.2)]);expect(n).toHaveLength(2);expect(n[0].duration).toBeCloseTo(.1);});
  it('cuts overlaps exactly and resumes a remaining lower voice',()=>{const n=melodyFromNotes([note(60,0,2),note(64,.5,.5)]);expect(n.map(x=>[x.midi,x.start,x.duration])).toEqual([[60,0,.5],[64,.5,.5],[60,1,1]]);});
  it('does not filter short MIDI notes',()=>expect(melodyFromNotes([note(60,0,.015)])[0].duration).toBe(.015));
});
describe('tempo and beat timeline',()=>{
  it('maps ticks across tempo changes in both directions',()=>{const t=load().timing;expect(ticksToSeconds(t,t.ppq*9)).toBeCloseTo(4+2/3);expect(secondsToTicks(t,4+2/3)).toBeCloseTo(t.ppq*9);});
  it('renders 3/4 downbeats after the meter change',()=>{const d=load(),score=convertMidi(d,d.recommended,{...defaults,mapping:[60,62,64,65,67,69,71,72]},crypto.randomUUID(),new Date().toISOString()).score;const start=ticksToSeconds(d.timing,d.timing.ppq*16);const lines=beatLines(score,start,start+3);expect(lines.filter(b=>b.downbeat).map(b=>b.time)).toContainEqual(start);expect(lines.some(b=>b.downbeat&&Math.abs(b.time-(start+2))<.001)).toBe(true);expect(bpmAt(score,5)).toBeCloseTo(90);});
});
