/**
 * エントリーポイント：画面の切り替え（ハッシュルーティング）とグローバルなエラー処理
 *
 * GitHub Pages ではサーバー側のルーティングが使えないため、#/preview のようなハッシュで画面を切り替える。
 * 各画面モジュールは mount(container, ctx) で画面を作り、{ unmount() } を返す。
 */
import './styles/base.css';
import './styles/layout.css';
import { mountHomeScreen } from './ui/homeScreen.js';
import { mountPreviewScreen } from './ui/previewScreen.js';
import { mountHelpScreen } from './ui/helpScreen.js';
import { h, showToast } from './utils/dom.js';

const ROUTES = {
  home: mountHomeScreen,
  preview: mountPreviewScreen,
  help: mountHelpScreen,
};

const app = document.getElementById('app');
let current = null;

/** 画面を移動する */
export function navigate(route) {
  const hash = route === 'home' ? '#/' : `#/${route}`;
  if (location.hash !== hash) location.hash = hash;
  else render();
}

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return name in ROUTES ? name : 'home';
}

function render() {
  try {
    current?.unmount();
  } catch (err) {
    console.error('[router] 画面の終了処理でエラー', err);
  }
  current = null;
  app.replaceChildren();

  const route = currentRoute();
  const container = h('main', { class: `screen screen--${route}` });
  app.append(container);
  try {
    current = ROUTES[route](container, { navigate, version: __APP_VERSION__ });
  } catch (err) {
    console.error('[router] 画面の表示でエラー', err);
    container.replaceChildren(
      h(
        'div',
        { class: 'error-panel' },
        h('h2', {}, '画面を表示できませんでした'),
        h('p', {}, 'ページを再読み込みしてください。'),
        h('button', { class: 'btn btn--primary', onClick: () => navigate('home') }, 'ホームに戻る'),
      ),
    );
  }
  window.scrollTo(0, 0);
}

// 予期しないエラーで画面が真っ白にならないよう、通知だけして処理を続ける
window.addEventListener('error', (event) => {
  console.error(event.error ?? event.message);
  showToast('エラーが発生しました。うまく動かない場合は再読み込みしてください。', { type: 'error' });
});
window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  showToast('エラーが発生しました。うまく動かない場合は再読み込みしてください。', { type: 'error' });
});

window.addEventListener('hashchange', render);
render();
