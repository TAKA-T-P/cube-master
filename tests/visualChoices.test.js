// @vitest-environment jsdom
// 2D の図（見取図など）が、3D と同じ向き・装飾のデータどおりに描かれるか
import { describe, it, expect } from 'vitest';
import { renderCubeSvg, renderFaceSvg, renderVisual, renderChoiceContent } from '../src/ui/visualChoices.js';
import { INITIAL_ORIENTATION, rotateOrientation, ALL_ORIENTATIONS } from '../src/core/cubeOrientation.js';
import { numberFaces, colorFaces, STANDARD_DICE, colorFace, symbolFace, FACE_MARKS } from '../src/core/cubeFaceLabels.js';
import { movesVisual, hiddenFacesVisual, viewOnlyVisual } from '../src/questions/decoratedCube.js';

const faces = numberFaces(STANDARD_DICE);
const facesShown = (el) => Object.fromEntries([...el.querySelectorAll('[data-direction]')].map((g) => [g.dataset.direction, g.dataset.face]));

describe('見取図（SVG）', () => {
  it('ふつうの視点では、上・前・右の面を、その向きの面 ID と目の数どおりに描く（数字は描かない）', () => {
    for (const o of ALL_ORIENTATIONS) {
      const el = renderCubeSvg({ orientation: o, faces, viewDirection: [4, 3, 5] });
      expect(facesShown(el)).toEqual({ top: o.top, front: o.front, right: o.right });
      for (const g of el.querySelectorAll('[data-direction]')) {
        const n = STANDARD_DICE[g.dataset.face];
        expect(g.querySelector('.pips').getAttribute('data-pips')).toBe(String(n));
        expect(g.querySelectorAll('circle')).toHaveLength(n);
        expect(g.textContent).toBe('');
      }
    }
  });

  it('下・左・後ろから見る視点では、その側の3面を描く', () => {
    const el = renderCubeSvg({ orientation: INITIAL_ORIENTATION, faces, viewDirection: [-4, -3, -5] });
    expect(Object.keys(facesShown(el)).sort()).toEqual(['back', 'bottom', 'left']);
  });

  it('回転した向きでは、回転後の面が見える', () => {
    const el = renderCubeSvg({ orientation: rotateOrientation(INITIAL_ORIENTATION, 'right'), faces, viewDirection: [4, 3, 5] });
    expect(facesShown(el).top).toBe('DAEH'); // 左にあった面
  });

  it('鏡映しの図（見えている3面だけ）も描ける', () => {
    const el = renderVisual(viewOnlyVisual({ top: colorFace('red'), front: colorFace('blue'), right: colorFace('yellow') }));
    for (const name of ['赤', '青', '黄']) expect(el.textContent).toContain(name);
  });
  it('記号（〇◎×●◇◆）は面と一緒にゆがめて描く（3D の面の印と同じ向きに見える）。「？」はゆがめない', () => {
    const ids = Object.keys(faces);
    const marks = Object.fromEntries(ids.map((id, i) => [id, symbolFace(FACE_MARKS[i])]));
    const el = renderCubeSvg({ orientation: INITIAL_ORIENTATION, faces: marks, viewDirection: [4, 3, 5] });
    for (const g of el.querySelectorAll('[data-direction]')) {
      const text = g.querySelector('text');
      expect(text.parentElement.getAttribute('transform')).toMatch(/^matrix/);
    }
    const q = { ...marks, [INITIAL_ORIENTATION.top]: symbolFace('？') };
    const el2 = renderCubeSvg({ orientation: INITIAL_ORIENTATION, faces: q, viewDirection: [4, 3, 5] });
    const top = el2.querySelector('[data-direction="top"] > text');
    expect(top.textContent).toBe('？');
  });
});

describe('そのほかの図', () => {
  it('面の図：目の並びの回転と、矢印の向き', () => {
    const six = renderFaceSvg({ face: numberFaces(STANDARD_DICE).EFGH, turn: 90 });
    expect(six.querySelector('.pips').getAttribute('transform')).toBe('rotate(90)');
    expect(six.querySelectorAll('circle')).toHaveLength(6);
    const el = renderFaceSvg({ face: colorFace('green'), arrow: 'left' });
    expect(el.querySelector('path').getAttribute('transform')).toBe('rotate(270)');
  });

  it('回転の手順は、番号・矢印・文字で表す', () => {
    const el = renderVisual(movesVisual(['right', 'forward', 'turnLeft']));
    const items = [...el.querySelectorAll('.moves__item')];
    expect(items.map((i) => i.querySelector('.moves__label').textContent)).toEqual(['右へ', '前へ', '水平に左へ']);
    // 見取図の向きに合わせる：右は右下 ↘、前（手前）は左下 ↙。水平に左へは真上から見て時計回り ↻
    expect(items.map((i) => i.querySelector('.moves__icon').textContent)).toEqual(['↘', '↙', '↻']);
    const all = renderVisual(movesVisual(['left', 'backward', 'turnRight']));
    expect([...all.querySelectorAll('.moves__icon')].map((i) => i.textContent)).toEqual(['↖', '↗', '↺']);
  });

  it('見えていない面の一覧', () => {
    const cf = colorFaces({ ABCD: 'red', EFGH: 'blue', ABFE: 'yellow', CDHG: 'green', BCGF: 'purple', DAEH: 'orange' });
    const el = renderVisual(hiddenFacesVisual(cf, INITIAL_ORIENTATION));
    for (const text of ['下：青', '後ろ：緑', '左：オレンジ']) expect(el.textContent).toContain(text);
  });

  it('図の選択肢は記号と図、目の選択肢は目の絵', () => {
    const fig = renderChoiceContent({ id: 'x', label: 'イ', visual: { type: 'face', face: colorFace('red'), arrow: 'up' }, description: '赤の面、矢印は上向き' });
    expect(fig[0].textContent).toBe('イ');
    expect(fig[1].querySelector('svg')).not.toBeNull();
    const pip = renderChoiceContent({ id: '5', label: '5の目', visual: { type: 'pip', face: numberFaces(STANDARD_DICE).CDHG } });
    expect(pip[0].querySelectorAll('circle')).toHaveLength(5); // 目の絵
    expect(pip[1].textContent).toBe('5の目'); // 読み上げ用の文字
    expect(pip[1].classList).toContain('sr-only');
  });
});
