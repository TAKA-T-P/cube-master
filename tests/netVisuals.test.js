// @vitest-environment jsdom
// 展開図の SVG と、サイコロの見取図の「上・前・右」の表示
import { describe, it, expect } from 'vitest';
import { renderNetSvg } from '../src/ui/netVisuals.js';
import { renderVisual, renderCubeSvg } from '../src/ui/visualChoices.js';
import { parseNet } from '../src/core/cubeNet.js';
import { INITIAL_ORIENTATION, ALL_ORIENTATIONS } from '../src/core/cubeOrientation.js';
import { numberFaces, STANDARD_DICE, symbolFace } from '../src/core/cubeFaceLabels.js';

const CROSS = parseNet(['.#..', '####', '.#..']);

describe('展開図の SVG', () => {
  it('マス・面のラベル・点のラベル・強調する辺を描く', () => {
    const el = renderNetSvg({
      cells: CROSS,
      cellLabels: { f0: 'ア', f1: 'イ' },
      points: [{ x: 1, y: 0, label: 'A', color: '#f06a00' }, { x: 2, y: 0, label: 'B' }],
      segments: [{ a: [1, 0], b: [2, 0] }],
    });
    expect(el.querySelectorAll('[data-cell]')).toHaveLength(6);
    expect([...el.querySelectorAll('[data-cell-label]')].map((t) => t.textContent)).toEqual(['ア', 'イ']);
    expect([...el.querySelectorAll('[data-point-label]')].map((t) => t.textContent)).toEqual(['A', 'B']);
    expect(el.querySelectorAll('[data-segment]')).toHaveLength(1);
  });

  it('点のラベルはマスの外側にずらして置く', () => {
    const el = renderNetSvg({ cells: CROSS, points: [{ x: 1, y: 0, label: 'A' }] });
    const dot = el.querySelector('[data-point="1,0"]');
    const label = el.querySelector('[data-point-label="A"]');
    // 点 (1,0) は上のマスの左上の角。ラベルはマスと反対の左上へ
    expect(Number(label.getAttribute('x'))).toBeLessThan(Number(dot.getAttribute('cx')));
    expect(Number(label.getAttribute('y'))).toBeLessThan(Number(dot.getAttribute('cy')));
  });

  it('マスを置く候補・動かすマス・重なるマス（回答後に表示する印）・マーク', () => {
    const el = renderNetSvg({
      cells: CROSS,
      marked: ['f0'],
      candidates: [{ x: 0, y: 0, label: 'ア' }],
      conflicts: ['f2'],
      cellFaces: { f3: symbolFace('◎') },
    });
    expect(el.querySelector('[data-cell="f0"]').getAttribute('stroke')).toBe('#f06a00');
    expect(el.querySelector('[data-candidate="ア"]')).not.toBeNull();
    expect(el.querySelector('[data-conflict="f2"]').classList).toContain('net-conflict');
    // マークは文字ではなく図形で、マスの中央に描く
    const mark = el.querySelector('[data-mark="◎"]');
    expect(mark.querySelectorAll('circle')).toHaveLength(2);
    expect(el.textContent).not.toContain('◎');
  });

  it('visual（type: net）として描ける', () => {
    expect(renderVisual({ type: 'net', cells: CROSS, caption: '展開図' }).querySelector('figcaption').textContent).toBe('展開図');
  });
});

describe('サイコロの見取図の向き', () => {
  it('はじめの向きの図に「上・前・右」を、立方体の外側に書く', () => {
    for (const o of [INITIAL_ORIENTATION, ALL_ORIENTATIONS[9]]) {
      const el = renderCubeSvg({ orientation: o, faces: numberFaces(STANDARD_DICE), viewDirection: [4, 3, 5], showDirections: true });
      const labels = Object.fromEntries([...el.querySelectorAll('[data-direction-label]')].map((t) => [t.dataset.directionLabel, t]));
      expect(Object.keys(labels).sort()).toEqual(['front', 'right', 'top']);
      expect(labels.top.textContent).toBe('上');
      expect(labels.front.textContent).toBe('前');
      expect(labels.right.textContent).toBe('右');
      // 上は図の上、前は左下、右は右
      expect(Number(labels.top.getAttribute('y'))).toBeLessThan(Number(labels.front.getAttribute('y')));
      expect(Number(labels.front.getAttribute('x'))).toBeLessThan(0);
      expect(Number(labels.right.getAttribute('x'))).toBeGreaterThan(0);
    }
    expect(renderCubeSvg({ orientation: INITIAL_ORIENTATION, faces: numberFaces(STANDARD_DICE), viewDirection: [4, 3, 5] }).querySelectorAll('[data-direction-label]')).toHaveLength(0);
  });
});
