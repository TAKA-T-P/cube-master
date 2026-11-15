// @vitest-environment jsdom
// トライアル⑥「サイコロの展開図を探せ！」：判定（数学的に正しい展開図か）・難易度ごとの出題・同じシードで同じ問題・LEVEL・記録・称号・画面の操作と答え合わせ
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DICE_NET_SEARCH_LEVELS,
  DICE_NET_REASONS,
  generateDiceNetSearchQuestion,
  validateDiceNetSelection,
  checkDiceNetSearchAnswer,
} from '../src/core/trial/diceNetSearchTrial.js';
import { foldNet } from '../src/core/cubeNetFolding.js';
import { identifyCubeNet } from '../src/core/cubeNetCatalog.js';
import { TRIAL_MODES, getTrialMode, levelAfter, TRIAL_RULES } from '../src/core/trial/trialRules.js';
import { checkTrialAnswer, generateTrialQuestion } from '../src/core/trial/trialGenerators.js';
import { createEmptyTrialRecords, recordTrialResult, normalizeTrialRecords } from '../src/core/trial/trialRecords.js';
import { trialTitleFor, TRIAL_TITLES } from '../src/core/trial/trialTitles.js';
import { createModeView } from '../src/ui/trial/trialModeViews.js';
import { renderTrialIcon } from '../src/ui/trial/trialVisuals.js';
import { createRng } from '../src/utils/random.js';

const at = (list) => list.map(([row, col]) => ({ row, col }));

// 十字の展開図（中央 (1,1)）。上 2・下 5・左 3・右 4・中央 1・右はし 6 で、向かい合う面の和はどれも 7
//   . 2 . .
//   3 1 4 6
//   . 5 . .
const CROSS = at([[0, 1], [1, 0], [1, 1], [1, 2], [1, 3], [2, 1]]);
const GOOD_GRID = [
  [6, 2, 3, 3],
  [3, 1, 4, 6],
  [1, 5, 2, 4],
];

describe('判定 validateDiceNetSelection（お手本と同じでなくても、数学的に正しければ正解）', () => {
  it('つながっていて・立方体になり・1〜6が1つずつ・向かい合う面の和が7なら正解。向かい合う面の組も返す', () => {
    const r = validateDiceNetSelection(GOOD_GRID, CROSS);
    expect(r).toMatchObject({ correct: true, isCorrect: true, reason: null, selectedCount: 6 });
    expect(r.oppositePairs).toHaveLength(3);
    expect(r.oppositePairs.map((p) => p.sum)).toEqual([7, 7, 7]);
    expect(r.netCells.map((c) => c.pip).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(Object.values(r.cellToFace)).size).toBe(6);
    // 選んだ順番は関係しない
    expect(validateDiceNetSelection(GOOD_GRID, [...CROSS].reverse()).correct).toBe(true);
  });

  it('6マスでないときは count（5マス・7マス・同じマスを2回）', () => {
    expect(validateDiceNetSelection(GOOD_GRID, CROSS.slice(0, 5))).toMatchObject({ correct: false, reason: 'count', selectedCount: 5 });
    expect(validateDiceNetSelection(GOOD_GRID, [...CROSS, { row: 0, col: 0 }])).toMatchObject({ correct: false, reason: 'count', selectedCount: 7 });
    expect(validateDiceNetSelection(GOOD_GRID, [...CROSS.slice(0, 5), CROSS[0]])).toMatchObject({ correct: false, reason: 'count' });
    expect(validateDiceNetSelection(GOOD_GRID, [...CROSS.slice(0, 5), { row: 9, col: 9 }])).toMatchObject({ correct: false, reason: 'count' });
    expect(validateDiceNetSelection(GOOD_GRID, null)).toMatchObject({ correct: false, reason: 'count', selectedCount: 0 });
  });

  it('はなれたマスがあれば notConnected', () => {
    const sel = at([[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [0, 3]]);
    expect(validateDiceNetSelection(GOOD_GRID, sel)).toMatchObject({ correct: false, reason: 'notConnected' });
  });

  it('つながっていても、折って立方体にならなければ invalidCubeNet（2×2 の正方形・4マスより長い列）', () => {
    expect(validateDiceNetSelection(GOOD_GRID, at([[0, 0], [0, 1], [1, 0], [1, 1], [1, 2], [1, 3]]))).toMatchObject({ correct: false, reason: 'invalidCubeNet' });
    const wide = [[1, 2, 3, 4, 5, 6]];
    expect(validateDiceNetSelection(wide, at([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]))).toMatchObject({ correct: false, reason: 'invalidCubeNet' });
  });

  it('展開図の形でも、同じ目が2つあれば duplicatePips', () => {
    const grid = GOOD_GRID.map((row) => [...row]);
    grid[1][3] = 1; // 6 のかわりに 1
    expect(validateDiceNetSelection(grid, CROSS)).toMatchObject({ correct: false, reason: 'duplicatePips' });
  });

  it('1〜6がそろっていても、向かい合う面の和が7でなければ oppositeFacesMismatch', () => {
    const grid = GOOD_GRID.map((row) => [...row]);
    // 右の 4 と右はしの 6 を入れかえる（1 と 4、3 と 6 が向かい合う）
    grid[1][2] = 6;
    grid[1][3] = 4;
    const r = validateDiceNetSelection(grid, CROSS);
    expect(r).toMatchObject({ correct: false, reason: 'oppositeFacesMismatch' });
    expect(r.oppositePairs.some((p) => p.sum !== 7)).toBe(true);
  });

  it('お手本とちがう、もう1つの正しい展開図も正解', () => {
    // 左の4列はお手本の十字。右の4列に、別の正しい展開図（1列4マス＋上下に1マスずつ）を入れる
    const grid = GOOD_GRID.map((row) => [...row, 6, 6, 6, 6]);
    const other = at([[1, 4], [1, 5], [1, 6], [1, 7], [0, 4], [2, 5]]);
    const fold = foldNet(other.map((s, i) => ({ id: `f${i}`, x: s.col, y: s.row })));
    expect(fold.valid).toBe(true);
    // その形で正しい目を入れる：向かい合う面に (1,6)(2,5)(3,4)
    const pips = { 0: 1, 1: 2, 2: 3 };
    other.forEach((s, i) => {
      const n = fold.frames[`f${i}`].outward;
      const axis = n.findIndex((v) => v !== 0);
      grid[s.row][s.col] = n[axis] > 0 ? pips[axis] : 7 - pips[axis];
    });
    expect(validateDiceNetSelection(grid, other).correct).toBe(true);
    expect(validateDiceNetSelection(grid, CROSS).correct).toBe(true);
    const q = { mode: 'diceNetSearch', grid, sampleSolution: CROSS };
    expect(checkDiceNetSearchAnswer(q, other).isCorrect).toBe(true);
    expect(checkTrialAnswer(q, other).isCorrect).toBe(true);
  });

  it('理由の文', () => {
    expect(DICE_NET_REASONS.invalidCubeNet).toBe('展開図の形が違います');
    expect(DICE_NET_REASONS.oppositeFacesMismatch).toBe('向かい合う目の和が7になっていません');
  });
});

describe('問題の作り方', () => {
  it('難易度ごとのマス目：★ 3×4・★★ 3×5・★★★ 4×5・★★★★ 5×5（5×5 より大きくしない）', () => {
    expect(DICE_NET_SEARCH_LEVELS).toEqual({ 1: { rows: 3, cols: 4 }, 2: { rows: 3, cols: 5 }, 3: { rows: 4, cols: 5 }, 4: { rows: 5, cols: 5 } });
  });

  it.each([1, 2, 3, 4])('★%i：どのマスにも1〜6の目。お手本の6マスは11種類の展開図のどれかで、マス目に入り、判定で正解になる', (difficulty) => {
    const { rows, cols } = DICE_NET_SEARCH_LEVELS[difficulty];
    const nets = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const q = generateTrialQuestion('diceNetSearch', difficulty, createRng(seed * 13 + difficulty));
      expect(q).toMatchObject({ mode: 'diceNetSearch', difficulty, rows, cols, text: '正しいサイコロの展開図になる6マスを選ぼう！' });
      expect(q.grid).toHaveLength(rows);
      for (const row of q.grid) {
        expect(row).toHaveLength(cols);
        for (const n of row) expect(Number.isInteger(n) && n >= 1 && n <= 6).toBe(true);
      }
      expect(q.sampleSolution).toHaveLength(6);
      for (const s of q.sampleSolution) expect(s.row >= 0 && s.row < rows && s.col >= 0 && s.col < cols).toBe(true);
      const net = identifyCubeNet(q.sampleSolution.map((s, i) => ({ id: `f${i}`, x: s.col, y: s.row })));
      expect(net).not.toBeNull();
      nets.add(net.key);
      const r = validateDiceNetSelection(q.grid, q.sampleSolution);
      expect(r.correct).toBe(true);
      expect(checkTrialAnswer(q, q.sampleSolution).isCorrect).toBe(true);
    }
    // 3×4 には横長の階段形（2×5）が入らないので10種類。ほかは11種類すべてが出る
    expect(nets.size).toBe(difficulty === 1 ? 10 : 11);
  });

  it('同じシードなら同じ問題（マス目もお手本も）', () => {
    for (const d of [1, 2, 3, 4]) {
      const a = generateDiceNetSearchQuestion(d, createRng(42));
      const b = generateDiceNetSearchQuestion(d, createRng(42));
      expect(b).toEqual(a);
    }
    expect(generateDiceNetSearchQuestion(4, createRng(1))).not.toEqual(generateDiceNetSearchQuestion(4, createRng(2)));
  });
});

describe('LEVEL・記録・称号', () => {
  it('6つめの種類。正解 +2、不正解は1回ごとに −1（LEVEL 1 より下がらない）', () => {
    expect(TRIAL_MODES.map((m) => m.id).at(-1)).toBe('diceNetSearch');
    const mode = getTrialMode('diceNetSearch');
    expect(mode).toMatchObject({ name: 'サイコロの展開図を探せ！', description: 'マス目の中から6マスを選んで、正しいサイコロの展開図を見つけよう！', gain: 2, missesPerLevelDown: 1 });
    expect(levelAfter(1, true, 'diceNetSearch')).toBe(3);
    expect(levelAfter(4, false, 'diceNetSearch', TRIAL_RULES, 1)).toBe(3);
    expect(levelAfter(4, false, 'diceNetSearch', TRIAL_RULES, 2)).toBe(3);
    expect(levelAfter(1, false, 'diceNetSearch', TRIAL_RULES, 1)).toBe(1);
  });

  it('自己ベストはほかの種類と別に保存（cubeMaster:trial）。前の保存データも読める。称号は10段階', () => {
    const base = createEmptyTrialRecords();
    base.modes.netArrow = { bestLevel: 9, attempts: 3, lastPlayedAt: null };
    const { records, bestUpdated } = recordTrialResult(base, { mode: 'diceNetSearch', highestLevel: 11, aborted: false });
    expect(bestUpdated).toBe(true);
    expect(records.modes.diceNetSearch).toMatchObject({ bestLevel: 11, attempts: 1 });
    expect(records.modes.netArrow).toMatchObject({ bestLevel: 9, attempts: 3 });
    expect(normalizeTrialRecords({ version: 1, modes: { diceRoll: { bestLevel: 4, attempts: 1 } } }).modes.diceNetSearch).toMatchObject({ bestLevel: 0, attempts: 0 });
    expect(TRIAL_TITLES.diceNetSearch).toEqual(['サイコロ探し見習い', '展開図たんけん隊', 'ダイスハンター', '展開図チェッカー', 'ダイス職人', '展開図鑑定士', 'ダイス博士', '展開図の達人', 'ダイスの覇者', '伝説のダイスマスター']);
    expect(trialTitleFor('diceNetSearch', 1)).toBeNull();
    expect(trialTitleFor('diceNetSearch', 2)).toMatchObject({ name: 'サイコロ探し見習い' });
    expect(trialTitleFor('diceNetSearch', 25)).toMatchObject({ rank: 10, name: '伝説のダイスマスター' });
  });

  it('選択画面のカードの絵（黄色の6マスは正しいサイコロの展開図）', () => {
    const icon = renderTrialIcon('diceNetSearch');
    expect(icon.tagName).toBe('svg');
    expect(icon.querySelectorAll(':scope > svg')).toHaveLength(12);
  });
});

describe('画面（選ぶ・答え合わせ）', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });
  const pointer = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  const setup = (q = { mode: 'diceNetSearch', difficulty: 1, rows: 3, cols: 4, grid: GOOD_GRID, sampleSolution: CROSS, text: '' }) => {
    const onSubmit = vi.fn();
    const notify = vi.fn();
    const view = createModeView(q, { onSubmit, notify });
    document.body.append(view.figure, view.input);
    view.setDisabled(false);
    const cell = (r, c) => view.figure.querySelector(`.trial-cell[data-r="${r}"][data-c="${c}"]`);
    const tap = (r, c) => {
      pointer(cell(r, c), 'pointerdown');
      pointer(cell(r, c), 'pointerup');
    };
    const btn = (text) => [...view.input.querySelectorAll('button')].find((b) => b.textContent === text);
    const count = () => view.input.querySelector('.trial-dicenet__count').textContent;
    return { q, view, onSubmit, notify, cell, tap, btn, count };
  };

  it('どのマスにもサイコロの目の絵（1の目は赤）。「選択中：n / 6マス」と、6マスのときだけ押せる「決定」', () => {
    const { view, cell, tap, btn, count } = setup();
    expect(view.figure.querySelectorAll('.trial-cell svg.trial-dicenet__face')).toHaveLength(12);
    expect(cell(1, 1).querySelectorAll('circle')).toHaveLength(1);
    expect(cell(1, 1).querySelector('circle').getAttribute('fill').toLowerCase()).not.toBe('#1b2a41');
    expect(count()).toBe('選択中：0 / 6マス');
    expect(btn('決定').disabled).toBe(true);
    expect(btn('全消去').disabled).toBe(true);
    for (const s of CROSS.slice(0, 5)) tap(s.row, s.col);
    expect(count()).toBe('選択中：5 / 6マス');
    expect(btn('決定').disabled).toBe(true);
    tap(CROSS[5].row, CROSS[5].col);
    expect(count()).toBe('選択中：6 / 6マス');
    expect(btn('決定').disabled).toBe(false);
    // もう一度押すと、とりけし
    tap(CROSS[5].row, CROSS[5].col);
    expect(count()).toBe('選択中：5 / 6マス');
    expect(btn('決定').disabled).toBe(true);
  });

  it('なぞると続けて選ぶ。とりけしから始めたら、なぞったマスをとりけし続ける', () => {
    const { cell, tap, count, view } = setup();
    pointer(cell(1, 0), 'pointerdown');
    pointer(cell(1, 1), 'pointermove');
    pointer(cell(1, 2), 'pointermove');
    pointer(cell(1, 1), 'pointermove'); // 同じストロークで戻っても反転しない
    pointer(cell(1, 2), 'pointerup');
    expect(count()).toBe('選択中：3 / 6マス');
    tap(0, 0);
    expect(count()).toBe('選択中：4 / 6マス');
    pointer(cell(1, 1), 'pointerdown'); // 選んであるマスから始める → とりけす
    pointer(cell(1, 2), 'pointermove');
    pointer(cell(0, 2), 'pointermove'); // 選んでいないマスは選ばない
    pointer(cell(0, 2), 'pointerup');
    expect(view.getSelection()).toEqual(at([[0, 0], [1, 0]]));
  });

  it('6マスより多くは選べず「6マスまで選べます」と出す。「全消去」ですべてとりけし', () => {
    const { tap, count, notify, btn, view } = setup();
    for (const s of CROSS) tap(s.row, s.col);
    tap(0, 0);
    expect(count()).toBe('選択中：6 / 6マス');
    expect(notify).toHaveBeenCalledWith('6マスまで選べます');
    expect(view.getSelection()).toEqual(CROSS);
    btn('全消去').click();
    expect(count()).toBe('選択中：0 / 6マス');
  });

  it('「決定」は1回だけ送る。止めている間（答え合わせ・時間切れ）は選べない', () => {
    const { tap, btn, onSubmit, view, count } = setup();
    for (const s of CROSS) tap(s.row, s.col);
    btn('決定').click();
    btn('決定').click();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(CROSS);
    view.setDisabled(true);
    tap(0, 0);
    expect(count()).toBe('選択中：6 / 6マス');
    expect(btn('決定').disabled).toBe(true);
    expect(btn('全消去').disabled).toBe(true);
  });

  const fakeViewer = () => ({
    animations: { cancel: vi.fn() },
    ...Object.fromEntries(['clearHighlights', 'setBlocks', 'setFaceDecorations', 'setLabelsVisible', 'setNet', 'setCameraPreset'].map((k) => [k, vi.fn()])),
    playQuestionReveal: vi.fn(() => Promise.resolve()),
  });

  it('正解：選んだ6マスを向かい合う組の色で示し、ほかはうすく。選んだ6マスを、目をかいて折りたたむ', async () => {
    const { tap, view, q } = setup();
    for (const s of CROSS) tap(s.row, s.col);
    const detail = checkTrialAnswer(q, view.getSelection());
    const viewer = fakeViewer();
    const show3D = vi.fn();
    await view.reveal({ result: { isCorrect: true, detail }, viewer, speed: 4, show3D });
    expect(show3D).toHaveBeenCalledWith({ keepFigure: true });
    expect(view.figure.querySelectorAll('.trial-cell--dim')).toHaveLength(6);
    expect(view.figure.querySelectorAll('.trial-cell--on')).toHaveLength(6);
    expect(view.figure.querySelector('.trial-dicenet__caption').textContent).toBe('向かい合う目の和：1+6=7・2+5=7・3+4=7');
    const spec = viewer.setNet.mock.calls[0][0];
    expect(spec.cells).toHaveLength(6);
    expect(Object.values(spec.cellFaces).map((f) => f.value).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(foldNet(spec.cells, { rootId: spec.rootId }).valid).toBe(true);
    expect(viewer.playQuestionReveal.mock.calls[0][0].steps.some((s) => s.type === 'fold')).toBe(true);
    expect(view.answerText({ isCorrect: true, detail })).toBe('正しいサイコロの展開図です。');
  });

  it('不正解：選んだマスを少し見せてから、お手本の6マスを示して折りたたむ。理由も出す', async () => {
    vi.useFakeTimers();
    const { tap, view, q } = setup();
    const wrong = at([[0, 0], [0, 1], [1, 0], [1, 1], [1, 2], [1, 3]]);
    for (const s of wrong) tap(s.row, s.col);
    const detail = checkTrialAnswer(q, view.getSelection());
    expect(detail.reason).toBe('invalidCubeNet');
    const viewer = fakeViewer();
    const done = view.reveal({ result: { isCorrect: false, detail }, viewer, speed: 2, show3D: vi.fn() });
    expect(view.figure.querySelectorAll('.trial-cell--wrong')).toHaveLength(6);
    expect(viewer.setNet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    await done;
    expect(view.figure.querySelectorAll('.trial-cell--wrong')).toHaveLength(0);
    const shown = [...view.figure.querySelectorAll('.trial-cell--answer')].map((el) => ({ row: Number(el.dataset.r), col: Number(el.dataset.c) }));
    expect(shown).toEqual(CROSS);
    expect(viewer.setNet).toHaveBeenCalledTimes(1);
    expect(view.answerText({ isCorrect: false, detail })).toBe('展開図の形が違います。正しい展開図の例を示しました。');
    expect(view.answerText({ isCorrect: false, detail: { reason: 'oppositeFacesMismatch' } })).toBe('向かい合う目の和が7になっていません。正しい展開図の例を示しました。');
  });
});
