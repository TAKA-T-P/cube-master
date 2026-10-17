/**
 * ヘルプ（あそびかた）画面
 * 使っている端末に合った操作説明を先に表示する。
 */
import { h, isTouchPrimary, showToast } from '../utils/dom.js';
import { confirmDialog } from './components.js';
import { clearLearningData, isLearningStorageAvailable } from './learningStore.js';

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

function section(key, current) {
  const { title, items } = HOW_TO[key];
  return h(
    'section',
    { class: `help-section ${current ? 'help-section--current' : ''}` },
    h('h2', {}, title, current ? h('span', { class: 'badge badge--info' }, 'お使いの端末') : null),
    h(
      'dl',
      { class: 'help-list' },
      items.map(([term, desc]) => [h('dt', {}, term), h('dd', {}, desc)]),
    ),
  );
}

const CERTIFICATION_STEPS = [
  ['段位認定', 'トップの「段位認定」→ レベル（ベーシック・スタンダード・エキスパート）を選んで「スタート」。3・2・1 のあと、100秒でいろいろなカテゴリの問題に挑戦します。'],
  ['得点', '正解すると ★1 100点・★2 160点・★3 220点。3問以上の連続正解でボーナスが加わり、答えが複数ある問題に一発で正解すると残り時間が3秒ふえます。まちがえると減点で、1回目50点・2回目100点…と重くなります（300点まで。得点は0点より下がりません）。'],
  ['パス', '「回答する」の左の「パス」で問題を入れかえられます。n回目のパスで残り時間が2×n秒へります（1回目2秒、2回目4秒…）。確認のメッセージが出ている間も時間は減ります。パスは回答の数・正答率には入らず、減点もしませんが、連続正解ボーナスは0に戻ります。'],
  ['時間', '答え合わせや3Dの演出のあいだは、時間は止まります。ヒントは使えません。ほかのタブに切りかえたり、とちゅうでやめたりすると中断になり、記録に残りません。'],
  ['段位', '10級から1級、初段から十段、そして最高の「皆伝」まで21段階。ベーシックは「五段」、スタンダードは「五段＋」、エキスパートは「五段★」のように、レベルごとに別々に記録されます。'],
];

const TRAINING_STEPS = [
  ['はじめ方', 'トップの「トレーニング」→ カテゴリ（展開図と頂点・辺／位置関係／展開図パズル／サイコロ・回転／立方体の個数・着色／積み木の見え方・投影図）→ 難易度と問題数を選んで「スタート」。'],
  ['答え方', '問題文を読んで、下の選択肢から答えを選び「回答する」。「すべて選ぼう」の問題は、あてはまるものを全部選びます。回答すると「○」（正解）・「△」（おしい）・「×」（不正解）が効果音とともに大きく出て、そのあと解説が表示されます（タップするとすぐ閉じます）。同じボタンは「次の問題へ」に変わります。'],
  ['ヒント', '回答する前に「ヒントを見る」を押すと、考え方の手がかりが出ます（答えは出ません）。ヒントを見ても正解・不正解は変わりません。'],
  ['3Dのヒント', '位置関係では、オレンジ色の辺・面が問題の基準です。立方体を回して、いろいろな向きから確かめよう。'],
  ['サイコロ・回転', '1個のサイコロを頭の中で回します。答えが見えてしまわないように、回答するまで3Dのサイコロは表示されません。図と回転の手順をよく見て考えよう。回答するとサイコロが現れ、実際に回って答えを確かめられます。'],
  ['積み木の見え方', '積み木を、赤い矢印の方向から見た形を考えます（矢印の根元が見る人の場所です）。回答すると3Dの積み木に切りかわり、その方向から見た様子を確かめられます。'],
  ['展開図', '展開図を頭の中で折りたたみます。回答すると3Dの展開図が実際に折れて立方体になり、重なる点や辺、向かい合う面を確かめられます。「展開図に戻す」で何度でも広げたり組み立てたりできます。'],
  ['積み木の個数', '積み木が全部で何個あるか、見えない積み木もふくめて数えます。積み木は床から隙間なく積んであり、上に積み木がある場所には下にも必ず積み木があります。回答すると3Dの積み木が段ごとに分かれ、各段の個数と合計が表示されます。'],
  ['小立方体', '大きな立方体を小さく切り分けたときの、色のついた面の数や小立方体の数を考えます。色を塗ったのは切る前の外側の面だけで、切り口には色がつきません。回答すると3Dの立方体が分かれて少しはなれ、条件に合う小立方体が緑で光ります。「元に戻す」「分離して見る」で切りかえられます。'],
  ['答え合わせ', '正解は緑、まちがえたところは赤で光ります。立方体の下の「もう一度見る」で何度でも見直せます。'],
  ['結果', '決めた問題数（1〜20問）を解くと結果が出ます。結果画面の「第◯問」を押すと、その問題をもう一度解けます。「間違えた問題を復習」で、不正解・おしいだった問題をまとめて解き直せます（もとの結果は変わりません）。間違えた問題はこの端末に保存され、カテゴリ選択の「学習記録」からあとで復習できます。'],
];

function certificationSection() {
  return h(
    'section',
    { class: 'help-section' },
    h('h2', {}, '段位認定のあそびかた'),
    h(
      'dl',
      { class: 'help-list' },
      CERTIFICATION_STEPS.map(([term, desc]) => [h('dt', {}, term), h('dd', {}, desc)]),
    ),
  );
}

function trainingSection() {
  return h(
    'section',
    { class: 'help-section' },
    h('h2', {}, 'トレーニングのあそびかた'),
    h(
      'dl',
      { class: 'help-list' },
      TRAINING_STEPS.map(([term, desc]) => [h('dt', {}, term), h('dd', {}, desc)]),
    ),
  );
}

/** 学習記録（ブラウザに保存した記録）の説明と消去 */
function recordSection() {
  async function confirmClear() {
    const dialog = confirmDialog({
      title: '学習記録を消去しますか？',
      message: 'この端末に保存した CUBE MASTER の学習記録・復習待ちの問題・段位認定の記録を、すべて消します。もとに戻せません。',
      okLabel: '消去する',
      cancelLabel: 'やめる',
    });
    if (!(await dialog.result)) return;
    clearLearningData();
    showToast('学習記録を消去しました。');
  }
  return h(
    'section',
    { class: 'help-section' },
    h('h2', {}, '学習記録'),
    h(
      'p',
      {},
      isLearningStorageAvailable()
        ? 'トレーニングの結果と間違えた問題は、この端末のブラウザの中だけに保存されます（名前などの個人情報は保存しません）。カテゴリ選択の「学習記録」で確認できます。'
        : 'この端末では学習記録を保存できません（練習はできます）。',
    ),
    h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: () => confirmClear() }, '学習記録を消去'),
  );
}

export function mountHelpScreen(container, { navigate }) {
  const touch = isTouchPrimary();
  const order = touch ? ['touch', 'pc'] : ['pc', 'touch'];

  container.append(
    h(
      'div',
      { class: 'help' },
      h(
        'header',
        { class: 'page-header' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => navigate('home') }, '← ホーム'),
        h('h1', {}, 'あそびかた'),
      ),
      h(
        'p',
        { class: 'help-lead' },
        '立方体の「頂点」「辺」「面」を自由に動かして観察しよう。',
      ),
      order.map((key, i) => section(key, i === 0)),
      trainingSection(),
      certificationSection(),
      recordSection(),
      h(
        'div',
        { class: 'help-actions' },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('categories') }, 'トレーニングをはじめる'),
        h('button', { class: 'btn', type: 'button', onClick: () => navigate('preview') }, '3D立方体をためす'),
      ),
    ),
  );

  return { unmount() {} };
}
