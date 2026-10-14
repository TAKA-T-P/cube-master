/**
 * 立方体の数学的な問い合わせ関数
 *
 * Three.js に依存しない純粋な関数群。描画・正解判定・テストの両方から利用する。
 * ベクトルは [x, y, z] の配列で扱う。
 */
import { VERTICES, EDGES, FACES, ELEMENT_TYPES } from './cubeConstants.js';

/** 無効な要素 ID が指定されたときのエラー */
export class CubeElementError extends Error {
  constructor(message, input) {
    super(message);
    this.name = 'CubeElementError';
    this.input = input;
  }
}

const vertexMap = new Map(VERTICES.map((v) => [v.id, v]));
const edgeMap = new Map(EDGES.map((e) => [e.id, e]));
const faceMap = new Map(FACES.map((f) => [f.id, f]));

// 頂点集合（順不同）→ 正規 ID の対応表
const setKey = (ids) => [...ids].sort().join('');
const edgeKeyMap = new Map(EDGES.map((e) => [setKey(e.vertices), e.id]));
const faceKeyMap = new Map(FACES.map((f) => [setKey(f.vertices), f.id]));

// 標準順序（定義配列のインデックス）
const orderIndex = new Map([
  ...VERTICES.map((v, i) => [v.id, i]),
  ...EDGES.map((e, i) => [e.id, 100 + i]),
  ...FACES.map((f, i) => [f.id, 200 + i]),
]);

// ---------- 取得 ----------

export const getVertex = (id) => vertexMap.get(id) ?? null;
export const getEdge = (id) => edgeMap.get(id) ?? null;
export const getFace = (id) => faceMap.get(id) ?? null;

export const getVertexIds = () => VERTICES.map((v) => v.id);
export const getEdgeIds = () => EDGES.map((e) => e.id);
export const getFaceIds = () => FACES.map((f) => f.id);

/**
 * 任意表記の要素 ID を正規化し、種類と正規 ID を返す。
 *   "A" → 頂点 A / "BA" → 辺 AB / "FGCB" → 面 BCGF
 * 大文字小文字・空白は無視する。存在しない要素なら CubeElementError を投げる。
 * @param {string} input
 * @returns {{ type: 'vertex'|'edge'|'face', id: string }}
 */
export function resolveElement(input) {
  if (typeof input !== 'string') {
    throw new CubeElementError(`要素IDは文字列で指定してください: ${String(input)}`, input);
  }
  const letters = input.replace(/\s+/g, '').toUpperCase();
  const chars = [...letters];
  if (chars.length === 0 || new Set(chars).size !== chars.length || !chars.every((c) => vertexMap.has(c))) {
    throw new CubeElementError(`無効な要素IDです: "${input}"`, input);
  }
  if (chars.length === 1) return { type: ELEMENT_TYPES.VERTEX, id: chars[0] };
  if (chars.length === 2) {
    const id = edgeKeyMap.get(setKey(chars));
    if (id) return { type: ELEMENT_TYPES.EDGE, id };
  }
  if (chars.length === 4) {
    const id = faceKeyMap.get(setKey(chars));
    if (id) return { type: ELEMENT_TYPES.FACE, id };
  }
  throw new CubeElementError(`立方体に存在しない要素です: "${input}"`, input);
}

/**
 * 種類を指定して正規化する。種類が一致しなければ CubeElementError。
 * @param {string} input
 * @param {'vertex'|'edge'|'face'} expectedType
 */
export function resolveElementOfType(input, expectedType) {
  const el = resolveElement(input);
  if (el.type !== expectedType) {
    throw new CubeElementError(`"${input}" は ${expectedType} ではありません（${el.type}）`, input);
  }
  return el.id;
}

/** 有効な要素 ID か（任意表記可） */
export function isValidElementId(input) {
  try {
    resolveElement(input);
    return true;
  } catch {
    return false;
  }
}

/** 正規 ID を標準順序（頂点→辺→面、定義順）で並べ替える */
export function sortElementIds(ids) {
  return [...ids].sort((a, b) => (orderIndex.get(a) ?? Infinity) - (orderIndex.get(b) ?? Infinity));
}

// ---------- 位置関係 ----------

/** 頂点に接続する辺 ID（3本） */
export const getEdgesOfVertex = (vertexId) => EDGES.filter((e) => e.vertices.includes(vertexId)).map((e) => e.id);

/** 頂点を含む面 ID（3面） */
export const getFacesOfVertex = (vertexId) => FACES.filter((f) => f.vertices.includes(vertexId)).map((f) => f.id);

/** 辺を含む面 ID（2面） */
export function getFacesOfEdge(edgeId) {
  const edge = getEdge(edgeId);
  if (!edge) return [];
  return FACES.filter((f) => edge.vertices.every((v) => f.vertices.includes(v))).map((f) => f.id);
}

/** 面の4辺の ID */
export function getEdgesOfFace(faceId) {
  const face = getFace(faceId);
  if (!face) return [];
  return face.vertices.map((v, i) => edgeKeyMap.get(setKey([v, face.vertices[(i + 1) % 4]])));
}

/** 向かい合う面の ID */
export function getOppositeFace(faceId) {
  const face = getFace(faceId);
  if (!face) return null;
  const opposite = FACES.find((f) => f.normal.every((n, i) => n === -face.normal[i]));
  return opposite ? opposite.id : null;
}

// ---------- 座標計算 ----------

export const vecSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vecScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vecDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vecCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vecLength = (a) => Math.hypot(a[0], a[1], a[2]);

/** 頂点の座標 */
export function getVertexPosition(vertexId) {
  const v = getVertex(vertexId);
  if (!v) throw new CubeElementError(`無効な頂点IDです: "${vertexId}"`, vertexId);
  return [...v.position];
}

/** 辺の両端の座標 [start, end] */
export function getEdgeEndpoints(edgeId) {
  const e = getEdge(edgeId);
  if (!e) throw new CubeElementError(`無効な辺IDです: "${edgeId}"`, edgeId);
  return e.vertices.map(getVertexPosition);
}

/** 辺の長さ */
export function getEdgeLength(edgeId) {
  const [p, q] = getEdgeEndpoints(edgeId);
  return vecLength(vecSub(q, p));
}

/** 辺の中点 */
export function getEdgeMidpoint(edgeId) {
  const [p, q] = getEdgeEndpoints(edgeId);
  return vecScale(vecAdd(p, q), 0.5);
}

/** 面の中心 */
export function getFaceCenter(faceId) {
  const f = getFace(faceId);
  if (!f) throw new CubeElementError(`無効な面IDです: "${faceId}"`, faceId);
  return vecScale(f.vertices.map(getVertexPosition).reduce(vecAdd, [0, 0, 0]), 0.25);
}

/** 面の外向き法線（定義値） */
export function getFaceNormal(faceId) {
  const f = getFace(faceId);
  if (!f) throw new CubeElementError(`無効な面IDです: "${faceId}"`, faceId);
  return [...f.normal];
}
