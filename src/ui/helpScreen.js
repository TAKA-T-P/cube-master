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
      h(
        'div',
        { class: 'help-actions' },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => navigate('preview') }, '3D立方体をためす'),
      ),
    ),
  );

  return { unmount() {} };
}
