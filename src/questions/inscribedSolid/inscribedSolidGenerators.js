/**
 * 立方体に内接する立体と体積の問題テンプレート（I01〜I06）
 *
 * 立体は、頂点・辺の中点・面の中心・立方体の中心から選んだ点の凸包として、core/inscribedSolids で正確に作る。
 * 立体の名前・体積・体積比・取り除いた残りの体積は、すべてこの数学データから計算し、問題文・選択肢・正解・解説・3D（scene.solid）を同じデータから作る。
 *
 * 3D（three/inscribedSolidModel）：回答前は、問題で示す点（オレンジ）と、必要なら示した立体の辺（オレンジの線）だけを表示する。
 * 回答後は、点を結ぶ辺 → 面が現れる（緑）→ 立方体を薄くする → 持ち上げる・2つに分ける・取り除く、の順に演出する。
 */
import { Q } from '../../core/rational.js';
import { Surd } from '../../core/surd.js';
import { FACES, EDGES, VERTICES } from '../../core/cubeConstants.js';
import { convexHull, calculatePolyhedronVolume, classifyPolyhedron, createInscribedOctahedron, CUBE_VOLUME, isValidPolyhedron } from '../../core/inscribedSolids.js';
import { VERTEX_POINTS, MIDPOINTS, FACE_CENTERS, CUBE_CENTER_POINT, labelPoints, joinPointTexts, viewDirectionForPoints, pointKey } from '../surfacePoints.js';
import { surdChoices } from '../cubeCutting/cubeCuttingGenerators.js';
import { shuffle, pick } from '../../utils/random.js';
import * as X from './inscribedSolidExplanations.js';

export const INSCRIBED_CATEGORY = 'inscribedSolid';

const V = Object.fromEntries(VERTEX_POINTS.map((p) => [p.id, p]));
const M = Object.fromEntries(MIDPOINTS.map((p) => [p.id, p]));
const FC = Object.fromEntries(FACE_CENTERS.map((p) => [p.id, p]));
const faceOf = (id) => FACES.find((f) => f.id === id);
const oppositeFace = (id) => {
  const n = faceOf(id).normal;
  return FACES.find((f) => f.normal.every((x, i) => x === -n[i]));
};
const nums = (pts) => pts.map((p) => [...p.position]);
const half = new Q(1, 2);

/** 立体の体積（1辺 s cm のとき） */
const realVolume = (poly, s) => calculatePolyhedronVolume(poly).mul(new Q(s * s * s, 8));

/** 立方体の体積・取り除く立体などの体積が整数になる1辺の長さ（cm）を選ぶ */
/** 問題で使う立方体の1辺の長さ（cm）。計算しやすい1けたの値だけ */
const SIDES = Object.freeze([3, 6, 9]);

function chooseSide(candidates, ok, rng) {
  const list = candidates.filter(ok);
  if (list.length === 0) return null;
  return rng ? pick(list, rng) : list[0];
}

const scenePoints = (given) => given.map((p) => ({ kind: p.kind, id: p.id, label: p.label, position: [...p.position] }));

function assemble(template, base, { given = [], question, choices, correct, explanation, outlines = [], solids, steps, referenceElements = [], type = 'single', view }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: INSCRIBED_CATEGORY,
    difficulty: template.difficulty,
    type,
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'solid',
      referenceElements,
      cameraPreset: view ?? viewDirectionForPoints(given.map((p) => p.position)),
      solid: { points: scenePoints(given), outlines: outlines.map((o) => o.map((p) => [...p])), solids: solids.map((x) => ({ role: x.role, points: x.points.map((p) => [...p]) })) },
      showLabels: true,
    },
    choices,
    correctAnswers: correct,
    explanation: { text: explanation, highlightElements: [], animation: 'highlightElements', reveal: { steps } },
  };
}

const volumeChoices = (answer, candidates) => surdChoices(new Surd(answer), candidates.filter((x) => x.sign() > 0 && x.isInteger()).map((x) => new Surd(x)), 'cm³');
const choiceOf = ({ id, label }) => ({ id, label });

// ---------- I01：点を結んでできる立体 ----------

const SOLID_NAMES = ['三角すい', '四角すい', '三角柱', '四角柱'];
const SOLID_IDS = { 三角すい: 'triPyramid', 四角すい: 'quadPyramid', 三角柱: 'triPrism', 四角柱: 'quadPrism' };

/** 立体になる点の組（名前ごと） */
function nameCandidates() {
  const list = [];
  const ids = VERTICES.map((v) => v.id);
  // 三角すい：同じ平面にない4つの頂点
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) for (let c = b + 1; c < 8; c++) for (let d = c + 1; d < 8; d++) list.push([ids[a], ids[b], ids[c], ids[d]].map((id) => V[id]));
  // 四角すい：面または対角面の長方形 + その平面にない頂点
  const rects = [...FACES.map((f) => f.vertices), ['A', 'B', 'G', 'H'], ['C', 'D', 'E', 'F'], ['A', 'D', 'G', 'F'], ['B', 'C', 'H', 'E'], ['A', 'C', 'G', 'E'], ['B', 'D', 'H', 'F']];
  for (const r of rects) for (const apex of ids) if (!r.includes(apex)) list.push([...r, apex].map((id) => V[id]));
  // 三角柱：対角面で立方体を2つに分けた片方
  for (const r of rects.slice(6)) {
    // 残りの4頂点から2つを選ぶ（対角面の同じ側の2頂点なら三角柱になる。ほかは形を調べて除く）
    const rest = ids.filter((id) => !r.includes(id));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) list.push([...r, rest[i], rest[j]].map((id) => V[id]));
  }
  // 四角柱：1つの面と、それに垂直な4本の辺の中点
  for (const f of FACES) {
    const edges = EDGES.filter((e) => e.vertices.filter((v) => f.vertices.includes(v)).length === 1);
    list.push([...f.vertices.map((id) => V[id]), ...edges.map((e) => M[e.id])]);
  }
  const out = [];
  const seen = new Set();
  for (const pts of list) {
    const poly = convexHull(pts.map((p) => p.position));
    if (!isValidPolyhedron(poly) || poly.vertices.length !== pts.length) continue;
    const info = classifyPolyhedron(poly);
    if (!SOLID_NAMES.includes(info.name)) continue;
    const key = pts.map(pointKey).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, points: pts, info });
  }
  return out;
}

let nameCache = null;
const names = () => (nameCache ??= nameCandidates());

// ---------- I03：角すいの体積 ----------

function pyramidCandidates() {
  const out = [];
  for (const f of FACES) {
    const opp = oppositeFace(f.id);
    // 頂点の候補と、高さ（立方体の1辺に対する割合）
    const one = Q.of(1);
    const apexes = [
      ...opp.vertices.map((id) => ({ pt: V[id], h: one })),
      { pt: FC[opp.id], h: one },
      ...EDGES.filter((e) => e.vertices.every((v) => opp.vertices.includes(v))).map((e) => ({ pt: M[e.id], h: one })),
      ...EDGES.filter((e) => e.vertices.filter((v) => f.vertices.includes(v)).length === 1).map((e) => ({ pt: M[e.id], h: half })),
    ];
    for (const a of apexes) out.push({ key: `q-${f.id}-${pointKey(a.pt)}`, kind: 'quad', face: f.id, base: f.vertices.map((id) => V[id]), apex: a.pt, h: a.h });
    // 三角形の底面（面の半分）
    for (let i = 0; i < 4; i++) {
      const tri = [0, 1, 2].map((k) => f.vertices[(i + k) % 4]);
      for (const id of opp.vertices) out.push({ key: `t-${tri.join('')}-${id}`, kind: 'tri', face: f.id, base: tri.map((x) => V[x]), apex: V[id], h: Q.of(1) });
    }
  }
  return out;
}

let pyramidCache = null;
const pyramids = () => (pyramidCache ??= pyramidCandidates());

// ---------- I05：4つの頂点の四面体 ----------

function tetraCandidates() {
  return names()
    .filter((c) => c.info.name === '三角すい' && c.points.every((p) => p.kind === 'vertex'))
    .map((c) => ({ ...c, regular: c.info.regular }));
}

/** 正四面体のまわりの4つの三角すい（立方体の残りの頂点と、そのとなりの3頂点） */
function cornerTetras(vertexIds) {
  return VERTICES.filter((v) => !vertexIds.includes(v.id)).map((v) => {
    const nb = EDGES.filter((e) => e.vertices.includes(v.id)).map((e) => e.vertices.find((x) => x !== v.id));
    return [v.id, ...nb].map((id) => V[id]);
  });
}

// ---------- I06：取り除いた残り ----------

function removalCandidates() {
  const out = [];
  // (a) 頂点を切り取る三角すい（3本の辺の上の点は、となりの頂点か辺の中点）
  for (const v of VERTICES) {
    const edges = EDGES.filter((e) => e.vertices.includes(v.id));
    for (let mask = 0; mask < 8; mask++) {
      const pts = edges.map((e, i) => (mask & (1 << i) ? M[e.id] : V[e.vertices.find((x) => x !== v.id)]));
      out.push({ key: `corner-${v.id}-${mask}`, kind: 'corner', apex: V[v.id], cut: pts });
    }
  }
  // (b) 頂点を頂点とし、その頂点をふくまない面を底面とする四角すい（残りは2つの四角すい）
  for (const v of VERTICES) {
    const away = FACES.filter((f) => !f.vertices.includes(v.id));
    for (const f of away) out.push({ key: `vpyr-${v.id}-${f.id}`, kind: 'vertexPyramid', apex: V[v.id], face: f.id, rest: away.filter((g) => g.id !== f.id).map((g) => g.id) });
  }
  // (c) 立方体の中心を頂点とし、1つの面を底面とする四角すい（残りは5つの四角すい）
  for (const f of FACES) out.push({ key: `cpyr-${f.id}`, kind: 'centerPyramid', apex: CUBE_CENTER_POINT, face: f.id, rest: FACES.filter((g) => g.id !== f.id).map((g) => g.id) });
  return out.map((r) => ({ ...r, ...removalGeometry(r) }));
}

/** 取り除く立体と、残りの立体（凸な部分に分けたもの）の点 */
function removalGeometry(r) {
  if (r.kind === 'corner') {
    const removed = [r.apex, ...r.cut].map((p) => p.position);
    const remaining = [[...VERTICES.filter((v) => v.id !== r.apex.id).map((v) => v.position), ...r.cut.map((p) => p.position)]];
    return { removed, remaining };
  }
  const removed = [r.apex.position, ...faceOf(r.face).vertices.map((id) => V[id].position)];
  const remaining = r.rest.map((g) => [r.apex.position, ...faceOf(g).vertices.map((id) => V[id].position)]);
  return { removed, remaining };
}

let removalCache = null;
const removals = () => (removalCache ??= removalCandidates());

const BUILD = Object.freeze([{ type: 'solidBuild' }, { type: 'solidFade' }]);

export const INSCRIBED_TEMPLATES = [
  // ---------------- ★1 基本 ----------------
  {
    id: 'I01',
    difficulty: 1,
    title: '点を結んでできる立体の名前',
    bases: () => names().map((c) => ({ key: c.key, refs: c.points.map(pointKey), group: c.info.name })),
    build(base) {
      const c = names().find((x) => x.key === base.key);
      const given = labelPoints(c.points);
      return assemble(this, base, {
        given,
        question: `立方体の${joinPointTexts(given)}の${given.length}つの点を結んでできる立体は、次のどれですか。`,
        choices: SOLID_NAMES.map((n) => ({ id: SOLID_IDS[n], label: n, fixed: true })),
        correct: [SOLID_IDS[c.info.name]],
        explanation: X.explainName({ count: given.length, name: c.info.name, faces: c.info.faceCount, vertices: c.info.vertexCount, regular: c.info.regular && c.info.name === '三角すい' }),
        solids: [{ role: 'main', points: nums(c.points) }],
        steps: [...BUILD, { type: 'solidLift', to: 1 }],
      });
    },
  },
  {
    id: 'I02',
    difficulty: 1,
    title: '6つの面の中心を結んでできる立体',
    bases: () => [0, 1, 2, 3].map((v) => ({ key: `v${v}`, refs: [], group: undefined })),
    build(base, rng) {
      const oct = createInscribedOctahedron();
      const info = classifyPolyhedron(oct);
      const answer = info.name === '八面体' && info.regular ? '正八面体' : info.name;
      const pool = ['正四面体', '立方体（正六面体）', '正十二面体', '正二十面体', '四角すい', '三角柱'];
      const others = shuffle(pool, rng).slice(0, 3);
      const given = labelPoints(FACE_CENTERS, ['P', 'Q', 'R', 'S', 'T', 'U']);
      return assemble(this, base, {
        given,
        question: '立方体の6つの面の中心（それぞれの面の対角線の交点）を結んでできる立体は、何という立体ですか。',
        choices: [answer, ...others].map((n, i) => ({ id: i === 0 ? 'answer' : `d${i}`, label: n })),
        correct: ['answer'],
        explanation: X.explainOctahedron(),
        solids: [{ role: 'main', points: nums(FACE_CENTERS) }],
        steps: [...BUILD, { type: 'solidLift', to: 1 }],
        view: 'default',
      });
    },
  },
  // ---------------- ★2 標準 ----------------
  {
    id: 'I03',
    difficulty: 2,
    title: '立方体の中の角すいの体積',
    bases: () => pyramids().map((p) => ({ key: p.key, refs: [p.face], group: `${p.kind}-${p.h}` })),
    build(base, rng) {
      const p = pyramids().find((x) => x.key === base.key);
      const pts = [...p.base, p.apex];
      const poly = convexHull(pts.map((x) => x.position));
      const name = classifyPolyhedron(poly).name;
      const s = chooseSide(SIDES, (n) => realVolume(poly, n).isInteger(), rng);
      const u = new Q(s, 2);
      const volume = realVolume(poly, s);
      const baseArea = p.kind === 'quad' ? Q.of(s * s) : new Q(s * s, 2);
      const height = p.h.mul(u.mul(2));
      if (!baseArea.mul(height).div(3).eq(volume)) throw new Error(`角すいの体積が合いません: ${base.key}`);
      const given = labelPoints(p.kind === 'quad' ? [p.apex] : [...p.base, p.apex]);
      const apex = given.at(-1);
      const baseText = p.kind === 'quad' ? `面${p.face}（1辺${s}cmの正方形）` : `三角形${p.base.map((x) => x.id).join('')}（直角をはさむ2辺が${s}cmの直角三角形）`;
      const question =
        p.kind === 'quad'
          ? `1辺${s}cmの立方体で、面${p.face}を底面とし、${apex.text}を頂点とする四角すいの体積は何cm³ですか。`
          : `1辺${s}cmの立方体で、頂点${p.base.map((x) => x.id).join('・頂点')}を結んだ三角形を底面とし、${apex.text}を頂点とする三角すいの体積は何cm³ですか。`;
      const choices = volumeChoices(volume, [baseArea.mul(height), baseArea.mul(height).div(2), Q.of(s * s * s), volume.mul(2), volume.div(2), volume.mul(3).div(2)]);
      return assemble(this, base, {
        given,
        question,
        choices: choices.map(choiceOf),
        correct: [choices[0].id],
        explanation: X.explainPyramid({ name, baseText, base: baseArea, height, volume }),
        outlines: [nums(pts)],
        solids: [{ role: 'main', points: nums(pts) }],
        steps: [...BUILD, { type: 'solidLift', to: 1, label: `${volume}cm³` }],
        referenceElements: p.kind === 'quad' ? [p.face] : [],
      });
    },
  },
  {
    id: 'I04',
    difficulty: 2,
    title: '正八面体と立方体の体積比',
    bases: () => ['x', 'y', 'z'].flatMap((axis) => ['part', 'whole'].map((dir) => ({ key: `${dir}-${axis}`, refs: [], group: dir, axis, dir }))),
    build(base, rng) {
      const oct = createInscribedOctahedron();
      const ratio = calculatePolyhedronVolume(oct).div(CUBE_VOLUME); // 1/6
      const inverse = base.dir === 'whole';
      const answer = inverse ? Q.of(1).div(ratio) : ratio;
      const pool = inverse ? [3, 4, 8, 2, 12].map((n) => Q.of(n)) : [3, 4, 8, 2, 12].map((n) => new Q(1, n));
      const others = shuffle(pool.filter((x) => !x.eq(answer)), rng).slice(0, 3);
      const label = (q) => `${q}倍`;
      // 正八面体を、軸の向きの2つの四角すいに分ける
      const k = { x: 0, y: 1, z: 2 }[base.axis];
      const apexes = FACE_CENTERS.filter((p) => p.position[k] !== 0);
      const ring = FACE_CENTERS.filter((p) => p.position[k] === 0);
      return assemble(this, base, {
        given: labelPoints(FACE_CENTERS, ['P', 'Q', 'R', 'S', 'T', 'U']),
        question: inverse
          ? '立方体の6つの面の中心を結んで正八面体を作ります。立方体の体積は、正八面体の体積の何倍ですか。'
          : '立方体の6つの面の中心を結んで正八面体を作ります。正八面体の体積は、もとの立方体の体積の何倍ですか。',
        choices: [answer, ...others].map((q, i) => ({ id: i === 0 ? 'answer' : `d${i}`, label: label(q) })),
        correct: ['answer'],
        explanation: X.explainRatio({ inverse }),
        solids: [{ role: 'main', points: nums(FACE_CENTERS) }, ...apexes.map((a) => ({ role: 'part', points: nums([a, ...ring]) }))],
        steps: [...BUILD, { type: 'solidSplit', label: inverse ? '立方体＝正八面体×6' : '正八面体＝立方体×1/6' }],
        view: 'default',
      });
    },
  },
  // ---------------- ★3 応用 ----------------
  {
    id: 'I05',
    difficulty: 3,
    title: '立方体の4つの頂点で作る四面体の体積',
    bases: () => tetraCandidates().map((c) => ({ key: c.key, refs: c.points.map(pointKey), group: c.regular ? 'regular' : 'other' })),
    build(base, rng) {
      const c = tetraCandidates().find((x) => x.key === base.key);
      const poly = convexHull(c.points.map((p) => p.position));
      const s = chooseSide(SIDES, (n) => realVolume(poly, n).isInteger() && new Q(n * n * n, 6).isInteger(), rng);
      const volume = realVolume(poly, s);
      const cube = Q.of(s * s * s);
      const ids = c.points.map((p) => p.id);
      const given = labelPoints(c.points);
      let explanation;
      const solids = [{ role: 'main', points: nums(c.points) }];
      let steps;
      if (c.regular) {
        const corner = new Q(s * s * s, 6);
        if (!cube.sub(corner.mul(4)).eq(volume)) throw new Error('正四面体の体積が合いません');
        explanation = X.explainRegularTetra({ s, corner, cube, volume });
        for (const t of cornerTetras(ids)) solids.push({ role: 'removed', points: nums(t) });
        steps = [{ type: 'solidBuild' }, { type: 'solidRemove', label: `${volume}cm³` }];
      } else {
        // 立方体の面の上にある三角形の面を底面にする
        const face = FACES.find((f) => ids.filter((id) => f.vertices.includes(id)).length === 3);
        if (!face) throw new Error(`底面にできる面がありません: ${base.key}`);
        const baseIds = ids.filter((id) => face.vertices.includes(id));
        const area = new Q(s * s, 2);
        const height = Q.of(s);
        if (!area.mul(height).div(3).eq(volume)) throw new Error(`四面体の体積が合いません: ${base.key}`);
        explanation = X.explainTetra({ baseVertices: baseIds.join(''), base: area, height, volume });
        steps = [...BUILD, { type: 'solidLift', to: 1, label: `${volume}cm³` }];
      }
      const choices = volumeChoices(volume, [cube.div(3), cube.div(6), cube.div(2), cube.div(4), volume.mul(3), cube.sub(volume)]);
      return assemble(this, base, {
        given,
        question: `1辺${s}cmの立方体の${joinPointTexts(given)}の4つの頂点を結んで四面体を作ります。この四面体の体積は何cm³ですか。`,
        choices: choices.map(choiceOf),
        correct: [choices[0].id],
        explanation,
        outlines: [nums(c.points)],
        solids,
        steps,
      });
    },
  },
  {
    id: 'I06',
    difficulty: 3,
    title: '角すいを取り除いた残りの体積',
    // 1けたの1辺で、取り除く立体の体積が整数になるものだけ
    bases: () => removals().filter((r) => chooseSide(SIDES, (n) => realVolume(convexHull(r.removed), n).isInteger())).map((r) => ({ key: r.key, refs: [pointKey(r.apex)], group: r.kind })),
    build(base, rng) {
      const r = removals().find((x) => x.key === base.key);
      const removedPoly = convexHull(r.removed);
      const remainingPolys = r.remaining.map((pts) => convexHull(pts));
      const s = chooseSide(SIDES, (n) => realVolume(removedPoly, n).isInteger(), rng);
      const removed = realVolume(removedPoly, s);
      const remaining = remainingPolys.reduce((sum, p) => sum.add(realVolume(p, s)), Q.of(0));
      const cube = Q.of(s * s * s);
      if (!removed.add(remaining).eq(cube)) throw new Error(`取り除いた部分と残りの体積の和が合いません: ${base.key}`);
      let removedText;
      let given;
      let question;
      if (r.kind === 'corner') {
        given = labelPoints([r.apex, ...r.cut]);
        const legs = r.cut.map((p) => (p.kind === 'midpoint' ? s / 2 : s)).sort((a, b) => b - a);
        const area = new Q(legs[0] * legs[1], 2);
        const h = Q.of(legs[2]);
        if (!area.mul(h).div(3).eq(removed)) throw new Error(`三角すいの体積が合いません: ${base.key}`);
        removedText = `取り除いた三角すいは、頂点${r.apex.id}に集まる3本の辺の上の長さが${legs.join('cm・')}cmです。底面を直角三角形（${legs[0]}×${legs[1]}÷2＝${area}cm²）、高さを${h}cmとすると、体積は${area}×${h}÷3＝${removed}cm³。`;
        question = `1辺${s}cmの立方体から、${joinPointTexts(given)}を頂点とする三角すいを切り取りました。残りの立体の体積は何cm³ですか。`;
      } else {
        given = labelPoints([r.apex]);
        const h = r.kind === 'centerPyramid' ? new Q(s, 2) : Q.of(s);
        const area = Q.of(s * s);
        if (!area.mul(h).div(3).eq(removed)) throw new Error(`四角すいの体積が合いません: ${base.key}`);
        removedText = `取り除いた四角すいは、底面が面${r.face}（${area}cm²）、高さが${h}cmなので、体積は${area}×${h}÷3＝${removed}cm³。`;
        question = `1辺${s}cmの立方体から、面${r.face}を底面とし、${given[0].text}を頂点とする四角すいを取り除きました。残りの立体の体積は何cm³ですか。`;
      }
      const choices = volumeChoices(remaining, [removed, cube.sub(removed.mul(3)), cube.sub(removed.div(3).mul(2)), cube.sub(removed.mul(2)), cube, remaining.add(removed.div(2))]);
      return assemble(this, base, {
        given,
        question,
        choices: choices.map(choiceOf),
        correct: [choices[0].id],
        explanation: X.explainRemoval({ removedText, removed, cube, volume: remaining }),
        outlines: [r.removed],
        solids: [{ role: 'removed', points: r.removed }, ...r.remaining.map((pts) => ({ role: 'remaining', points: pts }))],
        steps: [{ type: 'solidRemove', label: `残り ${remaining}cm³` }],
        referenceElements: r.kind === 'corner' ? [] : [r.face],
      });
    },
  },
];

