/**
 * トレーニング設定画面（難易度・問題数／1分チャレンジ）
 *
 * 「問題数を選ぶ」：問題数のスライダー（1〜20問）。タイマーなしで、じっくり解く
 * 「1分チャレンジ」：1分間で何問正解できるか（不正解は残り時間 −10 秒）。スライダーの代わりに、選んだ難易度の最高記録を出す
 */
import { h } from '../utils/dom.js';
import { segmented, slider, button, infoDialog, helpButton } from './components.js';
import { getCategory, DIFFICULTIES, QUESTION_LIMIT_RANGE, DEFAULT_SETTINGS } from '../questions/questionRegistry.js';
import { CHALLENGE_RULES } from '../core/timedChallengeSession.js';
import { startTraining, startChallenge, getSettings, takeChallengeNotice } from './trainingStore.js';
import { NoEligibleQuestionError } from '../core/questionEligibility.js';
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
  // 難易度ごとの問題の種類は、「難易度」の右の「？」で見る
  if (category.levelNotes?.length) {
    difficulty.el
      .querySelector('.field__label')
      .append(helpButton('難易度ごとの問題の種類', () => infoDialog({ title: `${category.name}：難易度ごとの問題`, items: category.levelNotes })));
  }
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

  // この難易度・設定で出題できる問題がないときの案内（難易度や設定を勝手に変えない）
  const unavailable = h(
    'div',
    { class: 'setup-unavailable', role: 'alert', hidden: true },
    h('p', {}, ''),
    button('タイトルで出題設定を変える', () => navigate('home'), 'btn--small'),
  );
  const showUnavailable = (challenge) => {
    unavailable.firstChild.textContent = challenge
      ? 'この難易度の1分チャレンジで出題できる問題がありません（1分チャレンジでは、三平方の定理・√を使う問題は出題しません）。難易度を変えてください。'
      : 'この難易度で出題できる問題がありません。難易度を変えるか、タイトル画面の「三平方の定理・√を使う問題」を「出題する」にしてください。';
    unavailable.hidden = false;
  };
  const start = button(
    'スタート',
    () => {
      unavailable.hidden = true;
      try {
        if (mode.get() === 'challenge') {
          startChallenge({ category: category.id, difficulty: difficulty.get(), questionLimit: limit.get() });
          navigate('challenge-play');
          return;
        }
        startTraining({ category: category.id, difficulty: difficulty.get(), questionLimit: limit.get() });
        navigate('question');
      } catch (err) {
        if (!(err instanceof NoEligibleQuestionError)) throw err;
        showUnavailable(mode.get() === 'challenge');
      }
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
        mode.el,
        countPanel,
        challengePanel,
        start,
        countNote,
        challengeNote,
        unavailable,
      ),
    ),
  );
  return { unmount() {} };
}
