import { z } from 'zod';
export const KEYS = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const;
export const mouseSchema = z.enum(['none', 'left', 'middle', 'right']);
export type MouseAction = z.infer<typeof mouseSchema>;
const maxTime = 86400;
export const noteSchema = z.object({ key: z.enum(KEYS), start: z.number().finite().min(0).max(maxTime), duration: z.number().finite().positive().max(maxTime), mouse: mouseSchema, midi: z.number().int().min(0).max(127).optional() }).strict();
export const timingSchema = z.object({
  ppq: z.number().int().positive().max(32767),
  tempos: z.array(z.object({ ticks:z.number().int().nonnegative(), time:z.number().finite().nonnegative(), bpm:z.number().finite().positive().max(10000) })).min(1).max(10000),
  meters: z.array(z.object({ ticks:z.number().int().nonnegative(), numerator:z.number().int().positive().max(255), denominator:z.number().int().positive().max(128) })).min(1).max(10000)
});
export type Timing = z.infer<typeof timingSchema>;
export type GameNote = z.infer<typeof noteSchema>;
export const scoreSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), name: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(), lastUsed: z.string().datetime().optional(),
  duration: z.number().finite().positive().max(maxTime),
  sourceDuration: z.number().finite().positive().max(maxTime),
  segment: z.tuple([z.number().finite().min(0), z.number().finite().max(maxTime)]),
  sourceId: z.string().max(128).optional(), bpm: z.number().finite().positive().max(10000).nullable(),
  timing: timingSchema.optional(),
  test: z.boolean().default(false), notes: z.array(noteSchema).min(1).max(50000)
}).strict().superRefine((s, ctx) => {
  if (s.segment[1] <= s.segment[0] || s.segment[1] > s.sourceDuration + .01 || Math.abs(s.segment[1] - s.segment[0] - s.duration) > .02) ctx.addIssue({ code: 'custom', message: '片段区间无效' });
  let end = 0;
  for (const n of s.notes) {
    if (n.start + 1e-6 < end || n.start + n.duration > s.duration + .001) { ctx.addIssue({ code: 'custom', message: '曲谱存在和弦、重叠或越界音符' }); break; }
    end = n.start + n.duration;
  }
});
export type Score = z.infer<typeof scoreSchema>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const alpha = z.number().min(0).max(1);
export const settingsSchema = z.preprocess(value=>{
  // Preserve existing settings while removing the obsolete AI-only setting.
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const clean={...value} as Record<string,unknown>;delete clean.inferenceBackend;return clean;
  }
  return value;
},z.object({
  language: z.enum(['zh', 'en']), theme: color, laneColors: z.array(color).length(8), noteColor: color.nullable().default(null),
  backgroundOpacity: alpha, trackOpacity: alpha, noteOpacity: alpha, lineOpacity: alpha,
  leadTime: z.number().min(.5).max(3), clickThrough: z.boolean(), locked: z.boolean(),
  overlayBounds: z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(480).max(7680), height: z.number().int().min(280).max(4320) }).nullable(),
  displayId: z.number().int().nullable(), focusBehavior: z.enum(['show', 'hide', 'pause']), gameExecutable: z.string().max(100).regex(/^(?:[\w. -]+\.exe)?$/i),
  mapping: z.array(z.number().int().min(0).max(127).nullable()).length(8),
  offsets: z.object({ left: z.number().int().min(-48).max(0).nullable(), middle: z.number().int().min(-1).max(1).nullable(), right: z.number().int().min(0).max(48).nullable() }),
  continuousMouse: z.boolean(), allowOctaveShift: z.boolean()
}).strict());
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  language: 'zh', theme: '#A77BD1', noteColor:null, laneColors: ['#C8A7EA','#B99AD7','#D6B9EC','#A77BD1','#C1A0DA','#DAC4EB','#B58BCF','#D1AFE6'],
  backgroundOpacity: 0, trackOpacity: .08, noteOpacity: .85, lineOpacity: .9,
  leadTime: 2, clickThrough: true, locked: false, overlayBounds: null, displayId: null,
  focusBehavior: 'show', gameExecutable: '', mapping: Array(8).fill(null),
  offsets: { left: null, middle: null, right: null }, continuousMouse: true, allowOctaveShift: false
};
const coverBase={seed:z.string().regex(/^[a-f0-9]{32}$/),version:z.literal(1)};
export const coverSchema=z.discriminatedUnion('kind',[
  z.object({...coverBase,kind:z.literal('generated')}),
  z.object({...coverBase,kind:z.literal('custom'),file:z.string().regex(/^[a-f0-9]{64}\.png$/)})
]);
export const librarySchema = z.object({ settings: settingsSchema, scores: z.array(scoreSchema).max(2000),covers:z.record(z.string().uuid(),coverSchema).default({}) }).strict();
export type Library = z.infer<typeof librarySchema>;
export type PitchNote = { start: number; duration: number; midi: number; confidence: number };
export type Transport = { state: 'idle' | 'countdown' | 'playing' | 'paused' | 'ended'; position: number; anchor: number; countdownEnd: number; score: Score | null };
export const emptyTransport: Transport = { state: 'idle', position: 0, anchor: 0, countdownEnd: 0, score: null };
