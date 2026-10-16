/**
 * 面の装飾（数字・色・記号）の 3D 表示
 *
 * cubeModel の面とは別に、各面のすぐ外側に装飾用の板を重ねる。板は model.root の子なので、
 * 立方体を回転させても装飾は同じ面に付いたまま動く（面 ID と装飾の対応が崩れない）。
 * 板の「上」は core/cubeFaceLabels の FACE_UP にそろえ、矢印の向きの計算と一致させる。
 */
import * as THREE from 'three';
import { FACES, CUBE_SIZE } from '../core/cubeConstants.js';
import { FACE_UP, PIP_LAYOUTS, MARK_SHAPES, pipRadius, pipColor } from '../core/cubeFaceLabels.js';

const OFFSET = 0.004; // 面から少し浮かせる（強調表示のオーバーレイ 0.006 より内側）
const TEXTURE_SIZE = 256;

/**
 * @param {ReturnType<import('./cubeModel.js').createCubeModel>} model
 */
export function createFaceDecorations(model) {
  const group = new THREE.Group();
  group.name = 'decorationsGroup';
  group.visible = false;
  model.root.add(group);
  const geometry = new THREE.PlaneGeometry(CUBE_SIZE * 0.97, CUBE_SIZE * 0.97);
  /** @type {Map<string, THREE.Mesh>} */
  const meshes = new Map();
  let current = null;

  function clear() {
    for (const mesh of meshes.values()) {
      mesh.material.map?.dispose();
      mesh.material.dispose();
      mesh.removeFromParent();
    }
    meshes.clear();
  }

  return {
    group,
    /**
     * 装飾を設定する。null なら装飾なし（Phase 1 までのふつうの立方体）
     * @param {Record<string, object>|null} faces 面 ID → 装飾（core/cubeFaceLabels）
     */
    set(faces) {
      clear();
      current = faces;
      group.visible = Boolean(faces);
      if (!faces) return;
      for (const face of FACES) {
        const decoration = faces[face.id];
        if (!decoration) continue;
        const texture = createTexture(decoration);
        const material = new THREE.MeshStandardMaterial({
          color: texture ? 0xffffff : decoration.color,
          map: texture,
          roughness: 0.7,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        const n = new THREE.Vector3(...face.normal);
        const up = new THREE.Vector3(...FACE_UP[face.id]);
        const right = new THREE.Vector3().crossVectors(up, n);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
        mesh.position.copy(n).multiplyScalar(CUBE_SIZE / 2 + OFFSET);
        mesh.userData.elementType = 'face';
        mesh.userData.elementId = face.id;
        mesh.userData.decoration = decoration;
        mesh.raycast = () => {}; // 装飾は選択判定の対象外（面そのもので判定する）
        group.add(mesh);
        meshes.set(face.id, mesh);
      }
    },
    get: () => current,
    getMesh: (faceId) => meshes.get(faceId) ?? null,
    dispose() {
      clear();
      geometry.dispose();
      group.removeFromParent();
    },
  };
}

/** 装飾のテクスチャ（DOM がない環境では null を返し、単色で表示する） */
function createTexture(decoration) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  let ctx = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  drawDecoration(ctx, decoration, TEXTURE_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 面の絵（2D 図の SVG と同じ配色・配置にする） */
export function drawDecoration(ctx, decoration, size) {
  const s = size;
  ctx.fillStyle = decoration.color;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = s * 0.03;
  ctx.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);

  if (decoration.arrow) {
    drawArrow(ctx, decoration.arrow, s, decoration.textColor);
    // 矢印があるときは色名を左上に小さく
    ctx.fillStyle = decoration.textColor;
    ctx.font = `bold ${Math.round(s * 0.13)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(decoration.label, s * 0.1, s * 0.09);
    return;
  }
  // サイコロの面は数字ではなく目（ドット）で描く
  if (decoration.kind === 'number' && PIP_LAYOUTS[decoration.value]) {
    const n = decoration.value;
    ctx.fillStyle = pipColor(n);
    for (const [x, y] of PIP_LAYOUTS[n]) {
      ctx.beginPath();
      ctx.arc(s / 2 + x * s, s / 2 + y * s, pipRadius(n) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  // マークは図形で描く（SVG の図と同じ形・同じ位置）
  if (decoration.kind === 'symbol' && MARK_SHAPES[decoration.value]) {
    drawMark(ctx, decoration.value, s, decoration.textColor);
    return;
  }
  const label = String(decoration.label);
  const fontSize = label.length <= 1 ? s * 0.55 : label.length <= 2 ? s * 0.4 : s * 0.24;
  ctx.fillStyle = decoration.textColor;
  ctx.font = `bold ${Math.round(fontSize)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s / 2, s / 2 + s * 0.02);
}

function drawMark(ctx, value, s, color) {
  const X = (n) => s / 2 + n * s;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const shape of MARK_SHAPES[value]) {
    ctx.beginPath();
    if (shape.type === 'circle') ctx.arc(X(0), X(0), shape.r * s, 0, Math.PI * 2);
    else if (shape.type === 'line') {
      ctx.moveTo(X(shape.from[0]), X(shape.from[1]));
      ctx.lineTo(X(shape.to[0]), X(shape.to[1]));
    } else {
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(X(x), X(y)) : ctx.lineTo(X(x), X(y))));
      ctx.closePath();
    }
    if (shape.fill) ctx.fill();
    else {
      ctx.lineWidth = shape.stroke * s;
      ctx.stroke();
    }
  }
}

const ARROW_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

function drawArrow(ctx, arrow, s, color) {
  ctx.save();
  ctx.translate(s / 2, s / 2 + s * 0.04);
  ctx.rotate(ARROW_ANGLE[arrow]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.32);
  ctx.lineTo(s * 0.22, -s * 0.06);
  ctx.lineTo(s * 0.08, -s * 0.06);
  ctx.lineTo(s * 0.08, s * 0.3);
  ctx.lineTo(-s * 0.08, s * 0.3);
  ctx.lineTo(-s * 0.08, -s * 0.06);
  ctx.lineTo(-s * 0.22, -s * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
