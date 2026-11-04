import { KEYS, type Settings, type PitchNote, type GameNote, type MouseAction } from './schema';
export function mapMelody(notes: PitchNote[], settings: Settings): { notes: GameNote[]; skipped: number; shifted: number } {
  const options: { midi: number; key: typeof KEYS[number]; mouse: MouseAction }[] = [];
  settings.mapping.forEach((midi, i) => {
    if (midi === null) return;
    options.push({ midi, key: KEYS[i], mouse: 'none' });
    for (const mouse of ['left','middle','right'] as const) {
      const offset = settings.offsets[mouse];
      if (offset !== null && offset !== 0) options.push({ midi: midi + offset, key: KEYS[i], mouse });
    }
  });
  const result: GameNote[] = []; let skipped = 0, shifted = 0;
  for (const n of notes) {
    let match = options.find(o => o.midi === n.midi);
    if (!match && settings.allowOctaveShift) {
      match = options.filter(o => (o.midi - n.midi) % 12 === 0).sort((a,b) => Math.abs(a.midi-n.midi)-Math.abs(b.midi-n.midi))[0];
      if (match) shifted++;
    }
    if (!match) { skipped++; continue; }
    result.push({ key: match.key, mouse: match.mouse, midi: match.midi, start: n.start, duration: n.duration });
  }
  return { notes: result, skipped, shifted };
}
export function mouseHolds(notes:GameNote[],continuous:boolean){
  const holds:{start:number;end:number;mouse:Exclude<MouseAction,'none'>}[]=[];
  for(const note of notes){
    if(note.mouse==='none')continue;
    const last=holds.at(-1);
    if(continuous&&last?.mouse===note.mouse&&Math.abs(last.end-note.start)<1e-6)last.end=note.start+note.duration;
    else holds.push({start:note.start,end:note.start+note.duration,mouse:note.mouse});
  }
  return holds;
}
