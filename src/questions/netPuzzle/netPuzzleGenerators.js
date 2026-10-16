/**
 * 展開図パズルの問題テンプレート（C01〜C06）
 *
 * 立方体になるかどうかは、すべて折りたたみ計算（core/cubeNetFolding）で決める。
 * 種類が同じかどうかは、回転・裏返し・平行移動をそろえたキー（getCanonicalNetKey）で比べる。
 */
import { CUBE_NETS, NON_CUBE_HEXOMINOES } from '../../core/cubeNetCatalog.js';
import { foldNet } from '../../core/cubeNetFolding.js';
import { makeCells, distinctOrientations, getShapeKey, getEmptyNeighbors, isNetConnected } from '../../core/cubeNet.js';
import { figureChoice } from '../decoratedCube.js';
import { randomNet, netBases, netVisual, assembleNetQuestion, CELL_LETTERS, TARGET_FILL, ANSWER_FILL } from '../netCommon.js';
import { shuffle, pick, sample } from '../../utils/random.js';
import * as X from './netPuzzleExplanations.js';

export const NET_PUZZLE_CATEGORY = 'netPuzzle';

const coordsOf = (cells) => cells.map((c) => [c.x, c.y]);
const withCell = (cells, x, y) => makeCells([...coordsOf(cells), [x, y]]);
const withoutCell = (cells, id) => makeCells(coordsOf(cells.filter((c) => c.id !== id)));
const randomOrientation = (cells, rng) => makeCells(coordsOf(pick(distinctOrientations(cells), rng)));

/** 3D で組み立てる展開図（足したマス・動かしたマスは緑） */
const foldSpec = (cells, greenAt = null) => ({
  cells,
  ...(greenAt ? { cellColors: Object.fromEntries(cells.filter((c) => c.x === greenAt.x && c.y === greenAt.y).map((c) => [c.id, ANSWER_FILL])) } : {}),
});

export const NET_PUZZLE_TEMPLATES = [
  // ---------------- ★1 きほん ----------------
  {
    id: 'C01',
    difficulty: 1,
    title: '立方体になる展開図',
    bases: () => [1, 2, 3].flatMap((k) => [...Array(6).keys()].map((v) => ({ key: `${k}-${v}`, refs: [], k, group: `${k}` }))),
    build(base, rng) {
      const valid = sample(CUBE_NETS, base.k, rng).map((n) => randomOrientation(n.cells, rng));
      const invalid = sample(NON_CUBE_HEXOMINOES, 4 - base.k, rng).map((h) => randomOrientation(h.cells, rng));
      const choices = [
        ...valid.map((cells, i) => figureChoice(`net-${i}`, netVisual(cells), '立方体の展開図')),
        ...invalid.map((cells, i) =>
          figureChoice(`not-${i}`, netVisual(cells, { conflicts: foldNet(cells).problemCells }), '立方体の展開図ではない'),
        ),
      ];
      return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
        type: 'multiple',
        question: '立方体の展開図になるものをすべて選びなさい。',
        choices,
        correctAnswers: valid.map((_, i) => `net-${i}`),
        explanation: X.explainWhichAreNets(
          valid.map((_, i) => `net-${i}`),
          invalid.map((_, i) => `not-${i}`),
        ),
        net: foldSpec(valid[0]),
      });
    },
  },
  {
    id: 'C02',
    difficulty: 1,
    title: 'あと1マスを加える',
    bases: () => netBases(2),
    build(base, rng) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const { cells } = randomNet(rng, base.netId);
        const removable = cells.filter((c) => isNetConnected(cells.filter((d) => d.id !== c.id)));
        const five = withoutCell(cells, pick(removable, rng).id);
        const spots = getEmptyNeighbors(five);
        const good = spots.filter((p) => foldNet(withCell(five, p.x, p.y)).valid);
        const bad = spots.filter((p) => !good.includes(p));
        // 正解はすべて候補に入れ、まちがいの場所も1つ以上入れる（候補は4〜5か所）
        if (good.length === 0 || good.length > 4 || bad.length < 1) continue;
        const candidates = shuffle([...good, ...sample(bad, Math.max(1, 4 - good.length), rng)], rng).map((p, i) => ({ ...p, label: CELL_LETTERS[i] }));
        const answers = candidates.filter((c) => good.includes(spots.find((p) => p.x === c.x && p.y === c.y)));
        const first = answers[0];
        return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
          type: 'multiple',
          question: 'あと1マス加えると、立方体の展開図になります。どこに加えればよいですか。すべて選びなさい。',
          preview: netVisual(five, { candidates }),
          choices: candidates.map((c) => ({ id: c.label, label: c.label })),
          correctAnswers: answers.map((c) => c.label),
          explanation: X.explainAddCell(answers.map((c) => c.label)),
          net: foldSpec(withCell(five, first.x, first.y), first),
        });
      }
      throw new Error('問題を作れませんでした');
    },
  },

  // ---------------- ★2 標準 ----------------
  {
    id: 'C03',
    difficulty: 2,
    title: '不要な1マス',
    bases: () => netBases(2),
    build(base, rng) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const { cells } = randomNet(rng, base.netId);
        const spot = pick(getEmptyNeighbors(cells), rng);
        const seven = withCell(cells, spot.x, spot.y);
        const labels = Object.fromEntries(seven.map((c, i) => [c.id, CELL_LETTERS[i]]));
        const answers = seven.filter((c) => {
          const rest = seven.filter((d) => d.id !== c.id);
          return isNetConnected(rest) && foldNet(rest).valid;
        });
        if (answers.length === 0 || answers.length === seven.length) continue;
        const rest = withoutCell(seven, answers[0].id);
        return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
          type: 'multiple',
          question: '1マス取りのぞいて立方体の展開図にします。どのマスを取ればよいですか。すべて選びなさい。',
          preview: netVisual(seven, { cellLabels: labels }),
          choices: seven.map((c) => ({ id: c.id, label: labels[c.id] })),
          correctAnswers: answers.map((c) => c.id),
          explanation: X.explainRemoveCell(answers.map((c) => labels[c.id])),
          net: foldSpec(rest),
        });
      }
      throw new Error('問題を作れませんでした');
    },
  },
  {
    id: 'C04',
    difficulty: 2,
    title: '1マスを移動する',
    bases: () => netBases(2),
    build(base, rng) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const { cells } = randomNet(rng, base.netId);
        const movable = cells.filter((c) => isNetConnected(cells.filter((d) => d.id !== c.id)));
        const moving = pick(movable, rng);
        const five = withoutCell(cells, moving.id);
        const spots = getEmptyNeighbors(five);
        // いまの場所（まちがった場所）：つながっているが立方体にならない場所
        const wrongSpots = spots.filter((p) => !foldNet(withCell(five, p.x, p.y)).valid);
        if (wrongSpots.length === 0) continue;
        const now = pick(wrongSpots, rng);
        const others = spots.filter((p) => p !== now);
        const good = others.filter((p) => foldNet(withCell(five, p.x, p.y)).valid);
        const bad = others.filter((p) => !good.includes(p));
        if (good.length === 0 || good.length > 4 || bad.length < 1) continue;
        const candidates = shuffle([...good, ...sample(bad, Math.max(1, 4 - good.length), rng)], rng).map((p, i) => ({ ...p, label: CELL_LETTERS[i] }));
        const answers = candidates.filter((c) => good.some((p) => p.x === c.x && p.y === c.y));
        const six = withCell(five, now.x, now.y);
        const movingId = six.find((c) => c.x === now.x && c.y === now.y).id;
        const first = answers[0];
        return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
          type: 'multiple',
          question: 'オレンジのマスを1つ動かして、立方体の展開図にします。どこへ動かせばよいですか。すべて選びなさい。',
          preview: netVisual(six, { marked: [movingId], candidates }),
          choices: candidates.map((c) => ({ id: c.label, label: c.label })),
          correctAnswers: answers.map((c) => c.label),
          explanation: X.explainMoveCell(answers.map((c) => c.label)),
          net: foldSpec(withCell(five, first.x, first.y), first),
        });
      }
      throw new Error('問題を作れませんでした');
    },
  },

  // ---------------- ★3 チャレンジ ----------------
  {
    id: 'C05',
    difficulty: 3,
    title: '同じ種類の展開図',
    bases: () => netBases(2),
    build(base, rng) {
      const { net, cells } = randomNet(rng, base.netId);
      // 正解：同じ種類で、向きがちがう形（もとと同じ向きのものは使わない）
      const others = distinctOrientations(net.cells).filter((o) => getShapeKey(o) !== getShapeKey(cells));
      const same = makeCells(coordsOf(pick(others, rng)));
      // まちがい：ほかの種類（同じ型のものを優先して、見分けにくくする）
      const otherNets = shuffle(CUBE_NETS.filter((n) => n.id !== net.id), rng).sort((a, b) => (b.group === net.group) - (a.group === net.group));
      const wrong = otherNets.slice(0, 3).map((n) => randomOrientation(n.cells, rng));
      return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
        question: '向きを変えたり裏返したりすると、上の展開図と同じ形になるものはどれですか。',
        preview: netVisual(cells, { cellColors: Object.fromEntries(cells.map((c) => [c.id, TARGET_FILL])) }),
        choices: [figureChoice('same', netVisual(same), '同じ形'), ...wrong.map((w, i) => figureChoice(`other-${i}`, netVisual(w), 'ちがう形'))],
        correctAnswers: ['same'],
        explanation: X.explainSameNet(),
        net: foldSpec(cells),
      });
    },
  },
  {
    id: 'C06',
    difficulty: 3,
    title: '異なる種類の展開図',
    // 向きのちがう形が4つ以上ある種類だけを使う
    bases: () => netBases(2).filter((b) => distinctOrientations(CUBE_NETS.find((n) => n.id === b.netId).cells).length >= 4),
    build(base, rng) {
      const net = CUBE_NETS.find((n) => n.id === base.netId);
      const four = sample(distinctOrientations(net.cells), 4, rng).map((o) => makeCells(coordsOf(o)));
      const oddNet = pick(
        CUBE_NETS.filter((n) => n.id !== net.id && n.group === net.group).length ? CUBE_NETS.filter((n) => n.id !== net.id && n.group === net.group) : CUBE_NETS.filter((n) => n.id !== net.id),
        rng,
      );
      const odd = randomOrientation(oddNet.cells, rng);
      return assembleNetQuestion(this, base, NET_PUZZLE_CATEGORY, {
        question: '次の5つの展開図のうち、ほかの4つと種類がちがうものはどれですか。',
        choices: [...four.map((cells, i) => figureChoice(`same-${i}`, netVisual(cells), '同じ種類')), figureChoice('odd', netVisual(odd), 'ちがう種類')],
        correctAnswers: ['odd'],
        explanation: X.explainOddNet(),
        net: foldSpec(odd),
      });
    },
  },
];

