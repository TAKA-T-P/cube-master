/**
 * 立方体に内接する立体（凸多面体）の数学データと体積（Three.js・DOM 非依存）
 *
 * 立体は「頂点の点の集まり」から、凸包（すべての点をふくむいちばん小さい凸多面体）として正確に作る。
 * 計算はすべて有理数（core/rational）。体積は core/cubeCutting の polyhedronVolume・tetrahedronVolume を使い、
 * 四面体に分けた別の計算とも一致することを確かめられるようにする。
 *
 * 多面体：{ vertices: Q[][], faces: { polygon: Q[][], normal: Q[] }[], edges: [Q[], Q[]][] }
 *   faces の polygon は外から見て反時計回り、normal は外向き。
 */
import { VERTICES, FACES } from './cubeConstants.js';
import { Q, Q0, qvec, vSub, vDot, vCross, vIsZero, vKey, vEq, vAverage, vLength2, vAdd } from './rational.js';
import { orderSectionVertices, polyhedronVolume, tetrahedronVolume } from './cubeCutting.js';

const VERTEX_POSITIONS = new Map(VERTICES.map((v) => [v.id, qvec(v.position)]));
export const cubeVertexQ = (id) => VERTEX_POSITIONS.get(id);
/** 一辺 2 の立方体の体積 */
export const CUBE_VOLUME = Q.of(8);

function gcdInt(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** 有理数のベクトルを、互いに素な整数のベクトルにそろえる（向きは変えない） */
function primitive(v) {
  const lcm = v.reduce((m, x) => (m / gcdInt(m, x.d)) * x.d, 1);
  const ints = v.map((x) => x.mul(lcm).n);
  const g = ints.reduce((a, b) => gcdInt(a, b), 0) || 1;
  return qvec(ints.map((x) => x / g));
}

/** 同じ点を1つにまとめる */
function uniquePoints(points) {
  const map = new Map();
  for (const p of points) map.set(vKey(qvec(p)), qvec(p));
  return [...map.values()];
}

/**
 * 点の集まりの凸包（凸多面体）。すべての点が同じ平面の上（体積 0）なら null
 * @param {(number[]|Q[])[]} points
 */
export function convexHull(points) {
  const pts = uniquePoints(points);
  if (pts.length < 4) return null;
  const faces = new Map();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const n = vCross(vSub(pts[j], pts[i]), vSub(pts[k], pts[i]));
        if (vIsZero(n)) continue;
        const sides = pts.map((p) => vDot(n, vSub(p, pts[i])).sign());
        let outward;
        if (sides.every((s) => s <= 0)) outward = n;
        else if (sides.every((s) => s >= 0)) outward = n.map((x) => x.neg());
        else continue;
        const normal = primitive(outward);
        const d = vDot(normal, pts[i]);
        const key = `${vKey(normal)}|${d}`;
        if (faces.has(key)) continue;
        const onPlane = pts.filter((p, idx) => sides[idx] === 0).map((p) => ({ position: p }));
        const ordered = orderSectionVertices(onPlane, { normal, d });
        faces.set(key, { polygon: ordered.map((v) => v.position), normal });
      }
    }
  }
  const faceList = [...faces.values()].filter((f) => f.polygon.length >= 3);
  if (faceList.length < 4) return null;
  const vmap = new Map();
  const emap = new Map();
  for (const f of faceList) {
    f.polygon.forEach((p, i) => {
      const q = f.polygon[(i + 1) % f.polygon.length];
      vmap.set(vKey(p), p);
      const key = [vKey(p), vKey(q)].sort().join('~');
      if (!emap.has(key)) emap.set(key, [p, q]);
    });
  }
  return { vertices: [...vmap.values()], faces: faceList, edges: [...emap.values()] };
}

/** 凸多面体の体積（正確な有理数） */
export const calculatePolyhedronVolume = (poly) => polyhedronVolume(poly.faces);

/** 別の計算：1つの頂点から、その頂点をふくまない面を三角形に分けた四面体の体積の和 */
export function volumeByTetrahedra(poly) {
  const apex = poly.vertices[0];
  let total = Q0;
  for (const f of poly.faces) {
    if (f.polygon.some((p) => vEq(p, apex))) continue;
    for (let i = 1; i + 1 < f.polygon.length; i++) total = total.add(tetrahedronVolume(apex, f.polygon[0], f.polygon[i], f.polygon[i + 1]));
  }
  return total;
}

/**
 * 向きのそろった閉じた面（凹んだ立体でもよい）の体積：Σ det(a, b, c) / 6（原点を使う符号つきの体積）
 * @param {Q[][][]} polygons 外から見て反時計回りの多角形
 */
export function signedVolume(polygons) {
  let total = Q0;
  for (const poly of polygons) {
    for (let i = 1; i + 1 < poly.length; i++) total = total.add(vDot(poly[0], vCross(poly[i], poly[i + 1])).div(6));
  }
  return total;
}

/** 体積比（a ÷ b） */
export const calculateVolumeRatio = (a, b) => a.div(b);

/** 6つの面の中心 */
export const getFaceCenters = () => FACES.map((f) => qvec(f.normal));

/** 6つの面の中心を結んだ正八面体 */
export const createInscribedOctahedron = () => convexHull(getFaceCenters());

/** 立方体の4つの頂点で作る四面体 */
export function createInscribedTetrahedron(vertexIds) {
  if (vertexIds.length !== 4) throw new Error('四面体の頂点は4つ');
  return convexHull(vertexIds.map(cubeVertexQ));
}

/** 角すい（底面の点の集まり + 頂点） */
export const createPyramid = (apex, base) => convexHull([apex, ...base]);

/** 点が立方体の内部または表面にあるか */
export const isInsideCube = (p) => qvec(p).every((x) => x.abs().cmp(1) <= 0);

/**
 * 立体の形を調べる（三角すい・四角すい・三角柱・四角柱・八面体）
 * @returns {{ name: string, regular: boolean, vertexCount, faceCount, edgeCount }}
 */
export function classifyPolyhedron(poly) {
  const v = poly.vertices.length;
  const f = poly.faces.length;
  const e = poly.edges.length;
  const sides = poly.faces.map((x) => x.polygon.length);
  const edgeLen = poly.edges.map(([a, b]) => vLength2(vSub(a, b)));
  const allEqual = edgeLen.every((l) => l.eq(edgeLen[0]));
  const base = { vertexCount: v, faceCount: f, edgeCount: e, regular: false };
  const count = (n) => sides.filter((s) => s === n).length;
  if (v === 4 && f === 4) return { ...base, name: '三角すい', regular: allEqual };
  if (v === 5 && f === 5 && count(4) === 1 && count(3) === 4) return { ...base, name: '四角すい' };
  if (v === 6 && f === 5 && count(3) === 2 && count(4) === 3) {
    const tris = poly.faces.filter((x) => x.polygon.length === 3);
    if (vIsZero(vCross(tris[0].normal, tris[1].normal))) return { ...base, name: '三角柱' };
  }
  if (v === 8 && f === 6 && count(4) === 6) return { ...base, name: '四角柱', regular: allEqual };
  if (v === 6 && f === 8 && count(3) === 8) return { ...base, name: '八面体', regular: allEqual };
  return { ...base, name: '多面体' };
}

/** 多面体として正しいか（オイラーの式 V − E + F = 2・体積が正・どの面も平面の凸多角形） */
export function isValidPolyhedron(poly) {
  if (!poly) return false;
  if (poly.vertices.length - poly.edges.length + poly.faces.length !== 2) return false;
  if (calculatePolyhedronVolume(poly).sign() <= 0) return false;
  return poly.faces.every((f) => f.polygon.every((p) => vDot(f.normal, vSub(p, f.polygon[0])).isZero()));
}

/** 立方体の中心 */
export const CUBE_CENTER = Object.freeze(qvec([0, 0, 0]));

export { vAverage, vAdd };
