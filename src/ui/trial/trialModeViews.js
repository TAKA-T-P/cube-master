/**
 * トライアルの6種類ごとの画面の中身（問題の図・回答の入力・答え合わせの演出）
 *
 * createModeView(question, { onSubmit, notify }) が返すもの：
 *   figure    問題の図（見取図・サイコロの道・塗り分ける図形）
 *   input     回答の入力（テンキー・マス目・1〜6・パレット）
 *   setDisabled(bool)
 *   answerText(result) 正しい答えの短い文
 *   reveal({ result, viewer, netViewer, speed, show3D }) → Promise   正解・不正解のどちらでも、正しい答えの演出
 *   destroy()
 * 3D は、問題画面と同じ three/cubeViewer（積み木・サイコロ）と、three/trial/trialNetViewer（展開図）を使う。
 */
import { h } from '../../utils/dom.js';
import { button } from '../components.js';
import { renderBlocksSvg } from '../blockVisuals.js';
import { createNumberInput } from './numberInput.js';
import { createGridPainter } from './gridPainter.js';
import { createDiceAnswerInput } from './diceAnswerInput.js';
import { createColorPalette, TRIAL_COLORS, ERASER } from './colorPalette.js';
import { renderDiceBoard } from './trialVisuals.js';
import { renderNetArrowSketch, createNetArrowInput, ARROW_COLORS } from './netArrowVisuals.js';
import { renderFaceSvg } from '../visualChoices.js';
import { BLOCK_VIEW_DIRECTION } from '../../core/blockGeometry.js';
import { INITIAL_ORIENTATION } from '../../core/cubeOrientation.js';
import { numberFaces, numberFace } from '../../core/cubeFaceLabels.js';
import { DEFAULT_VIEW_DIRECTION } from '../../core/cubeConstants.js';
import { expectedGrid } from '../../core/trial/projectionTrial.js';
import { canPaintColor, solutionColoring, MAX_CELLS_PER_COLOR } from '../../core/trial/netPartitionTrial.js';
import { validateDiceNetSelection, DICE_NET_CELLS, DICE_NET_REASONS } from '../../core/trial/diceNetSearchTrial.js';

/** 積み木の個数を数える演出のカメラ（トレーニングの B09・B10 と同じ） */
export const COUNT_VIEW = Object.freeze([6.5, 5, 3.5]);
/** 真正面から見るカメラ（トレーニングの「積み木の見え方」と同じ） */
export const STRAIGHT_VIEWS = Object.freeze({ front: [0, 0.02, 1], right: [1, 0.02, 0], top: [0, 1, 0.05] });
/** サイコロの1回の転がり（速さ 1 のとき） */
export const DICE_TURN_MS = 600;
export const DICE_PAUSE_MS = 200;

/** 3D の積み木を置く（前の問題の飾り・展開図は消す） */
function showBlocks(viewer, cubes, { arrows = [], counting = false } = {}) {
  viewer.animations.cancel();
  viewer.clearHighlights?.();
  viewer.setFaceDecorations(null);
  viewer.setNet?.(null);
  viewer.setBlocks(cubes, { arrows, ...(counting ? { countingRoom: true } : {}) });
  viewer.setCubeOrientation(INITIAL_ORIENTATION);
  viewer.setLabelsVisible(false);
  viewer.setCameraPreset([...BLOCK_VIEW_DIRECTION], { animate: false });
}

// ---------------- ① 積み木の数はいくつ？ ----------------
function blockCountView(q, { onSubmit }) {
  const input = createNumberInput({ maxDigits: 3, unit: '個', onSubmit: (v) => onSubmit(v) });
  return {
    figure: h('figure', { class: 'trial-figure__blocks' }, renderBlocksSvg({ cubes: q.cubes })),
    input: input.el,
    setDisabled: (v) => input.setDisabled(v),
    answerText: () => `答え：${q.answer}個（${q.layers.map((l) => `${l.level}段目 ${l.count}個`).join('・')}）`,
    reveal({ viewer, show3D }) {
      if (!viewer) return Promise.resolve();
      show3D();
      showBlocks(viewer, q.cubes, { counting: true });
      return viewer.playQuestionReveal({
        cameraPreset: [...BLOCK_VIEW_DIRECTION],
        steps: [
          { type: 'camera', direction: [...COUNT_VIEW], duration: 700 },
          { type: 'countLayers', hidden: q.hidden },
        ],
      });
    },
    destroy: () => input.destroy(),
  };
}

// ---------------- ② 3方向から見ると？ ----------------
function projectionView(q, { onSubmit }) {
  const { rows, cols } = q.grid;
  let erase = false;
  const submit = h('button', { class: 'btn btn--primary trial-grid-tools__submit', type: 'button', disabled: true, onClick: () => onSubmit(painter.getValues()) }, '決定');
  const painter = createGridPainter({
    rows,
    cols,
    initial: () => false,
    resolve: (value) => (erase ? false : !value),
    render: (el, value) => el.classList.toggle('trial-cell--on', Boolean(value)),
    onChange: (values) => (submit.disabled = !values.flat().some(Boolean)),
    label: `${q.viewFrom}見た図をかくマス目`,
  });
  const modeButton = button('塗る', () => setErase(!erase), 'btn--small trial-grid-tools__mode');
  const setErase = (v) => {
    erase = v;
    modeButton.textContent = erase ? '消す' : '塗る';
    modeButton.setAttribute('aria-pressed', String(erase));
    modeButton.classList.toggle('trial-grid-tools__mode--erase', erase);
  };
  setErase(false);
  const clear = button('全消去', () => painter.setAll(false), 'btn--small');
  const floorLabel = q.direction === 'top' ? '手前' : '床';
  const gridBox = h('div', { class: 'trial-projection__grid' }, painter.el, h('p', { class: 'trial-projection__floor', 'aria-hidden': 'true' }, `▲ ${floorLabel}`));
  gridBox.style.setProperty('--ratio', String(cols / rows));
  return {
    figure: h('figure', { class: 'trial-figure__blocks' }, renderBlocksSvg({ cubes: q.cubes, arrows: [q.direction] })),
    input: h(
      'div',
      { class: 'trial-projection' },
      gridBox,
      h('div', { class: 'trial-grid-tools' }, modeButton, clear, submit),
    ),
    setDisabled(v) {
      painter.setDisabled(v);
      for (const b of [modeButton, clear]) b.disabled = v;
      submit.disabled = v || !painter.getValues().flat().some(Boolean);
    },
    answerText: (result) => (result?.isCorrect ? `${q.viewFrom}見た形と同じです。` : `正しい形を緑の枠で示しました（${q.viewFrom}見た図）。`),
    reveal({ result, viewer, show3D }) {
      // 入力した形と正解を重ねて示す（左右にずれただけなら、ずれた位置に合わせる）
      const marks = result.detail.marks;
      painter.decorate((el, r, c) => {
        el.classList.remove('trial-cell--hit', 'trial-cell--missing', 'trial-cell--extra');
        if (marks[r][c]) el.classList.add(`trial-cell--${marks[r][c]}`);
      });
      if (!viewer) return Promise.resolve();
      show3D();
      showBlocks(viewer, q.cubes, { arrows: [q.direction] });
      return viewer.playQuestionReveal({ cameraPreset: [...BLOCK_VIEW_DIRECTION], steps: [{ type: 'camera', direction: [...STRAIGHT_VIEWS[q.direction]], duration: 900 }, { type: 'pause', ms: 600 }] });
    },
    destroy() {},
    /** テスト用：正解の形（中央に置いたもの） */
    expected: () => expectedGrid(q),
  };
}

// ---------------- ③ サイコロを転がすと？ ----------------
function diceRollView(q, { onSubmit }) {
  const input = createDiceAnswerInput({ onSubmit: (v) => onSubmit(v) });
  const board = renderDiceBoard(q);
  const timers = [];
  return {
    figure: h('figure', { class: 'trial-figure__board' }, board.el),
    input: input.el,
    setDisabled: (v) => input.setDisabled(v),
    answerText: () => `答え：${q.answer}の目（${q.moves.length}回転がす）`,
    reveal({ viewer, speed, show3D }) {
      // 道の上で、今いるマスを順に示す（3D の転がりと同じ間かく）
      const step = (DICE_TURN_MS + DICE_PAUSE_MS) / speed;
      board.setMarker(0);
      q.moves.forEach((_, i) => timers.push(setTimeout(() => board.setMarker(i + 1), (i + 1) * step - DICE_PAUSE_MS / speed)));
      if (!viewer) return new Promise((r) => timers.push(setTimeout(r, q.moves.length * step)));
      show3D({ keepFigure: true });
      viewer.animations.cancel();
      viewer.clearHighlights?.();
      viewer.setBlocks(null);
      viewer.setNet?.(null);
      viewer.setFaceDecorations(numberFaces(q.faces));
      viewer.setCubeOrientation(q.pose);
      viewer.setLabelsVisible(false);
      viewer.setCameraPreset([...DEFAULT_VIEW_DIRECTION], { animate: false });
      return viewer.playQuestionReveal({
        orientation: q.pose,
        cameraPreset: [...DEFAULT_VIEW_DIRECTION],
        steps: [{ type: 'rotate', moves: [...q.moves], durationPerTurn: DICE_TURN_MS, pause: DICE_PAUSE_MS, pauseAfter: 600 }],
      });
    },
    destroy() {
      input.destroy();
      for (const t of timers) clearTimeout(t);
    },
  };
}

// ---------------- ④ 展開図に分けろ！ ----------------
function netPartitionView(q, { onSubmit, notify }) {
  const byPos = new Map(q.cells.map((c) => [`${c.y},${c.x}`, c]));
  const cellAt = (r, c) => byPos.get(`${r},${c}`);
  const coloring = Object.fromEntries(q.cells.map((c) => [c.id, null]));
  const palette = createColorPalette();
  const submit = h('button', { class: 'btn btn--primary trial-grid-tools__submit', type: 'button', disabled: true, onClick: () => onSubmit({ ...coloring }) }, '決定');
  const counts = () => TRIAL_COLORS.map((col) => Object.values(coloring).filter((v) => v === col.id).length);
  const paint = (el, value) => {
    el.style.background = value === null || value === undefined ? '' : TRIAL_COLORS[value].fill;
    el.classList.toggle('trial-cell--on', value !== null && value !== undefined);
  };
  const painter = createGridPainter({
    rows: q.height,
    cols: q.width,
    isActive: (r, c) => Boolean(cellAt(r, c)),
    resolve: (value) => {
      const sel = palette.getSelected();
      if (sel === ERASER) return null;
      // 同じ色のマスを押すと消す（なぞると消し続ける）
      return value === sel ? null : sel;
    },
    canApply: (r, c, target) => {
      if (canPaintColor(coloring, target, cellAt(r, c).id)) return true;
      notify(`${TRIAL_COLORS[target].name}は${MAX_CELLS_PER_COLOR}マスまでです。ほかの色をえらんでね。`);
      return false;
    },
    render: paint,
    onChange: (values) => {
      for (const cell of q.cells) coloring[cell.id] = values[cell.y][cell.x];
      palette.setCounts(counts());
      submit.disabled = !Object.values(coloring).some((v) => v !== null);
    },
    label: '展開図に分ける図形',
  });
  const clear = button('全消去', () => painter.setAll(null), 'btn--small');
  const showColoring = (map) => painter.decorate((el, r, c) => cellAt(r, c) && paint(el, map[cellAt(r, c).id]));
  const figure = h('div', { class: 'trial-figure__net' }, painter.el);
  figure.style.setProperty('--cols', String(q.width));
  figure.style.setProperty('--rows', String(q.height));
  return {
    figure,
    input: h('div', { class: 'trial-net-tools' }, palette.el, h('div', { class: 'trial-grid-tools' }, clear, submit)),
    setDisabled(v) {
      painter.setDisabled(v);
      palette.setDisabled(v);
      clear.disabled = v;
      submit.disabled = v || !Object.values(coloring).some((x) => x !== null);
    },
    answerText: (result) => (result?.isCorrect ? `${q.netCount}つの展開図に分けられました。` : `分け方の例を示しました（${q.netCount}つの展開図）。`),
    async reveal({ result, netViewer, speed, show3D }) {
      // 正解ならプレイヤーのぬり分け、不正解ならお手本の分け方で折りたたむ
      const map = result.isCorrect ? { ...coloring } : solutionColoring(q);
      if (!result.isCorrect) {
        // 入力したぬり分けを少し見せてから、お手本に切りかえる
        await new Promise((r) => setTimeout(r, 700 / speed));
        showColoring(map);
      }
      if (!netViewer) return;
      const groups = new Map();
      for (const cell of q.cells) {
        const color = map[cell.id];
        if (!groups.has(color)) groups.set(color, []);
        groups.get(color).push({ x: cell.x, y: cell.y });
      }
      const colors = [...groups.keys()].map((k) => TRIAL_COLORS[k]?.fill ?? '#e6f0fb');
      show3D({ keepFigure: true, net: true });
      netViewer.set([...groups.values()], colors);
      await netViewer.play({ speed });
    },
    destroy() {},
  };
}

// ---------------- ⑤ 展開図に矢印を引け！ ----------------
function netArrowView(q, { onSubmit }) {
  let disabled = false;
  const submit = h('button', { class: 'btn btn--primary trial-grid-tools__submit', type: 'button', disabled: true, onClick: () => onSubmit(input.getValue()) }, '決定');
  const redo = button('かき直し', () => input.clear(), 'btn--small');
  redo.disabled = true;
  const input = createNetArrowInput(q, {
    onChange: (v) => {
      submit.disabled = disabled || !v;
      redo.disabled = disabled || !v;
    },
  });
  return {
    figure: h('figure', { class: 'trial-figure__sketch' }, renderNetArrowSketch(q)),
    input: h('div', { class: 'trial-arrow' }, h('div', { class: 'trial-arrow__net' }, input.el), h('div', { class: 'trial-grid-tools' }, redo, submit)),
    setDisabled(v) {
      disabled = v;
      input.setDisabled(v);
      submit.disabled = v || !input.getValue();
      redo.disabled = v || !input.getValue();
    },
    answerText: (result) =>
      result?.isCorrect ? '面も向きも合っています。' : result?.detail?.reason === 'direction' ? '面は合っていますが、向きがちがいます。正しい矢印を示しました。' : '青い矢印をかく面がちがいます。正しい面と向きを示しました。',
    reveal({ result, viewer, show3D }) {
      // 展開図に正しい青い矢印をかき（まちがいは灰色の点線で残す）、赤・青の矢印をかいた展開図を折りたたむ。
      // 見取図と同じ基準のマス（rootId）で折るので、組み立てた立方体は見取図と同じ向きになる
      input.showAnswer({ isCorrect: result.isCorrect });
      if (!viewer) return Promise.resolve();
      show3D({ keepFigure: true });
      viewer.animations.cancel();
      viewer.clearHighlights?.();
      viewer.setBlocks(null);
      viewer.setFaceDecorations(null);
      viewer.setLabelsVisible(false);
      viewer.setNet({
        cells: q.cells,
        rootId: q.rootId,
        cellArrows: { [q.red.cellId]: [{ dir: q.red.dir, color: ARROW_COLORS.red }], [q.answer.cellId]: [{ dir: q.answer.dir, color: ARROW_COLORS.blue }] },
      });
      viewer.setCameraPreset([...DEFAULT_VIEW_DIRECTION], { animate: false });
      // 青い矢印がうら側の面なら、折りたたんだあとにその面が見える向きへ回りこむ（見えない面の軸だけ、見る向きを反対にする）
      const normal = q.frames[q.answer.cellId].outward;
      const hidden = normal.some((n, i) => n !== 0 && n * DEFAULT_VIEW_DIRECTION[i] < 0);
      const turn = hidden ? [{ type: 'camera', direction: DEFAULT_VIEW_DIRECTION.map((v, i) => (normal[i] !== 0 ? -v : v)), duration: 1000 }, { type: 'pause', ms: 600 }] : [{ type: 'pause', ms: 700 }];
      return viewer.playQuestionReveal({
        cameraPreset: [...DEFAULT_VIEW_DIRECTION],
        steps: [{ type: 'pause', ms: 400 }, { type: 'fold', to: 1, duration: 2200 }, ...turn],
      });
    },
    destroy() {},
    /** テスト用：入力の部品 */
    arrowInput: input,
  };
}

// ---------------- ⑥ サイコロの展開図を探せ！ ----------------
/** 選んだマスの色 */
export const DICE_NET_SELECTED_COLOR = '#ffe27a';
/** 答え合わせで、向かい合う面の組（1と6・2と5・3と4）を同じ色にする */
export const DICE_NET_PAIR_COLORS = Object.freeze({ 1: '#ffc9c9', 6: '#ffc9c9', 2: '#c6e3ff', 5: '#c6e3ff', 3: '#cdeec0', 4: '#cdeec0' });

function diceNetSearchView(q, { onSubmit, notify }) {
  let disabled = false;
  let submitted = false;
  const selectedList = () => {
    const values = painter.getValues();
    const list = [];
    for (let r = 0; r < q.rows; r++) for (let c = 0; c < q.cols; c++) if (values[r][c]) list.push({ row: r, col: c });
    return list;
  };
  const count = h('span', { class: 'trial-dicenet__count', 'aria-live': 'polite' });
  const submit = h(
    'button',
    {
      class: 'btn btn--primary trial-grid-tools__submit',
      type: 'button',
      disabled: true,
      onClick: () => {
        // 二重に送らない（押したらすぐに止める）
        if (disabled || submitted || selectedList().length !== DICE_NET_CELLS) return;
        submitted = true;
        submit.disabled = true;
        onSubmit(selectedList());
      },
    },
    '決定',
  );
  const clear = button('全消去', () => painter.setAll(false), 'btn--small');
  const update = () => {
    const n = selectedList().length;
    count.textContent = `選択中：${n} / ${DICE_NET_CELLS}マス`;
    count.classList.toggle('trial-dicenet__count--full', n === DICE_NET_CELLS);
    submit.disabled = disabled || submitted || n !== DICE_NET_CELLS;
    clear.disabled = disabled || n === 0;
  };
  const face = (el, pip, color) => {
    el.replaceChildren(renderFaceSvg({ face: numberFace(pip, { color }) }, 'trial-dicenet__face'));
  };
  const painter = createGridPainter({
    rows: q.rows,
    cols: q.cols,
    initial: () => false,
    // 押した最初のマスで「選ぶ」か「とりけす」かを決め、なぞっている間はそれを続ける
    resolve: (value) => !value,
    canApply: (r, c, target, values) => {
      if (!target) return true;
      const n = values.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
      if (n < DICE_NET_CELLS) return true;
      notify(`${DICE_NET_CELLS}マスまで選べます`);
      return false;
    },
    render: (el, value, r, c) => {
      face(el, q.grid[r][c], value ? DICE_NET_SELECTED_COLOR : '#ffffff');
      el.classList.toggle('trial-cell--on', Boolean(value));
      el.setAttribute('aria-label', `${r + 1}行${c + 1}列：${q.grid[r][c]}の目${value ? '（選択中）' : ''}`);
    },
    onChange: () => {
      notify('');
      update();
    },
    label: 'サイコロの目のマス目',
  });
  const caption = h('p', { class: 'trial-dicenet__caption', hidden: true });
  const figure = h('div', { class: 'trial-figure__net trial-dicenet' }, painter.el, caption);
  figure.style.setProperty('--cols', String(q.cols));
  figure.style.setProperty('--rows', String(q.rows));
  update();

  /** 6マスを示す（pairColors：向かい合う面の組を同じ色に。ほかのマスはうすくする） */
  const showCells = (cells, { mark = null, pairColors = false } = {}) => {
    const on = new Set(cells.map((s) => `${s.row},${s.col}`));
    painter.decorate((el, r, c) => {
      const inside = on.has(`${r},${c}`);
      face(el, q.grid[r][c], inside ? (pairColors ? DICE_NET_PAIR_COLORS[q.grid[r][c]] : DICE_NET_SELECTED_COLOR) : '#ffffff');
      el.classList.toggle('trial-cell--on', inside);
      el.classList.toggle('trial-cell--dim', !inside);
      el.classList.toggle('trial-cell--wrong', inside && mark === 'wrong');
      el.classList.toggle('trial-cell--answer', inside && mark === 'answer');
    });
  };
  const pairText = (pairs, cells) => {
    const pip = new Map(cells.map((c) => [c.id, c.pip]));
    return pairs
      .map((p) => [pip.get(p.a), pip.get(p.b)].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0])
      .map(([a, b]) => `${a}+${b}=${a + b}`)
      .join('・');
  };

  return {
    figure,
    input: h('div', { class: 'trial-dicenet-tools' }, count, h('div', { class: 'trial-grid-tools' }, clear, submit)),
    setDisabled(v) {
      disabled = v;
      painter.setDisabled(v);
      update();
    },
    answerText: (result) => {
      if (result?.isCorrect) return '正しいサイコロの展開図です。';
      const reason = DICE_NET_REASONS[result?.detail?.reason] ?? '正しい展開図ではありません';
      return `${reason}。正しい展開図の例を示しました。`;
    },
    async reveal({ result, viewer, speed = 1, show3D }) {
      // 正解ならプレイヤーの6マス、不正解ならお手本の6マスを折りたたむ
      let target = result.detail;
      if (!result.isCorrect) {
        // 選んだマスを少し見せてから、お手本に切りかえる
        showCells(selectedList(), { mark: 'wrong' });
        await new Promise((r) => setTimeout(r, 700 / speed));
        target = validateDiceNetSelection(q.grid, q.sampleSolution);
      }
      showCells(target.netCells, { mark: result.isCorrect ? null : 'answer', pairColors: true });
      caption.textContent = `向かい合う目の和：${pairText(target.oppositePairs, target.netCells)}`;
      caption.hidden = false;
      if (!viewer) return;
      show3D({ keepFigure: true });
      viewer.animations.cancel();
      viewer.clearHighlights?.();
      viewer.setBlocks(null);
      viewer.setFaceDecorations(null);
      viewer.setLabelsVisible(false);
      viewer.setNet({
        cells: target.netCells.map(({ id, x, y }) => ({ id, x, y })),
        rootId: target.rootId,
        cellFaces: Object.fromEntries(target.netCells.map((c) => [c.id, numberFace(c.pip)])),
        cellColors: Object.fromEntries(target.netCells.map((c) => [c.id, DICE_NET_PAIR_COLORS[c.pip]])),
      });
      viewer.setCameraPreset([...DEFAULT_VIEW_DIRECTION], { animate: false });
      // 折りたたんだあと、反対側へ回りこんで、うら側の3つの面（向かい合う面）も見せる
      await viewer.playQuestionReveal({
        cameraPreset: [...DEFAULT_VIEW_DIRECTION],
        steps: [
          { type: 'pause', ms: 400 },
          { type: 'fold', to: 1, duration: 2200 },
          { type: 'pause', ms: 500 },
          { type: 'camera', direction: DEFAULT_VIEW_DIRECTION.map((v) => -v), duration: 1200 },
          { type: 'pause', ms: 500 },
        ],
      });
    },
    destroy() {},
    /** テスト用：選んでいるマス */
    getSelection: selectedList,
  };
}

const VIEWS = { blockCount: blockCountView, projectionDraw: projectionView, diceRoll: diceRollView, netPartition: netPartitionView, netArrow: netArrowView, diceNetSearch: diceNetSearchView };


export function createModeView(question, handlers) {
  const make = VIEWS[question.mode];
  if (!make) throw new Error(`トライアルの種類が不正です: ${question.mode}`);
  return make(question, handlers);
}
