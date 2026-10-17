/**
 * 線分を細い管（円柱と継ぎ目の球）で描く小さな部品（内接立体・長さと角度の 3D で共通）
 * WebGL の線は太さを変えられないので、目立たせたい線分は管にする。
 */
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);

/**
 * @param {{ cylinder: THREE.BufferGeometry, joint: THREE.BufferGeometry }} geometries 半径 1 の円柱（高さ 1）と球
 * @param {THREE.Vector3[][]} segments [始点, 終点] の一覧
 * @param {THREE.Material} material
 * @param {number} radius
 */
export function tubeSegments(geometries, segments, material, radius) {
  const group = new THREE.Group();
  for (const [a, b] of segments) {
    const len = a.distanceTo(b);
    if (len < 1e-6) continue;
    const m = new THREE.Mesh(geometries.cylinder, material);
    m.scale.set(radius, len, radius);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    group.add(m);
    for (const p of [a, b]) {
      const j = new THREE.Mesh(geometries.joint, material);
      j.scale.setScalar(radius);
      j.position.copy(p);
      group.add(j);
    }
  }
  return group;
}

/** 管の部品の形（半径 1） */
export function createTubeGeometries() {
  return { cylinder: new THREE.CylinderGeometry(1, 1, 1, 10, 1), joint: new THREE.SphereGeometry(1, 10, 8) };
}

/** 凸多角形（THREE.Vector3 の並び）を三角形に分けた BufferGeometry */
export function polygonsGeometry(polygons) {
  const pos = [];
  for (const pts of polygons) for (let i = 1; i + 1 < pts.length; i++) pos.push(...pts[0].toArray(), ...pts[i].toArray(), ...pts[i + 1].toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 立方体（一辺 2・中心が原点）の12本の辺 */
export function cubeEdgeSegments() {
  const c = [-1, 1];
  const list = [];
  for (const a of c) for (const b of c) {
    list.push([new THREE.Vector3(-1, a, b), new THREE.Vector3(1, a, b)], [new THREE.Vector3(a, -1, b), new THREE.Vector3(a, 1, b)], [new THREE.Vector3(a, b, -1), new THREE.Vector3(a, b, 1)]);
  }
  return list;
}
