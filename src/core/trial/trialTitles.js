/**
 * トライアルの称号（Three.js・DOM 非依存）
 *
 * 到達した LEVEL に応じて、種類ごとに10段階の称号がつく（LEVEL 2・4・6…18・20以上）。LEVEL 1 は称号なし。
 * 結果画面（その回の最高到達 LEVEL）と選択画面（自己ベスト）で表示する。段階ごとの絵文字は結果画面の演出で使う。
 */

/** 称号がつく LEVEL（段階 1〜10 の下限） */
export const TRIAL_TITLE_LEVELS = Object.freeze([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);

/** 段階ごとの絵文字（見習い → 神） */
export const TRIAL_TITLE_EMOJI = Object.freeze(['🔰', '⭐', '🌟', '🥉', '🥈', '🥇', '🏅', '🎖️', '🏆', '👑']);

export const TRIAL_TITLES = Object.freeze({
  blockCount: Object.freeze(['かぞえる見習い', '積み木たんけん隊', '積み木カウンター', 'かぞえの名人', '積み木職人', '積み木鑑定士', '積み木博士', '千里眼のカウンター', '積み木の神眼', '万物を数える者']),
  projectionDraw: Object.freeze(['観察見習い', '形の発見者', 'シルエットハンター', '形の見きわめ名人', '空間ウォッチャー', '透視の達人', '空間解析士', '空間の支配者', '三方向の覇者', '空間を見通す神眼']),
  diceRoll: Object.freeze(['サイコロ見習い', 'コロコロ探検家', 'サイコロ使い', '回転マスター', 'ダイスマスター', 'ダイスコントローラー', '回転の達人', 'ダイスウィザード', 'ダイスエンペラー', '運命を操るダイス神']),
  netPartition: Object.freeze(['展開図見習い', '色分けチャレンジャー', '展開図パズラー', '展開図職人', '展開図マスター', 'キューブクラフター', '展開図博士', 'キューブクリエイター', '展開図の覇者', 'キューブ創造神']),
  // ⑤ は仮の称号（文言が決まったら差しかえる）
  netArrow: Object.freeze(['矢印見習い', '向きのたんけん隊', '矢印ナビゲーター', '向きの名人', 'アローマスター', '展開図の案内人', '向きの達人', '空間アローマイスター', '矢印の覇者', '向きを司る神']),
});

const titleAt = (mode, index) => ({ rank: index + 1, level: TRIAL_TITLE_LEVELS[index], name: TRIAL_TITLES[mode][index], emoji: TRIAL_TITLE_EMOJI[index] });

/**
 * その LEVEL の称号
 * @returns {{ rank: number, level: number, name: string, emoji: string }|null} 称号がない（LEVEL 1・不明な種類）なら null
 */
export function trialTitleFor(mode, level) {
  if (!TRIAL_TITLES[mode]) return null;
  let index = -1;
  for (let i = 0; i < TRIAL_TITLE_LEVELS.length; i++) if (level >= TRIAL_TITLE_LEVELS[i]) index = i;
  return index < 0 ? null : titleAt(mode, index);
}

/** 次の称号（もう最高の称号なら null） */
export function nextTrialTitle(mode, level) {
  if (!TRIAL_TITLES[mode]) return null;
  const index = TRIAL_TITLE_LEVELS.findIndex((l) => level < l);
  return index < 0 ? null : titleAt(mode, index);
}
