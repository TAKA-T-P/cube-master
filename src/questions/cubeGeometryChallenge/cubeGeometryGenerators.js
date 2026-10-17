/**
 * 立方体に隠れた図形・長さ・角度の問題テンプレート（G01〜G06）
 *
 * 頂点・辺の中点・面の中心を結んでできる線分・三角形・角を、core/cubeMetricGeometry で正確に計算する
 * （長さ・面積は √ をふくむ数、角は cos² と符号から決める）。問題文・選択肢・正解・解説・3D（scene.metric）は同じ計算結果から作る。
 * ③位置関係（平行・垂直・ねじれ）とは重ならないように、対角線・三角形・長さ・角度・面積を扱う。
 *
 * 3D（three/cubeMetricModel）：回答前は、問題で示す点・線分（オレンジ）だけを表示する。
 * 回答後は、答えの線分（緑）・三角形（面を薄く塗り、直角の印）・角の弧を表示し、三角形を立方体から取り出して正面に向ける。
 */
import { Q, qvec, vSub, vCross, vToNumbers } from '../../core/rational.js';
import { Surd } from '../../core/surd.js';
import { FACES, EDGES, VERTICES } from '../../core/cubeConstants.js';
import { distance3D, classifyTriangle, triangleArea3D, angleAt, allVertexSegments, triangleSideLengths } from '../../core/cubeMetricGeometry.js';
import { VERTEX_POINTS, MIDPOINTS, FACE_CENTERS, labelPoints, joinPointTexts, pointKey } from '../surfacePoints.js';
import { surdChoices } from '../cubeCutting/cubeCuttingGenerators.js';
import { multipleChoiceTotal } from '../questionUtils.js';
import { shuffle, pick, sample } from '../../utils/random.js';
import * as X from './cubeGeometryExplanations.js';
import { PYTHAGOREAN_AND_ROOT } from '../../core/learningPrerequisites.js';
import { classifyVertexSegment } from '../../core/cubeMetricGeometry.js';

/** 点がすべて立方体の頂点か（線分が辺・面の対角線・立方体の対角線だけになり、図形の性質だけで判断できる） */
const onlyVertices = (points) => points.every((p) => p.kind === 'vertex');
const KIND_NAMES = { edge: '立方体の辺', faceDiagonal: '面の対角線', spaceDiagonal: '立方体の対角線' };
/** 2つの頂点をふくむ面 */
const faceWith = (...ids) => FACES.find((f) => ids.every((id) => f.vertices.includes(id)));

export const GEOMETRY_CATEGORY = 'cubeGeometryChallenge';

const V = Object.fromEntries(VERTEX_POINTS.map((p) => [p.id, p]));
const IDS = VERTICES.map((v) => v.id);
const SEGMENTS = allVertexSegments();
const segById = (id) => SEGMENTS.find((s) => s.id === id || s.id === id[1] + id[0]);
const isEdgeId = (id) => EDGES.some((e) => e.id === id);
const neighbors = (id) => EDGES.filter((e) => e.vertices.includes(id)).map((e) => e.vertices.find((x) => x !== id));
const half = new Q(1, 2);

/** 選択肢（線分）。辺なら 3D の辺と対応させる（まちがえた辺を赤で示す） */
const segmentChoice = (seg) => ({ id: seg.id, label: `線分${seg.id}`, ...(isEdgeId(seg.id) ? { elementId: seg.id } : {}) });
const segmentPositions = (seg) => ({ from: [...V[seg.ends[0]].position], to: [...V[seg.ends[1]].position] });

const scenePoints = (given) => given.map((p) => ({ kind: p.kind, id: p.id, label: p.label, position: [...p.position] }));

/** 三角形がよく見える（つぶれて見えない）カメラの向き：三角形の面がなるべく正面を向く、8つのななめの向きから選ぶ */
function viewForTriangle(points) {
  const [a, b, c] = points.map((p) => qvec(p));
  const n = vToNumbers(vCross(vSub(b, a), vSub(c, a)));
  const len = Math.hypot(...n) || 1;
  const dirs = [
    [4, 3, 5],
    [-4, 3, 5],
    [4, 3, -5],
    [-4, 3, -5],
    [4, -3, 5],
    [-4, -3, 5],
    [4, -3, -5],
    [-4, -3, -5],
  ];
  const score = (d) => Math.abs(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / (len * Math.hypot(...d));
  let best = dirs[0];
  for (const d of dirs) if (score(d) > score(best) + 0.05) best = d;
  return best === dirs[0] ? 'default' : [...best];
}

function assemble(template, base, { given = [], question, type = 'single', choices, correct, explanation, segments = [], answerSegments = [], triangles = [], angle, steps, referenceElements = [], view = 'default', prerequisites = [] }) {
  return {
    prerequisites: [...prerequisites],
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: GEOMETRY_CATEGORY,
    difficulty: template.difficulty,
    type,
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'metric',
      referenceElements,
      cameraPreset: view,
      metric: {
        points: scenePoints(given),
        segments,
        answerSegments,
        triangles: triangles.map((t) => ({ points: t.points.map((p) => [...p]), rightAt: t.rightAt ?? null })),
        ...(angle ? { angle } : {}),
      },
      showLabels: true,
    },
    choices,
    correctAnswers: correct,
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps } },
  };
}

// ---------- 三角形（G04・G06）の候補 ----------

const TRI_POINTS = [...VERTEX_POINTS, ...MIDPOINTS];
const NICE_TRIANGLES = ['正三角形', '直角二等辺三角形', '直角三角形', '二等辺三角形'];
let triCache = null;
function triangles() {
  if (triCache) return triCache;
  const out = [];
  for (let i = 0; i < TRI_POINTS.length; i++) {
    for (let j = i + 1; j < TRI_POINTS.length; j++) {
      for (let k = j + 1; k < TRI_POINTS.length; k++) {
        const pts = [TRI_POINTS[i], TRI_POINTS[j], TRI_POINTS[k]];
        // 少なくとも2つは立方体の頂点（図がわかりやすいもの）
        if (pts.filter((p) => p.kind === 'vertex').length < 2) continue;
        const info = classifyTriangle(...pts.map((p) => p.position));
        if (!info || !NICE_TRIANGLES.includes(info.name)) continue;
        out.push({ key: pts.map(pointKey).join('|'), points: pts, info });
      }
    }
  }
  triCache = out;
  return out;
}
const findTriangle = (key) => triangles().find((t) => t.key === key);

const TRIANGLE_CHOICES = [
  { id: 'equilateral', label: '正三角形', name: '正三角形' },
  { id: 'rightIsosceles', label: '直角二等辺三角形', name: '直角二等辺三角形' },
  { id: 'right', label: '直角三角形（二等辺三角形ではない）', name: '直角三角形' },
  { id: 'isosceles', label: '二等辺三角形（直角三角形ではない）', name: '二等辺三角形' },
];

/** 三角形の面積を、形の公式で求める（解説の式）。座標の外積から求めた面積と一致しなければ null */
export function triangleAreaByFormula(points, u) {
  const P = points.map((p) => p.position);
  const info = classifyTriangle(...P);
  const sides = triangleSideLengths(...P).map((x) => x.scale(u)); // sides[i]：頂点 i の向かいの辺
  let area;
  let text;
  if (info.name === '正三角形') {
    const a = sides[0];
    const h = a.mul(new Surd(half, 3));
    area = a.mul(h).scale(half);
    text = `三角形は1辺${a.format('cm')}の正三角形です。高さは${a}×√3÷2＝${h.format('cm')}なので、面積は${a}×${h}÷2＝${area.format('cm²')}です。`;
  } else if (info.rightAt !== null) {
    const legs = [0, 1, 2].filter((i) => i !== info.rightAt).map((i) => sides[i]);
    area = legs[0].mul(legs[1]).scale(half);
    text = `三角形は、直角をはさむ2辺が${legs[0].format('cm')}と${legs[1].format('cm')}の${info.name}です。面積は${legs[0]}×${legs[1]}÷2＝${area.format('cm²')}です。`;
  } else if (info.name === '二等辺三角形') {
    const [i, j] = info.equalPair;
    const k = [0, 1, 2].find((x) => x !== i && x !== j);
    const b = sides[k];
    const l = sides[i];
    const hb = b.scale(half);
    const h2 = l.square().sub(hb.square());
    if (h2.sign() <= 0) return null;
    const h = Surd.sqrt(h2);
    area = b.mul(h).scale(half);
    text =
      `三角形は、等しい2辺が${l.format('cm')}、残りの1辺が${b.format('cm')}の二等辺三角形です。底辺を${b}とすると、高さは三平方の定理から ${X.sq(l)}−${X.sq(hb)}＝${h2}より${h.format('cm')}。` +
      `面積は${b}×${h}÷2＝${area.format('cm²')}です。`;
  } else return null;
  if (!area.eq(triangleArea3D(...P).scale(u.mul(u)))) return null;
  return { area, text, info };
}

// ---------- 角（G05）の候補 ----------

const ANGLE_POINTS = [...VERTEX_POINTS, ...MIDPOINTS, ...FACE_CENTERS];
let angleCache = null;
function angles() {
  if (angleCache) return angleCache;
  const out = [];
  for (const p of VERTEX_POINTS) {
    const others = ANGLE_POINTS.filter((x) => pointKey(x) !== pointKey(p));
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const q = others[i];
        const r = others[j];
        const info = classifyTriangle(p.position, q.position, r.position);
        if (!info) continue;
        const deg = angleAt(p.position, q.position, r.position).degrees;
        let reason = null;
        if (deg === 60 && info.name === '正三角形') reason = 'equilateral';
        else if (deg === 90 && info.rightAt === 0) reason = 'right';
        else if (deg === 45 && info.name === '直角二等辺三角形' && info.rightAt !== 0) reason = 'rightIsosceles';
        if (!reason) continue;
        // 点が多すぎる図は避ける（頂点以外の点は1つまで）
        if ([q, r].filter((x) => x.kind !== 'vertex').length > 1) continue;
        out.push({ key: `${p.id}|${pointKey(q)}|${pointKey(r)}`, p, q, r, deg, reason, info });
      }
    }
  }
  angleCache = out;
  return out;
}

/** 三角形の面積に三平方の定理・√ が要るか（直角をはさむ2辺の長さがどちらも √ をふくまない直角三角形なら要らない） */
export function areaNeedsRoots(t) {
  const info = t.info;
  if (info.rightAt === null) return true;
  const legs = [0, 1, 2].filter((i) => i !== info.rightAt).map((i) => Surd.sqrt(info.sides2[i]));
  return !legs.every((l) => l.isRational());
}

/** 頂点だけの三角形の形の理由（辺・面の対角線・立方体の対角線の性質だけで説明する） */
function explainVertexTriangle(t, given) {
  const ids = t.points.map((p) => p.id);
  const name = ids.join('');
  const kinds = [0, 1, 2].map((i) => classifyVertexSegment(ids[(i + 1) % 3], ids[(i + 2) % 3]));
  if (t.info.name === '正三角形') return `三角形${name}の3辺は、どれも立方体の面の対角線です。面の対角線の長さはどれも等しいので、正三角形です。`;
  const r = t.info.rightAt;
  const R = ids[r];
  const [X1, Y1] = [ids[(r + 1) % 3], ids[(r + 2) % 3]];
  if (t.info.name === '直角二等辺三角形') {
    return `3つの頂点は、どれも面${faceWith(...ids).id}の上にあります。辺${R}${X1}と辺${R}${Y1}は立方体の辺で長さが等しく、その間の角は正方形の角なので直角です。だから直角二等辺三角形です。`;
  }
  // 直角三角形：直角の頂点から出る2辺のうち、1本は立方体の辺、もう1本は面の対角線
  const edgeEnd = classifyVertexSegment(R, X1) === 'edge' ? X1 : Y1;
  const diagEnd = edgeEnd === X1 ? Y1 : X1;
  const face = faceWith(R, diagEnd);
  return (
    `辺${R}${edgeEnd}は面${face.id}に垂直なので、その面の上の線分${R}${diagEnd}とも垂直です（∠${edgeEnd}${R}${diagEnd}＝90°）。` +
    `3辺は${kinds.map((k) => KIND_NAMES[k]).join('・')}で長さがすべてちがうので、（二等辺三角形ではない）直角三角形です。`
  );
}

/** 頂点だけでできる角の理由 */
function explainVertexAngle(a, angleName) {
  const P = a.p.id;
  const [q, r] = [a.q.id, a.r.id];
  const kq = classifyVertexSegment(P, q);
  const kr = classifyVertexSegment(P, r);
  if (a.deg === 60) return `線分${P}${q}・${P}${r}と、${q}${r}は、どれも立方体の面の対角線で長さが等しいので、三角形${q}${P}${r}は正三角形です。だから${angleName}＝60°です。`;
  if (a.deg === 90 && kq === 'edge' && kr === 'edge') return `線分${P}${q}と${P}${r}は、頂点${P}に集まる立方体の辺で、たがいに垂直です。だから${angleName}＝90°です。`;
  if (a.deg === 90) {
    const [edgeEnd, diagEnd] = kq === 'edge' ? [q, r] : [r, q];
    return `辺${P}${edgeEnd}は面${faceWith(P, diagEnd).id}に垂直なので、その面の上の線分${P}${diagEnd}とも垂直です。だから${angleName}＝90°です。`;
  }
  // 45°：辺と、同じ面の対角線
  const [edgeEnd, diagEnd] = kq === 'edge' ? [q, r] : [r, q];
  return `線分${P}${diagEnd}は面${faceWith(P, diagEnd).id}の対角線で、正方形の角（90°）をちょうど半分に分けます。辺${P}${edgeEnd}はその正方形の辺なので、${angleName}＝45°です。`;
}

const ANGLE_CHOICES = [30, 45, 60, 90].map((d) => ({ id: `deg${d}`, label: `${d}°`, fixed: true }));

export const GEOMETRY_TEMPLATES = [
  // ---------------- ★1 基本 ----------------
  {
    id: 'G01',
    difficulty: 1,
    title: '面の対角線を探す',
    bases: () => [...FACES.map((f) => ({ key: `face-${f.id}`, refs: [f.id], group: 'face', face: f.id })), ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ key: `mixed-${v}`, refs: [], group: 'mixed' }))],
    build(base, rng) {
      if (base.face) {
        const f = FACES.find((x) => x.id === base.face);
        const [a, b, c, d] = f.vertices;
        const answers = [segById(a + c), segById(b + d)];
        const pool = SEGMENTS.filter((s) => !answers.includes(s) && s.ends.some((v) => f.vertices.includes(v)));
        const preferred = pool.filter((s) => s.kind === 'edge' && s.ends.every((v) => f.vertices.includes(v)));
        const others = [...sample(preferred, 1, rng), ...sample(pool.filter((s) => s.kind !== 'edge'), 1, rng)];
        const list = shuffle([...answers, ...others], rng);
        return assemble(this, base, {
          type: 'multiple',
          question: `面${f.id}の対角線になっている線分を、すべて選びましょう。`,
          choices: list.map(segmentChoice),
          correct: answers.map((s) => s.id),
          explanation: X.explainFaceDiagonals({ face: f.id, answers: answers.map((s) => s.id) }),
          answerSegments: answers.map(segmentPositions),
          steps: [{ type: 'metricSegments' }],
          referenceElements: [f.id],
        });
      }
      const k = 2 + Math.floor(rng() * 2);
      const faceDiags = shuffle(SEGMENTS.filter((s) => s.kind === 'faceDiagonal'), rng);
      const answers = [];
      for (const s of faceDiags) if (answers.length < k && !answers.some((x) => x.ends.some((v) => s.ends.includes(v)))) answers.push(s);
      const others = sample(SEGMENTS.filter((s) => s.kind !== 'faceDiagonal'), multipleChoiceTotal(k) - k, rng);
      const list = shuffle([...answers, ...others], rng);
      return assemble(this, base, {
        type: 'multiple',
        question: '次の線分のうち、立方体の面の対角線になっているものを、すべて選びましょう。',
        choices: list.map(segmentChoice),
        correct: answers.map((s) => s.id),
        explanation: X.explainMixedFaceDiagonals({ answers: answers.map((s) => s.id) }),
        answerSegments: answers.map(segmentPositions),
        steps: [{ type: 'metricSegments' }],
      });
    },
  },
  {
    id: 'G02',
    difficulty: 1,
    title: '立方体の対角線を探す',
    bases: () => [...IDS.map((v) => ({ key: `vertex-${v}`, refs: [v], group: 'vertex', vertex: v })), ...[0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ key: `mixed-${v}`, refs: [], group: 'mixed' }))],
    build(base, rng) {
      if (base.vertex) {
        const x = base.vertex;
        const from = SEGMENTS.filter((s) => s.ends.includes(x));
        const answer = from.find((s) => s.kind === 'spaceDiagonal');
        const list = shuffle([answer, ...sample(from.filter((s) => s.kind === 'faceDiagonal'), 2, rng), ...sample(from.filter((s) => s.kind === 'edge'), 1, rng)], rng);
        return assemble(this, base, {
          question: `頂点${x}を通る、立方体の対角線（立方体の内部を通る対角線）はどれですか。`,
          choices: list.map(segmentChoice),
          correct: [answer.id],
          explanation: X.explainSpaceDiagonals({ answers: [answer.id] }),
          answerSegments: [segmentPositions(answer)],
          steps: [{ type: 'metricSegments' }],
          referenceElements: [x],
        });
      }
      const k = 2 + Math.floor(rng() * 2);
      const answers = sample(SEGMENTS.filter((s) => s.kind === 'spaceDiagonal'), k, rng);
      const others = [...sample(SEGMENTS.filter((s) => s.kind === 'faceDiagonal'), multipleChoiceTotal(k) - k - 1, rng), ...sample(SEGMENTS.filter((s) => s.kind === 'edge'), 1, rng)];
      const list = shuffle([...answers, ...others], rng);
      return assemble(this, base, {
        type: 'multiple',
        question: '次の線分のうち、立方体の内部を通る対角線（立方体の対角線）を、すべて選びましょう。',
        choices: list.map(segmentChoice),
        correct: answers.map((s) => s.id),
        explanation: X.explainSpaceDiagonals({ answers: answers.map((s) => s.id) }),
        answerSegments: answers.map(segmentPositions),
        steps: [{ type: 'metricSegments' }],
      });
    },
  },
  // ---------------- ★2 標準 ----------------
  {
    id: 'G03',
    difficulty: 2,
    title: '対角線の長さ',
    advanced: 'always',
    prerequisites: [...PYTHAGOREAN_AND_ROOT],
    bases: () => SEGMENTS.filter((s) => s.kind !== 'edge').map((s) => ({ key: s.id, refs: s.ends, group: s.kind })),
    build(base, rng) {
      const seg = segById(base.key);
      const s = pick([2, 3, 4, 5, 6], rng);
      const u = new Q(s, 2);
      const [x, y] = seg.ends;
      const length = distance3D(V[x].position, V[y].position).scale(u);
      let explanation;
      let tris;
      if (seg.kind === 'faceDiagonal') {
        const w = neighbors(x).find((n) => neighbors(y).includes(n));
        tris = [{ points: [V[x].position, V[w].position, V[y].position], rightAt: 1 }];
        if (!length.eq(new Surd(s, 2))) throw new Error('面の対角線の長さが合いません');
        explanation = X.explainFaceDiagonalLength({ seg: seg.id, s, length });
      } else {
        // 頂点 y のとなりの頂点 z のうち、x と同じ面にあるもの（x–z が面の対角線）
        const z = neighbors(y).find((n) => segById(x + n).kind === 'faceDiagonal');
        const w = neighbors(x).find((n) => neighbors(z).includes(n));
        tris = [
          { points: [V[x].position, V[w].position, V[z].position], rightAt: 1 },
          { points: [V[x].position, V[z].position, V[y].position], rightAt: 1 },
        ];
        if (!length.eq(new Surd(s, 3))) throw new Error('立方体の対角線の長さが合いません');
        explanation = X.explainSpaceDiagonalLength({ seg: seg.id, mid: x + z, s, face: new Surd(s, 2), length });
      }
      const choices = surdChoices(length, [new Surd(s, seg.kind === 'faceDiagonal' ? 3 : 2), new Surd(2 * s), new Surd(s), new Surd(s, 5), new Surd(3 * s), new Surd(s, 6)], 'cm');
      const kind = seg.kind === 'faceDiagonal' ? '面の対角線' : '立方体の対角線';
      return assemble(this, base, {
        question: `1辺${s}cmの立方体で、${kind}${seg.id}の長さは何cmですか。`,
        choices: choices.map(({ id, label }) => ({ id, label })),
        correct: [choices[0].id],
        explanation,
        segments: [segmentPositions(seg)],
        triangles: tris,
        steps: tris.map((_, i) => ({ type: 'metricTriangle', index: i, ...(i === tris.length - 1 ? { label: `${seg.id}＝${length.format('cm')}` } : {}) })),
        prerequisites: PYTHAGOREAN_AND_ROOT,
        view: viewForTriangle(tris.at(-1).points),
      });
    },
  },
  {
    id: 'G04',
    difficulty: 2,
    title: '3つの点を結んだ三角形の形',
    // 立方体の頂点だけの三角形は、辺・面の対角線・立方体の対角線の性質で判断できる。辺の中点をふくむと、長さをくらべるのに三平方の定理が要る
    advanced: 'sometimes',
    bases: (ctx = {}) => triangles().filter((t) => ctx.allowAdvanced !== false || onlyVertices(t.points)).map((t) => ({ key: t.key, refs: t.points.map(pointKey), group: t.info.name })),
    build(base) {
      const t = findTriangle(base.key);
      const given = labelPoints(t.points);
      const sides = triangleSideLengths(...t.points.map((p) => p.position));
      const answer = TRIANGLE_CHOICES.find((c) => c.name === t.info.name);
      const pts = t.points.map((p) => p.position);
      return assemble(this, base, {
        given,
        question: `立方体の${joinPointTexts(given)}の3つの点を結んでできる三角形は、どんな三角形ですか。`,
        choices: TRIANGLE_CHOICES.map((c) => ({ id: c.id, label: c.label, fixed: true })),
        correct: [answer.id],
        explanation: onlyVertices(t.points) ? explainVertexTriangle(t, given) : X.explainTriangle({ name: t.info.name, sides, names: given.map((p) => p.short).join('') }),
        prerequisites: onlyVertices(t.points) ? [] : PYTHAGOREAN_AND_ROOT,
        triangles: [{ points: pts, rightAt: t.info.rightAt }],
        steps: [{ type: 'metricTriangle', index: 0 }, { type: 'metricExtract', label: t.info.name }],
        view: viewForTriangle(pts),
      });
    },
  },
  // ---------------- ★3 応用 ----------------
  {
    id: 'G05',
    difficulty: 3,
    title: '立方体の中の角度',
    // 頂点だけの角は、辺どうし・辺と面の対角線・面の対角線どうしの性質で判断できる。中点・面の中心をふくむと三平方の定理が要る
    advanced: 'sometimes',
    bases: (ctx = {}) => angles().filter((a) => ctx.allowAdvanced !== false || onlyVertices([a.q, a.r])).map((a) => ({ key: a.key, refs: [a.p.id], group: `d${a.deg}` })),
    build(base) {
      const a = angles().find((x) => x.key === base.key);
      const [Q1, R1] = labelPoints([a.q, a.r]);
      const P = a.p.id;
      const angleName = `∠${Q1.short}${P}${R1.short}`;
      const tri = `${Q1.short}${P}${R1.short}`;
      const sides = triangleSideLengths(a.p.position, a.q.position, a.r.position); // [QR, RP, PQ]
      const f = (x) => x.format('cm');
      let reason;
      if (a.reason === 'equilateral') reason = `3辺の長さが（立方体の1辺を2cmとすると）どれも${f(sides[0])}で等しい正三角形な`;
      else if (a.reason === 'right') reason = `${Q1.short}${R1.short}²＝${X.sq(sides[0])}＝${sides[0].square()}、${P}${Q1.short}²＋${P}${R1.short}²＝${sides[2].square()}＋${sides[1].square()}＝${sides[2].square().add(sides[1].square())}（立方体の1辺を2cmとしたとき）で、三平方の定理が成り立つ`;
      else {
        const at = a.info.rightAt === 1 ? Q1.short : R1.short;
        reason = `∠${at === Q1.short ? `${P}${Q1.short}${R1.short}` : `${P}${R1.short}${Q1.short}`}が直角の直角二等辺三角形（頂点${at}で直角）な`;
      }
      const pts = [a.p.position, a.q.position, a.r.position];
      return assemble(this, base, {
        given: labelPoints([a.p, a.q, a.r]).filter((p) => p.kind !== 'vertex' || p.id === P),
        question: `立方体で、頂点${P}と${Q1.text}、頂点${P}と${R1.text}をそれぞれ結びます。線分${P}${Q1.short}と線分${P}${R1.short}がつくる角${angleName}の大きさは何度ですか。`,
        choices: ANGLE_CHOICES.map((c) => ({ ...c })),
        correct: [`deg${a.deg}`],
        explanation: onlyVertices([a.q, a.r]) ? explainVertexAngle(a, angleName) : X.explainAngle({ angle: angleName, deg: a.deg, triangle: tri, reason }),
        prerequisites: onlyVertices([a.q, a.r]) ? [] : PYTHAGOREAN_AND_ROOT,
        segments: [
          { from: [...a.p.position], to: [...a.q.position] },
          { from: [...a.p.position], to: [...a.r.position] },
        ],
        triangles: [{ points: pts, rightAt: a.info.rightAt }],
        angle: { at: [...a.p.position], a: [...a.q.position], b: [...a.r.position] },
        steps: [{ type: 'metricAngle', label: `${angleName}＝${a.deg}°` }, { type: 'metricTriangle', index: 0 }, { type: 'metricExtract' }],
        referenceElements: [P],
        view: viewForTriangle(pts),
      });
    },
  },
  {
    id: 'G06',
    difficulty: 3,
    title: '三角形の面積',
    // 直角をはさむ2辺が立方体の辺の上にある直角三角形は、三平方の定理・√ なしで面積が求められる
    advanced: 'sometimes',
    bases: (ctx = {}) =>
      triangles()
        .filter((t) => [2, 4, 6, 8].some((s) => triangleAreaByFormula(t.points, new Q(s, 2))?.area.hasIntegerCoef()))
        .filter((t) => ctx.allowAdvanced !== false || !areaNeedsRoots(t))
        .map((t) => ({ key: t.key, refs: t.points.map(pointKey), group: t.info.name })),
    build(base, rng) {
      const t = findTriangle(base.key);
      const sides = [2, 4, 6, 8].filter((s) => triangleAreaByFormula(t.points, new Q(s, 2))?.area.hasIntegerCoef());
      const s = pick(sides, rng);
      const { area, text } = triangleAreaByFormula(t.points, new Q(s, 2));
      const given = labelPoints(t.points);
      const pts = t.points.map((p) => p.position);
      const choices = surdChoices(area, [area.scale(2), area.scale(half), new Surd(s * s), new Surd(area.c, area.r === 3 ? 2 : 3), area.mul(new Surd(1, 2))], 'cm²');
      return assemble(this, base, {
        given,
        question: `1辺${s}cmの立方体の${joinPointTexts(given)}の3つの点を結んでできる三角形の面積は何cm²ですか。`,
        choices: choices.map(({ id, label }) => ({ id, label })),
        correct: [choices[0].id],
        explanation: X.explainArea({ text }),
        triangles: [{ points: pts, rightAt: t.info.rightAt }],
        steps: [{ type: 'metricTriangle', index: 0 }, { type: 'metricExtract', label: `面積 ${area.format('cm²')}` }],
        prerequisites: areaNeedsRoots(t) ? PYTHAGOREAN_AND_ROOT : [],
        view: viewForTriangle(pts),
      });
    },
  },
];
