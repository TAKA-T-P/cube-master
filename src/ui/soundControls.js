/**
 * 効果音の設定の部品（トップ画面のオン／オフのボタン・あそびかたの設定）
 */
import { h } from '../utils/dom.js';
import { slider } from './components.js';
import { isSoundEnabled, setSoundEnabled, getSoundVolume, setSoundVolume, onSoundSettingsChange } from './soundSettings.js';
import { playAnswerSound } from './answerSound.js';

const toggleLabel = () => (isSoundEnabled() ? '効果音：オン' : '効果音：オフ');

/** 効果音のオン／オフを切りかえるボタン（押すたびに切りかわる） */
export function soundToggleButton() {
  const btn = h('button', { class: 'btn btn--small btn--sound', type: 'button', 'aria-pressed': String(isSoundEnabled()), 'data-testid': 'sound-toggle' }, toggleLabel());
  btn.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    if (isSoundEnabled()) playAnswerSound('correct'); // オンにしたら確かめの音
  });
  const off = onSoundSettingsChange(() => {
    if (!btn.isConnected && off) return off();
    btn.textContent = toggleLabel();
    btn.setAttribute('aria-pressed', String(isSoundEnabled()));
  });
  return btn;
}

/** 効果音の設定（オン／オフ・音量） */
export function soundSettingsPanel() {
  const volume = slider('効果音の音量', { min: 0, max: 10, unit: '' }, Math.round(getSoundVolume() * 10), (v) => setSoundVolume(v / 10));
  volume.el.addEventListener('change', () => playAnswerSound('correct'));
  return h('div', { class: 'sound-settings' }, soundToggleButton(), volume.el);
}
