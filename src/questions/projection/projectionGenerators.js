/**
 * 立方体の見え方の問題テンプレート（V01〜V06）
 *
 * 目のついたサイコロで出題する。正解は向き（core/cubeOrientation）と目の配置（core/cubeFaceLabels）から計算し、
 * 図の選択肢は cubePuzzle で「回転で一致するか」を確かめてから出題する（鏡映しは一致しない）。
 */
import { getEdgesOfFace } from '../../core/cubeGeometry.js';
import { ALL_ORIENTATIONS, INITIAL_ORIENTATION, rotateOrientation, findRotationPath, orientationKey } from '../../core/cubeOrientation.js';
import { MOVE_IDS, ROTATION_MOVES, DIRECTIONS } from '../../core/cubeRotations.js';
import {
  numberFaces,
  numberFace,
  randomNumberAssignment,
  byDirection,
  unknownFace,
  pipLabel,
  pipTurnAsSeen,
  ORIENTED_PIPS,
} from '../../core/cubeFaceLabels.js';
import { viewOf, mirrorView, viewKey, canMatchView, canSatisfyConditions, VIEW_DIRECTIONS } from '../../core/cubePuzzle.js';
import { cubeVisual, viewOnlyVisual, hiddenFacesVisual, pipChoice, figureChoice, assembleQuestion } from '../decoratedCube.js';
import { movePhrase } from '../dice/diceExplanations.js';
import { shuffle, pick, sample } from '../../utils/random.js';
import * as X from './projectionExplanations.js';

export const PROJECTION_CATEGORY = 'projection';

/** 答えの方向から見るカメラの向き（真上・真下はわずかに前へずらして、前が下／上になるようにする） */
const STRAIGHT_VIEWS = Object.freeze({
  top: [0, 1, 0.05],
  bottom: [0, -1, 0.05],
  front: [0, 0.02, 1],
  back: [0, 0.02, -1],
  right: [1, 0.02, 0],
  left: [-1, 0.02, 0],
});

/** 3つの符号から、斜めのカメラの向き */
const cornerCamera = (sx, sy, sz) => [4 * sx, 3 * sy, 5 * sz];

/** 目 → その目がある面 ID */
const faceOfValue = (byFace, n) => Object.keys(byFace).find((f) => byFace[f] === n);

/** その方向から見える、斜めのカメラで見えている面の目を答える問題（V01・V02） */
function singleViewQuestion(template, base, rng, { dir, camera }) {
  const byFace = randomNumberAssignment(rng);
  const faces = numberFaces(byFace);
  const pose = INITIAL_ORIENTATION;
  const byDir = byDirection(byFace, pose);
  const answer = byDir[dir];

  // 斜めのカメラで見えている3面
  const visibleDirs = DIRECTIONS.filter((d) => {
    const v = { top: [0, 1, 0], bottom: [0, -1, 0], front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0] }[d];
    return v[0] * camera[0] + v[1] * camera[1] + v[2] * camera[2] > 0;
  });
  if (!visibleDirs.includes(dir)) throw new Error('答えの面がカメラから見えていません');
  const visibleOthers = visibleDirs.filter((d) => d !== dir).map((d) => byDir[d]);
  const hidden = shuffle(
    DIRECTIONS.filter((d) => !visibleDirs.includes(d)).map((d) => byDir[d]),
    rng,
  );
  const options = [answer, ...visibleOthers, hidden[0]];

  return assembleQuestion(template, base, PROJECTION_CATEGORY, {
    type: 'single',
    question: `このサイコロを${X.VIEW_PHRASES[dir]}見ると、どの目の面が見えますか。`,
    visuals: [cubeVisual(pose, faces, { caption: 'いまの見え方', viewDirection: camera })],
    choices: options.map((n) => pipChoice(n, { elementId: faceOfValue(byFace, n) })),
    correctAnswers: [String(answer)],
    explanation: X.explainSingleView(dir, pipLabel(answer)),
    highlight: getEdgesOfFace(pose[dir]),
    reveal: { steps: [{ type: 'camera', direction: STRAIGHT_VIEWS[dir] }] },
    scene: { model: 'dice', faces, orientation: pose, cameraPreset: camera },
  });
}

/** 図の選択肢の説明（読み上げ用） */
const describe = (view, label = pipLabel) => `上 ${label(view.top)}、前 ${label(view.front)}、右 ${label(view.right)}`;

/** 見えている3面の目（上・前・右）だけの見取図 */
const viewOnlyPips = (view) => viewOnlyVisual({ top: numberFace(view.top), front: numberFace(view.front), right: numberFace(view.right) });

export const PROJECTION_TEMPLATES = [
  {
    id: 'V01',
    difficulty: 1,
    title: '上から見える面',
    bases: () =>
      ['top', 'bottom'].flatMap((dir) =>
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].map(([sx, sz]) => ({ key: `${dir}-${sx}${sz}`, refs: [], dir, sx, sz, group: dir })),
      ),
    build(base, rng) {
      const camera = cornerCamera(base.sx, base.dir === 'top' ? 1 : -1, base.sz);
      return singleViewQuestion(this, base, rng, { dir: base.dir, camera });
    },
  },
  {
    id: 'V02',
    difficulty: 1,
    title: '横から見える面',
    bases: () => ['right', 'left', 'front', 'back'].flatMap((dir) => [1, -1].map((s) => ({ key: `${dir}-${s}`, refs: [], dir, s, group: dir }))),
    build(base, rng) {
      const sx = base.dir === 'right' ? 1 : base.dir === 'left' ? -1 : base.s;
      const sz = base.dir === 'front' ? 1 : base.dir === 'back' ? -1 : base.s;
      return singleViewQuestion(this, base, rng, { dir: base.dir, camera: cornerCamera(sx, 1, sz) });
    },
  },
  {
    id: 'V03',
    difficulty: 2,
    title: '指定方向からの見え方',
    // 2・3・6 の目は、見る向きによって目の並び方（ななめの向き・たて／よこ）が変わる
    bases: () => VIEW_DIRECTIONS.flatMap((asked) => [0, 4, 9, 14, 19, 23].map((pose) => ({ key: `${asked}-${pose}`, refs: [], asked, pose, group: asked }))),
    build(base, rng) {
      const pose = ALL_ORIENTATIONS[base.pose];
      const answerFace = pose[base.asked];
      // 問う面に、向きで見え方が変わる目（2・3・6）を置く
      const byFace = randomNumberAssignment(rng);
      const v = pick(ORIENTED_PIPS, rng);
      const holder = faceOfValue(byFace, v);
      [byFace[holder], byFace[answerFace]] = [byFace[answerFace], v];
      const faces = numberFaces(byFace);
      const turn = pipTurnAsSeen(answerFace, pose, base.asked);

      // 誤答に使うもう1つの目：見えているほかの面にある 2・3・6、なければ残りから
      const visibleOriented = VIEW_DIRECTIONS.filter((d) => d !== base.asked)
        .map((d) => byFace[pose[d]])
        .filter((n) => ORIENTED_PIPS.includes(n));
      const w = visibleOriented[0] ?? pick(ORIENTED_PIPS.filter((n) => n !== v), rng);
      const choices = [v, w].flatMap((n) =>
        [0, 90].map((t) => figureChoice(`${n}-${t}`, { type: 'face', face: numberFace(n), turn: t }, `${pipLabel(n)}、${X.pipArrangement(n, t)}`)),
      );
      const note = base.asked === 'top' ? '（前が下になるように見た図）' : '（上が上になるように見た図）';
      return assembleQuestion(this, base, PROJECTION_CATEGORY, {
        type: 'single',
        question: `このサイコロを${X.VIEW_PHRASES[base.asked]}見ると、どのように見えますか。${note}`,
        visuals: [cubeVisual(pose, faces, { caption: 'いまの見え方' })],
        choices,
        correctAnswers: [`${v}-${turn}`],
        explanation: X.explainPipView(base.asked, v, turn),
        reveal: { steps: [{ type: 'camera', direction: STRAIGHT_VIEWS[base.asked] }] },
        scene: { model: 'dice', faces, orientation: pose },
      });
    },
  },
  {
    id: 'V04',
    difficulty: 2,
    title: '回転後の完成図',
    bases: () => MOVE_IDS.flatMap((move) => [0, 1, 2, 3].map((v) => ({ key: `${move}-${v}`, refs: [], move, group: move }))),
    build(base, rng) {
      const byFace = randomNumberAssignment(rng);
      const faces = numberFaces(byFace);
      const pose = INITIAL_ORIENTATION;
      const correct = rotateOrientation(pose, base.move);
      const viewOfPose = (o) => viewOf(byDirection(byFace, o));
      const valueKey = (o) => viewKey(viewOfPose(o));

      // まちがいの図：逆向き・ほかの回転の結果（同じ図が重ならないようにする）
      const inverse = ROTATION_MOVES[base.move].inverse;
      const others = [inverse, ...shuffle(MOVE_IDS.filter((m) => m !== base.move && m !== inverse), rng)];
      const used = new Set([valueKey(correct), valueKey(pose)]);
      const wrongMoves = [];
      for (const m of others) {
        const key = valueKey(rotateOrientation(pose, m));
        if (used.has(key)) continue;
        used.add(key);
        wrongMoves.push(m);
        if (wrongMoves.length === 3) break;
      }
      const choices = [base.move, ...wrongMoves].map((m) => {
        const o = rotateOrientation(pose, m);
        return figureChoice(m, cubeVisual(o, faces), describe(viewOfPose(o)));
      });
      const correctView = viewOfPose(correct);
      return assembleQuestion(this, base, PROJECTION_CATEGORY, {
        type: 'single',
        question: `このサイコロを${movePhrase(base.move)}と、どのように見えますか。`,
        visuals: [cubeVisual(pose, faces, { caption: 'はじめの向き' }), hiddenFacesVisual(faces, pose)],
        choices,
        correctAnswers: [base.move],
        explanation: X.explainTurnedCube(base.move, { top: pipLabel(correctView.top), front: pipLabel(correctView.front), right: pipLabel(correctView.right) }),
        reveal: { steps: [{ type: 'rotate', moves: [base.move] }] },
        scene: { model: 'dice', faces, orientation: pose },
      });
    },
  },
  {
    id: 'V05',
    difficulty: 3,
    title: '3方向の情報から推理',
    bases: () => [1, 2].flatMap((shift) => [0, 1, 2, 3, 4, 5].map((v) => ({ key: `${shift}-${v}`, refs: [], shift }))),
    build(base, rng) {
      const [c1, c2, c3] = sample([1, 2, 3, 4, 5, 6], 3, rng);
      const conditions = { top: c1, front: c2, right: c3 };
      // 条件の3面だけ目があり、ほかの面は「？」のサイコロ
      const faces = Object.fromEntries(
        DIRECTIONS.map((d) => [INITIAL_ORIENTATION[d], conditions[d] ? numberFace(conditions[d]) : unknownFace()]),
      );
      const cornerFaces = new Set(VIEW_DIRECTIONS.map((d) => INITIAL_ORIENTATION[d]));
      const cornerTurns = ALL_ORIENTATIONS.filter((o) => VIEW_DIRECTIONS.every((d) => cornerFaces.has(o[d])));
      const nonIdentity = cornerTurns.filter((o) => orientationKey(o) !== orientationKey(INITIAL_ORIENTATION));
      const correctPose = nonIdentity[(base.shift - 1) % nonIdentity.length];

      // 鏡に映した並び（3つの目の、反対回りの並べ方すべて）
      const triple = [c1, c2, c3];
      const mirrors = [
        [0, 2, 1],
        [2, 1, 0],
        [1, 0, 2],
      ].map(([a, b, c]) => ({ top: triple[a], front: triple[b], right: triple[c] }));

      const valueView = (o) => {
        const v = viewOf(byDirection(faces, o));
        return { top: v.top.value, front: v.front.value, right: v.right.value };
      };
      const name = pipLabel;
      const choices = [
        figureChoice('match', cubeVisual(correctPose, faces), describe(valueView(correctPose))),
        ...mirrors.map((m, i) => figureChoice(`mirror-${i}`, viewOnlyPips(m), describe(m))),
      ];
      // 回転で条件どおりに置けるのは正解だけ（鏡映しは置けない）
      if (canSatisfyConditions(valueView(correctPose), conditions) !== true) throw new Error('正解の図が条件を満たしません');
      for (const m of mirrors) if (canSatisfyConditions(m, conditions) !== false) throw new Error('鏡映しの図が条件を満たしてしまいます');

      return assembleQuestion(this, base, PROJECTION_CATEGORY, {
        type: 'single',
        question: `上から見ると${name(c1)}、正面から見ると${name(c2)}、右から見ると${name(c3)}に見えるように置けるサイコロはどれですか。`,
        visuals: [cubeVisual(INITIAL_ORIENTATION, faces, { caption: '条件' })],
        choices,
        correctAnswers: ['match'],
        explanation: X.explainCornerOrder(name(c1), name(c2), name(c3)),
        reveal: { steps: [{ type: 'rotate', moves: findRotationPath(INITIAL_ORIENTATION, correctPose) }] },
        scene: { model: 'dice', faces, orientation: INITIAL_ORIENTATION },
      });
    },
  },
  {
    id: 'V06',
    difficulty: 3,
    title: 'ありえない配置を見抜く',
    bases: () => [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ key: `${v}`, refs: [], v })),
    build(base, rng) {
      const byFace = randomNumberAssignment(rng);
      const faces = numberFaces(byFace);
      const pose = INITIAL_ORIENTATION;
      const fullByDir = byDirection(byFace, pose);
      const valueView = (o) => viewOf(byDirection(byFace, o));

      const used = new Set([viewKey(valueView(pose))]);
      const poses = [];
      for (const o of shuffle(ALL_ORIENTATIONS, rng)) {
        const key = viewKey(valueView(o));
        if (used.has(key)) continue;
        used.add(key);
        poses.push(o);
        if (poses.length === 4) break;
      }
      const [p1, p2, p3, p4] = poses;
      const mirror = mirrorView(valueView(p4));
      if (used.has(viewKey(mirror)) || canMatchView(fullByDir, mirror)) throw new Error('鏡映しの図が作れません');
      for (const o of [p1, p2, p3]) if (!canMatchView(fullByDir, valueView(o))) throw new Error('回転した図が一致しません');

      const name = pipLabel;
      const choices = [
        ...[p1, p2, p3].map((o, i) => figureChoice(`rotated-${i}`, cubeVisual(o, faces), describe(valueView(o)))),
        figureChoice('mirror', viewOnlyPips(mirror), describe(mirror)),
      ];
      // 成立する向きを順番に見せる
      const steps = [];
      let from = pose;
      for (const o of [p1, p2, p3]) {
        steps.push({ type: 'rotate', moves: findRotationPath(from, o), pauseAfter: 800 });
        from = o;
      }
      return assembleQuestion(this, base, PROJECTION_CATEGORY, {
        type: 'single',
        question: '次の4つの図のうち、このサイコロをどのように回しても作れないものはどれですか。',
        visuals: [cubeVisual(pose, faces, { caption: 'もとのサイコロ' }), hiddenFacesVisual(faces, pose)],
        choices,
        correctAnswers: ['mirror'],
        explanation: X.explainImpossible({ top: name(mirror.top), front: name(mirror.front), right: name(mirror.right) }),
        reveal: { steps },
        scene: { model: 'dice', faces, orientation: pose },
      });
    },
  },
];
