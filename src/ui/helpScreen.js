/**
 * ヘルプ（あそびかた）画面
 *
 * 説明が多いので、7つのタブに分けて、短いまとまりで切りかえて読めるようにする。
 *   1. CUBE MASTERとは？ 2. トレーニング 3. 1分チャレンジ 4. 段位認定 5. 3Dの操作 6. ヒント・復習・学習記録 7. 記録と設定
 * 3Dの操作は、使っている端末に合った説明を先に表示する。
 */
import { h, isTouchPrimary, showToast } from '../utils/dom.js';
import { confirmDialog } from './components.js';
import { clearLearningData, isLearningStorageAvailable } from './learningStore.js';
import { soundSettingsPanel } from './soundControls.js';
import { CERTIFICATION_RULES } from '../core/certificationRules.js';
import { CHALLENGE_RULES } from '../core/timedChallengeSession.js';

const R = CERTIFICATION_RULES;

/** KEC数学科ラボ（ほかのアプリの入り口） */
export const MATH_LAB_URL = 'https://taka-t-p.github.io/math-app-portal/';
const sec = (ms) => ms / 1000;

const HOW_TO = {
  pc: {
    title: 'パソコン（マウス）',
    items: [
      ['回転', '立方体をドラッグすると、いろいろな向きから見られます。'],
      ['拡大・縮小', 'マウスホイールを回すと、大きく・小さくできます。'],
      ['えらぶ', '「頂点」「辺」「面」を切りかえて、クリックするとえらべます。もう一度クリックすると解除できます。'],
      ['視点リセット', '「視点リセット」ボタンで、はじめの向きにもどります。'],
    ],
  },
  touch: {
    title: 'スマホ・タブレット（タッチ）',
    items: [
      ['回転', '1本指でなぞると、いろいろな向きから見られます。'],
      ['拡大・縮小', '2本指でつまむように広げたり縮めたりします（ピンチ）。'],
      ['えらぶ', '「頂点」「辺」「面」を切りかえて、タップするとえらべます。もう一度タップすると解除できます。'],
      ['視点リセット', '「視点リセット」ボタンで、はじめの向きにもどります。'],
    ],
  },
};

const list = (items) => h('dl', { class: 'help-list' }, items.map(([term, desc]) => [h('dt', {}, term), h('dd', {}, desc)]));

const ABOUT = [
  ['CUBE MASTER', '立方体の「頂点」「辺」「面」や、展開図・サイコロ・積み木など、立方体のいろいろな問題に挑戦するアプリです。3Dの立方体を動かして、答えを目で確かめられます。'],
  ['3つの遊び方', '「トレーニング」はじっくり練習、「1分チャレンジ」は1つのカテゴリで60秒の挑戦、「段位認定」は全部のカテゴリから出る100秒の挑戦です。'],
  ['はじめての人は', 'まずトレーニングの「基本」から始めよう。慣れてきたら1分チャレンジや段位認定に挑戦！'],
];

const TRAINING = [
  ['はじめ方', 'トップの「トレーニング」→ カテゴリを選んで「次へ」→ 難易度と「問題数を選ぶ」を決めて「スタート」。'],
  ['答え方', '問題文を読んで、選択肢を選び「回答する」。「1つ選ぼう」は1つだけ、「当てはまるものをすべて選ぼう」は当てはまるものを全部選びます。'],
  ['答え合わせ', '「○」（正解）・「△」（おしい）・「×」（不正解）が出たあと、解説が表示されます。正解は緑、まちがえたところは赤で光ります。立方体の下の「もう一度見る」で何度でも見直せます。'],
  ['ヒント', '回答する前に「ヒントを見る」を押すと、考え方の手がかりが出ます（答えは出ません）。'],
  ['3Dで確かめる', '回答すると、サイコロが実際に回ったり、展開図が折りたたまれたり、積み木が段ごとに分かれたりして、答えを確かめられます。'],
  ['結果', '決めた問題数（1〜20問）を解くと結果が出ます。「第◯問」を押すと、その問題をもう一度解けます。'],
];

const CHALLENGE = [
  ['ルール', `${sec(CHALLENGE_RULES.durationMs)}秒で、選んだカテゴリ・難易度の問題に何問正解できるかに挑戦します。`],
  ['はじめ方', '難易度・問題数の画面で「1分チャレンジ」を選んで「スタート」。3・2・1 のあとに始まります。'],
  ['ペナルティ', `まちがえる（おしいもふくむ）と、残り時間が${sec(CHALLENGE_RULES.mistakePenaltyMs)}秒へります。`],
  ['時間が止まるとき', '答え合わせや3Dの演出のあいだは、時間は減りません。'],
  ['できないこと', 'ヒントとパスは使えません。'],
  ['記録', 'カテゴリごとに、「基本」「標準」「応用」「すべて」それぞれの最高記録（正解数）が残ります。'],
];

const CERTIFICATION = [
  ['ルール', `${sec(R.durationMs)}秒で、6つのカテゴリから出る問題に挑戦し、得点で段位が決まります。`],
  ['レベル', 'ベーシック（★1の問題）・スタンダード（★1と★2）・エキスパート（★2と★3）の3つから選びます。'],
  ['得点', `正解すると ★1 ${R.points[1]}点・★2 ${R.points[2]}点・★3 ${R.points[3]}点。3問以上続けて正解すると、ボーナスが加わります。`],
  ['時間ボーナス', `答えが複数ある問題に一発で正解すると、残り時間が${sec(R.multipleAnswerTimeBonusMs)}秒ふえます。`],
  ['減点', `まちがえると減点です。1回目${R.mistakePenalty.perMistake}点、2回目${R.mistakePenalty.perMistake * 2}点…と、まちがえるほど重くなります（${R.mistakePenalty.perMistake * R.mistakePenalty.maxMultiplier}点まで）。得点は0点より下がりません。`],
  ['パス', `「回答する」の左の「パス」で問題を入れかえられます。1回目は残り時間が${sec(R.passPenalty.perPassMs)}秒、2回目は${sec(R.passPenalty.perPassMs * 2)}秒…とへります。減点はありませんが、連続正解は0に戻ります。`],
  ['段位', `10級から1級、初段から十段、そして最高の「皆伝」まで21段階。必要な得点は3つのレベルで同じで、${R.levels.basic.thresholds.at(-1)}点で皆伝です。ベーシックは「五段」、スタンダードは「五段＋」、エキスパートは「五段★」のように記録されます。`],
  ['中断', 'とちゅうでやめたり、ほかのタブに切りかえたりすると中断になり、記録に残りません。'],
];

const SUPPORT = [
  ['ヒント', 'トレーニングでは、回答する前に「ヒントを見る」で考え方の手がかりが見られます。ヒントを見ても正解・不正解は変わりません。'],
  ['復習', '結果画面の「間違えた問題を復習」で、まちがえた問題を同じ問題のまま解き直せます。もとの結果は変わりません。'],
  ['学習記録', 'カテゴリ選択の右上の「学習記録」で、カテゴリごとの正答率や、あとで復習できる問題が見られます。'],
];

function recordSection() {
  async function confirmClear() {
    const dialog = confirmDialog({
      title: '学習記録を消去しますか？',
      message: 'この端末に保存した CUBE MASTER の学習記録・復習待ちの問題・1分チャレンジと段位認定の記録・設定を、すべて消します。もとに戻せません。',
      okLabel: '消去する',
      cancelLabel: 'やめる',
    });
    if (!(await dialog.result)) return;
    clearLearningData();
    showToast('学習記録を消去しました。');
  }
  return [
    h('h3', {}, '効果音'),
    soundSettingsPanel(),
    h('p', { class: 'setup-note' }, '効果音をオフにしても、○△×や色で正解・不正解がわかります。設定はこの端末に保存されます。'),
    h('h3', {}, '記録の保存'),
    h(
      'p',
      {},
      isLearningStorageAvailable()
        ? '記録は、この端末のブラウザの中だけに保存されます（名前などの個人情報は保存しません）。ブラウザのデータを消すと、記録も消えます。'
        : 'この端末では記録を保存できません（練習はできます）。',
    ),
    h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: () => confirmClear() }, '学習記録を消去'),
  ];
}

/** 「KEC数学科ラボへ」：確かめてから移動する */
async function goToMathLab() {
  const dialog = confirmDialog({ title: 'KEC数学科ラボへ移動しますか？', okLabel: 'はい', cancelLabel: 'いいえ' });
  if (await dialog.result) window.location.assign(MATH_LAB_URL);
}

export function mountHelpScreen(container, { navigate }) {
  const touch = isTouchPrimary();
  const order = touch ? ['touch', 'pc'] : ['pc', 'touch'];
  const control = (key, current) =>
    h('section', { class: `help-section ${current ? 'help-section--current' : ''}` }, h('h3', {}, HOW_TO[key].title, current ? h('span', { class: 'badge badge--info' }, 'お使いの端末') : null), list(HOW_TO[key].items));

  const TABS = [
    { id: 'about', label: 'CUBE MASTERとは？', body: () => [list(ABOUT)] },
    { id: 'training', label: 'トレーニング', body: () => [list(TRAINING)] },
    { id: 'challenge', label: '1分チャレンジ', body: () => [list(CHALLENGE)] },
    { id: 'certification', label: '段位認定', body: () => [list(CERTIFICATION)] },
    { id: 'controls', label: '3Dの操作', body: () => order.map((key, i) => control(key, i === 0)) },
    { id: 'support', label: 'ヒント・復習・学習記録', body: () => [list(SUPPORT)] },
    { id: 'records', label: '記録と設定', body: () => recordSection() },
  ];

  const tabButtons = [];
  const panels = TABS.map((tab, i) =>
    h('section', { class: 'help-panel', role: 'tabpanel', id: `help-${tab.id}`, 'aria-labelledby': `help-tab-${tab.id}`, hidden: i !== 0, dataset: { tab: tab.id } }, h('h2', {}, tab.label), ...tab.body()),
  );
  function select(index) {
    tabButtons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    panels.forEach((p, i) => (p.hidden = i !== index));
  }
  TABS.forEach((tab, i) => {
    const b = h('button', { class: 'help-tab', type: 'button', role: 'tab', id: `help-tab-${tab.id}`, 'aria-controls': `help-${tab.id}`, 'aria-selected': String(i === 0), dataset: { tab: tab.id } }, tab.label);
    b.addEventListener('click', () => select(i));
    // 左右の矢印キーでタブを移る
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      select(next);
      tabButtons[next].focus();
    });
    tabButtons.push(b);
  });
  select(0);

  container.append(
    h(
      'div',
      { class: 'help' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, 'あそびかた'),
      ),
      h('div', { class: 'help-tabs', role: 'tablist', 'aria-label': 'あそびかたの項目' }, tabButtons),
      panels,
      h(
        'div',
        { class: 'help-actions' },
        h('button', { class: 'btn', type: 'button', onClick: () => navigate('home') }, 'タイトルに戻る'),
        h('button', { class: 'btn btn--primary', type: 'button', 'data-testid': 'math-lab', onClick: () => goToMathLab() }, 'KEC数学科ラボへ'),
      ),
    ),
  );

  return { unmount() {} };
}
