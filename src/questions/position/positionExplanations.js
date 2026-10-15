/**
 * 位置関係の解説文
 * 正解は計算済みの値を受け取り、文章だけを組み立てる（正解を文章中で決めない）。
 */
import { joinLabels, elementLabel } from '../questionUtils.js';
import { getEdge, getOppositeFace } from '../../core/cubeGeometry.js';
import {
  getParallelEdges,
  getIntersectingEdges,
  getFacesContainingEdge,
  getEdgesPerpendicularToFace,
} from '../../core/cubeRelations.js';
import { getParallelEdgeInFace, getFaceEdgesThroughVertex, getEdgeFaceMeetingVertex } from './positionRelations.js';

const E = elementLabel;

export const explainParallelEdges = (edge, answers) =>
  `${E(edge)}と平行な辺は、${joinLabels(answers)}の${answers.length}本です。どれも${E(edge)}と同じ向きにのびていて、どこまでのばしても交わりません。`;

export function explainIntersectingEdges(edge, answers) {
  const groups = getEdge(edge).vertices.map((v) => {
    const at = answers.filter((a) => getEdge(a).vertices.includes(v));
    return `頂点${v}で交わる${joinLabels(at)}`;
  });
  return `${E(edge)}と交わる辺は、${groups.join('と、')}の${answers.length}本です。立方体の辺どうしは、共通の頂点で交わります。`;
}

export const explainParallelFaces = (face, answers) =>
  `${E(face)}と平行な面は、向かい合う${joinLabels(answers)}です。立方体の向かい合う面は、いつも平行です。`;

export const explainPerpendicularFaces = (face, answers) =>
  `${E(face)}と垂直な面は、となり合う${joinLabels(answers)}の${answers.length}つです。向かい合う${E(getOppositeFace(face))}だけは平行で、垂直ではありません。`;

export const explainFacesContainingEdge = (edge, answers) =>
  `${E(edge)}を含む面は、${E(edge)}を辺としてもつ${joinLabels(answers)}の${answers.length}つです。`;

export function explainFacesParallelToEdge(edge, answers) {
  const reasons = answers.map((f) => `${E(f)}の上の${E(getParallelEdgeInFace(edge, f))}`).join('、');
  const containing = getFacesContainingEdge(edge);
  return (
    `${E(edge)}と平行な面は、${joinLabels(answers)}の${answers.length}つです。` +
    `${E(edge)}は${reasons}と平行で、その面と交わらないからです。` +
    `${E(edge)}を含む${joinLabels(containing)}は、「平行」とはいいません。`
  );
}

export function explainFacesPerpendicularToEdge(edge, answers) {
  const face = answers[0];
  const vertex = getEdgeFaceMeetingVertex(edge, face);
  const onFace = getFaceEdgesThroughVertex(face, vertex);
  return (
    `${E(edge)}と垂直な面は、${joinLabels(answers)}の${answers.length}つです。` +
    `たとえば${E(edge)}は${E(face)}と頂点${vertex}で交わり、面の上の${joinLabels(onFace)}の両方と垂直なので、${E(face)}に垂直です。`
  );
}

export function explainSkewEdges(edge, answers) {
  const parallel = getParallelEdges(edge);
  const intersecting = getIntersectingEdges(edge);
  return (
    `${E(edge)}とねじれの位置にある辺は、${joinLabels(answers)}の${answers.length}本です。` +
    `ほかの11本のうち、平行な${parallel.length}本（${joinLabels(parallel)}）と交わる${intersecting.length}本を除いた残りで、` +
    `${E(edge)}と同じ平面の上にありません。`
  );
}

export const explainEdgesPerpendicularToFace = (face, answers) =>
  `${E(face)}に垂直な辺は、${E(face)}の4つの頂点から垂直にのびる${joinLabels(answers)}の${answers.length}本です。`;

export function explainEdgePairRelation(a, b, relation, { commonVertex = null, commonFace = null } = {}) {
  if (relation === 'intersecting') return `${E(a)}と${E(b)}は、頂点${commonVertex}で交わっています。`;
  if (relation === 'parallel') {
    const plane = commonFace ? `どちらも${E(commonFace)}の上にあり、` : '';
    return `${E(a)}と${E(b)}は、${plane}同じ向きにのびていて、どこまでのばしても交わらないので「平行」です。`;
  }
  return `${E(a)}と${E(b)}は、平行でもなく、交わりもしません。このように同じ平面の上にない2本の辺の関係を「ねじれの位置」といいます。`;
}

export function explainCommonPerpendicular(faceA, faceB, answers, commonEdge) {
  if (answers.length > 0) {
    return `${E(faceA)}と${E(faceB)}は向かい合う平行な面なので、${joinLabels(answers)}の${answers.length}本はどちらの面にも垂直です。`;
  }
  return (
    `${E(faceA)}と${E(faceB)}はとなり合っていて、${E(commonEdge)}で垂直に交わります。` +
    `${E(faceA)}に垂直な辺（${joinLabels(getEdgesPerpendicularToFace(faceA))}）は、${E(faceB)}に含まれるか平行になるので、両方に垂直な辺はありません。`
  );
}

export function explainFacesParallelToBothEdges(edgeA, edgeB, answers, parallelA, parallelB) {
  const base = `${E(edgeA)}と平行な面は${joinLabels(parallelA)}、${E(edgeB)}と平行な面は${joinLabels(parallelB)}です。`;
  if (answers.length > 0) return `${base}両方に共通する${joinLabels(answers)}が答えです。`;
  return `${base}両方に共通する面がないので、「あてはまる面はない」が答えです。辺を含む面は平行とはいわないことに注意しましょう。`;
}

export const explainSkewByDefinition = (edge, answers) =>
  `${E(edge)}と交わらず、平行でもない辺は「ねじれの位置」にある辺で、${joinLabels(answers)}の${answers.length}本です。` +
  `ねじれの位置にある2本の辺は、同じ平面の上にありません。`;

export function explainPerpendicularAndIntersecting(face, edge, answers) {
  const perpendicular = getEdgesPerpendicularToFace(face);
  return (
    `${E(face)}に垂直な辺は${joinLabels(perpendicular)}の4本です。` +
    `このうち${E(edge)}と交わる（共通の頂点をもつ）のは、${joinLabels(answers)}です。`
  );
}

export function explainEdgeFaceRelation(edge, face, relation) {
  if (relation === 'contained') {
    const [p, q] = getEdge(edge).vertices;
    return `${E(edge)}の両はしの頂点${p}・${q}が${E(face)}の上にあるので、${E(edge)}は${E(face)}に含まれます。`;
  }
  if (relation === 'parallel') {
    return `${E(edge)}は${E(face)}の上の${E(getParallelEdgeInFace(edge, face))}と平行で、${E(face)}と交わらないので、${E(edge)}と${E(face)}は平行です。`;
  }
  const vertex = getEdgeFaceMeetingVertex(edge, face);
  return (
    `${E(edge)}は${E(face)}と頂点${vertex}で交わり、面の上の${joinLabels(getFaceEdgesThroughVertex(face, vertex))}の両方と垂直なので、` +
    `${E(edge)}は${E(face)}に垂直です。`
  );
}
