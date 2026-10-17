/**
 * 立方体の表面の最短経路の問題テンプレート（S01〜S06）
 *
 * 出発点・到着点は、立方体の頂点・辺の中点・面の対角線の交点から選ぶ（同じ面の上にない2点）。
 * 道の長さ・最短経路は core/cubeSurfacePath で、面の並びを広げて正確に計算する（同じ長さの道もすべて見つける）。
 * 問題文・選択肢・正解・解説・3D（scene.surfacePath）は、すべて同じ計算結果から作る。
 *
 * いろいろな位置の問題にするため、基準の点の組（出発点は頂点A・辺ABの中点・面ABCDの対角線の交点）を
 * 立方体の回転（24通り）で動かしてから、あらためて最短経路を計算する。
 */
import { Q as Frac, qvec, vSub, vLength2, vToNumbers, vEq } from '../../core/rational.js';
import { Surd, SurdSum } from '../../core/surd.js';
import { findShortestSurfacePaths, bentPath, calculatePathLength, polylineKey, enumerateFacePaths, validateUnfoldedPath } from '../../core/cubeSurfacePath.js';
import { unfoldFaces, unfoldedFaceCorners, facesOfPoint, sharedEdge } from '../../core/cubeSurfaceUnfolding.js';
import { EDGES, VERTICES } from '../../core/cubeConstants.js';
import { VERTEX_POINTS, MIDPOINTS, FACE_CENTERS, labelPoints, pointKey, CUBE_ROTATIONS, rotatePoint, findSurfacePoint, viewDirectionForPoints } from '../surfacePoints.js';
import { CHOICE_MARKS } from '../decoratedCube.js';
import { surdChoices } from '../cubeCutting/cubeCuttingGenerators.js';
import { shuffle, pick } from '../../utils/random.js';
import { buildElementChoices } from '../questionUtils.js';
import { describeEdgePoint } from '../../core/cubeCutting.js';
import * as X from './surfacePathExplanations.js';

export const SURFACE_PATH_CATEGORY = 'surfacePath';

/** 道の色（ア・イ・ウ…の順。緑は正解、オレンジは点に使うので使わない） */
export const PATH_COLORS = Object.freeze(['#1e66d0', '#8e24aa', '#d81b60', '#00897b', '#6d4c41']);

const ALL_POINTS = [...VERTEX_POINTS, ...MIDPOINTS, ...FACE_CENTERS];
/** 基準の出発点（回転で、ほかの頂点・中点・面の中心にも動かす） */
const STARTS = [VERTEX_POINTS[0], MIDPOINTS[0], FACE_CENTERS[0]];

const VERTEX_Q = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));

let cache = null;
/** 基準の点の組（同じ面の上にない2点）と最短経路の計算結果 */
export function basePairs() {
  if (cache) return cache;
  const list = [];
  for (const p of STARTS) {
    for (const q of ALL_POINTS) {
      if (pointKey(p) === pointKey(q)) continue;
      const fp = facesOfPoint(p.position);
      if (facesOfPoint(q.position).some((f) => fp.includes(f))) continue;
      const res = findShortestSurfacePaths(p.position, q.position);
      list.push({ key: `${pointKey(p)}>${pointKey(q)}`, p, q, res });
    }
  }
  cache = list;
  return list;
}

const findPair = (key) => basePairs().find((x) => x.key === key);

/** 基準の組を回転して、出題する2点と最短経路の計算結果を作る */
function rotatedPair(pair, rng) {
  const m = pick(CUBE_ROTATIONS, rng);
  const p = findSurfacePoint(rotatePoint(m, pair.p.position));
  const q = findSurfacePoint(rotatePoint(m, pair.q.position));
  const [P, Qp] = labelPoints([p, q], ['P', 'Q']);
  return { P, Q: Qp, res: findShortestSurfacePaths(P.position, Qp.position) };
}

const nums = (polyline) => polyline.map((p) => vToNumbers(qvec(p)));
const lengthOf = (path) => (path.length instanceof SurdSum ? path.length : new SurdSum([path.length]));

/** 折れ線に、同じ点が続くところがないか */
const hasRepeat = (polyline) => polyline.some((p, i) => i > 0 && vEq(qvec(p), qvec(polyline[i - 1])));

/**
 * まちがいの候補になる道：ほかの面を通る直線の道（長い）と、最短経路を共通の辺の中点・頂点で折り曲げた道
 * @returns {{ shortest: object[], longer: object[] }} どれも { polyline, faces, length: SurdSum, kind }
 */
export function candidatePaths(res, P, Q, { minRatio = 1.05 } = {}) {
  const min = Surd.sqrt(res.length2).toNumber();
  const shortest = res.shortest.map((x) => ({ polyline: x.polyline, faces: x.faces, length: lengthOf(x), kind: 'geodesic' }));
  const seen = new Set(res.all.map((x) => polylineKey(x.polyline)));
  const longer = res.all.filter((x) => x.length2.cmp(res.length2) > 0).map((x) => ({ polyline: x.polyline, faces: x.faces, length: lengthOf(x), kind: 'longer' }));
  for (const sp of res.shortest.slice(0, 2)) {
    const edges = sp.faces.slice(1).map((f, i) => sharedEdge(sp.faces[i], f));
    if (edges.length === 0) continue;
    const options = [
      edges.map((e) => midpointOf(e)),
      edges.map((e) => VERTEX_Q.get(EDGES.find((x) => x.id === e).vertices[0])),
      edges.map((e) => VERTEX_Q.get(EDGES.find((x) => x.id === e).vertices[1])),
    ];
    for (const bends of options) {
      const b = bentPath(P.position, Q.position, sp.faces, bends);
      const key = polylineKey(b.polyline);
      if (seen.has(key) || hasRepeat(b.polyline)) continue;
      seen.add(key);
      longer.push({ polyline: b.polyline, faces: b.faces, length: b.length, kind: 'bent' });
    }
  }
  return { shortest, longer: longer.filter((x) => x.length.toNumber() >= min * minRatio) };
}

const midpointOf = (edgeId) => {
  const [a, b] = EDGES.find((e) => e.id === edgeId).vertices.map((id) => VERTEX_Q.get(id));
  return a.map((x, i) => x.add(b[i]).div(2));
};

/** 道の長さの表示（1辺を2cmとしたとき） */
const fmtLength = (len) => len.format('cm');

/** 3D の点（P・Q。頂点にはラベルをつけない） */
const scenePoints = (P, Q) => [P, Q].map((x) => ({ kind: x.kind, id: x.id, label: x.label, position: [...x.position] }));

const UNFOLD_STEPS = Object.freeze([
  { type: 'pathHighlight' },
  { type: 'pathTravel' },
  { type: 'pause', ms: 300 },
  { type: 'pathUnfold', to: 1 },
  { type: 'pause', ms: 900 },
  { type: 'pathUnfold', to: 0 },
]);

function assemble(template, base, { P, Q, question, type = 'single', choices, correct, explanation, candidates = [], solution, highlight = [] }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: SURFACE_PATH_CATEGORY,
    difficulty: template.difficulty,
    type,
    question,
    hint: { text: X.HINTS[template.id] },
    scene: {
      model: 'surfacePath',
      referenceElements: [],
      cameraPreset: viewDirectionForPoints([P.position, Q.position]),
      surfacePath: { points: scenePoints(P, Q), candidates, solution },
      showLabels: true,
    },
    choices,
    correctAnswers: correct,
    explanation: { text: explanation, highlightElements: highlight, animation: 'highlightElements', reveal: { steps: UNFOLD_STEPS.map((s) => ({ ...s })) } },
  };
}

/** 正解の道の 3D 演出データ（緑で示す道・広げる面と道・長さの表示） */
const solutionOf = (paths, { highlight = [], label = '' } = {}) => ({
  polylines: paths.map((p) => nums(p.polyline)),
  highlight,
  unfold: { faces: [...paths[0].faces], polyline: nums(paths[0].polyline) },
  ...(label ? { label } : {}),
});

/** 色をつけた候補の道（ア・イ…）。並べる順はシャッフルしてから記号をつける */
function labelCandidates(list, rng) {
  return shuffle(list, rng).map((c, i) => ({ ...c, id: `path${i}`, label: CHOICE_MARKS[i], color: PATH_COLORS[i] }));
}

const candidateScene = (list) => list.map((c) => ({ id: c.id, label: c.label, color: c.color, polyline: nums(c.polyline) }));
const candidateChoice = (c) => ({ id: c.id, label: c.label, fixed: true, visual: { type: 'swatch', face: { color: c.color, label: c.label } } });

const questionStart = (P, Q) => `立方体の表面を通って、${P.text}から${Q.text}まで行きます。`;

/** 広げた図の上の、直角をはさむ2辺（単位の数） */
function legsOf(path) {
  const { p, q } = path.plane;
  return [q[0].sub(p[0]).abs(), q[1].sub(p[1]).abs()];
}

// ---------- 展開図の図（S04） ----------

/** 面の並びを広げた図（2D）。line：道の点（2D）。頂点の文字は、同じ位置には1つだけ */
function netFigure(faces, P, Q, line) {
  const unfolding = unfoldFaces(faces);
  const faceList = faces.map((f, k) => {
    const corners = unfoldedFaceCorners(unfolding, k);
    return { id: f, corners: corners.map((c) => c.at.map((x) => x.toNumber())), letters: corners.map((c) => c.vertex) };
  });
  const at = (pt, k) => unfolding.toPlane(qvec(pt.position), k).map((x) => x.toNumber());
  return {
    type: 'pathNet',
    faces: faceList,
    points: [
      // 頂点の点は、図の頂点の文字でわかるので、点の文字はつけない
      { label: P.label ?? '', at: at(P, 0) },
      { label: Q.label ?? '', at: at(Q, faces.length - 1) },
    ],
    path: line(unfolding),
  };
}

/** 道（3D の折れ線）を、その面の並びの広げた図に置く */
const lineOnNet = (polyline) => (unfolding) => polyline.map((p, i) => unfolding.toPlane(qvec(p), Math.min(i, unfolding.faces.length - 1)).map((x) => x.toNumber()));

/** 直線が、広げた面の外を通るか（面の外にはみ出す図） */
function leavesFaces(figure) {
  const [a, b] = [figure.points[0].at, figure.points[1].at];
  const inside = (x, y) =>
    figure.faces.some((f) => {
      const xs = f.corners.map((c) => c[0]);
      const ys = f.corners.map((c) => c[1]);
      return x >= Math.min(...xs) - 1e-6 && x <= Math.max(...xs) + 1e-6 && y >= Math.min(...ys) - 1e-6 && y <= Math.max(...ys) + 1e-6;
    });
  for (let i = 1; i < 40; i++) {
    const t = i / 40;
    if (!inside(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return true;
  }
  return false;
}

/** 図の大きさをそろえる（同じ縮尺で並べ、長さを比べられるように） */
function frameFigures(figures) {
  const box = (f) => {
    const pts = f.faces.flatMap((x) => x.corners).concat(f.path);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  const sizes = figures.map(box);
  // 縦長の図は横にする（ボタンに収まりやすく）
  const rotated = figures.map((f, i) => (sizes[i][1] > sizes[i][0] ? rotateFigure(f) : f));
  const frame = rotated.map(box).reduce((m, s) => [Math.max(m[0], s[0]), Math.max(m[1], s[1])], [0, 0]);
  return rotated.map((f) => ({ ...f, frame: frame.map((x) => Math.round(x * 1000) / 1000) }));
}

const rot = ([x, y]) => [-y + 0, x + 0];
function rotateFigure(f) {
  return {
    ...f,
    faces: f.faces.map((x) => ({ ...x, corners: x.corners.map(rot) })),
    points: f.points.map((p) => ({ ...p, at: rot(p.at) })),
    path: f.path.map(rot),
  };
}

/**
 * S04 のまちがいの図の候補（遠回りの直線・折れ曲がった道・面からはみ出す直線）
 * @param {object} best 正解にする最短経路
 */
function netDistractorPool(P, Q, res, best) {
  const pool = [];
  for (const x of res.all.filter((y) => y.length2.cmp(res.length2) > 0).slice(0, 3)) pool.push({ ...netFigure(x.faces, P, Q, lineOnNet(x.polyline)), kind: 'longer' });
  const { longer } = candidatePaths(res, P, Q);
  for (const x of longer.filter((y) => y.kind === 'bent' && y.faces.join() === best.faces.join())) pool.push({ ...netFigure(x.faces, P, Q, lineOnNet(x.polyline)), kind: 'bent' });
  const invalid = [];
  for (const s0 of facesOfPoint(P.position)) {
    for (const e0 of facesOfPoint(Q.position)) {
      for (const fp of enumerateFacePaths(s0, e0, 4)) if (fp.length > 1 && !validateUnfoldedPath(P.position, Q.position, fp).valid) invalid.push(fp);
    }
  }
  let outside = 0;
  for (const fp of invalid) {
    if (outside >= 2) break;
    const fig = netFigure(fp, P, Q, (unf) => [unf.toPlane(qvec(P.position), 0), unf.toPlane(qvec(Q.position), fp.length - 1)].map((p) => p.map((x) => x.toNumber())));
    if (leavesFaces(fig)) {
      pool.push({ ...fig, kind: 'outside' });
      outside += 1;
    }
  }
  return pool;
}

/** S04 で正解にできる最短経路（まちがいの図が3つ以上作れるもの） */
function netAnswerCandidates(P, Q, res) {
  return res.shortest.filter((best) => netDistractorPool(P, Q, res, best).length >= 3);
}

/** 2面を通る道・3面以上を通る道の、それぞれいちばん短いもの */
function routeGroups(res) {
  const two = res.all.filter((x) => x.faces.length === 2);
  const many = res.all.filter((x) => x.faces.length >= 3);
  return { two: two[0] ?? null, many: many[0] ?? null };
}

// ---------- 出題の基準 ----------

const baseOf = (pair, extra = {}) => ({ key: pair.key, refs: [pointKey(pair.p), pointKey(pair.q)], group: pair.q.kind, ...extra });
const facesCount = (pair) => pair.res.shortest[0].faces.length;

/** 最短経路が2面だけを通り、直角三角形の2辺がどちらも 0 でない */
const twoFacePairs = () => basePairs().filter((x) => x.res.shortest.every((s) => s.faces.length === 2) && legsOf(x.res.shortest[0]).every((l) => !l.isZero()));
/**
 * 2面を通る道と3面以上を通る道の両方があり、長さをくらべる必要がある（3面以上の道が、最短の 1.4 倍より短い）
 */
const manyFacePairs = () =>
  basePairs().filter((x) => {
    const { two, many } = routeGroups(x.res);
    // 2面では行けない（向かい合う面の内部の点どうし）か、3面以上の道が最短の 1.4 倍より短い
    return many && (!two || many.length.toNumber() <= x.res.length.toNumber() * 1.4);
  });

/** 長さの選択肢のまちがい：内部を通る直線・2辺の和・ほかの道の長さなど */
function distanceDistractors(pair, res, u, [a, b]) {
  const inside = Surd.sqrt(vLength2(vSub(qvec(pair.Q.position), qvec(pair.P.position)))).scale(u);
  const others = res.all.filter((x) => x.length2.cmp(res.length2) > 0).map((x) => x.length.scale(u));
  const legSum = new Surd(a.add(b).mul(u));
  const off = Surd.sqrt(a.add(1).mul(a.add(1)).add(b.mul(b))).scale(u);
  return [inside, ...others.slice(0, 2), legSum, off];
}

export const SURFACE_PATH_TEMPLATES = [
  // ---------------- ★1 基本 ----------------
  {
    id: 'S01',
    difficulty: 1,
    title: '最短経路はどの辺を通る？',
    // 最短経路が1本に決まり、2つの面を通る（1本の辺を横切る）組だけ
    bases: () => basePairs().filter((x) => x.res.shortest.length === 1 && x.res.shortest[0].faces.length === 2).map((x) => baseOf(x)),
    build(base, rng) {
      const { P, Q, res } = rotatedPair(findPair(base.key), rng);
      const path = res.shortest[0];
      const edge = sharedEdge(path.faces[0], path.faces[1]);
      const crossing = describeEdgePoint(path.polyline[1], edge);
      // まちがい：P・Q がのっている面の辺（P・Q がのっている辺はのぞく）
      const near = new Set([...facesOfPoint(P.position), ...facesOfPoint(Q.position)].flatMap((f) => EDGES.filter((e) => e.vertices.every((v) => f.includes(v))).map((e) => e.id)));
      const onPoint = (e) => [P, Q].some((x) => x.kind === 'midpoint' && x.id === e) || [P, Q].some((x) => x.kind === 'vertex' && e.includes(x.id));
      const pool = EDGES.map((e) => e.id).filter((e) => e !== edge && !onPoint(e));
      const preferred = pool.filter((e) => near.has(e));
      // 別の辺を通る道で、いちばん短いもの（解説でくらべる）
      const other = res.all.find((x) => x !== path && x.faces.length >= 2 && sharedEdge(x.faces[0], x.faces[1]) !== edge);
      return assemble(this, base, {
        P,
        Q,
        question: `${questionStart(P, Q)}いちばん短い道（最短経路）は、立方体のどの辺を通りますか。`,
        choices: buildElementChoices({ correct: [edge], pool, preferred, total: 4, rng }),
        correct: [edge],
        explanation: X.explainEdge({
          faces: path.faces,
          from: P.short,
          to: Q.short,
          edge,
          where: crossing.kind === 'midpoint' ? '中点' : `${crossing.from}側から${crossing.ratio[0]}:${crossing.ratio[1]}の点`,
          length: fmtLength(path.length),
          other: other ? { edge: sharedEdge(other.faces[0], other.faces[1]), length: fmtLength(other.length) } : null,
        }),
        highlight: [edge],
        solution: solutionOf([path]),
      });
    },
  },
  {
    id: 'S02',
    difficulty: 1,
    title: '2つの道のどちらが短い？',
    bases: () =>
      basePairs().flatMap((x) => {
        const list = [];
        if (candidatePaths(x.res, x.p, x.q).longer.length >= 1) list.push(baseOf(x, { key: `${x.key}#a`, group: 'a', variant: 'a' }), baseOf(x, { key: `${x.key}#b`, group: 'b', variant: 'b' }));
        if (x.res.shortest.length >= 2) list.push(baseOf(x, { key: `${x.key}#same`, group: 'same', variant: 'same' }));
        return list;
      }),
    build(base, rng) {
      const pairKey = base.key.split('#')[0];
      const { P, Q, res } = rotatedPair(findPair(pairKey), rng);
      const { shortest, longer } = candidatePaths(res, P, Q, { minRatio: 1.08 });
      let pair;
      if (base.variant === 'same') pair = shuffle(shortest, rng).slice(0, 2);
      else {
        const s = pick(shortest, rng);
        const l = pick(longer.length ? longer : candidatePaths(res, P, Q).longer, rng);
        pair = base.variant === 'a' ? [s, l] : [l, s];
      }
      const [a, b] = pair.map((c, i) => ({ ...c, id: `path${i}`, label: CHOICE_MARKS[i], color: PATH_COLORS[i] }));
      const cmp = a.length.cmp(b.length);
      const answer = cmp === 0 ? 'same' : cmp < 0 ? 'a' : 'b';
      const winners = answer === 'same' ? [a, b] : [answer === 'a' ? a : b];
      return assemble(this, base, {
        P,
        Q,
        question: `${questionStart(P, Q)}色をつけたアとイの道では、どちらが短いですか。`,
        choices: [
          { id: 'a', label: 'アのほうが短い', fixed: true },
          { id: 'b', label: 'イのほうが短い', fixed: true },
          { id: 'same', label: 'どちらも同じ長さ', fixed: true },
        ],
        correct: [answer],
        explanation: X.explainCompare({ a: fmtLength(a.length), b: fmtLength(b.length), answer }),
        candidates: candidateScene([a, b]),
        solution: solutionOf(winners.filter((w) => w.kind === 'geodesic').length ? winners.filter((w) => w.kind === 'geodesic') : winners, { highlight: winners.map((w) => w.id) }),
      });
    },
  },
  // ---------------- ★2 標準 ----------------
  {
    id: 'S03',
    difficulty: 2,
    title: '2面を通る最短距離',
    bases: () => twoFacePairs().map((x) => baseOf(x)),
    build(base, rng) {
      const { P, Q, res } = rotatedPair(findPair(base.key), rng);
      const s = pick([4, 6], rng);
      const u = new Frac(s / 2);
      const path = res.shortest[0];
      const [a, b] = legsOf(path);
      const length = res.length.scale(u);
      const choices = surdChoices(length, distanceDistractors({ P, Q }, res, u, [a, b]), 'cm');
      return assemble(this, base, {
        P,
        Q,
        question: `1辺${s}cmの立方体の表面を通って、${P.text}から${Q.text}まで、2つの面を通って行きます。いちばん短い道のりは何cmですか。`,
        choices: choices.map(({ id, label }) => ({ id, label })),
        correct: [choices[0].id],
        explanation: X.explainDistance({ faces: path.faces, from: P.short, to: Q.short, a: a.mul(u).toNumber(), b: b.mul(u).toNumber(), length2: res.length2.mul(u).mul(u), length, count: res.shortest.length }),
        solution: solutionOf(res.shortest, { label: length.format('cm') }),
      });
    },
  },
  {
    id: 'S04',
    difficulty: 2,
    title: '展開図の上の最短経路',
    bases: () => basePairs().filter((x) => facesCount(x) <= 3 && netAnswerCandidates(labelPoints([x.p, x.q], ['P', 'Q'])[0], labelPoints([x.p, x.q], ['P', 'Q'])[1], x.res).length > 0).map((x) => baseOf(x, { group: `f${facesCount(x)}` })),
    build(base, rng) {
      const { P, Q, res } = rotatedPair(findPair(base.key), rng);
      const best = pick(netAnswerCandidates(P, Q, res), rng);
      const correct = { ...netFigure(best.faces, P, Q, lineOnNet(best.polyline)), kind: 'correct' };
      const pool = shuffle(netDistractorPool(P, Q, res, best), rng);
      // 種類がかたよらないように選ぶ
      const chosen = [];
      for (const kind of shuffle(['longer', 'bent', 'outside'], rng)) {
        const x = pool.find((f) => f.kind === kind && !chosen.includes(f));
        if (x) chosen.push(x);
      }
      for (const x of pool) if (chosen.length < 3 && !chosen.includes(x)) chosen.push(x);
      if (chosen.length < 3) throw new Error(`展開図のまちがいの図が足りません: ${base.key}`);
      const figures = frameFigures([correct, ...chosen.slice(0, 3)]).map((f, i) => ({ ...f, id: `net${i}` }));
      return assemble(this, base, {
        P,
        Q,
        question: `${questionStart(P, Q)}最短経路を、通る面だけを広げた図にかきました。正しくかけている図はどれですか。`,
        choices: figures.map((f, i) => ({
          id: f.id,
          label: CHOICE_MARKS[i],
          labelByPosition: true,
          visual: { type: 'pathNet', faces: f.faces, points: f.points, path: f.path, frame: f.frame },
          description: i === 0 ? '面を広げて2点を直線で結んだ図' : 'ちがう図',
        })),
        correct: ['net0'],
        explanation: X.explainNet({ choiceId: 'net0', faces: best.faces, from: P.short, to: Q.short, kinds: chosen.slice(0, 3).map((c) => c.kind) }),
        solution: solutionOf([best]),
      });
    },
  },
  // ---------------- ★3 応用 ----------------
  {
    id: 'S05',
    difficulty: 3,
    title: '3面以上を通る道もくらべる最短距離',
    bases: () => manyFacePairs().map((x) => baseOf(x)),
    build(base, rng) {
      const { P, Q, res } = rotatedPair(findPair(base.key), rng);
      const s = pick([4, 6], rng);
      const u = new Frac(s / 2);
      const path = res.shortest[0];
      const [a, b] = legsOf(path);
      const length = res.length.scale(u);
      const { two, many } = routeGroups(res);
      const choices = surdChoices(length, [...[two, many].filter(Boolean).map((x) => x.length.scale(u)), ...distanceDistractors({ P, Q }, res, u, [a, b])], 'cm');
      return assemble(this, base, {
        P,
        Q,
        question: `1辺${s}cmの立方体の表面を通って、${P.text}から${Q.text}まで行きます。${two ? '2つの面を通る道と、3つ以上の面を通る道の両方を考えると、' : '通る面の組み合わせを考えると、'}いちばん短い道のりは何cmですか。`,
        choices: choices.map(({ id, label }) => ({ id, label })),
        correct: [choices[0].id],
        explanation: X.explainRoutes({
          two: two ? { faces: two.faces, length: two.length.scale(u).format('cm') } : null,
          many: { faces: many.faces, length: many.length.scale(u).format('cm') },
          shortestIsMany: path.faces.length >= 3,
          detail: X.explainDistance({ faces: path.faces, from: P.short, to: Q.short, a: a.mul(u).toNumber(), b: b.mul(u).toNumber(), length2: res.length2.mul(u).mul(u), length, count: res.shortest.length }),
        }),
        solution: solutionOf(res.shortest, { label: length.format('cm') }),
      });
    },
  },
  {
    id: 'S06',
    difficulty: 3,
    title: '最短経路をすべて選ぶ',
    bases: () => basePairs().filter((x) => x.res.shortest.length >= 2 && candidatePaths(x.res, x.p, x.q).longer.length >= 1).map((x) => baseOf(x)),
    build(base, rng) {
      const { P, Q, res } = rotatedPair(findPair(base.key), rng);
      const { shortest, longer } = candidatePaths(res, P, Q);
      // 図がごちゃごちゃしないように、道は3本（最短経路2本と、長い道1本）
      const picked = [...shuffle(shortest, rng).slice(0, 2), ...shuffle(longer, rng).slice(0, 1)];
      const list = labelCandidates(picked, rng);
      const correct = list.filter((c) => c.kind === 'geodesic');
      return assemble(this, base, {
        P,
        Q,
        type: 'multiple',
        question: `${questionStart(P, Q)}色をつけた${list.map((c) => c.label).join('・')}の道のうち、最短経路をすべて選びましょう。`,
        choices: list.map(candidateChoice),
        correct: correct.map((c) => c.id),
        explanation: X.explainChoice({
          correctLabels: correct.map((c) => c.label),
          faces: correct[0].faces,
          lengths: list.map((c) => ({ label: c.label, length: fmtLength(c.length) })),
        }) + `${correct.map((c) => c.label).join('・')}は長さが同じで、どれも最短経路です。`,
        candidates: candidateScene(list),
        solution: solutionOf(correct, { highlight: correct.map((c) => c.id) }),
      });
    },
  },
];

export { calculatePathLength };
