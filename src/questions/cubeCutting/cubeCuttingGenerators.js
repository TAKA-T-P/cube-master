/**
 * 立方体の切断の問題テンプレート（K01〜K06）
 *
 * 切る平面は、立方体の頂点・辺の中点から選んだ3点で決める。切り口・面積・体積は core/cubeCutting で
 * 有理数のまま正確に計算し、問題文・選択肢・正解・解説・3D（scene.cutting）をすべて同じ計算結果から作る。
 * 正解はハードコードしない。
 *
 * 3D（three/cubeCuttingModel）：回答前は、切る3点だけをオレンジで示す（切り口は見せない）。
 * 回答後は、平面が入る → 切り口が現れる（緑）→ 2つの立体に分かれる、の順に演出する。
 */
import {
  planeFromThreePoints,
  intersectPlaneWithCube,
  classifySectionPolygon,
  splitCubeByPlane,
  classifyPiece,
  polygonArea2,
  SHAPE_SUPERSETS,
  POLYGON_NAMES,
} from '../../core/cubeCutting.js';
import { Q, qvec, vSub, vCross, vLength2, vIsZero, vToNumbers, vDot } from '../../core/rational.js';
import { Surd } from '../../core/surd.js';
import { VERTEX_POINTS, MIDPOINTS, labelPoints, joinPointTexts, pointKey, viewDirectionForPoints } from '../surfacePoints.js';
import { buildElementChoices, multipleChoiceTotal } from '../questionUtils.js';
import { CHOICE_MARKS } from '../decoratedCube.js';
import { shuffle, pick } from '../../utils/random.js';
import * as X from './cubeCuttingExplanations.js';

export const CUTTING_CATEGORY = 'cubeCutting';

/** 切る平面を決める点（頂点 8・辺の中点 12） */
const CUT_POINTS = [...VERTEX_POINTS, ...MIDPOINTS];

const SHAPE_IDS = Object.freeze({
  正三角形: 'eqTriangle',
  二等辺三角形: 'isoTriangle',
  直角三角形: 'rightTriangle',
  三角形: 'triangle',
  正方形: 'square',
  長方形: 'rectangle',
  ひし形: 'rhombus',
  平行四辺形: 'parallelogram',
  台形: 'trapezoid',
  四角形: 'quadrilateral',
  五角形: 'pentagon',
  正六角形: 'regHexagon',
  六角形: 'hexagon',
});

let cache = null;

/**
 * 3点の組み合わせごとの切り口（平面が立方体を2つに分けるものだけ）。一度だけ計算して使い回す
 * @returns {{ key: string, points: object[], plane, section, shape, area2: Q }[]}
 */
export function allCuts() {
  if (cache) return cache;
  const list = [];
  for (let i = 0; i < CUT_POINTS.length; i++) {
    for (let j = i + 1; j < CUT_POINTS.length; j++) {
      for (let k = j + 1; k < CUT_POINTS.length; k++) {
        const points = [CUT_POINTS[i], CUT_POINTS[j], CUT_POINTS[k]];
        const plane = planeFromThreePoints(...points.map((p) => p.position));
        if (!plane) continue;
        const section = intersectPlaneWithCube(plane);
        if (!section.valid) continue;
        list.push({
          key: points.map(pointKey).join('|'),
          points,
          plane,
          section,
          shape: classifySectionPolygon(section),
          area2: polygonArea2(section.polygon.map((p) => p.position)),
        });
      }
    }
  }
  cache = list;
  return list;
}

const splitCache = new Map();
/** 切り分けた2つの立体（必要になったときに計算する） */
export function getSplit(record) {
  if (!splitCache.has(record.key)) splitCache.set(record.key, splitCubeByPlane(record.plane));
  return splitCache.get(record.key);
}

const findCut = (key) => allCuts().find((c) => c.key === key);

/** 問題の点（P・Q・R をつけたもの） */
const givenPoints = (record) => labelPoints(record.points);

/** 回答前・回答後の 3D の点（頂点にはラベルをつけない） */
const scenePoints = (given) => given.map((p) => ({ kind: p.kind, id: p.id, label: p.label, position: [...p.position] }));

const facesOpposite = (faces) => faces.some((f) => faces.some((g) => g !== f && f.split('').every((v) => !g.includes(v))));

/** 切り口の演出（平面が入る → 切り口が現れる → 2つに分かれる） */
const CUT_STEPS = Object.freeze([{ type: 'cutPlane' }, { type: 'cutSection' }, { type: 'cutSplit', to: 1 }]);

function assemble(template, base, { record, given, question, type = 'single', choices, correct, explanation, highlight = [], steps = CUT_STEPS }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: CUTTING_CATEGORY,
    difficulty: template.difficulty,
    type,
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'cutting',
      referenceElements: [],
      cameraPreset: viewDirectionForPoints(given.map((p) => p.position)),
      cutting: { points: scenePoints(given) },
      showLabels: true,
    },
    choices,
    correctAnswers: correct,
    explanation: { text: explanation, highlightElements: highlight, animation: 'highlightElements', reveal: { steps: steps.map((s) => ({ ...s })) } },
  };
}

const planeText = (given) => `${joinPointTexts(given)}の3点を通る平面`;

/** 形の名前の選択肢（答えより広い名前は入れない。例：答えが正方形なら長方形・ひし形は入れない） */
function shapeChoices(answer, rng, { pool }) {
  const banned = new Set([answer, ...(SHAPE_SUPERSETS[answer] ?? [])]);
  const candidates = shuffle(pool.filter((n) => !banned.has(n)), rng);
  // 同じ角の数の名前を先に（まちがえやすい）
  const sides = (n) => (n.includes('三角形') ? 3 : n.includes('六角形') ? 6 : n === '五角形' ? 5 : 4);
  candidates.sort((a, b) => Number(sides(b) === sides(answer)) - Number(sides(a) === sides(answer)));
  return [answer, ...candidates.slice(0, 3)].map((name) => ({ id: SHAPE_IDS[name], label: name }));
}

// ---------- 面積・体積の計算（公式で求めて、座標の計算と一致するものだけ出題する） ----------

const half = new Q(1, 2);

/**
 * 切り口の面積を、形の公式で求める（解説の式）。座標から求めた面積と一致しなければ null
 * @param {Q} u 1単位（立方体の一辺の半分）の長さ（cm）
 */
export function sectionAreaByFormula(record, u) {
  const pts = record.section.polygon.map((p) => p.position);
  const n = pts.length;
  const len = (i, j) => Surd.sqrt(vLength2(vSub(pts[j % n], pts[i % n]))).scale(u);
  const sides = pts.map((_, i) => len(i, i + 1));
  const name = record.shape.name;
  let area = null;
  let text = '';
  if (name === '正三角形') {
    const a = sides[0];
    const h = a.mul(new Surd(half, 3));
    area = a.mul(h).scale(half);
    text = `切り口は1辺${a.format('cm')}の正三角形です。高さは${a}×√3÷2＝${h.format('cm')}なので、面積は${a}×${h}÷2＝${area.format('cm²')}です。`;
  } else if (name === '二等辺三角形') {
    const i = [0, 1, 2].find((k) => sides[(k + 1) % 3].eq(sides[(k + 2) % 3]));
    if (i === undefined) return null;
    const b = sides[i];
    const l = sides[(i + 1) % 3];
    const hb = b.scale(half);
    const h2 = l.square().sub(hb.square());
    if (h2.sign() <= 0) return null;
    const h = Surd.sqrt(h2);
    area = b.mul(h).scale(half);
    text =
      `切り口は、等しい2辺が${l.format('cm')}、残りの1辺が${b.format('cm')}の二等辺三角形です。` +
      `底辺を${b}とすると、高さは三平方の定理から ${sq(l)}−${sq(hb)}＝${h2}より${h.format('cm')}。面積は${b}×${h}÷2＝${area.format('cm²')}です。`;
  } else if (name === '正方形' || name === '長方形') {
    const [a, b] = sides;
    area = a.mul(b);
    text = `切り口は、たて${a.format('cm')}、横${b.format('cm')}の${name}です。面積は${a}×${b}＝${area.format('cm²')}です。`;
  } else if (name === 'ひし形') {
    const d1 = len(0, 2);
    const d2 = len(1, 3);
    area = d1.mul(d2).scale(half);
    text = `切り口はひし形で、2本の対角線の長さは${d1.format('cm')}と${d2.format('cm')}です。面積は${d1}×${d2}÷2＝${area.format('cm²')}です。`;
  } else if (name === '台形' && record.shape.isoscelesTrapezoid) {
    const vec = (i) => vSub(pts[(i + 1) % n], pts[i]);
    const i = vIsZero(vCross(vec(0), vec(2))) ? 0 : 1;
    const [p, q] = [sides[i], sides[i + 2]].sort((x, y) => x.cmp(y));
    const legs = sides[i + 1];
    const diff = q.sub(p);
    const sum = p.add(q);
    if (!diff || !sum) return null;
    const hd = diff.scale(half);
    const h2 = legs.square().sub(hd.square());
    if (h2.sign() <= 0) return null;
    const h = Surd.sqrt(h2);
    area = sum.mul(h).scale(half);
    text =
      `切り口は、平行な2辺が${p.format('cm')}と${q.format('cm')}、残りの2辺が${legs.format('cm')}の台形です。` +
      `高さは三平方の定理から ${sq(legs)}−${sq(hd)}＝${h2}より${h.format('cm')}。面積は（${p}＋${q}）×${h}÷2＝${area.format('cm²')}です。`;
  } else if (name === '正六角形') {
    const a = sides[0];
    const tri = a.mul(a).mul(new Surd(new Q(1, 4), 3));
    area = tri.scale(6);
    text = `切り口は1辺${a.format('cm')}の正六角形で、1辺${a}の正三角形6つに分けられます。正三角形1つの面積は${tri.format('cm²')}なので、${tri}×6＝${area.format('cm²')}です。`;
  } else return null;
  // 座標から求めた面積と一致するか
  const exact = Surd.sqrt(record.area2).scale(u.mul(u));
  if (!area.eq(exact)) return null;
  return { area, text };
}

const sq = X.sq;

/**
 * 小さいほうの立体の体積を、三角すい・三角柱の公式で求める。座標から求めた体積と一致しなければ null
 */
export function pieceVolumeByFormula(record, u) {
  const { pieces } = getSplit(record);
  if (pieces.length !== 2 || pieces[0].volume.eq(pieces[1].volume)) return null;
  const small = pieces[0].volume.cmp(pieces[1].volume) < 0 ? pieces[0] : pieces[1];
  const big = small === pieces[0] ? pieces[1] : pieces[0];
  const info = classifyPiece(small, record.plane);
  const legs = (info.legs2 ?? []).map((l2) => Surd.sqrt(l2).scale(u));
  if (!legs.every((l) => l.isRational())) return null;
  const v = (x) => x.c;
  let volume = null;
  let text = '';
  if (info.kind === 'tetrahedron') {
    const [a, b, c] = legs.map(v).sort((x, y) => y.cmp(x));
    const base = a.mul(b).mul(half);
    volume = base.mul(c).div(3);
    text =
      `小さいほうの立体は、頂点${info.apex}に集まる3本の辺を、${a}cm・${b}cm・${c}cmのところで切ってできる三角すいです。` +
      `底面を直角三角形（${a}×${b}÷2＝${base}cm²）、高さを${c}cmとすると、体積は${base}×${c}÷3＝${volume}cm³です。`;
  } else if (info.kind === 'triangularPrism') {
    const [a, b] = legs.map(v).sort((x, y) => y.cmp(x));
    const height = u.mul(2);
    const base = a.mul(b).mul(half);
    volume = base.mul(height);
    text =
      `小さいほうの立体は、辺${info.edge}にそった三角柱です。底面は、直角をはさむ2辺が${a}cmと${b}cmの直角三角形（${a}×${b}÷2＝${base}cm²）、` +
      `高さは${height}cmなので、体積は${base}×${height}＝${volume}cm³です。`;
  } else return null;
  const u3 = u.mul(u).mul(u);
  if (!volume.eq(small.volume.mul(u3))) return null;
  return { volume, big: big.volume.mul(u3), kind: info.kind, text, small };
}

/** 数の選択肢（正解 + まちがえやすい数。整数の係数・正の数・重複なし・4つ） */
export function surdChoices(answer, candidates, unit) {
  const list = [answer];
  const ok = (x) => x && x.sign() > 0 && x.hasIntegerCoef() && !list.some((y) => y.eq(x));
  for (const c of candidates) if (list.length < 4 && ok(c)) list.push(c);
  for (let k = 2; list.length < 4 && k < 20; k++) {
    for (const c of [answer.scale(k), new Surd(answer.c.add(k), answer.r)]) if (list.length < 4 && ok(c)) list.push(c);
  }
  return list.map((x) => ({ id: `v${x.key().replace(/[|/]/g, '_')}`, label: x.format(unit), value: x }));
}

const choiceOf = (c) => ({ id: c.id, label: c.label });

/**
 * 1辺の長さ（cm）。面積・体積が整数の係数になる長さから選ぶ（rng がなければ、いちばん小さい長さ）
 */
function pickSide(sides, test, rng = null) {
  const ok = [];
  for (const s of sides) {
    const res = test(new Q(s, 2));
    if (res) ok.push({ s, res });
    if (res && !rng) break;
  }
  if (ok.length === 0) return null;
  return rng ? pick(ok, rng) : ok[0];
}

// ---------- 切り口の形の図（K03） ----------

/** 切り口を正面から見た形（2D。いちばん長い辺を下にして、大きさ 1 に収める） */
export function sectionShape2D(record) {
  const pts = record.section.polygon.map((p) => vToNumbers(p.position));
  const n = vToNumbers(record.plane.normal);
  const len = Math.hypot(...n);
  const nn = n.map((x) => x / len);
  const ref = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let u = cross(nn, ref);
  const ul = Math.hypot(...u);
  u = u.map((x) => x / ul);
  const w = cross(nn, u);
  return normalizeShape(pts.map((p) => [dot(p, u), dot(p, w)]));
}

/** 2D の多角形を、いちばん長い辺が下で水平・中心が原点・大きさ 1 になるようにそろえる */
export function normalizeShape(poly) {
  const n = poly.length;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
    if (l > bestLen + 1e-9) {
      bestLen = l;
      best = i;
    }
  }
  const a = poly[best];
  const b = poly[(best + 1) % n];
  const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
  const rot = poly.map(([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)]);
  // ほかの頂点が上（y が大きい側）にくるように
  const baseY = rot[best][1];
  const above = rot.reduce((s, p) => s + (p[1] - baseY), 0);
  const flipped = above < 0 ? rot.map(([x, y]) => [x, -y]) : rot;
  const xs = flipped.map((p) => p[0]);
  const ys = flipped.map((p) => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  return flipped.map(([x, y]) => [round3((x - cx) / size), round3((y - cy) / size)]);
}

const round3 = (x) => Math.round(x * 1000) / 1000 + 0;

/** 形が相似か（辺の長さの比と角が同じ。回転・裏返しを許す） */
export function similarShapes(p, q, tol = 0.035) {
  if (p.length !== q.length) return false;
  const sig = (poly) => {
    const n = poly.length;
    const sides = poly.map((a, i) => Math.hypot(poly[(i + 1) % n][0] - a[0], poly[(i + 1) % n][1] - a[1]));
    const per = sides.reduce((s, x) => s + x, 0);
    const angles = poly.map((_, i) => {
      const a = poly[(i + n - 1) % n];
      const b = poly[i];
      const c = poly[(i + 1) % n];
      const u = [a[0] - b[0], a[1] - b[1]];
      const v = [c[0] - b[0], c[1] - b[1]];
      return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)))));
    });
    return { sides: sides.map((s) => s / per), angles };
  };
  const a = sig(p);
  const b = sig(q);
  const n = p.length;
  const match = (sides, angles) => {
    for (let k = 0; k < n; k++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        if (Math.abs(sides[(i + k) % n] - a.sides[i]) > tol || Math.abs(angles[(i + k) % n] - a.angles[i]) > tol * 3) ok = false;
      }
      if (ok) return true;
    }
    return false;
  };
  if (match(b.sides, b.angles)) return true;
  // 裏返し：辺の並びを逆にすると、角の並びは1つずれる
  const rs = [...b.sides].reverse();
  const ra = [...b.angles].reverse();
  const raShift = ra.map((_, i) => ra[(i + n - 1) % n]);
  return match(rs, raShift) || match(rs, ra);
}

const regularPolygon = (n) => normalizeShape([...Array(n).keys()].map((i) => [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)]));
const stretch = (poly, k) => normalizeShape(poly.map(([x, y]) => [x * k, y]));
const shear = (poly, k) => normalizeShape(poly.map(([x, y]) => [x + k * y, y]));

/** まちがいの図（相似でない形を3つ。実際の切り口でできる別の形・のばした形・正多角形など） */
function figureDistractors(record, correct, rng) {
  const others = shuffle(
    allCuts().filter((c) => c.shape.sides === record.shape.sides && c.shape.name !== record.shape.name),
    rng,
  ).slice(0, 4);
  const pool = [
    ...others.map((c) => ({ points: sectionShape2D(c), name: c.shape.name })),
    { points: stretch(correct, 1.55), name: null },
    { points: stretch(correct, 0.6), name: null },
    { points: shear(correct, 0.5), name: null },
    { points: regularPolygon(record.shape.sides), name: null },
    { points: regularPolygon(record.shape.sides === 3 ? 4 : record.shape.sides - 1), name: null },
  ];
  const chosen = [];
  for (const cand of shuffle(pool.slice(0, others.length), rng).concat(shuffle(pool.slice(others.length), rng))) {
    if (chosen.length >= 3) break;
    if (similarShapes(correct, cand.points)) continue;
    if (chosen.some((c) => similarShapes(c.points, cand.points))) continue;
    chosen.push(cand);
  }
  return chosen;
}

// ---------- 出題の基準（3点の組み合わせ） ----------

const NICE_SHAPES = ['正三角形', '二等辺三角形', '正方形', '長方形', 'ひし形', '平行四辺形', '台形', '五角形', '正六角形', '六角形'];
const AREA_SHAPES = ['正三角形', '二等辺三角形', '正方形', '長方形', 'ひし形', '台形', '正六角形'];

const baseOf = (c, group) => ({ key: c.key, refs: c.points.map(pointKey), group });

/** 平面が立方体の頂点を通らず、問題の3点がどれも辺の中点で、ほかの辺の上にも頂点がある切り口 */
function edgeBases() {
  return allCuts()
    .filter((c) => c.points.every((p) => p.kind === 'midpoint') && c.section.polygon.every((v) => !v.vertex) && c.shape.sides >= 4)
    .map((c) => baseOf(c, `x${c.shape.sides - 3}`));
}

export const CUTTING_TEMPLATES = [
  // ---------------- ★1 基本 ----------------
  {
    id: 'K01',
    difficulty: 1,
    title: '切り口は何角形？',
    bases: () => allCuts().map((c) => baseOf(c, `n${c.shape.sides}`)),
    build(base) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const names = X.sectionVertexNames(record.section.polygon, given);
      return assemble(this, base, {
          record,
          given,
          question: `立方体を、${planeText(given)}で切ります。切り口は何角形になりますか。`,
          choices: [3, 4, 5, 6].map((n) => ({ id: `n${n}`, label: POLYGON_NAMES[n], fixed: true })),
          correct: [`n${record.shape.sides}`],
          explanation: X.explainSides({ faces: record.section.faces, names, polygonName: record.shape.polygonName, hasOpposite: facesOpposite(record.section.faces) }),
        });
    },
  },
  {
    id: 'K02',
    difficulty: 1,
    title: '切り口が通る辺',
    bases: edgeBases,
    build(base, rng) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const givenEdges = given.map((p) => p.id);
      const sectionEdges = record.section.polygon.map((v) => v.edges[0]);
      const extra = sectionEdges.filter((e) => !givenEdges.includes(e));
      const pool = ['AB', 'BC', 'CD', 'DA', 'EF', 'FG', 'GH', 'HE', 'AE', 'BF', 'CG', 'DH'].filter((e) => !givenEdges.includes(e));
      // まちがえやすい辺：切り口が通る面の上の辺
      const preferred = pool.filter((e) => record.section.faces.some((f) => e.split('').every((v) => f.includes(v))));
      const names = X.sectionVertexNames(record.section.polygon, given);
      return assemble(this, base, {
          record,
          given,
          type: 'multiple',
          question: `立方体を、${planeText(given)}で切ります。切り口の頂点は、${given.map((p) => p.short).join('・')}のほかに、どの辺の上にありますか。すべて選びましょう。`,
          choices: buildElementChoices({ correct: extra, pool, preferred, total: multipleChoiceTotal(extra.length), rng }),
          correct: extra,
          explanation: X.explainEdges({ names, extraEdges: extra, givenNames: given.map((p) => p.short) }),
          highlight: extra,
          steps: [{ type: 'cutPlane' }, { type: 'cutSection' }],
        });
    },
  },
  // ---------------- ★2 標準 ----------------
  {
    id: 'K03',
    difficulty: 2,
    title: '切り口の形の図を選ぶ',
    bases: () => allCuts().map((c) => baseOf(c, c.shape.name)),
    build(base, rng) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const correct = sectionShape2D(record);
      const distractors = figureDistractors(record, correct, rng);
      if (distractors.length < 3) throw new Error(`まちがいの図が足りません: ${base.key}`);
      const figures = [{ id: 'fig0', points: correct, description: record.shape.name }, ...distractors.map((d, i) => ({ id: `fig${i + 1}`, points: d.points, description: 'ちがう形' }))];
      return assemble(this, base, {
          record,
          given,
          question: `立方体を、${planeText(given)}で切ります。切り口を正面から見た形として正しいものはどれですか。`,
          choices: figures.map((f, i) => ({ id: f.id, label: CHOICE_MARKS[i], labelByPosition: true, visual: { type: 'section', points: f.points }, description: f.description })),
          correct: ['fig0'],
          explanation: X.explainFigure({ name: record.shape.name, lengths: X.sideLengthsText(record.shape.sideLengths2), choiceId: 'fig0' }),
        });
    },
  },
  {
    id: 'K04',
    difficulty: 2,
    title: '中点を通る切り口の形',
    bases: () => allCuts().filter((c) => c.points.some((p) => p.kind === 'midpoint') && NICE_SHAPES.includes(c.shape.name)).map((c) => baseOf(c, c.shape.name)),
    build(base, rng) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const names = X.sectionVertexNames(record.section.polygon, given);
      return assemble(this, base, {
          record,
          given,
          question: `立方体を、${planeText(given)}で切ります。切り口はどんな形になりますか。`,
          choices: shapeChoices(record.shape.name, rng, { pool: NICE_SHAPES }),
          correct: [SHAPE_IDS[record.shape.name]],
          explanation: X.explainShape({ name: record.shape.name, names, lengths: X.sideLengthsText(record.shape.sideLengths2) }),
        });
    },
  },
  // ---------------- ★3 応用 ----------------
  {
    id: 'K05',
    difficulty: 3,
    title: '切り口の面積',
    bases: () =>
      allCuts()
        .filter((c) => AREA_SHAPES.includes(c.shape.name) && pickSide([2, 4, 6, 8], (u) => areaOk(c, u)))
        .map((c) => baseOf(c, c.shape.name)),
    build(base, rng) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const { s, res } = pickSide([2, 4, 6, 8], (u) => areaOk(record, u), rng);
      const { area, text } = res;
      const face = new Surd(s * s);
      const choices = surdChoices(
        area,
        [area.scale(2), area.scale(half), face, new Surd(area.c, area.r === 3 ? 2 : 3), area.mul(new Surd(1, 2))],
        'cm²',
      );
      return assemble(this, base, {
          record,
          given,
          question: `1辺${s}cmの立方体を、${planeText(given)}で切ります。切り口の面積は何cm²ですか。`,
          choices: choices.map(choiceOf),
          correct: [choices[0].id],
          explanation: text,
          steps: [{ type: 'cutPlane' }, { type: 'cutSection', label: area.format('cm²') }, { type: 'cutSplit', to: 1 }],
        });
    },
  },
  {
    id: 'K06',
    difficulty: 3,
    title: '切り分けた立体の体積',
    bases: () =>
      allCuts()
        .filter((c) => c.shape.sides <= 4)
        .map((c) => ({ c, ok: pickSide([2, 4, 6, 8, 12], (u) => volumeOk(c, u)) }))
        .filter((x) => x.ok)
        .map(({ c, ok }) => baseOf(c, ok.res.kind)),
    build(base, rng) {
      const record = findCut(base.key);
      const given = givenPoints(record);
      const { s, res } = pickSide([2, 4, 6, 8, 12], (u) => volumeOk(record, u), rng);
      const V = new Surd(res.volume);
      const big = new Surd(res.big);
      const cube = new Surd(s * s * s);
      const candidates = [big, V.scale(3), V.scale(2), V.scale(half), new Surd(new Q(s * s * s, 6)), new Surd(new Q(s * s * s, 2)), cube];
      const choices = surdChoices(V, candidates, 'cm³');
      return assemble(this, base, {
          record,
          given,
          question: `1辺${s}cmの立方体を、${planeText(given)}で切って、2つの立体に分けます。小さいほうの立体の体積は何cm³ですか。`,
          choices: choices.map(choiceOf),
          correct: [choices[0].id],
          explanation: `${res.text}（大きいほうの立体は、${s * s * s}−${res.volume}＝${res.big}cm³です。）`,
          steps: [{ type: 'cutPlane' }, { type: 'cutSection' }, { type: 'cutSplit', to: 1, highlightSmall: true, label: V.format('cm³') }],
        });
    },
  },
];

/** 面積が整数の係数で、公式の計算と座標の計算が一致するか */
function areaOk(record, u) {
  const res = sectionAreaByFormula(record, u);
  return res && res.area.hasIntegerCoef() ? res : null;
}

/** 体積が整数で、公式の計算と座標の計算が一致するか */
function volumeOk(record, u) {
  const res = pieceVolumeByFormula(record, u);
  return res && res.volume.isInteger() ? res : null;
}

export { pick, vDot };
