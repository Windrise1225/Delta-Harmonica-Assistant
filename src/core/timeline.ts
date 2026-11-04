import type { Score, Transport } from './schema';
export type Span = { start: number; end: number; playStart: number };
export function timeline(score: Score): Span[] {
  const end = score.notes.at(-1)!.start + score.notes.at(-1)!.duration;
  const cuts: {start:number;end:number}[] = []; let last = 0;
  for (const note of score.notes) { if (note.start-last>5) cuts.push({start:last+.25,end:note.start-3}); last=note.start+note.duration; }
  const out: Span[]=[]; let original=0, play=0;
  for(const cut of cuts) { out.push({start:original,end:cut.start,playStart:play}); play+=cut.start-original; original=cut.end; }
  out.push({start:original,end,playStart:play}); return out;
}
export function originalToPlay(spans: Span[], time: number): number {
  for (const s of spans) { if (time <= s.end) return s.playStart + Math.max(0,time-s.start); }
  const s=spans.at(-1)!; return s.playStart+s.end-s.start;
}
export function playToOriginal(spans: Span[], time: number): number {
  for (const s of spans) if (time < s.playStart+s.end-s.start) return s.start+Math.max(0,time-s.playStart);
  return spans.at(-1)!.end;
}
export function positionAt(t: Transport, now: number): number {
  if (!t.score || t.state !== 'playing') return t.position;
  const spans=getTimeline(t.score);
  return playToOriginal(spans,originalToPlay(spans,t.position)+(now-t.anchor)/1000);
}
export function noteGeometry(start: number, duration: number, position: number, lead: number, lineY: number, top=30) {
  const speed=(lineY-top)/lead;
  return { y: lineY-(start+duration-position)*speed, height: duration*speed, bottom: lineY-(start-position)*speed };
}
export function formatTime(value:number) { const s=Math.max(0,Math.floor(value)); return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
const timelineCache=new WeakMap<Score,Span[]>();
export function getTimeline(score:Score){let spans=timelineCache.get(score);if(!spans){spans=timeline(score);timelineCache.set(score,spans);}return spans;}
