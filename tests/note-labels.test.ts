import { describe, expect, it } from 'vitest';
import { createNoteLabelPainter, noteLabelTops } from '../src/components/noteLabels';
import { noteGeometry } from '../src/core/timeline';
import { KEYS, noteSchema, type GameNote } from '../src/core/schema';

function recorder() {
  const texts: { text: string; x: number; y: number; font: string; color: string }[] = [];
  const gradients: {offset:number;color:string}[][] = [];
  const rectangles: number[][] = [];
  const ctx = {
    font: '', save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, clip() {}, translate() {}, moveTo() {}, lineTo() {}, fillRect() {},
    roundRect(...args: number[]) { rectangles.push(args); },
    measureText(text: string) { return { width: text.length * 11 }; },
    createLinearGradient() { const stops:{offset:number;color:string}[]=[];gradients.push(stops);return { addColorStop(offset:number,color:string) {stops.push({offset,color});} }; },
    fillText(this: {font: string;fillStyle: unknown}, text: string, x: number, y: number) { texts.push({ text, x, y, font: this.font, color: String(this.fillStyle) }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texts, rectangles, gradients, paint: createNoteLabelPainter(ctx) };
}
const geometry = { centerX: 80, headY: 200, laneWidth: 100, bodyWidth: 68, top: 85, line: 300 };
describe('falling-note keyboard and optional mouse labels', () => {
  it('uses pearl/lavender glass and dark purple letters on the transparent overlay', () => {
    const r=recorder();r.paint({key:'Z',mouse:'left'},geometry,false);
    expect(r.gradients[0]).toEqual([{offset:0,color:'#FFFFFFF7'},{offset:1,color:'#E9DDF7F2'}]);
    expect(r.texts.map(text=>text.color)).toEqual(['#40344C','#8056AC']);
  });
  it.each(KEYS)('renders only the %s key for an ordinary note', key => {
    const r = recorder();
    r.paint({ key, mouse: 'none' }, geometry, true);
    expect(r.texts.map(t => t.text)).toEqual([key]);
    expect(r.texts[0].x).toBe(geometry.centerX);
    expect(r.rectangles).toHaveLength(1); // Badge only; no mouse outline.
  });
  it.each([['Z', 'left', 'L'], ['C', 'middle', 'M'], ['V', 'right', 'R']] as const)('keeps %s beside the %s mouse glyph', (key, mouse, marker) => {
    const r = recorder(); r.paint({ key, mouse }, geometry, true);
    expect(r.texts.map(t => t.text)).toEqual([key, marker]);
    expect(r.texts[0].x).toBeLessThan(r.texts[1].x);
    expect(r.texts[0].y).toBe(r.texts[1].y);
    expect(r.rectangles).toHaveLength(2); // Badge plus vector mouse outline.
  });
  it.each(['none', 'right'] as const)('keeps a long %s note visible throughout its hold without changing duration', mouse => {
    const note: GameNote = { key: 'V', mouse, start: 1, duration: 3 };
    const original = { ...note };
    for (const position of [1, 2, 3.999]) {
      const r = recorder(); const g = noteGeometry(note.start, note.duration, position, 2, 300, 85);
      r.paint(note, { ...geometry, headY: g.bottom }, false);
      expect(r.texts.map(t => t.text)).toEqual(mouse === 'none' ? ['V'] : ['V', 'R']);
      expect(r.rectangles[0][1] + r.rectangles[0][3]).toBeLessThanOrEqual(geometry.line);
    }
    expect(note).toEqual(original);
  });
  it('keeps labels readable on 15ms notes and within a minimum-width overlay lane', () => {
    const r = recorder();
    const g = noteGeometry(1, .015, .99, 2, 300, 85);
    r.paint({ key: 'C', mouse: 'middle' }, { ...geometry, headY: g.bottom, laneWidth: 52.5, bodyWidth: 35.7 }, false);
    expect(g.height).toBeLessThan(2);
    expect(r.rectangles[0][3]).toBeGreaterThanOrEqual(22);
    expect(r.rectangles[0][2]).toBeLessThanOrEqual(52.5 - 6);
    expect(r.texts.map(t => t.text)).toEqual(['C', 'M']);
  });
  it('does not attach labels to notes whose heads have not entered the field', () => {
    const r = recorder(); r.paint({ key: 'Z', mouse: 'left' }, { ...geometry, headY: 84 }, true);
    expect(r.texts).toEqual([]);
  });
  it('keeps consecutive notes independent, even with a shared mouse hold', () => {
    const r = recorder();
    for (const headY of [140, 180, 220]) r.paint({ key: 'Z', mouse: 'left' }, { ...geometry, headY }, true);
    expect(r.texts.map(t => t.text)).toEqual(['Z', 'L', 'Z', 'L', 'Z', 'L']);
    expect(new Set(r.texts.filter(t => t.text === 'Z').map(t => t.y)).size).toBe(3);
  });
  it('can draw every badge before foreground text so dense notes do not erase letters', () => {
    const r = recorder();
    r.paint({ key: 'Z', mouse: 'none' }, geometry, true, 'background');
    r.paint({ key: 'Z', mouse: 'none' }, { ...geometry, headY: 218 }, true, 'background');
    expect(r.texts).toEqual([]);
    expect(r.rectangles).toHaveLength(2);
    r.paint({ key: 'Z', mouse: 'none' }, geometry, true, 'content');
    r.paint({ key: 'Z', mouse: 'none' }, { ...geometry, headY: 218 }, true, 'content');
    expect(r.texts.map(t => t.text)).toEqual(['Z', 'Z']);
    expect(r.rectangles).toHaveLength(2);
  });
  it('continues to validate the original v1 key/mouse storage format', () => {
    expect(noteSchema.safeParse({ start: 0, duration: 1, mouse: 'left' }).success).toBe(false);
    expect(noteSchema.parse({ key: 'Z', start: 0, duration: 1, mouse: 'none' })).toEqual({ key: 'Z', start: 0, duration: 1, mouse: 'none' });
  });
  it('separates dense incoming labels without leaving the field or moving their note heads', () => {
    const heads = [278, 239, 200, 162, 123, 85];
    const copy = [...heads];
    const positions = noteLabelTops(heads, 26, 85, 300);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(85);
    expect(Math.max(...positions) + 26).toBeLessThanOrEqual(300);
    positions.slice(1).forEach((position, i) => expect(positions[i] - position).toBeGreaterThanOrEqual(26));
    expect(heads).toEqual(copy);
  });
  it('keeps the active hold and its following note separate at the judgment line', () => {
    const positions = noteLabelTops([500, 297], 26, 85, 300);
    expect(positions[0] + 26).toBe(300);
    expect(positions[0] - positions[1]).toBeGreaterThanOrEqual(26);
  });
});
