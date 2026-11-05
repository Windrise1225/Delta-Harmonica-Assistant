import type { GameNote } from '../core/schema';

type LabelGeometry = {
  centerX: number;
  headY: number;
  laneWidth: number;
  bodyWidth: number;
  top: number;
  line: number;
  labelTop?: number;
};
type LabelLayout = {
  keySize: number;
  markerSize: number;
  keyWidth: number;
  contentWidth: number;
  width: number;
  height: number;
  gap: number;
  iconWidth: number;
  iconHeight: number;
};
const mouseMarkers = { left: 'L', middle: 'M', right: 'R' } as const;

export function noteLabelHeight(laneWidth: number) {
  return Math.max(14, Math.min(18, Math.floor(laneWidth * .3))) + 8;
}

/** Heads are in score order, from the lowest/earliest to the highest/latest.
 * Pack badges within their lane at the entry/hold boundaries, independently
 * of the timed note bodies. The max/min operations move continuously in time. */
export function noteLabelTops(heads: readonly number[], height: number, top: number, line: number) {
  const available = Math.max(0, line - top - height);
  const spacing = heads.length > 1 ? Math.min(height + 2, available / (heads.length - 1)) : 0;
  const positions = heads.map(head => Math.min(line - height, Math.max(top, head - height)));
  for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.max(positions[i], positions[i + 1] + spacing);
  const overflow = positions.length ? Math.max(0, positions[0] + height - line) : 0;
  return positions.map(position => position - overflow);
}

/** Each mouse glyph supplements the existing key; neither changes note timing. */
export function createNoteLabelPainter(ctx: CanvasRenderingContext2D) {
  let sizeSignature = '';
  const layouts = new Map<string, LabelLayout>();
  return (note: Pick<GameNote, 'key' | 'mouse'>, geometry: LabelGeometry, _light: boolean, layer: 'background' | 'content' | 'all' = 'all') => {
    const { centerX, headY, laneWidth, bodyWidth, top, line } = geometry;
    if (headY < top) return;
    const signature = `${laneWidth}:${bodyWidth}`;
    if (signature !== sizeSignature) { layouts.clear(); sizeSignature = signature; }
    const special = note.mouse !== 'none';
    const marker = special ? mouseMarkers[note.mouse as keyof typeof mouseMarkers] : null;
    const cacheKey = `${note.key}:${note.mouse}`;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    let layout = layouts.get(cacheKey);
    if (!layout) {
      const keySize = noteLabelHeight(laneWidth) - 8;
      const markerSize = Math.max(10, Math.round(keySize * .65));
      const gap = keySize >= 18 ? 6 : 4;
      const iconWidth = keySize >= 18 ? 10 : 9, iconHeight = keySize >= 18 ? 14 : 12;
      ctx.font = `700 ${keySize}px Segoe UI`;
      const keyWidth = ctx.measureText(note.key).width;
      ctx.font = `600 ${markerSize}px Segoe UI`;
      const contentWidth = keyWidth + (marker ? gap + iconWidth + 3 + ctx.measureText(marker).width : 0);
      layout = { keySize, markerSize, keyWidth, contentWidth, gap, iconWidth, iconHeight,
        width: Math.min(laneWidth - 6, Math.max(special ? bodyWidth : 32, contentWidth + 10)),
        height: keySize + 8 };
      layouts.set(cacheKey, layout);
    }
    // The legible head badge can exceed a tiny note's body, but the timed body
    // remains its true height. A held note keeps its badge above the judgment line.
    const y = geometry.labelTop ?? Math.min(line - layout.height, Math.max(top, headY - layout.height));
    const middle = y + layout.height / 2;
    const accent = '#8056AC';
    if (layer !== 'content') {
      const glass = ctx.createLinearGradient(0, y, 0, y + layout.height);
      glass.addColorStop(0, '#FFFFFFF7');
      glass.addColorStop(1, '#E9DDF7F2');
      ctx.fillStyle = glass;
      ctx.strokeStyle = '#A783CBE6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(centerX - layout.width / 2, y, layout.width, layout.height, 6);
      ctx.fill(); ctx.stroke();
    }
    if (layer === 'background') { ctx.restore(); return; }
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${layout.keySize}px Segoe UI`;
    ctx.fillStyle = '#40344C';
    ctx.textAlign = special ? 'left' : 'center';
    const start = centerX - layout.contentWidth / 2;
    // Always render the required keyboard key, including the literal comma key.
    ctx.fillText(note.key, special ? start : centerX, middle);
    if (marker) {
      const iconX = start + layout.keyWidth + layout.gap;
      ctx.save();
      ctx.translate(iconX, middle - layout.iconHeight / 2);
      ctx.strokeStyle = accent;
      ctx.fillStyle = '#F3ECFA';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.roundRect(0, 0, layout.iconWidth, layout.iconHeight, 4); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = accent;
      if (note.mouse === 'left') ctx.fillRect(0, 0, layout.iconWidth / 2, layout.iconHeight * .43);
      if (note.mouse === 'right') ctx.fillRect(layout.iconWidth / 2, 0, layout.iconWidth / 2, layout.iconHeight * .43);
      if (note.mouse === 'middle') ctx.fillRect(layout.iconWidth / 2 - 1, 2, 2, 5);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(layout.iconWidth / 2, 1); ctx.lineTo(layout.iconWidth / 2, layout.iconHeight * .43);
      ctx.moveTo(1, layout.iconHeight * .43); ctx.lineTo(layout.iconWidth - 1, layout.iconHeight * .43); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = accent;
      ctx.font = `600 ${layout.markerSize}px Segoe UI`;
      ctx.textAlign = 'left';
      ctx.fillText(marker, iconX + layout.iconWidth + 3, middle);
    }
    ctx.restore();
  };
}
