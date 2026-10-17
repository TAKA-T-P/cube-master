/**
 * 学習ヘルプの図（SVG）と、ヘルプの中身・ポップアップ
 *
 * 立体の図は、頂点の座標から core/inscribedSolids の凸包で面を作り、立方体の見取図と同じ向き（右手前の斜め上）から描く。
 * 見えない辺は点線にする。どれも一般的な例で、出題中の問題の頂点・答えは使わない。
 */
import { h } from '../utils/dom.js';
import { convexHull } from '../core/inscribedSolids.js';
import { vToNumbers } from '../core/rational.js';
import { getHelpTopic } from '../core/learningHelp.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}
const text = (x, y, str, attrs = {}) => svg('text', { x, y, 'font-size': 11, 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...attrs }, document.createTextNode(str));

const VIEW = (() => {
  const v = [4, 3, 5];
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
})();
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const RIGHT = (() => {
  const r = cross([0, 1, 0], VIEW);
  const l = Math.hypot(...r);
  return r.map((x) => x / l);
})();
const UP = cross(VIEW, RIGHT);

/** 立方体（一辺 2）の頂点 */
const C = { A: [-1, 1, 1], B: [1, 1, 1], C: [1, 1, -1], D: [-1, 1, -1], E: [-1, -1, 1], F: [1, -1, 1], G: [1, -1, -1], H: [-1, -1, -1] };
const pts = (ids) => ids.split('').map((id) => C[id]);

/** 図のカタログ（座標はどれも整数） */
const SHAPES = {
  prism: { points: [[-2, -1, 1], [2, -1, 1], [-2, -1, -2], [-2, 1, 1], [2, 1, 1], [-2, 1, -2]], base: (n) => n[1] < 0, height: [[-2, -1, -2], [-2, 1, -2]], labels: [{ at: [0, -1.6, 0], text: '底面', color: '#1e66d0' }, { at: [-2.6, 0, -2], text: '高さ', color: '#d9480f' }] },
  pyramid: { points: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], [0, 1, 0]], base: (n) => n[1] < 0, height: [[0, 1, 0], [0, -1, 0]], dashedHeight: true, labels: [{ at: [0, 1.4, 0], text: '頂点', color: '#333' }, { at: [0.45, 0, 0], text: '高さ', color: '#d9480f' }, { at: [0, -1.7, 1], text: '底面', color: '#1e66d0' }] },
  triPrism: { points: [[-1, -1, 1], [1, -1, 1], [-1, -1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1]], caption: '三角柱' },
  quadPrism: { points: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]].map(([x, y, z]) => [x, y * 2, z]), caption: '四角柱' },
  triPyramid: { points: [[-1, -1, 1], [1, -1, 1], [0, -1, -1], [0, 1, 0]], caption: '三角錐（四面体）' },
  quadPyramid: { points: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], [0, 1, 0]], caption: '四角錐' },
  hexahedron: { points: pts('ABCDEFGH'), caption: '六面体（立方体）' },
  octahedron: { points: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], caption: '八面体' },
  regTetra: { points: pts('ACFH'), caption: '正四面体', frame: true },
  cube: { points: pts('ABCDEFGH'), caption: '立方体（正六面体）' },
  regOcta: { points: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], caption: '正八面体', frame: true },
};

/** 凸な立体の図（見えない辺は点線。base が true の面は青く塗る） */
function solidSvg(shape, { size = 110 } = {}) {
  const hull = convexHull(shape.points);
  const S = 26;
  const P = (w) => [S * dot(w, RIGHT), -S * dot(w, UP)];
  const faces = hull.faces.map((f) => ({ poly: f.polygon.map(vToNumbers), normal: vToNumbers(f.normal) }));
  const front = (f) => dot(f.normal, VIEW) > 1e-9;
  const edgeVisible = (a, b) => faces.some((f) => front(f) && f.poly.some((p) => p.join() === a.join()) && f.poly.some((p) => p.join() === b.join()));
  const parts = [];
  // 外わくの立方体（正四面体・正八面体が立方体の中にあることを示す）
  if (shape.frame) {
    const cube = convexHull(pts('ABCDEFGH'));
    for (const [a, b] of cube.edges.map((e) => e.map(vToNumbers))) parts.push(svg('line', { x1: P(a)[0], y1: P(a)[1], x2: P(b)[0], y2: P(b)[1], stroke: '#b8c4d2', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  }
  for (const f of faces.filter(front)) {
    const isBase = shape.base?.(f.normal);
    parts.push(svg('polygon', { points: f.poly.map((p) => P(p).map((v) => v.toFixed(1)).join(',')).join(' '), fill: isBase ? '#9cc7f5' : '#e3f1fb', 'fill-opacity': 0.9, stroke: 'none' }));
  }
  // 底面がうしろ向き（下）でも、色で示す
  for (const f of faces.filter((x) => !front(x) && shape.base?.(x.normal))) {
    parts.push(svg('polygon', { points: f.poly.map((p) => P(p).map((v) => v.toFixed(1)).join(',')).join(' '), fill: '#9cc7f5', 'fill-opacity': 0.55, stroke: 'none', 'data-base': '' }));
  }
  for (const [a, b] of hull.edges.map((e) => e.map(vToNumbers))) {
    const vis = edgeVisible(a, b);
    parts.push(svg('line', { x1: P(a)[0], y1: P(a)[1], x2: P(b)[0], y2: P(b)[1], stroke: '#1f4e9c', 'stroke-width': vis ? 1.8 : 1.2, 'stroke-dasharray': vis ? undefined : '4 3', 'stroke-linecap': 'round' }));
  }
  if (shape.height) {
    const [a, b] = shape.height;
    parts.push(svg('line', { x1: P(a)[0], y1: P(a)[1], x2: P(b)[0], y2: P(b)[1], stroke: '#d9480f', 'stroke-width': 2.4, 'stroke-dasharray': shape.dashedHeight ? '5 3' : undefined, 'data-height': '' }));
  }
  for (const l of shape.labels ?? []) {
    const [x, y] = P(l.at);
    parts.push(text(x, y, l.text, { fill: l.color }));
  }
  const all = [...shape.points, ...(shape.frame ? pts('ABCDEFGH') : []), ...(shape.labels ?? []).map((l) => l.at)].map(P);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 12;
  const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2].map((v) => v.toFixed(1)).join(' ');
  return svg('svg', { viewBox, class: 'help-figure__svg', width: size, role: 'img', 'aria-hidden': 'true', 'data-shape': hull.faces.length }, parts);
}

/** ねじれの位置の図：立方体の辺を色分け（平行・交わる・ねじれの位置） */
function skewSvg() {
  const S = 34;
  const P = (w) => [S * dot(w, RIGHT), -S * dot(w, UP)];
  const cube = convexHull(pts('ABCDEFGH'));
  const parts = [];
  for (const [a, b] of cube.edges.map((e) => e.map(vToNumbers))) parts.push(svg('line', { x1: P(a)[0], y1: P(a)[1], x2: P(b)[0], y2: P(b)[1], stroke: '#9aa8b8', 'stroke-width': 1.2 }));
  const seg = (u, v, color, label) => {
    const [a, b] = [C[u], C[v]].map(P);
    return [
      svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round', 'data-pair': label }),
      text((a[0] + b[0]) / 2 + 9, (a[1] + b[1]) / 2 - 8, `${u}${v}`, { fill: color }),
    ];
  };
  // 基準の辺 AB と、平行な DC（青）・交わる BF（緑）・ねじれの位置の CG（赤）
  parts.push(...seg('A', 'B', '#222', 'base'), ...seg('D', 'C', '#1e66d0', 'parallel'), ...seg('B', 'F', '#17a34a', 'intersect'), ...seg('C', 'G', '#e03131', 'skew'));
  for (const [id, p] of Object.entries(C)) {
    const [x, y] = P(p);
    parts.push(text(x + (p[0] > 0 ? 9 : -9), y + (p[1] > 0 ? -7 : 8), id, { fill: '#1f4e9c', 'font-size': 10 }));
  }
  const all = Object.values(C).map(P);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const viewBox = [Math.min(...xs) - 18, Math.min(...ys) - 18, Math.max(...xs) - Math.min(...xs) + 36, Math.max(...ys) - Math.min(...ys) + 36].map((v) => v.toFixed(1)).join(' ');
  return svg('svg', { viewBox, class: 'help-figure__svg', width: 170, role: 'img', 'aria-hidden': 'true', 'data-figure': 'skew' }, parts);
}

/** 図を1つ描く */
export function renderHelpFigure(id) {
  if (id === 'skew') return h('figure', { class: 'help-figure help-figure--wide' }, skewSvg(), h('figcaption', {}, '辺ABと、平行な辺DC・交わる辺BF・ねじれの位置にある辺CG'));
  const shape = SHAPES[id];
  if (!shape) return null;
  const wide = id === 'prism' || id === 'pyramid';
  return h('figure', { class: `help-figure ${wide ? 'help-figure--wide' : ''}` }, solidSvg(shape, { size: wide ? 170 : 96 }), shape.caption ? h('figcaption', {}, shape.caption) : null);
}

/** ヘルプ1つ分の中身（説明・式・図・ポイント） */
export function renderHelpTopic(topicId) {
  const t = getHelpTopic(topicId);
  if (!t) return null;
  return h(
    'div',
    { class: 'help-topic', dataset: { topic: t.id } },
    h('p', { class: 'help-topic__lead' }, t.lead),
    t.formula ? h('p', { class: 'help-topic__formula' }, t.formula) : null,
    h('div', { class: 'help-topic__figures' }, t.figures.map(renderHelpFigure)),
    h('ul', { class: 'help-topic__points' }, t.points.map((p) => h('li', {}, p))),
  );
}
