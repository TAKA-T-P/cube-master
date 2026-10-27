/**
 * トライアルの4種類ごとの画面の中身（問題の図・回答の入力・答え合わせの演出）
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
import { BLOCK_VIEW_DIRECTION } from '../../core/blockGeometry.js';
import { INITIAL_ORIENTATION } from '../../core/cubeOrientation.js';
import { numberFaces } from '../../core/cubeFaceLabels.js';
import { DEFAULT_VIEW_DIRECTION } from '../../core/cubeConstants.js';
import { expectedGrid } from '../../core/trial/projectionTrial.js';
import { canPaintColor, solutionColoring, MAX_CELLS_PER_COLOR } from '../../core/trial/netPartitionTrial.js';

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
  return {
    figure: h('figure', { class: 'trial-figure__blocks' }, renderBlocksSvg({ cubes: q.cubes, arrows: [q.direction] })),
    input: h(
      'div',
      { class: 'trial-projection' },
      h('div', { class: 'trial-projection__grid' }, painter.el, h('p', { class: 'trial-projection__floor', 'aria-hidden': 'true' }, `▲ ${floorLabel}`)),
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

const VIEWS = { blockCount: blockCountView, projectionDraw: projectionView, diceRoll: diceRollView, netPartition: netPartitionView };

export function createModeView(question, handlers) {
  const make = VIEWS[question.mode];
  if (!make) throw new Error(`トライアルの種類が不正です: ${question.mode}`);
  return make(question, handlers);
}
