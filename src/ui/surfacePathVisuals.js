/**
 * 立方体の一部の面を広げた図と、その上の道（SVG）
 *
 * 面の位置・道の点は core/cubeSurfaceUnfolding で広げた座標（1マス = 立方体の一辺 2）をそのまま描く。
 * 選択肢の図は frame（どの図にも共通の大きさ）の中に同じ縮尺で描くので、道の長さをくらべられる。
 */
import { h } from '../utils/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

const S = 22; // 1単位の大きさ

/**
 * @param {{ faces: { corners: number[][], letters: string[] }[], points: { label: string, at: number[] }[], path: number[][], frame?: number[] }} visual
 */
export function renderPathNetSvg({ faces, points, path, frame }) {
  const P = ([x, y]) => [x * S, -y * S];
  const all = [...faces.flatMap((f) => f.corners), ...path].map(P);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const w = Math.max(frame ? frame[0] * S : 0, Math.max(...xs) - Math.min(...xs));
  const hgt = Math.max(frame ? frame[1] * S : 0, Math.max(...ys) - Math.min(...ys));
  const pad = 16;
  const viewBox = [cx - w / 2 - pad, cy - hgt / 2 - pad, w + pad * 2, hgt + pad * 2].map((v) => v.toFixed(1)).join(' ');

  // 頂点の文字（同じ位置・同じ文字は1つだけ）。面の外側へ少しずらす
  const seen = new Set();
  const letters = [];
  for (const f of faces) {
    const center = P([f.corners.reduce((s, c) => s + c[0], 0) / 4, f.corners.reduce((s, c) => s + c[1], 0) / 4]);
    f.corners.forEach((c, i) => {
      const [x, y] = P(c);
      const key = `${f.letters[i]}@${x.toFixed(1)},${y.toFixed(1)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const dx = x - center[0];
      const dy = y - center[1];
      const len = Math.hypot(dx, dy) || 1;
      letters.push(
        svg('text', { x: (x + (dx / len) * 8).toFixed(1), y: (y + (dy / len) * 8).toFixed(1), 'font-size': 9, 'font-weight': 700, fill: '#1f4e9c', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, document.createTextNode(f.letters[i])),
      );
    });
  }

  return svg(
    'svg',
    { viewBox, class: 'figure-svg path-net-figure', role: 'img', 'aria-hidden': 'true', 'data-faces': faces.length },
    faces.map((f) =>
      svg('polygon', { points: f.corners.map(P).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), fill: '#e3f1fb', stroke: '#1f4e9c', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
    ),
    svg('polyline', { points: path.map(P).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), fill: 'none', stroke: '#c2185b', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-path': '' }),
    points.map((pt) => {
      const [x, y] = P(pt.at);
      return svg(
        'g',
        { 'data-point': pt.label },
        svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.6, fill: '#f06a00' }),
        pt.label ? svg('text', { x: (x + 6).toFixed(1), y: (y - 6).toFixed(1), 'font-size': 10, 'font-weight': 800, fill: '#c2410c' }, document.createTextNode(pt.label)) : null,
      );
    }),
    letters,
  );
}

/** 図（visual）を描く。展開図の道の図でなければ null */
export function renderPathNetVisual(visual) {
  if (visual?.type !== 'pathNet') return null;
  return h('figure', { class: 'figure figure--path-net' }, renderPathNetSvg(visual), visual.caption ? h('figcaption', {}, visual.caption) : null);
}
