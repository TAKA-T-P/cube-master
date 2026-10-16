/**
 * ヘルプ（あそびかた）画面
 * 使っている端末に合った操作説明を先に表示する。
 */
import { h, isTouchPrimary } from '../utils/dom.js';

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

const TRAINING_STEPS = [
  ['はじめ方', 'トップの「トレーニング」→ カテゴリ（展開図と頂点・辺／位置関係／展開図パズル／サイコロ・回転／積み木の見え方・投影図）→ 難易度と問題数を選んで「スタート」。'],
  ['答え方', '問題文を読んで、下の選択肢から答えを選び「回答する」。「すべて選ぼう」の問題は、あてはまるものを全部選びます。回答すると、同じボタンが「次の問題へ」に変わります。'],
  ['3Dのヒント', '位置関係では、オレンジ色の辺・面が問題の基準です。立方体を回して、いろいろな向きから確かめよう。'],
  ['サイコロ・回転', '1個のサイコロを頭の中で回します。答えが見えてしまわないように、回答するまで3Dのサイコロは表示されません。図と回転の手順をよく見て考えよう。回答するとサイコロが現れ、実際に回って答えを確かめられます。'],
  ['積み木の見え方', '積み木を、赤い矢印の方向から見た形を考えます（矢印の根元が見る人の場所です）。回答すると3Dの積み木に切りかわり、その方向から見た様子を確かめられます。'],
  ['展開図', '展開図を頭の中で折りたたみます。回答すると3Dの展開図が実際に折れて立方体になり、重なる点や辺、向かい合う面を確かめられます。「展開図に戻す」で何度でも広げたり組み立てたりできます。'],
  ['答え合わせ', '正解は緑、まちがえたところは赤で光ります。「もう一度見る」で何度でも見直せます。'],
  ['結果', '決めた問題数を解くと結果が出ます。エンドレスは「終了する」で結果を見られます。'],
];

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
