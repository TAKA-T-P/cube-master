/**
 * 位置関係の問題テンプレート（P01〜P15）
 *
 * テンプレートの形（カテゴリ共通。questionEngine が利用する）：
 *   {
 *     id: 'P01', difficulty: 1|2|3, title: string,
 *     bases(): [{ key, refs, group?, ...params }],   // 出題できる基準の一覧（key は重複判定用）
 *     build(base, rng): 問題オブジェクト（id 以外。questionSchema 参照）
 *   }
 * base.group があるテンプレートは、グループごとに均等に出題される（答えの偏り防止）。
 *
 * 正解は必ず core/cubeRelations の計算結果から作る。
 */
import { EDGES, FACES } from '../../core/cubeConstants.js';
import {
  getParallelEdges,
  getIntersectingEdges,
  getSkewEdges,
  getParallelFaces,
  getPerpendicularFaces,
  getFacesContainingEdge,
  getFacesParallelToEdge,
  getFacesPerpendicularToEdge,
  getEdgesPerpendicularToFace,
  getEdgesInFace,
  getEdgesParallelToFace,
  classifyEdgePair,
  classifyEdgeFace,
  getCommonVertex,
  getCommonEdge,
  getEdgeFaceMeetingVertex,
} from '../../core/cubeRelations.js';
import { elementLabel as L, buildElementChoices, multipleChoiceTotal, viewDirectionFor } from '../questionUtils.js';
import {
  EDGE_PAIR_RELATION_LABELS,
  getEdgesPerpendicularToBothFaces,
  getFacesParallelToBothEdges,
  getEdgesPerpendicularToFaceAndIntersecting,
  getParallelEdgeInFace,
} from './positionRelations.js';
import * as X from './positionExplanations.js';

export const POSITION_CATEGORY = 'position';

const EDGE_IDS = EDGES.map((e) => e.id);
const FACE_IDS = FACES.map((f) => f.id);
const without = (list, ...excluded) => list.filter((id) => !excluded.includes(id));

/** 2つの集合の組（順不同）をすべて列挙 */
const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));

const edgeBases = () => EDGE_IDS.map((edge) => ({ key: edge, refs: [edge], edge }));
const faceBases = () => FACE_IDS.map((face) => ({ key: face, refs: [face], face }));

/**
 * 問題オブジェクトを組み立てる（id はエンジンが付ける）
 */
function makeQuestion(template, base, { type, question, choices, correctAnswers, explanation, highlight = correctAnswers }) {
  return {
    templateId: template.id,
    key: `${template.id}:${base.key}`,
    category: POSITION_CATEGORY,
    difficulty: template.difficulty,
    type,
    question,
    scene: { model: 'cube', referenceElements: [...base.refs], cameraPreset: viewDirectionFor(base.refs) },
    choices,
    correctAnswers: [...correctAnswers],
    explanation: {
      text: explanation,
      highlightElements: [...highlight],
      animation: highlight.length > 0 ? 'highlightElements' : 'none',
    },
  };
}

/** 立方体の要素を選ぶ複数回答問題 */
function elementQuestion(template, base, rng, { question, correct, pool, preferred, explanation, type = 'multiple', total }) {
  const choices = buildElementChoices({
    correct,
    pool,
    preferred,
    total: total ?? (type === 'single' ? 4 : multipleChoiceTotal(correct.length)),
    rng,
  });
  return makeQuestion(template, base, { type, question, choices, correctAnswers: correct, explanation });
}

/** 文章の選択肢 */
const textChoice = (id, label, extra = {}) => ({ id, label, ...extra });

export const POSITION_TEMPLATES = [
  // ---------------- ★1 きほん ----------------
  {
    id: 'P01',
    difficulty: 1,
    title: '辺と平行な辺',
    bases: edgeBases,
    build(base, rng) {
      const correct = getParallelEdges(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}と平行な辺をすべて選びなさい。`,
        correct,
        pool: without(EDGE_IDS, base.edge),
        preferred: getSkewEdges(base.edge),
        explanation: X.explainParallelEdges(base.edge, correct),
      });
    },
  },
  {
    id: 'P02',
    difficulty: 1,
    title: '辺と交わる辺',
    bases: edgeBases,
    build(base, rng) {
      const correct = getIntersectingEdges(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}と交わる辺をすべて選びなさい。`,
        correct,
        pool: without(EDGE_IDS, base.edge),
        preferred: getSkewEdges(base.edge),
        explanation: X.explainIntersectingEdges(base.edge, correct),
      });
    },
  },
  {
    id: 'P03',
    difficulty: 1,
    title: '面と平行な面',
    bases: faceBases,
    build(base, rng) {
      const correct = getParallelFaces(base.face);
      return elementQuestion(this, base, rng, {
        type: 'single',
        question: `${L(base.face)}と平行な面はどれですか。`,
        correct,
        pool: without(FACE_IDS, base.face),
        explanation: X.explainParallelFaces(base.face, correct),
      });
    },
  },
  {
    id: 'P04',
    difficulty: 1,
    title: '面と垂直な面',
    bases: faceBases,
    build(base, rng) {
      const correct = getPerpendicularFaces(base.face);
      return elementQuestion(this, base, rng, {
        question: `${L(base.face)}と垂直な面をすべて選びなさい。`,
        correct,
        pool: without(FACE_IDS, base.face),
        explanation: X.explainPerpendicularFaces(base.face, correct),
      });
    },
  },
  {
    id: 'P05',
    difficulty: 1,
    title: '辺を含む面',
    bases: edgeBases,
    build(base, rng) {
      const correct = getFacesContainingEdge(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}を含む面をすべて選びなさい。`,
        correct,
        pool: FACE_IDS,
        explanation: X.explainFacesContainingEdge(base.edge, correct),
      });
    },
  },

  // ---------------- ★2 標準 ----------------
  {
    id: 'P06',
    difficulty: 2,
    title: '辺と平行な面',
    bases: edgeBases,
    build(base, rng) {
      const correct = getFacesParallelToEdge(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}と平行な面をすべて選びなさい。`,
        correct,
        pool: FACE_IDS,
        preferred: getFacesContainingEdge(base.edge), // 「含む面」を平行と思いこむまちがい
        explanation: X.explainFacesParallelToEdge(base.edge, correct),
      });
    },
  },
  {
    id: 'P07',
    difficulty: 2,
    title: '辺と垂直な面',
    bases: edgeBases,
    build(base, rng) {
      const correct = getFacesPerpendicularToEdge(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}と垂直な面をすべて選びなさい。`,
        correct,
        pool: FACE_IDS,
        preferred: getFacesContainingEdge(base.edge),
        explanation: X.explainFacesPerpendicularToEdge(base.edge, correct),
      });
    },
  },
  {
    id: 'P08',
    difficulty: 2,
    title: 'ねじれの位置にある辺',
    bases: edgeBases,
    build(base, rng) {
      const correct = getSkewEdges(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}とねじれの位置にある辺をすべて選びなさい。`,
        correct,
        pool: without(EDGE_IDS, base.edge),
        preferred: getParallelEdges(base.edge),
        explanation: X.explainSkewEdges(base.edge, correct),
      });
    },
  },
  {
    id: 'P09',
    difficulty: 2,
    title: '面に垂直な辺',
    bases: faceBases,
    build(base, rng) {
      const correct = getEdgesPerpendicularToFace(base.face);
      return elementQuestion(this, base, rng, {
        question: `${L(base.face)}に垂直な辺をすべて選びなさい。`,
        correct,
        pool: EDGE_IDS,
        preferred: [...getEdgesInFace(base.face), ...getEdgesParallelToFace(base.face)],
        explanation: X.explainEdgesPerpendicularToFace(base.face, correct),
      });
    },
  },
  {
    id: 'P10',
    difficulty: 2,
    title: '2本の辺の位置関係',
    // 立方体の辺の組は必ず「平行・交わる・ねじれ」のどれかになる（テストで確認）
    bases: () =>
      pairs(EDGE_IDS).map(([a, b]) => ({ key: `${a}-${b}`, refs: [a, b], a, b, group: classifyEdgePair(a, b) })),
    build(base) {
      const relation = classifyEdgePair(base.a, base.b);
      const commonVertex = getCommonVertex(base.a, base.b);
      const commonFace = FACE_IDS.find((f) => getEdgesInFace(f).includes(base.a) && getEdgesInFace(f).includes(base.b)) ?? null;
      const highlight = relation === 'intersecting' ? [commonVertex] : relation === 'parallel' && commonFace ? [commonFace] : [];
      return makeQuestion(this, base, {
        type: 'single',
        question: `${L(base.a)}と${L(base.b)}の位置関係はどれですか。`,
        choices: Object.entries(EDGE_PAIR_RELATION_LABELS).map(([id, label]) => textChoice(id, label, { fixed: true })),
        correctAnswers: [relation],
        explanation: X.explainEdgePairRelation(base.a, base.b, relation, { commonVertex, commonFace }),
        highlight,
      });
    },
  },

  // ---------------- ★3 チャレンジ ----------------
  {
    id: 'P11',
    difficulty: 3,
    title: '2つの面に共通して垂直な辺',
    bases: () =>
      pairs(FACE_IDS).map(([f, g]) => ({
        key: `${f}-${g}`,
        refs: [f, g],
        f,
        g,
        group: getEdgesPerpendicularToBothFaces(f, g).length > 0 ? 'exists' : 'none',
      })),
    build(base) {
      const answers = getEdgesPerpendicularToBothFaces(base.f, base.g);
      const commonEdge = getCommonEdge(base.f, base.g);
      return makeQuestion(this, base, {
        type: 'single',
        question: `${L(base.f)}と${L(base.g)}の両方に垂直な辺はありますか。`,
        choices: [textChoice('exists', 'ある', { fixed: true }), textChoice('none', 'ない', { fixed: true })],
        correctAnswers: [answers.length > 0 ? 'exists' : 'none'],
        explanation: X.explainCommonPerpendicular(base.f, base.g, answers, commonEdge),
        highlight: answers.length > 0 ? answers : [commonEdge],
      });
    },
  },
  {
    id: 'P12',
    difficulty: 3,
    title: '2本の辺の両方と平行な面',
    bases: () =>
      pairs(EDGE_IDS).map(([a, b]) => ({
        key: `${a}-${b}`,
        refs: [a, b],
        a,
        b,
        group: getFacesParallelToBothEdges(a, b).length > 0 ? 'exists' : 'none',
      })),
    build(base, rng) {
      const answers = getFacesParallelToBothEdges(base.a, base.b);
      const parallelA = getFacesParallelToEdge(base.a);
      const parallelB = getFacesParallelToEdge(base.b);
      const correct = answers.length > 0 ? answers : ['none'];
      // 片方だけに平行な面・辺を含む面をまぎらわしい誤答にする
      const faceChoices = buildElementChoices({
        correct: answers,
        pool: FACE_IDS,
        preferred: [...parallelA, ...parallelB],
        total: 4,
        rng,
      });
      return makeQuestion(this, base, {
        type: 'multiple',
        question: `${L(base.a)}と${L(base.b)}の両方に平行な面をすべて選びなさい。`,
        choices: [...faceChoices, textChoice('none', 'あてはまる面はない', { fixed: true })],
        correctAnswers: correct,
        explanation: X.explainFacesParallelToBothEdges(base.a, base.b, answers, parallelA, parallelB),
        highlight: answers,
      });
    },
  },
  {
    id: 'P13',
    difficulty: 3,
    title: '交わらず平行でもない辺',
    bases: edgeBases,
    build(base, rng) {
      const correct = getSkewEdges(base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.edge)}と交わらず、平行でもない辺をすべて選びなさい。`,
        correct,
        pool: without(EDGE_IDS, base.edge),
        preferred: [...getParallelEdges(base.edge), ...getIntersectingEdges(base.edge)],
        explanation: X.explainSkewByDefinition(base.edge, correct),
      });
    },
  },
  {
    id: 'P14',
    difficulty: 3,
    title: '2つの条件を満たす辺',
    // 答えが1本以上ある「面 × 辺」の組だけを使う
    bases: () =>
      FACE_IDS.flatMap((face) =>
        EDGE_IDS.filter((edge) => getEdgesPerpendicularToFaceAndIntersecting(face, edge).length > 0).map((edge) => ({
          key: `${face}-${edge}`,
          refs: [face, edge],
          face,
          edge,
        })),
      ),
    build(base, rng) {
      const correct = getEdgesPerpendicularToFaceAndIntersecting(base.face, base.edge);
      return elementQuestion(this, base, rng, {
        question: `${L(base.face)}に垂直で、${L(base.edge)}と交わる辺をすべて選びなさい。`,
        correct,
        pool: without(EDGE_IDS, base.edge),
        // 片方の条件だけを満たす辺
        preferred: [...getEdgesPerpendicularToFace(base.face), ...getIntersectingEdges(base.edge)],
        total: 6,
        explanation: X.explainPerpendicularAndIntersecting(base.face, base.edge, correct),
      });
    },
  },
  {
    id: 'P15',
    difficulty: 3,
    title: '辺と面の位置関係の説明',
    bases: () =>
      EDGE_IDS.flatMap((edge) =>
        FACE_IDS.map((face) => ({ key: `${edge}-${face}`, refs: [edge, face], edge, face, group: classifyEdgeFace(edge, face) })),
      ),
    build(base) {
      const { edge, face } = base;
      const relation = classifyEdgeFace(edge, face);
      const e = L(edge);
      const f = L(face);
      const highlight =
        relation === 'perpendicular'
          ? [getEdgeFaceMeetingVertex(edge, face)]
          : relation === 'parallel'
            ? [getParallelEdgeInFace(edge, face)]
            : [];
      return makeQuestion(this, base, {
        type: 'single',
        question: `${e}と${f}の位置関係について、正しい説明はどれですか。`,
        choices: [
          textChoice('contained', `${e}は${f}に含まれる`),
          textChoice('parallel', `${e}と${f}は平行である`),
          textChoice('perpendicular', `${e}と${f}は垂直である`),
          textChoice('oblique', `${e}は${f}とななめに交わる`),
        ],
        correctAnswers: [relation],
        explanation: X.explainEdgeFaceRelation(edge, face, relation),
        highlight,
      });
    },
  },
];
