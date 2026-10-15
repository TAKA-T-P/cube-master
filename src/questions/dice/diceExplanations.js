/**
 * サイコロ・回転の解説文
 * 面の動きを「どの方向の面が、どこへ動くか」で具体的に説明する。
 */
import { ROTATION_MOVES, DIRECTION_LABELS, DIRECTIONS, moveDirection, getOppositeDirection } from '../../core/cubeRotations.js';

const D = (d) => DIRECTION_LABELS[d];

/** 回転の言い方（「右へ90°転がす」など） */
export function movePhrase(moveId) {
  const m = ROTATION_MOVES[moveId];
  return m.kind === 'roll' ? `${m.short}90°転がす` : `${m.short}90°回す`;
}

/** 回転の手順の言い方 */
export function movesPhrase(moveIds) {
  if (moveIds.length === 1) return movePhrase(moveIds[0]);
  return `「${moveIds.map((m) => ROTATION_MOVES[m].short).join(' → ')}」の順に90°ずつ動かす`;
}

/** 1回の回転で面がどう動くか（「左の面が上に、上の面が右に…」） */
export function moveEffect(moveId) {
  const cycle = DIRECTIONS.filter((d) => moveDirection(moveId, d) !== d);
  // 上（または前）から順に、動く先をたどって並べる
  const startDir = cycle.includes('top') ? 'top' : 'front';
  const order = [startDir];
  while (order.length < 4) order.push(moveDirection(moveId, order.at(-1)));
  const parts = order.map((d) => `${D(d)}の面は${D(moveDirection(moveId, d))}へ`);
  return `${movePhrase(moveId)}と、${parts.join('、')}動きます。`;
}

/** 手順のあと、方向 asked にくる面が、はじめにどこにあったか（途中の方向の列） */
export function tracePath(moveIds, askedDir) {
  for (const start of DIRECTIONS) {
    const path = [start];
    for (const m of moveIds) path.push(moveDirection(m, path.at(-1)));
    if (path.at(-1) === askedDir) return path;
  }
  throw new Error('面の動きを追えませんでした');
}

/**
 * 回転のあとの面を答える問題の解説
 * @param {{ moves: string[], askedDir: string, value: any, unit: string, info: 'visible'|'rule'|'list', byDir: object }} p
 */
export function explainTracking({ moves, askedDir, value, info, byDir }) {
  const path = tracePath(moves, askedDir);
  const start = path[0];
  const lines = [];
  if (moves.length === 1) lines.push(moveEffect(moves[0]));
  else {
    lines.push(
      `${D(askedDir)}にくる面の動きを順に追うと、はじめ${D(start)} → ` +
        moves.map((m, i) => `${ROTATION_MOVES[m].short}で${D(path[i + 1])}`).join(' → ') +
        ' です。',
    );
  }
  lines.push(`つまり${D(askedDir)}にくるのは、はじめ${D(start)}にあった面です。`);
  if (info === 'rule' && ['bottom', 'back', 'left'].includes(start)) {
    const opp = getOppositeDirection(start);
    lines.push(`${D(start)}の面は見えていませんが、向かい合う${D(opp)}の面が${byDir[opp]}なので、7−${byDir[opp]}＝${value}です。`);
  } else if (info === 'list' && ['bottom', 'back', 'left'].includes(start)) {
    lines.push(`見えていない面の表から、${D(start)}の面は${value}です。`);
  } else {
    lines.push(`はじめ${D(start)}の面は${value}なので、答えは${value}です。`);
  }
  return lines.join('');
}
