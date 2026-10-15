/**
 * 位置関係カテゴリで使う関係の組み合わせ・用語
 * 基本の判定は core/cubeRelations.js にあり、ここでは問題用に組み合わせる。
 */
import {
  getEdgesPerpendicularToFace,
  getIntersectingEdges,
  getFacesParallelToEdge,
  getEdgesInFace,
  areEdgesParallel,
  areFacesParallel,
  getCommonVertex,
  getEdgeFaceMeetingVertex,
} from '../../core/cubeRelations.js';
import { getEdge } from '../../core/cubeGeometry.js';

/** 2辺の位置関係の表示名 */
export const EDGE_PAIR_RELATION_LABELS = Object.freeze({
  parallel: '平行',
  intersecting: '交わる',
  skew: 'ねじれの位置',
});

/** 2つの面の両方に垂直な辺 */
export function getEdgesPerpendicularToBothFaces(faceA, faceB) {
  const b = new Set(getEdgesPerpendicularToFace(faceB));
  return getEdgesPerpendicularToFace(faceA).filter((e) => b.has(e));
}

/** 2つの辺の両方に平行な面 */
export function getFacesParallelToBothEdges(edgeA, edgeB) {
  const b = new Set(getFacesParallelToEdge(edgeB));
  return getFacesParallelToEdge(edgeA).filter((f) => b.has(f));
}

/** 面に垂直で、かつ指定した辺と交わる辺 */
export function getEdgesPerpendicularToFaceAndIntersecting(faceId, edgeId) {
  const intersecting = new Set(getIntersectingEdges(edgeId));
  return getEdgesPerpendicularToFace(faceId).filter((e) => intersecting.has(e));
}

/** 面の上にあって、指定した辺と平行な辺（辺と面が平行である理由の説明用） */
export const getParallelEdgeInFace = (edgeId, faceId) => getEdgesInFace(faceId).find((e) => areEdgesParallel(edgeId, e)) ?? null;

/** 頂点を通る、面の上の辺（辺と面が垂直である理由の説明用） */
export const getFaceEdgesThroughVertex = (faceId, vertexId) => getEdgesInFace(faceId).filter((e) => getEdge(e).vertices.includes(vertexId));

export { getCommonVertex, getEdgeFaceMeetingVertex, areFacesParallel };
