/**
 * 立方体の切断（平面で切ったときの切り口・切り分けた2つの立体。Three.js・DOM 非依存）
 *
 * 座標は cubeConstants（中心が原点・一辺 2）。計算はすべて有理数（core/rational）で行うので、
 * 切り口の頂点・面積・体積は小数の誤差なく正確に求まる。3D の切断の形もこの結果から作る。
 *
 * 平面：3点 P1・P2・P3 を通る平面 n・X = d（n = (P2−P1)×(P3−P1)。3点が一直線上なら平面は決まらない）
 * 切り口：12本の辺と平面の交点（同じ点は1つにまとめる）を、平面の上で一周する順に並べた凸多角形（3〜6角形）
 */
import { VERTICES, EDGES, FACES } from './cubeConstants.js';
import { Q, Q0, qvec, vAdd, vSub, vScale, vDot, vCross, vIsZero, vEq, vKey, vToNumbers, vLength2, vAverage } from './rational.js';
import { Surd } from './surd.js';

const VERTEX_POSITIONS = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));

/** 頂点の位置（有理数のベクトル） */
export const vertexQ = (id) => VERTEX_POSITIONS.get(id);

/** 有理数のベクトルを、互いに素な整数のベクトル（最初の 0 でない成分が正）にそろえる */
function primitive(v) {
  const lcm = v.reduce((m, x) => {
    const g = gcdInt(m, x.d);
    return (m / g) * x.d;
  }, 1);
  let ints = v.map((x) => x.mul(lcm).n);
  const g = ints.reduce((a, b) => gcdInt(a, b), 0) || 1;
  ints = ints.map((x) => x / g);
  const first = ints.find((x) => x !== 0);
  if (first < 0) ints = ints.map((x) => -x);
  return qvec(ints);
}

function gcdInt(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * 3点を通る平面。3点が一直線上なら null
 * @param {number[]|Q[]} p1
 * @returns {{ normal: Q[], d: Q } | null}
 */
export function planeFromThreePoints(p1, p2, p3) {
  const [a, b, c] = [p1, p2, p3].map((p) => qvec(p));
  const n = vCross(vSub(b, a), vSub(c, a));
  if (vIsZero(n)) return null;
  const normal = primitive(n);
  return { normal, d: vDot(normal, a) };
}

/** 点が平面のどちら側か（n・X − d。0 なら平面の上） */
export const planeSide = (plane, p) => vDot(plane.normal, qvec(p)).sub(plane.d);

/**
 * 線分 AB と平面の交わり
 * @returns {{ kind: 'none'|'point'|'segment', points: Q[][], t?: Q }}
 *   segment：線分全体が平面の上 / point：1点で交わる（t は A からの割合）
 */
export function intersectPlaneWithSegment(plane, a, b) {
  const A = qvec(a);
  const B = qvec(b);
  const fa = planeSide(plane, A);
  const fb = planeSide(plane, B);
  if (fa.isZero() && fb.isZero()) return { kind: 'segment', points: [A, B] };
  if (fa.sign() * fb.sign() > 0) return { kind: 'none', points: [] };
  const t = fa.div(fa.sub(fb));
  return { kind: 'point', points: [vAdd(A, vScale(vSub(B, A), t))], t };
}

/** 平面が立方体を2つに分けるか（平面の両側に立方体の頂点がある） */
export function cutsCube(plane) {
  const sides = VERTICES.map((v) => planeSide(plane, v.position).sign());
  return sides.includes(1) && sides.includes(-1);
}

/** 点が立方体の表面のどの面の上にあるか（面 ID の一覧） */
export function facesContaining(p) {
  const P = qvec(p);
  return FACES.filter((f) => {
    const axis = f.normal.findIndex((x) => x !== 0);
    return P[axis].eq(f.normal[axis]);
  }).map((f) => f.id);
}

/**
 * 平面と立方体の交わり（切り口）
 * @returns {{ valid: boolean, plane, polygon: { position: Q[], edges: string[], vertex: string|null }[], faces: string[] }}
 *   polygon：切り口の頂点（一周する順）。edges はその点がのっている辺、vertex は立方体の頂点と重なるとき
 *   faces：切り口の各辺がのっている面（polygon[i] → polygon[i+1] の辺）
 */
export function intersectPlaneWithCube(plane) {
  if (!plane || !cutsCube(plane)) return { valid: false, plane, polygon: [], faces: [] };
  const map = new Map();
  const add = (p, edgeId) => {
    const key = vKey(p);
    if (!map.has(key)) {
      const vertex = VERTICES.find((v) => vEq(VERTEX_POSITIONS.get(v.id), p))?.id ?? null;
      map.set(key, { position: p, edges: [], vertex });
    }
    const entry = map.get(key);
    if (!entry.edges.includes(edgeId)) entry.edges.push(edgeId);
  };
  for (const edge of EDGES) {
    const [a, b] = edge.vertices.map((id) => VERTEX_POSITIONS.get(id));
    const res = intersectPlaneWithSegment(plane, a, b);
    for (const p of res.points) add(p, edge.id);
  }
  const polygon = orderSectionVertices([...map.values()], plane);
  if (polygon.length < 3) return { valid: false, plane, polygon: [], faces: [] };
  const faces = polygon.map((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const common = facesContaining(p.position).filter((f) => facesContaining(q.position).includes(f));
    return common[0] ?? null;
  });
  return { valid: faces.every(Boolean), plane, polygon, faces };
}

/**
 * 切り口の頂点を、平面の上で一周する順に並べる（法線の向きから見て反時計回り）。
 * 一直線上にある余分な点は除く
 * @param {{ position: Q[] }[]} vertices
 */
export function orderSectionVertices(vertices, plane) {
  if (vertices.length < 3) return [...vertices];
  const n = vToNumbers(plane.normal);
  const center = vToNumbers(vAverage(vertices.map((v) => v.position)));
  // 平面の上の2つの軸
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const u = cross(n, ref);
  const w = cross(n, u);
  const angle = (v) => {
    const p = vToNumbers(v.position).map((x, i) => x - center[i]);
    return Math.atan2(dot(p, w), dot(p, u));
  };
  let sorted = [...vertices].sort((a, b) => angle(a) - angle(b));
  // 法線から見て反時計回りにそろえる（正確な計算で向きを確かめる）
  if (polygonNormal(sorted.map((v) => v.position)).reduce((s, x, i) => s.add(x.mul(plane.normal[i])), Q0).sign() < 0) sorted.reverse();
  // 一直線上の点を除く
  let changed = true;
  while (changed && sorted.length > 3) {
    changed = false;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[(i + sorted.length - 1) % sorted.length].position;
      const b = sorted[i].position;
      const c = sorted[(i + 1) % sorted.length].position;
      if (vIsZero(vCross(vSub(b, a), vSub(c, b)))) {
        sorted = sorted.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return sorted;
}

/** 多角形の Σ p_i × p_{i+1}（大きさが面積の2倍、向きが面の向き） */
function polygonNormal(points) {
  let s = qvec([0, 0, 0]);
  for (let i = 0; i < points.length; i++) s = vAdd(s, vCross(points[i], points[(i + 1) % points.length]));
  return s;
}

/** 多角形の面積の2乗（有理数） */
export function polygonArea2(points) {
  return vLength2(polygonNormal(points)).div(4);
}

/** 切り口の面積（立方体の一辺 2 のとき。√ をふくむ正確な数） */
export function calculateSectionArea(section) {
  return Surd.sqrt(polygonArea2(section.polygon.map((p) => p.position)));
}

/** 切り口が凸多角形として正しいか（同じ平面・同じ向きに曲がる・自己交差なし） */
export function isConvexPlanarPolygon(points, plane) {
  if (points.length < 3) return false;
  if (!points.every((p) => planeSide(plane, p).isZero())) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    if (vDot(vCross(vSub(b, a), vSub(c, b)), plane.normal).sign() <= 0) return false;
  }
  // 向きをそろえた凸多角形なら、角の合計が一周（自己交差しない）。外角の合計で確かめる
  let turn = 0;
  const pts = points.map(vToNumbers);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const u = b.map((x, k) => x - a[k]);
    const v = c.map((x, k) => x - b[k]);
    const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
    turn += Math.acos(Math.max(-1, Math.min(1, cos)));
  }
  return Math.abs(turn - 2 * Math.PI) < 1e-9;
}

// ---------- 切り口の形 ----------

/** 形の名前の、より広い名前（「正方形」は「長方形」「ひし形」でもある）。選択肢でまぎらわしくならないように使う */
export const SHAPE_SUPERSETS = Object.freeze({
  正三角形: ['二等辺三角形', '三角形'],
  二等辺三角形: ['三角形'],
  直角三角形: ['三角形'],
  三角形: [],
  正方形: ['長方形', 'ひし形', '平行四辺形', '台形', '四角形'],
  長方形: ['平行四辺形', '台形', '四角形'],
  ひし形: ['平行四辺形', '台形', '四角形'],
  平行四辺形: ['台形', '四角形'],
  台形: ['四角形'],
  四角形: [],
  五角形: [],
  正六角形: ['六角形'],
  六角形: [],
});

export const POLYGON_NAMES = Object.freeze({ 3: '三角形', 4: '四角形', 5: '五角形', 6: '六角形' });

const parallel = (u, v) => vIsZero(vCross(u, v));

/**
 * 切り口の形を調べる
 * @returns {{ sides: number, name: string, polygonName: string, sideLengths2: Q[], isoscelesTrapezoid?: boolean }}
 */
export function classifySectionPolygon(section) {
  const pts = section.polygon.map((p) => p.position);
  const n = pts.length;
  const sides = pts.map((p, i) => vSub(pts[(i + 1) % n], p));
  const len2 = sides.map(vLength2);
  const allEqual = len2.every((l) => l.eq(len2[0]));
  // 角が直角か（となり合う辺の内積が 0）
  const rightAngles = sides.map((s, i) => vDot(s, sides[(i + 1) % n]).isZero());
  const base = { sides: n, polygonName: POLYGON_NAMES[n], sideLengths2: len2 };
  if (n === 3) {
    if (allEqual) return { ...base, name: '正三角形' };
    if (rightAngles.some(Boolean)) return { ...base, name: '直角三角形' };
    const equalPairs = [[0, 1], [1, 2], [0, 2]].some(([i, j]) => len2[i].eq(len2[j]));
    return { ...base, name: equalPairs ? '二等辺三角形' : '三角形' };
  }
  if (n === 4) {
    const p02 = parallel(sides[0], sides[2]);
    const p13 = parallel(sides[1], sides[3]);
    if (p02 && p13) {
      if (rightAngles[0]) return { ...base, name: allEqual ? '正方形' : '長方形' };
      return { ...base, name: allEqual ? 'ひし形' : '平行四辺形' };
    }
    if (p02 || p13) {
      // 平行でない2辺（脚）の長さが等しければ等脚台形
      const legs = p02 ? [len2[1], len2[3]] : [len2[0], len2[2]];
      return { ...base, name: '台形', isoscelesTrapezoid: legs[0].eq(legs[1]) };
    }
    return { ...base, name: '四角形' };
  }
  if (n === 6) {
    const angles = sides.map((s, i) => vDot(s, sides[(i + 1) % n]).div(len2[i]));
    if (allEqual && angles.every((a) => a.eq(angles[0]))) return { ...base, name: '正六角形' };
    return { ...base, name: '六角形' };
  }
  return { ...base, name: POLYGON_NAMES[n] ?? `${n}角形` };
}

// ---------- 切り分けた立体 ----------

/**
 * 凸多角形を平面で切って、keep 側（n・X − d の符号が keep 以上）を残す（Sutherland–Hodgman）
 * @param {Q[][]} polygon
 * @param {1|-1} keep
 */
export function clipPolygon(polygon, plane, keep) {
  const out = [];
  const inside = (p) => planeSide(plane, p).mul(keep).sign() >= 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const res = intersectPlaneWithSegment(plane, a, b);
      if (res.kind === 'point') out.push(res.points[0]);
    }
  }
  // 同じ点が続くときは1つにする
  const dedup = out.filter((p, i) => !vEq(p, out[(i + out.length - 1) % out.length]));
  return dedup.length >= 3 && !polygonArea2(dedup).isZero() ? dedup : [];
}

/**
 * 平面で立方体を2つの立体に分ける。どちらも凸多面体
 * @returns {{ section, pieces: { side: 1|-1, faces: { id: string, polygon: Q[][] }[], vertices: Q[][], cubeVertices: string[], volume: Q }[] }}
 *   faces の id は立方体の面 ID か 'section'（切り口）。polygon は立体の外側から見て反時計回り
 */
export function splitCubeByPlane(plane) {
  const section = intersectPlaneWithCube(plane);
  if (!section.valid) return { section, pieces: [] };
  const sectionPoints = section.polygon.map((p) => p.position);
  const pieces = [1, -1].map((side) => {
    const faces = [];
    for (const face of FACES) {
      const poly = clipPolygon(face.vertices.map(vertexQ), plane, side);
      if (poly.length >= 3) faces.push({ id: face.id, polygon: orientOutward(poly, qvec(face.normal)) });
    }
    // 切り口：この立体の外向きは、平面の法線の −side の向き
    faces.push({ id: 'section', polygon: orientOutward(sectionPoints, vScale(plane.normal, Q.of(-side))) });
    const keys = new Map();
    for (const f of faces) for (const p of f.polygon) keys.set(vKey(p), p);
    const vertices = [...keys.values()];
    const cubeVertices = VERTICES.filter((v) => planeSide(plane, v.position).mul(side).sign() > 0).map((v) => v.id);
    return { side, faces, vertices, cubeVertices, volume: polyhedronVolume(faces) };
  });
  return { section, pieces };
}

function orientOutward(points, outward) {
  return vDot(polygonNormal(points), outward).sign() >= 0 ? [...points] : [...points].reverse();
}

/**
 * 凸多面体の体積（内部の1点から、各面を三角形に分けた三角すいの体積の和。正確な有理数）
 * @param {{ polygon: Q[][] }[]} faces
 */
export function polyhedronVolume(faces) {
  const keys = new Map();
  for (const f of faces) for (const p of f.polygon) keys.set(vKey(p), p);
  const o = vAverage([...keys.values()]);
  let total = Q0;
  for (const f of faces) {
    const [a, ...rest] = f.polygon;
    for (let i = 0; i < rest.length - 1; i++) total = total.add(tetrahedronVolume(o, a, rest[i], rest[i + 1]));
  }
  return total;
}

/** 四面体の体積 |det(B−A, C−A, D−A)| / 6 */
export function tetrahedronVolume(a, b, c, d) {
  const [A, B, C, D] = [a, b, c, d].map((p) => qvec(p));
  return vDot(vSub(B, A), vCross(vSub(C, A), vSub(D, A))).abs().div(6);
}

/**
 * 切り分けた立体の形（三角すい・三角柱・それ以外）
 * 三角すい：立方体の頂点1つと、そこから出る3本の辺の上の切り口の点でできる（直角の角をもつ）
 * 三角柱：立方体の1本の辺をふくみ、切り口がその辺に平行（向かい合う2つの面が合同な直角三角形）
 */
export function classifyPiece(piece, plane) {
  const nV = piece.vertices.length;
  const nF = piece.faces.length;
  if (nV === 4 && nF === 4 && piece.cubeVertices.length === 1) {
    const apex = vertexQ(piece.cubeVertices[0]);
    const others = piece.vertices.filter((p) => !vEq(p, apex));
    return { kind: 'tetrahedron', name: '三角すい', apex: piece.cubeVertices[0], legs2: others.map((p) => vLength2(vSub(p, apex))) };
  }
  if (nV === 6 && nF === 5 && piece.cubeVertices.length === 2) {
    const [u, v] = piece.cubeVertices;
    const edge = EDGES.find((e) => e.vertices.includes(u) && e.vertices.includes(v));
    // 切り口が辺に平行なときだけ三角柱（平行でなければ、上下の三角形の大きさがちがう）
    if (edge && vDot(plane.normal, vSub(vertexQ(v), vertexQ(u))).isZero()) {
      const A = vertexQ(u);
      // 頂点 u をふくむ三角形の面（立方体の面のうち、三角形のもの）
      const tri = piece.faces.find((f) => f.id !== 'section' && f.polygon.length === 3 && f.polygon.some((p) => vEq(p, A)));
      if (tri) {
        const others = tri.polygon.filter((p) => !vEq(p, A));
        return { kind: 'triangularPrism', name: '三角柱', edge: edge.id, apex: u, legs2: others.map((p) => vLength2(vSub(p, A))) };
      }
    }
  }
  return { kind: 'other', name: '立体' };
}

/** 切り口の点が、辺のどこにあるか（中点・頂点・「C側から1:2」など） */
export function describeEdgePoint(position, edgeId) {
  const edge = EDGES.find((e) => e.id === edgeId);
  const [a, b] = edge.vertices.map(vertexQ);
  const total = vLength2(vSub(b, a));
  const part = vLength2(vSub(qvec(position), a));
  if (part.isZero()) return { kind: 'vertex', vertex: edge.vertices[0] };
  if (part.eq(total)) return { kind: 'vertex', vertex: edge.vertices[1] };
  // 割合 t = |AP| / |AB|（どちらも辺に沿う長さなので、2乗の比の平方根は有理数）
  const t = Surd.sqrt(part.div(total)).c;
  if (t.eq(new Q(1, 2))) return { kind: 'midpoint', edge: edgeId };
  return { kind: 'ratio', edge: edgeId, from: edge.vertices[0], ratio: [t.n, t.d - t.n] };
}

export { vToNumbers };
