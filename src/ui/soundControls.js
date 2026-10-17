/**
 * 効果音の設定の部品（トップ画面のオン／オフのボタン・あそびかたの設定）
 *
 * トップ画面では、右上の小さなスピーカーのアイコン（icon: true）。名前は aria-label と title で伝える。
 */
import { h } from '../utils/dom.js';
import { slider } from './components.js';
import { isSoundEnabled, setSoundEnabled, getSoundVolume, setSoundVolume, onSoundSettingsChange } from './soundSettings.js';
import { playAnswerSound } from './answerSound.js';

const toggleLabel = () => (isSoundEnabled() ? '効果音：オン' : '効果音：オフ');

// スピーカー（オンは音の波、オフは ×）
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/>';
const ICONS = {
  on: `${SPEAKER}<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>`,
  off: `${SPEAKER}<path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>`,
};
const iconSvg = () =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[isSoundEnabled() ? 'on' : 'off']}</svg>`;

/**
 * 効果音のオン／オフを切りかえるボタン（押すたびに切りかわる）
 * @param {{ icon?: boolean }} [options] icon: true でスピーカーのアイコンだけのボタン
 */
export function soundToggleButton({ icon = false } = {}) {
  const btn = h('button', { class: icon ? 'sound-icon-btn' : 'btn btn--small btn--sound', type: 'button', 'data-testid': 'sound-toggle' });
  const update = () => {
    btn.setAttribute('aria-pressed', String(isSoundEnabled()));
    if (icon) {
      btn.innerHTML = iconSvg();
      btn.setAttribute('aria-label', toggleLabel());
      btn.title = toggleLabel();
    } else btn.textContent = toggleLabel();
  };
  update();
  btn.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    if (isSoundEnabled()) playAnswerSound('correct'); // オンにしたら確かめの音
  });
  const off = onSoundSettingsChange(() => {
    if (!btn.isConnected && off) return off();
    update();
  });
  return btn;
}

/** 効果音の設定（オン／オフ・音量） */
export function soundSettingsPanel() {
  const volume = slider('効果音の音量', { min: 0, max: 10, unit: '' }, Math.round(getSoundVolume() * 10), (v) => setSoundVolume(v / 10));
  volume.el.addEventListener('change', () => playAnswerSound('correct'));
  return h('div', { class: 'sound-settings' }, soundToggleButton(), volume.el);
}
