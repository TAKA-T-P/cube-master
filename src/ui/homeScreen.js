/**
 * トップ画面
 *
 * メニューは MENU_ITEMS で定義する。後続 Phase では enabled を true にして route を設定するだけで有効化できる。
 */
import { h } from '../utils/dom.js';

export const MENU_ITEMS = [
  { id: 'preview', label: '3D立方体をためす', route: 'preview', enabled: true, primary: true },
  { id: 'training', label: 'トレーニング', route: 'categories', enabled: true },
  { id: 'certification', label: '段位認定', route: 'certification', enabled: false },
  { id: 'help', label: 'あそびかた', route: 'help', enabled: true },
];

export function mountHomeScreen(container, { navigate, version }) {
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
      h(
        'header',
        { class: 'home-hero' },
        h('img', { class: 'home-logo', src: `${import.meta.env.BASE_URL}favicon.svg`, alt: '', width: 88, height: 88 }),
        h('h1', { class: 'home-title' }, 'CUBE MASTER'),
        h('p', { class: 'home-subtitle' }, '立方体を極める！空間認識トレーニング'),
      ),
      menu,
      h('footer', { class: 'home-footer' }, `Ver.${version}`),
    ),
  );

  return { unmount() {} };
}
