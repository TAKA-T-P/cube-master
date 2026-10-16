/**
 * マーク（〇◎×●◇◆）の SVG 描画
 *
 * 文字（フォント）で描くと端末によって位置がずれるので、core/cubeFaceLabels の MARK_SHAPES の
 * 図形データから描く。3D の面（three/faceDecoration）も同じデータから描くので、形と位置がそろう。
 */
import { MARK_SHAPES } from '../core/cubeFaceLabels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

/** 図形で描けるマークか */
export const hasMarkShape = (face) => face?.kind === 'symbol' && Boolean(MARK_SHAPES[face.value]);

/** マーク（中心 0,0・一辺 1 の正方形の中）。transform で位置と大きさを決める */
export function markShape(value, color, transform) {
  return svg(
    'g',
    { class: 'mark', 'data-mark': value, transform },
    MARK_SHAPES[value].map((s) => {
      const paint = s.fill
        ? { fill: color }
        : { fill: 'none', stroke: color, 'stroke-width': s.stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      if (s.type === 'circle') return svg('circle', { cx: 0, cy: 0, r: s.r, ...paint });
      if (s.type === 'line') return svg('line', { x1: s.from[0], y1: s.from[1], x2: s.to[0], y2: s.to[1], ...paint });
      return svg('polygon', { points: s.points.map((pt) => pt.join(',')).join(' '), ...paint });
    }),
  );
}
