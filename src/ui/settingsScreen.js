/**
 * 設定画面（#/settings。タイトル画面の右上の歯車のアイコンから開く）
 *
 * - 効果音：オン／オフと音量（0〜10）
 * - 記録の保存：保存のしかたの説明と「学習記録を消去」（確かめてから消す）
 */
import { h, showToast } from '../utils/dom.js';
import { confirmDialog } from './components.js';
import { clearLearningData, isLearningStorageAvailable } from './learningStore.js';
import { soundSettingsPanel } from './soundControls.js';

/** 「学習記録を消去」：確かめてから、CUBE MASTER のデータだけを消す */
async function confirmClear() {
  const dialog = confirmDialog({
    title: '学習記録を消去しますか？',
    message: 'この端末に保存した CUBE MASTER の学習記録・復習待ちの問題・1分チャレンジと段位認定とトライアルの記録・設定を、すべて消します。もとに戻せません。',
    okLabel: '消去する',
    cancelLabel: 'やめる',
  });
  if (!(await dialog.result)) return;
  clearLearningData();
  showToast('学習記録を消去しました。');
}

export function mountSettingsScreen(container, { navigate }) {
  container.append(
    h(
      'div',
      { class: 'page page--narrow settings' },
      h('header', { class: 'page-header' }, h('button', { class: 'btn btn--back', type: 'button', onClick: () => navigate('home') }, '← タイトル'), h('h1', {}, '設定')),
      h(
        'section',
        { class: 'settings-section', 'data-section': 'sound' },
        h('h2', {}, '効果音'),
        soundSettingsPanel(),
        h('p', { class: 'setup-note' }, '効果音をオフにしても、○△×や色で正解・不正解がわかります。設定はこの端末に保存されます。'),
      ),
      h(
        'section',
        { class: 'settings-section', 'data-section': 'records' },
        h('h2', {}, '記録の保存'),
        h(
          'p',
          {},
          isLearningStorageAvailable()
            ? '記録は、この端末のブラウザの中だけに保存されます（名前などの個人情報は保存しません）。ブラウザのデータを消すと、記録も消えます。'
            : 'この端末では記録を保存できません（練習はできます）。',
        ),
        h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: () => confirmClear() }, '学習記録を消去'),
      ),
    ),
  );
  return { unmount() {} };
}
