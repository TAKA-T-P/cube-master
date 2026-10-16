/**
 * サイコロ・回転の問題テンプレート（D01〜D06）
 *
 * - 正解は回転エンジン（core/cubeOrientation・cubeRotations）で計算する
 * - 出題前に cubePuzzle.solveUnique で「提示した情報だけで答えが1つに決まる」ことを確かめ、
 *   見えている面だけで決まらないときは「向かい合う面の和は7」のルールか、見えていない面の一覧を提示する
 * - 回答前は視点を回せない（隠れた面が見えてしまうため）
 */
import { getEdgesOfFace } from '../../core/cubeGeometry.js';
import { ALL_ORIENTATIONS, INITIAL_ORIENTATION, rotateOrientationSequence, findRotationPath, sequenceMatrix, orientationKey } from '../../core/cubeOrientation.js';
import { MOVE_IDS, ROLL_MOVE_IDS, ROTATION_MOVES, rotateLabeling, ALL_ROTATIONS, getOppositeDirection, DIRECTIONS, matrixKey, IDENTITY } from '../../core/cubeRotations.js';
import { STANDARD_DICE, numberFaces, numberFace, randomNumberAssignment, isStandardDice, byDirection, pipLabel } from '../../core/cubeFaceLabels.js';
import { solveUnique, viewOf, mirrorView, viewKey, canMatchView, VIEW_DIRECTIONS } from '../../core/cubePuzzle.js';
import { cubeVisual, viewOnlyVisual, movesVisual, hiddenFacesVisual, pipChoice, figureChoice, assembleQuestion } from '../decoratedCube.js';
import { shuffle, pick } from '../../utils/random.js';
import * as X from './diceExplanations.js';

export const DICE_CATEGORY = 'dice';

const NUMBERS = [1, 2, 3, 4, 5, 6];
const ASKED_LABELS = { top: '上の面', front: '前の面', right: '右の面' };
const RULE_NOTE = 'このサイコロは、向かい合う面の目の数の和が7です。';
const POSE_VARIANTS = [0, 5, 11, 17, 23];

/** 面 ID の4辺（正解の面を緑の枠で示す。面の目を隠さないため） */
const faceFrame = (faceId) => getEdgesOfFace(faceId);

/** サイコロの目の配置を決める */
function setupDie(rng, { preferStandard } = {}) {
  const standard = preferStandard ?? rng() < 0.6;
  const byFace = standard ? { ...STANDARD_DICE } : randomNumberAssignment(rng);
  return { byFace, standard: isStandardDice(byFace) };
}

/**
 * 答えを決めるのに必要な情報を選ぶ
 * @returns {'visible'|'rule'|'list'} visible: 見えている3面で決まる / rule: 和が7のルール / list: 見えていない面の一覧
 */
function chooseInfo({ byDir, answerOf, standard, rng }) {
  const known = Object.fromEntries(VIEW_DIRECTIONS.map((d) => [d, byDir[d]]));
  if (solveUnique({ values: NUMBERS, known }, answerOf).unique) return 'visible';
  if (standard && rng() < 0.65 && solveUnique({ values: NUMBERS, known, oppositeSum: 7 }, answerOf).unique) return 'rule';
  return 'list';
}

/** 目の選択肢（4択）。priority の目を優先して誤答にする */
function numberChoices({ correct, priority, byFace, rng }) {
  const faceOf = (n) => Object.keys(byFace).find((f) => byFace[f] === n);
  const wrong = [...new Set(priority.filter((n) => n !== correct && NUMBERS.includes(n)))];
  const rest = shuffle(NUMBERS.filter((n) => n !== correct && !wrong.includes(n)), rng);
  const picked = [...wrong, ...rest].slice(0, 3);
  return [correct, ...picked].map((n) => pipChoice(n, { elementId: faceOf(n) }));
}

/**
 * 回転のあと、ある方向にくる目を答える問題（D01・D03・D04・D06）
 */
function trackingQuestion(template, base, rng, { moves, askedDir, pose, preferStandard }) {
  const { byFace, standard } = setupDie(rng, { preferStandard });
  const faces = numberFaces(byFace);
  const byDir = byDirection(byFace, pose);
  const matrix = sequenceMatrix(moves);
  const answerOf = (labeling) => rotateLabeling(labeling, matrix)[askedDir];

  const finalOrientation = rotateOrientationSequence(pose, moves);
  const answerFace = finalOrientation[askedDir];
  const answer = byFace[answerFace];
  if (answerOf(byDir) !== answer) throw new Error('回転の計算が一致しません');

  const info = chooseInfo({ byDir, answerOf, standard, rng });
  const inverseMoves = moves.map((m) => ROTATION_MOVES[m].inverse);
  const finalByDir = byDirection(byFace, finalOrientation);
  const priority = [
    rotateLabeling(byDir, sequenceMatrix(inverseMoves))[askedDir], // 逆に回したとき
    byDir[askedDir], // 回す前のまま
    finalByDir[getOppositeDirection(askedDir)], // 反対側の面
  ];

  const visuals = [cubeVisual(pose, faces, { caption: 'はじめの向き' }), movesVisual(moves)];
  if (info === 'list') visuals.push(hiddenFacesVisual(faces, pose));
  const note = info === 'rule' ? RULE_NOTE : '';

  return assembleQuestion(template, base, DICE_CATEGORY, {
    type: 'single',
    question: `${note}このサイコロを${X.movesPhrase(moves)}と、${ASKED_LABELS[askedDir]}の目はいくつになりますか。`,
    visuals,
    choices: numberChoices({ correct: answer, priority, byFace, rng }),
    correctAnswers: [String(answer)],
    explanation: X.explainTracking({ moves, askedDir, value: answer, info, byDir }),
    highlight: faceFrame(answerFace),
    reveal: { steps: [{ type: 'rotate', moves }] },
    scene: { model: 'dice', faces, orientation: pose },
  });
}

const VISIBLE_DIRS = ['top', 'front', 'right'];
const HIDDEN_DIRS = ['bottom', 'back', 'left'];

/** 直前の回転を打ち消す回転を続けない手順 */
function sequences(length, moveIds) {
  let result = [[]];
  for (let i = 0; i < length; i++) {
    result = result.flatMap((seq) =>
      moveIds.filter((m) => seq.length === 0 || ROTATION_MOVES[seq.at(-1)].inverse !== m).map((m) => [...seq, m]),
    );
  }
  return result;
}

/** 手順のあと、その方向にくる面がはじめと入れ替わっているか（変わらない問題は出さない） */
const movesChange = (moves, asked) => X.tracePath(moves, asked)[0] !== asked;

/** 2つの向きをつなぐ、いちばん短い回転の手順 */
function pathBetween(from, to) {
  return findRotationPath(from, to) ?? [];
}

export const DICE_TEMPLATES = [
  {
    id: 'D01',
    difficulty: 1,
    title: '回転後の上面',
    bases: () =>
      ALL_ORIENTATIONS.flatMap((_, pose) => ROLL_MOVE_IDS.map((move) => ({ key: `${pose}-${move}`, refs: [], pose, move, group: move }))),
    build(base, rng) {
      return trackingQuestion(this, base, rng, { moves: [base.move], askedDir: 'top', pose: ALL_ORIENTATIONS[base.pose] });
    },
  },
  {
    id: 'D02',
    difficulty: 1,
    title: '向かい合う面',
    bases: () => VISIBLE_DIRS.flatMap((dir) => [0, 1, 2, 3, 4, 5, 6, 7].map((v) => ({ key: `${dir}-${v}`, refs: [], dir, group: dir }))),
    build(base, rng) {
      // 和が7のルールでは解けないように、ふつうでない目の配置にする
      let byFace = randomNumberAssignment(rng);
      while (isStandardDice(byFace)) byFace = randomNumberAssignment(rng);
      const faces = numberFaces(byFace);
      const pose = INITIAL_ORIENTATION;
      const byDir = byDirection(byFace, pose);
      const target = byDir[base.dir];
      const answerDir = getOppositeDirection(base.dir);
      const answer = byDir[answerDir];
      const view1 = viewOf(byDir);
      const known = { ...view1 };
      const answerOf = (labeling) => labeling[answerDir];

      // 別の向きから見た図を足して、答えが1つに決まるようにする
      const rotations = shuffle(
        ALL_ROTATIONS.filter((m) => matrixKey(m) !== matrixKey(IDENTITY)),
        rng,
      );
      const viewFor = (m) => viewOf(rotateLabeling(byDir, m));
      const shares = (v) => VIEW_DIRECTIONS.some((d) => Object.values(view1).includes(v[d]));
      const extra = rotations.find((m) => shares(viewFor(m)) && solveUnique({ values: Object.values(byDir), known, views: [viewFor(m)] }, answerOf).unique);
      let extras = extra ? [extra] : null;
      if (!extras) {
        outer: for (const a of rotations) {
          for (const b of rotations) {
            if (matrixKey(a) >= matrixKey(b)) continue;
            if (solveUnique({ values: Object.values(byDir), known, views: [viewFor(a), viewFor(b)] }, answerOf).unique) {
              extras = [a, b];
              break outer;
            }
          }
        }
      }
      const faceOf = (n) => Object.keys(byFace).find((f) => byFace[f] === n);

      // 誤答は、7−（目）のまちがい（和が7と思いこむ）を優先する
      const sevenMistake = 7 - target;
      const othersPool = Object.values(byDir).filter((n) => n !== target && n !== answer);
      const others = [
        ...(othersPool.includes(sevenMistake) ? [sevenMistake] : []),
        ...shuffle(othersPool.filter((n) => n !== sevenMistake), rng),
      ].slice(0, 3);
      const choices = [answer, ...others].map((n) => pipChoice(n, { elementId: faceOf(n) }));

      // 正解演出：基準の目を前に向けてから、水平に 180° 回して向かい合う面を前に出す
      const targetFace = pose[base.dir];
      const toFront = ALL_ORIENTATIONS.filter((o) => o.front === targetFace)
        .map((o) => pathBetween(pose, o))
        .sort((a, b) => a.length - b.length)[0];
      const steps = [];
      if (toFront.length > 0) steps.push({ type: 'rotate', moves: toFront, pauseAfter: 700 });
      steps.push({ type: 'rotate', moves: ['turnRight', 'turnRight'] });

      const neighbors = DIRECTIONS.filter((d) => d !== base.dir && d !== answerDir).map((d) => pipLabel(byDir[d]));
      return assembleQuestion(this, base, DICE_CATEGORY, {
        type: 'single',
        question:
          `${pipLabel(target)}の面と向かい合う面の目はいくつですか。図1と図2は、同じサイコロを別の向きから見たものです。` +
          'このサイコロは、向かい合う面の目の和が7とはかぎりません。',
        visuals: [
          cubeVisual(pose, faces, { caption: '図1' }),
          ...extras.map((m, i) => cubeVisual(rotateLabeling(pose, m), faces, { caption: `図${i + 2}` })),
        ],
        choices,
        correctAnswers: [String(answer)],
        explanation:
          `図をくらべると、${pipLabel(target)}ととなり合う面は${neighbors.join('・')}の4つだとわかります。` +
          `となりにない残りの${pipLabel(answer)}が、${pipLabel(target)}と向かい合う面です。`,
        highlight: faceFrame(pose[answerDir]),
        reveal: { steps },
        scene: { model: 'dice', faces, orientation: pose },
      });
    },
  },
  {
    id: 'D03',
    difficulty: 2,
    title: '見えなかった面',
    // 回転のあと、はじめは見えていなかった面がくる方向を問う
    bases: () =>
      MOVE_IDS.flatMap((move) =>
        VISIBLE_DIRS.filter((asked) => HIDDEN_DIRS.includes(X.tracePath([move], asked)[0])).flatMap((asked) =>
          POSE_VARIANTS.map((pose) => ({ key: `${move}-${asked}-${pose}`, refs: [], move, asked, pose, group: move })),
        ),
      ),
    build(base, rng) {
      return trackingQuestion(this, base, rng, { moves: [base.move], askedDir: base.asked, pose: ALL_ORIENTATIONS[base.pose] });
    },
  },
  {
    id: 'D04',
    difficulty: 2,
    title: '2回転後の面',
    bases: () =>
      sequences(2, ROLL_MOVE_IDS).flatMap((moves) =>
        VISIBLE_DIRS.filter((asked) => movesChange(moves, asked)).map((asked) => ({
          key: `${moves.join('-')}-${asked}`,
          refs: [],
          moves,
          asked,
          group: asked,
        })),
      ),
    build(base, rng) {
      return trackingQuestion(this, base, rng, { moves: base.moves, askedDir: base.asked, pose: pick(ALL_ORIENTATIONS, rng) });
    },
  },
  {
    id: 'D05',
    difficulty: 3,
    title: '同じサイコロはどれ？',
    bases: () => ALL_ORIENTATIONS.map((_, pose) => ({ key: `${pose}`, refs: [], pose })),
    build(base, rng) {
      const byFace = { ...STANDARD_DICE };
      const faces = numberFaces(byFace);
      const refPose = ALL_ORIENTATIONS[base.pose];
      const refByDir = byDirection(byFace, refPose);
      const refKey = viewKey(viewOf(refByDir));

      const poses = shuffle(ALL_ORIENTATIONS.filter((o) => orientationKey(o) !== orientationKey(refPose)), rng);
      const correctPose = poses.find((o) => viewKey(viewOf(byDirection(byFace, o))) !== refKey);
      const correctView = viewOf(byDirection(byFace, correctPose));

      // まちがいの図：鏡に映した配置（正解の図の鏡像を必ず入れる）と、向かい合う面が並んだ配置
      const used = new Set([refKey, viewKey(correctView)]);
      const distractors = [];
      const addDistractor = (view, kind) => {
        const key = viewKey(view);
        if (used.has(key) || canMatchView(refByDir, view)) return;
        used.add(key);
        distractors.push({ view, kind });
      };
      addDistractor(mirrorView(correctView), 'mirror');
      if (rng() < 0.5) {
        const v = viewOf(byDirection(byFace, poses[1]));
        addDistractor({ ...v, right: 7 - v.front }, 'opposite');
      }
      for (const o of poses) {
        if (distractors.length >= 3) break;
        addDistractor(mirrorView(viewOf(byDirection(byFace, o))), 'mirror');
      }

      const toVisual = (view) => viewOnlyVisual(Object.fromEntries(VIEW_DIRECTIONS.map((d) => [d, numberFace(view[d])])));
      const choices = [
        figureChoice('same', cubeVisual(correctPose, faces), describeView(correctView)),
        ...distractors.map((d, i) => figureChoice(`${d.kind}-${i}`, toVisual(d.view), describeView(d.view))),
      ];
      const path = pathBetween(refPose, correctPose);
      const opposite = distractors.find((d) => d.kind === 'opposite');
      return assembleQuestion(this, base, DICE_CATEGORY, {
        type: 'single',
        question: `${RULE_NOTE}このサイコロを回転させた図はどれですか。`,
        visuals: [cubeVisual(refPose, faces, { caption: 'もとのサイコロ' })],
        choices,
        correctAnswers: ['same'],
        explanation:
          `正解の図は、もとのサイコロを${X.movesPhrase(path)}と同じ向きになります。` +
          '鏡に映したように面の並びが反対回りになっている図は、どのように回しても作れません。' +
          (opposite
            ? `また、${pipLabel(opposite.view.front)}と${pipLabel(opposite.view.right)}は向かい合う面（和が7）なので、同時に見えることはありません。`
            : ''),
        reveal: { steps: [{ type: 'rotate', moves: path }] },
        scene: { model: 'dice', faces, orientation: refPose },
      });
    },
  },
  {
    id: 'D06',
    difficulty: 3,
    title: '3回転チャレンジ',
    bases: () =>
      sequences(3, MOVE_IDS)
        .filter((moves) => new Set(moves).size > 1)
        .flatMap((moves) =>
          VISIBLE_DIRS.filter((asked) => movesChange(moves, asked)).map((asked) => ({
            key: `${moves.join('-')}-${asked}`,
            refs: [],
            moves,
            asked,
            group: asked,
          })),
        ),
    build(base, rng) {
      return trackingQuestion(this, base, rng, { moves: base.moves, askedDir: base.asked, pose: pick(ALL_ORIENTATIONS, rng) });
    },
  },
];

/** 見取図の読み上げ用の説明 */
function describeView(view) {
  return `上 ${pipLabel(view.top)}、前 ${pipLabel(view.front)}、右 ${pipLabel(view.right)}`;
}
