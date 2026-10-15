// @vitest-environment jsdom
// 2D の図（見取図など）が、3D と同じ向き・装飾のデータどおりに描かれるか
import { describe, it, expect } from 'vitest';
import { renderCubeSvg, renderFaceSvg, renderVisual, renderChoiceContent } from '../src/ui/visualChoices.js';
import { INITIAL_ORIENTATION, rotateOrientation, ALL_ORIENTATIONS } from '../src/core/cubeOrientation.js';
import { numberFaces, colorFaces, STANDARD_DICE, colorFace } from '../src/core/cubeFaceLabels.js';
import { movesVisual, hiddenFacesVisual, viewOnlyVisual } from '../src/questions/decoratedCube.js';

const faces = numberFaces(STANDARD_DICE);
const facesShown = (el) => Object.fromEntries([...el.querySelectorAll('[data-direction]')].map((g) => [g.dataset.direction, g.dataset.face]));

describe('見取図（SVG）', () => {
  it('ふつうの視点では、上・前・右の面を、その向きの面 ID と数字どおりに描く', () => {
    for (const o of ALL_ORIENTATIONS) {
      const el = renderCubeSvg({ orientation: o, faces, viewDirection: [4, 3, 5] });
      expect(facesShown(el)).toEqual({ top: o.top, front: o.front, right: o.right });
      for (const g of el.querySelectorAll('[data-direction]')) expect(g.textContent).toBe(String(STANDARD_DICE[g.dataset.face]));
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
});

describe('そのほかの図', () => {
  it('面の図は矢印の向きを回転で表す', () => {
    const el = renderFaceSvg({ face: colorFace('green'), arrow: 'left' });
    expect(el.querySelector('path').getAttribute('transform')).toBe('rotate(270)');
  });

  it('回転の手順は、番号・矢印・文字で表す', () => {
    const el = renderVisual(movesVisual(['right', 'forward', 'turnLeft']));
    const items = [...el.querySelectorAll('.moves__item')];
    expect(items.map((i) => i.querySelector('.moves__label').textContent)).toEqual(['右へ', '前へ', '水平に左へ']);
    expect(items.map((i) => i.querySelector('.moves__icon').textContent)).toEqual(['→', '↓', '↺']);
  });

  it('見えていない面の一覧', () => {
    const cf = colorFaces({ EFGH: 'red', ABCD: 'blue', ABFE: 'yellow', CDHG: 'green', BCGF: 'purple', DAEH: 'orange' });
    const el = renderVisual(hiddenFacesVisual(cf, INITIAL_ORIENTATION));
    for (const text of ['下：青', '後ろ：緑', '左：オレンジ']) expect(el.textContent).toContain(text);
  });

  it('図の選択肢は記号と図、色の選択肢は色見本と色名', () => {
    const fig = renderChoiceContent({ id: 'x', label: 'イ', visual: { type: 'face', face: colorFace('red'), arrow: 'up' }, description: '赤の面、矢印は上向き' });
    expect(fig[0].textContent).toBe('イ');
    expect(fig[1].querySelector('svg')).not.toBeNull();
    const swatch = renderChoiceContent({ id: 'red', label: '赤', visual: { type: 'swatch', face: colorFace('red') } });
    expect(swatch[0].classList).toContain('swatch');
    expect(swatch[1].textContent).toBe('赤');
  });
});
