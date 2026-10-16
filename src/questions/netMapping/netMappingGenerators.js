/**
 * 展開図と頂点・辺の問題テンプレート（N01〜N06）
 *
 * 正解は、折りたたみ計算から求めた「展開図の点・辺・マス → 立方体の頂点・辺・面」の対応で決める。
 * 展開図の点のラベル（A, B, …）・面のラベル（ア, イ, …）は問題ごとに付け、立方体の頂点 ID とは別に管理する。
 */
import { getNetMapping, getCoincidentPoints, getCoincidentSegments, getOppositeCell, getCubeNeighborCells, getNetNeighborCells } from '../../core/cubeNetMapping.js';
import { parsePointKey, parseSegmentKey } from '../../core/cubeNet.js';
import { ALL_ORIENTATIONS, INITIAL_ORIENTATION } from '../../core/cubeOrientation.js';
import { getOppositeFace } from '../../core/cubeGeometry.js';
import { byDirection, randomSymbolAssignment, symbolFaces, symbolFace } from '../../core/cubeFaceLabels.js';
import { viewOf, mirrorView, viewKey, canMatchView } from '../../core/cubePuzzle.js';
import { cubeVisual, viewOnlyVisual, figureChoice } from '../decoratedCube.js';
import {
  randomNet,
  netBases,
  netVisual,
  assembleNetQuestion,
  POINT_LETTERS,
  CELL_LETTERS,
  TARGET_COLOR,
  ANSWER_COLOR,
  TARGET_FILL,
  ANSWER_FILL,
} from '../netCommon.js';
import { shuffle, pick } from '../../utils/random.js';
import * as X from './netMappingExplanations.js';

export const NET_MAPPING_CATEGORY = 'netMapping';

/** 点を読む順（上の行から、左から） */
const byReading = (a, b) => {
  const [ax, ay] = parsePointKey(a);
  const [bx, by] = parsePointKey(b);
  return ay - by || ax - bx;
};

/** 点のキーにラベルを付ける（target が 'A'、ほかは読む順に B, C, …） */
function labelPoints(target, others) {
  const labels = new Map(target ? [[target, POINT_LETTERS[0]]] : []);
  [...new Set(others)].filter((k) => k !== target).sort(byReading).forEach((k) => labels.set(k, POINT_LETTERS[labels.size]));
  return labels;
}

const pointsOf = (labels, colors = {}) =>
  [...labels.entries()].map(([k, label]) => {
    const [x, y] = parsePointKey(k);
    return { x, y, label, ...(colors[k] ? { color: colors[k] } : {}) };
  });

/** 辺の名前（両はしの点のラベル。アルファベット順） */
const segmentName = (labels, key) =>
  parseSegmentKey(key)
    .map(([x, y]) => labels.get(`${x},${y}`))
    .sort()
    .join('');

/** マスに ア〜カ を付ける */
function labelCells(cells, rng) {
  const letters = shuffle(CELL_LETTERS.slice(0, 6), rng);
  return Object.fromEntries(cells.map((c, i) => [c.id, letters[i]]));
}

const boundarySegments = (mapping) => [...mapping.segments.values()].filter((s) => s.boundary).map((s) => s.key);

export const NET_MAPPING_TEMPLATES = [
  // ---------------- ★1 きほん ----------------
  {
    id: 'N01',
    difficulty: 1,
    title: '重なる頂点',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      // 2つ以上の点が集まる頂点を選ぶ
      const candidates = [...mapping.points.values()].filter((p) => p.boundary && getCoincidentPoints(mapping, p.key).length > 0);
      const target = pick(candidates, rng).key;
      const answers = getCoincidentPoints(mapping, target);
      const others = shuffle(
        [...mapping.points.values()].filter((p) => p.boundary && p.key !== target && !answers.includes(p.key)).map((p) => p.key),
        rng,
      ).slice(0, Math.max(2, 5 - answers.length));
      const labels = labelPoints(target, [...answers, ...others]);
      const L = (k) => labels.get(k);
      const visual = netVisual(cells, { points: pointsOf(labels, { [target]: TARGET_COLOR }) });
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        type: 'multiple',
        question: `この展開図を組み立てたとき、点Aと重なる点をすべて選びなさい。`,
        preview: visual,
        choices: [...answers, ...others].map((k) => ({ id: k, label: `点${L(k)}` })),
        correctAnswers: answers,
        explanation: X.explainCoincidentPoints('A', answers.map(L).sort()),
        net: { cells, points: [{ ...parsePointKeyObj(target), color: TARGET_COLOR }, ...answers.map((k) => ({ ...parsePointKeyObj(k), color: ANSWER_COLOR }))] },
      });
    },
  },
  {
    id: 'N02',
    difficulty: 1,
    title: '向かい合う面',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      const labels = labelCells(cells, rng);
      const target = pick(cells, rng).id;
      const answer = getOppositeCell(mapping, target);
      const distractors = shuffle(getCubeNeighborCells(mapping, target), rng).slice(0, 3);
      const t = cells.find((c) => c.id === target);
      const a = cells.find((c) => c.id === answer);
      const inLine = (t.x === a.x && Math.abs(t.y - a.y) === 2) || (t.y === a.y && Math.abs(t.x - a.x) === 2);
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        question: `この展開図を組み立てたとき、面${labels[target]}と向かい合う面はどれですか。`,
        preview: netVisual(cells, { cellLabels: labels, cellColors: { [target]: TARGET_FILL } }),
        choices: [answer, ...distractors].map((id) => ({ id, label: `面${labels[id]}` })),
        correctAnswers: [answer],
        explanation: X.explainOppositeFace(labels[target], labels[answer], inLine),
        net: { cells, cellLabels: labels, cellColors: { [target]: TARGET_FILL, [answer]: ANSWER_FILL } },
      });
    },
  },

  // ---------------- ★2 標準 ----------------
  {
    id: 'N03',
    difficulty: 2,
    title: '重なる辺',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      const all = boundarySegments(mapping);
      const target = pick(all, rng);
      const [answer] = getCoincidentSegments(mapping, target);
      const distractors = shuffle(all.filter((k) => k !== target && k !== answer), rng).slice(0, 3);
      const segs = [target, answer, ...distractors];
      const pointKeys = segs.flatMap((k) => parseSegmentKey(k).map(([x, y]) => `${x},${y}`));
      const labels = labelPoints(null, pointKeys);
      const name = (k) => segmentName(labels, k);
      const toSeg = (k, color) => {
        const [a, b] = parseSegmentKey(k);
        return { a, b, color };
      };
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        question: `この展開図を組み立てたとき、辺${name(target)}と重なる辺はどれですか。`,
        preview: netVisual(cells, { points: pointsOf(labels), segments: [toSeg(target, TARGET_COLOR)] }),
        choices: [answer, ...distractors].map((k) => ({ id: k, label: `辺${name(k)}` })),
        correctAnswers: [answer],
        explanation: X.explainCoincidentSegments(name(target), name(answer)),
        net: { cells, segments: [toSeg(target, TARGET_COLOR), toSeg(answer, ANSWER_COLOR)] },
      });
    },
  },
  {
    id: 'N04',
    difficulty: 2,
    title: '組み立て後に隣り合う面',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      const labels = labelCells(cells, rng);
      const target = pick(cells, rng).id;
      const answers = getCubeNeighborCells(mapping, target);
      const opposite = getOppositeCell(mapping, target);
      const netNeighbors = getNetNeighborCells(cells, target);
      const L = (id) => labels[id];
      const colors = { [target]: TARGET_FILL, ...Object.fromEntries(answers.map((id) => [id, ANSWER_FILL])) };
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        type: 'multiple',
        question: `この展開図を組み立てたとき、面${L(target)}と辺を共有する（となり合う）面をすべて選びなさい。`,
        preview: netVisual(cells, { cellLabels: labels, cellColors: { [target]: TARGET_FILL } }),
        choices: cells.filter((c) => c.id !== target).map((c) => ({ id: c.id, label: `面${L(c.id)}` })),
        correctAnswers: answers,
        explanation: X.explainCubeNeighbors(
          L(target),
          answers.filter((id) => netNeighbors.includes(id)).map(L).sort(),
          answers.filter((id) => !netNeighbors.includes(id)).map(L).sort(),
          L(opposite),
        ),
        net: { cells, cellLabels: labels, cellColors: colors },
      });
    },
  },

  // ---------------- ★3 チャレンジ ----------------
  {
    id: 'N05',
    difficulty: 3,
    title: '完成した立方体',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      // マスにマークを付け、組み立てた立方体の面 ID → マーク を求める
      const marksByCell = Object.fromEntries(Object.entries(randomSymbolAssignment(rng)).map(([, m], i) => [cells[i].id, m]));
      const byFace = Object.fromEntries(Object.entries(marksByCell).map(([cellId, m]) => [mapping.cellToFace[cellId], m]));
      const faces = symbolFaces(byFace);
      const poses = shuffle(ALL_ORIENTATIONS, rng);
      const correctPose = poses[0];
      const correctView = viewOf(byDirection(byFace, correctPose));
      const fullByDir = byDirection(byFace, INITIAL_ORIENTATION);
      const used = new Set([viewKey(correctView)]);
      const wrong = [];
      const tryAdd = (view) => {
        const k = viewKey(view);
        if (used.has(k) || canMatchView(fullByDir, view)) return;
        used.add(k);
        wrong.push(view);
      };
      tryAdd(mirrorView(correctView));
      for (const o of poses.slice(1)) {
        if (wrong.length >= 3) break;
        const v = viewOf(byDirection(byFace, o));
        // 鏡に映した並び、または向かい合う面（同時には見えない）が並んだ図
        tryAdd(rng() < 0.5 ? mirrorView(v) : { ...v, right: byFace[getOppositeFace(o.top)] });
      }
      const toVisual = (v) => viewOnlyVisual({ top: symbolFace(v.top), front: symbolFace(v.front), right: symbolFace(v.right) });
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        question: 'この展開図を組み立てると、どの立方体になりますか。',
        preview: netVisual(cells, { cellFaces: Object.fromEntries(Object.entries(marksByCell).map(([id, m]) => [id, symbolFace(m)])) }),
        choices: [figureChoice('correct', cubeVisual(correctPose, faces), 'この展開図を組み立てた立方体'), ...wrong.map((v, i) => figureChoice(`wrong-${i}`, toVisual(v), '組み立てた立方体と合わない'))],
        correctAnswers: ['correct'],
        explanation: X.explainCompletedCube(),
        net: { cells, cellFaces: Object.fromEntries(Object.entries(marksByCell).map(([id, m]) => [id, symbolFace(m)])) },
      });
    },
  },
  {
    id: 'N06',
    difficulty: 3,
    title: '頂点・辺の複合問題',
    bases: () => netBases(2),
    build(base, rng) {
      const { cells } = randomNet(rng, base.netId);
      const mapping = getNetMapping(cells);
      const target = pick([...mapping.points.values()].filter((p) => p.boundary), rng).key;
      const vertex = mapping.points.get(target).vertex;
      const touches = (segKey) => parseSegmentKey(segKey).some(([x, y]) => mapping.points.get(`${x},${y}`).vertex === vertex);
      // 点A を端にもたない辺から選ぶ（点A そのものの辺は簡単すぎるため）
      const all = boundarySegments(mapping).filter((k) => !parseSegmentKey(k).some(([x, y]) => `${x},${y}` === target));
      const yes = shuffle(all.filter(touches), rng).slice(0, 3);
      const no = shuffle(all.filter((k) => !touches(k)), rng).slice(0, 5 - yes.length);
      if (yes.length === 0) return this.build({ ...base }, rng);
      const segs = [...yes, ...no];
      const labels = labelPoints(target, segs.flatMap((k) => parseSegmentKey(k).map(([x, y]) => `${x},${y}`)));
      const name = (k) => segmentName(labels, k);
      const toSeg = (k, color) => {
        const [a, b] = parseSegmentKey(k);
        return { a, b, color };
      };
      return assembleNetQuestion(this, base, NET_MAPPING_CATEGORY, {
        type: 'multiple',
        question: 'この展開図を組み立てたとき、点Aと重なる頂点（角）を端にもつ辺を、選択肢の中からすべて選びなさい。',
        preview: netVisual(cells, { points: pointsOf(labels, { [target]: TARGET_COLOR }) }),
        choices: segs.map((k) => ({ id: k, label: `辺${name(k)}` })),
        correctAnswers: yes,
        explanation: X.explainEdgesAtPoint('A', yes.map(name).sort()),
        net: { cells, points: [{ ...parsePointKeyObj(target), color: TARGET_COLOR }], segments: yes.map((k) => toSeg(k, ANSWER_COLOR)) },
      });
    },
  },
];

function parsePointKeyObj(key) {
  const [x, y] = parsePointKey(key);
  return { x, y };
}
