/**
 * トレーニング設定画面（難易度・問題数／1分チャレンジ）
 *
 * 「問題数を選ぶ」：問題数のスライダー（1〜20問）。タイマーなしで、じっくり解く
 * 「1分チャレンジ」：1分間で何問正解できるか（不正解は残り時間 −10 秒）。スライダーの代わりに、選んだ難易度の最高記録を出す
 */
import { h } from '../utils/dom.js';
import { segmented, slider, button } from './components.js';
import { getCategory, DIFFICULTIES, QUESTION_LIMIT_RANGE, DEFAULT_SETTINGS } from '../questions/questionRegistry.js';
import { CHALLENGE_RULES } from '../core/timedChallengeSession.js';
import { startTraining, startChallenge, getSettings, takeChallengeNotice } from './trainingStore.js';
import { getChallengeBest } from './learningStore.js';

export const PLAY_MODES = Object.freeze([
  { value: 'count', label: '問題数を選ぶ', lead: '時間を気にせず、じっくり練習！' },
  { value: 'challenge', label: '1分チャレンジ', lead: '60秒で何問正解できるか挑戦！' },
]);

export function mountTrainingSetupScreen(container, { navigate, params }) {
  const category = getCategory(params?.category);
  if (!category?.enabled) {
    navigate('categories');
    return { unmount() {} };
  }

  // 前回と同じカテゴリなら、前回の設定を初期値にする
  const prev = getSettings();
  const initial = prev?.category === category.id ? prev : DEFAULT_SETTINGS;
  const notice = takeChallengeNotice();

  const recordEl = h('p', { class: 'challenge-record', 'data-testid': 'challenge-record' });
  const updateRecord = () => {
    const best = getChallengeBest(category.id, difficulty.get());
    recordEl.textContent = best > 0 ? `最高記録：${best}問正解` : '最高記録：まだありません';
  };

  const difficulty = segmented('難易度', DIFFICULTIES, initial.difficulty, () => updateRecord());
  const { min, max } = QUESTION_LIMIT_RANGE;
  const initialLimit = Number.isInteger(initial.questionLimit) ? Math.min(max, Math.max(min, initial.questionLimit)) : DEFAULT_SETTINGS.questionLimit;
  const limit = slider('問題数', { min, max, unit: '問' }, initialLimit, () => {});

  // 問題数を選ぶ ⇄ 1分チャレンジ（同じ行に横並び）
  // 説明（ルールの注意）は「スタート」の下に出す
  const countPanel = h('div', { class: 'setup-mode-panel' }, h('p', { class: 'setup-mode-lead' }, PLAY_MODES[0].lead), limit.el);
  const countNote = h('p', { class: 'setup-note setup-note--after-start' }, 'タイマーはありません。ヒントを見たり、解説の3Dを何度も見直したりできます。');
  const challengePanel = h('div', { class: 'setup-mode-panel' }, h('p', { class: 'setup-mode-lead' }, PLAY_MODES[1].lead), recordEl);
  const challengeNote = h(
    'p',
    { class: 'setup-note setup-note--after-start' },
    `まちがえると残り時間が${CHALLENGE_RULES.mistakePenaltyMs / 1000}秒へります。ヒント・パスはありません。答え合わせの間は時間が止まります。`,
  );
  const showMode = (value) => {
    countPanel.hidden = countNote.hidden = value === 'challenge';
    challengePanel.hidden = challengeNote.hidden = value !== 'challenge';
  };
  const mode = segmented('出題のしかた', PLAY_MODES, initial.mode === 'challenge' ? 'challenge' : 'count', (value) => showMode(value));
  mode.el.classList.add('setup-mode');
  showMode(mode.get());
  updateRecord();

  const start = button(
    'スタート',
    () => {
      if (mode.get() === 'challenge') {
        startChallenge({ category: category.id, difficulty: difficulty.get(), questionLimit: limit.get() });
        navigate('challenge-play');
        return;
      }
      startTraining({ category: category.id, difficulty: difficulty.get(), questionLimit: limit.get() });
      navigate('question');
    },
    'btn--primary btn--large',
  );

  container.append(
    h(
      'div',
      { class: 'page page--narrow' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('categories') }, '← カテゴリ'),
        h('h1', {}, category.name),
      ),
      notice ? h('p', { class: 'cert-notice', role: 'alert' }, notice) : null,
      h(
        'section',
        { class: 'setup-card' },
        h('p', { class: 'setup-card__desc' }, category.description),
        difficulty.el,
        h('ul', { class: 'setup-note' }, (category.levelNotes ?? []).map((note) => h('li', {}, note))),
        mode.el,
        countPanel,
        challengePanel,
        start,
        countNote,
        challengeNote,
      ),
    ),
  );
  return { unmount() {} };
}
