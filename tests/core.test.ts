import { describe,expect,it } from 'vitest';
import { defaults,scoreSchema,settingsSchema,type Score } from '../src/core/schema';
import { mapMelody,mouseHolds } from '../src/core/mapping';
import { testScore } from '../src/core/demo';
import { timeline,originalToPlay,playToOriginal,positionAt,noteGeometry } from '../src/core/timeline';
import { readFileSync } from 'node:fs';
import { userMessage } from '../electron/errors';
describe('confirmed-only game mapping',()=>{
  const pitch=(midi:number)=>({midi,start:0,duration:.123,confidence:1});
  it('does not infer intervals for unknown keys',()=>expect(mapMelody([pitch(60)],defaults)).toEqual({notes:[],skipped:1,shifted:0}));
  it('uses one confirmed mouse action and preserves duration',()=>{const result=mapMelody([pitch(59)],{...defaults,mapping:[60,null,null,null,null,null,null,null],offsets:{left:-1,middle:1,right:12}});expect(result.notes[0]).toEqual({key:'Z',mouse:'left',midi:59,start:0,duration:.123});});
  it('never combines mouse modifiers to invent a pitch',()=>{const result=mapMelody([pitch(71)],{...defaults,mapping:[60,null,null,null,null,null,null,null],offsets:{left:-1,middle:1,right:12}});expect(result.notes).toEqual([]);});
  it('prefers exact base pitch over octave shift',()=>{const result=mapMelody([pitch(72)],{...defaults,mapping:[60,72,null,null,null,null,null,null],allowOctaveShift:true});expect(result.notes[0].key).toBe('X');expect(result.shifted).toBe(0);});
  it('folds only to a confirmed pitch of the same class when enabled',()=>{const settings={...defaults,mapping:[60,null,null,null,null,null,null,null]};expect(mapMelody([pitch(72)],settings).notes).toEqual([]);expect(mapMelody([pitch(72),pitch(73)],{...settings,allowOctaveShift:true})).toMatchObject({skipped:1,shifted:1});});
  it('keeps adjacent keyboard notes independent while combining mouse holds',()=>{const notes=[{key:'Z' as const,mouse:'left' as const,start:0,duration:.2},{key:'Z' as const,mouse:'left' as const,start:.2,duration:.3}];expect(mouseHolds(notes,true)).toEqual([{mouse:'left',start:0,end:.5}]);expect(mouseHolds(notes,false)).toHaveLength(2);expect(notes).toHaveLength(2);});
});
describe('time-accurate falling notes',()=>{
  const score:Score={...testScore(),duration:20,sourceDuration:20,segment:[0,20],notes:[{key:'Z',mouse:'none',start:0,duration:1},{key:'X',mouse:'none',start:12,duration:1}]};
  it('compresses only long empty intervals',()=>{const spans=timeline(score);expect(playToOriginal(spans,1.25)).toBeCloseTo(9);expect(playToOriginal(spans,4.25)).toBeCloseTo(12);expect(originalToPlay(spans,12)).toBeCloseTo(4.25);});
  it('keeps original time when transport is paused',()=>{expect(positionAt({score,state:'paused',position:7,anchor:0,countdownEnd:0},99999)).toBe(7);});
  it('advances against one anchor and freezes ended state',()=>{expect(positionAt({score,state:'playing',position:12,anchor:1000,countdownEnd:0},1500)).toBeCloseTo(12.5);expect(positionAt({score,state:'ended',position:13,anchor:0,countdownEnd:0},99999)).toBe(13);});
  it('uses the same speed and actual duration for short and long notes',()=>{const short=noteGeometry(2,.05,1,2,400),long=noteGeometry(2,2,1,2,400);expect(short.bottom).toBe(long.bottom);expect(long.height/short.height).toBeCloseTo(40);expect(noteGeometry(2,.05,2,2,400).bottom).toBe(400);});
});
describe('versioned scores and safe settings',()=>{
  it('loads both built-in test data and exported test DHScore',()=>{expect(scoreSchema.safeParse(testScore()).success).toBe(true);expect(scoreSchema.safeParse(JSON.parse(readFileSync('fixtures/TEST_eight_lanes.dhscore','utf8'))).success).toBe(true);});
  it('rejects chords, invalid lengths and unknown fields',()=>{const score=testScore();expect(scoreSchema.safeParse({...score,notes:[{...score.notes[0],duration:-1}]}).success).toBe(false);expect(scoreSchema.safeParse({...score,notes:[score.notes[0],score.notes[0]]}).success).toBe(false);expect(scoreSchema.safeParse({...score,audio:'secret'}).success).toBe(false);});
  it('accepts earlier version-1 scores without timing metadata',()=>expect(scoreSchema.parse(testScore()).timing).toBeUndefined());
  it('rejects invalid visual values and retains blank pitch calibration',()=>{expect(settingsSchema.safeParse({...defaults,leadTime:4}).success).toBe(false);expect(settingsSchema.safeParse({...defaults,theme:'red'}).success).toBe(false);expect(settingsSchema.parse(defaults).mapping).toEqual(Array(8).fill(null));});
  it('migrates obsolete inference settings without losing calibration',()=>{const result=settingsSchema.parse({...defaults,mapping:[60,null,null,null,null,null,null,null],inferenceBackend:'cpu'});expect(result.mapping[0]).toBe(60);expect('inferenceBackend' in result).toBe(false);});
  it('presents filesystem and malformed JSON errors in plain Chinese',()=>{expect(userMessage(Object.assign(new Error('raw'),{code:'EACCES'}))).toContain('权限');expect(userMessage(new SyntaxError('raw'))).toContain('有效');});
});
