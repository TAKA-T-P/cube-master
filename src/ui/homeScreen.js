/**
 * トップ画面
 *
 * メニューは MENU_ITEMS で定義する。後続 Phase では enabled を true にして route を設定するだけで有効化できる。
 */
import { h } from '../utils/dom.js';
import { soundToggleButton } from './soundControls.js';
import { createHomeCube } from './homeCube.js';
import { isPythagoreanAllowed, setPythagoreanAllowed } from './soundSettings.js';
import { infoDialog, helpButton } from './components.js';

export const SETTING_NOTE = '※この設定は通常トレーニングにのみ反映されます。1分チャレンジ・段位認定では、どちらの設定でも出題されません。';

/** 「三平方の定理・√を使う問題」の設定（出題しない＝初期値・おすすめ／出題する）。タイトル画面で変え、次に始めるトレーニングから使う */
function questionSetting() {
  const options = [
    { value: false, label: '出題しない（おすすめ）' },
    { value: true, label: '出題する' },
  ];
  const buttons = options.map((o) =>
    h('button', { class: 'home-setting__option', type: 'button', role: 'radio', dataset: { value: String(o.value) }, onClick: () => select(o.value) }, o.label),
  );
  function render() {
    const v = isPythagoreanAllowed();
    buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === v)));
  }
  function select(v) {
    setPythagoreanAllowed(v);
    render();
  }
  render();
  return h(
    'section',
    { class: 'home-setting', 'aria-label': '三平方の定理・√を使う問題', 'data-testid': 'pythagorean-setting' },
    h(
      'div',
      { class: 'home-setting__head' },
      h('span', { class: 'home-setting__title' }, '三平方の定理・√を使う問題'),
      helpButton('この設定について', () =>
        infoDialog({
          title: '三平方の定理・√を使う問題',
          items: [
            '「出題しない」（はじめの設定）にすると、三平方の定理や√を知らなくても解ける問題だけを出題します。',
            '「出題する」にすると、三平方の定理や√を使う問題も出題します。',
            '「出題しない」にしても、小学校で習う内容だけになるわけではありません。立体の名前・角柱や角すいの体積・ねじれの位置などは出題します。わからないときは、問題画面の「？」やあそびかたの「学習ヘルプ」で確かめられます。',
            '設定は、次に始める通常トレーニングから使われます。',
            SETTING_NOTE,
          ],
        }),
      ),
    ),
    h('div', { class: 'home-setting__options', role: 'radiogroup', 'aria-label': '三平方の定理・√を使う問題' }, buttons),
  );
}

export const MENU_ITEMS = [
  { id: 'training', label: 'トレーニング', route: 'categories', enabled: true, primary: true },
  { id: 'certification', label: '段位認定', route: 'certification', enabled: true, primary: true },
  { id: 'preview', label: '3D立方体をためす', route: 'preview', enabled: true },
  { id: 'help', label: 'あそびかた', route: 'help', enabled: true },
];

/** 隠し操作：バージョン表示を続けて押す回数（問題テンプレート図鑑を開く。開発者の確認用） */
export const CATALOG_TAPS = 5;
const CATALOG_TAP_WINDOW_MS = 3000;

export function mountHomeScreen(container, { navigate, version }) {
  const cube = createHomeCube();
  let taps = [];
  const tapVersion = () => {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < CATALOG_TAP_WINDOW_MS), now];
    if (taps.length >= CATALOG_TAPS) {
      taps = [];
      navigate('catalog');
    }
  };
  const menu = h(
    'nav',
    { class: 'home-menu', 'aria-label': 'メニュー' },
    MENU_ITEMS.map((item) =>
      h(
        'button',
        {
          class: `btn btn--menu ${item.primary ? 'btn--primary' : ''}`,
          type: 'button',
          disabled: !item.enabled,
          'aria-disabled': item.enabled ? undefined : 'true',
          dataset: { menu: item.id },
          onClick: () => item.enabled && navigate(item.route),
        },
        item.label,
        item.enabled ? null : h('span', { class: 'badge' }, '準備中'),
      ),
    ),
  );

  container.append(
    h(
      'div',
      { class: 'home' },
      h('div', { class: 'home-corner' }, soundToggleButton({ icon: true })),
      h(
        'header',
        { class: 'home-hero' },
        cube.el,
        h('h1', { class: 'home-title' }, 'CUBE MASTER'),
        h('p', { class: 'home-subtitle' }, '立方体を極める！空間認識トレーニング'),
      ),
      menu,
      questionSetting(),
      h('footer', { class: 'home-footer' }, h('span', { 'data-testid': 'version', onClick: tapVersion }, `Ver.${version}`)),
      h('p', { class: 'home-copyright', 'data-testid': 'copyright' }, '©2026 T.TAKEMOTO / KEC Glows'),
    ),
  );

  return {
    unmount() {
      cube.destroy();
    },
  };
}
