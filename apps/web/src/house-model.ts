import * as THREE from 'three';
import { roofColors, roofColumns, roofRows, roofSlotCount, type RoofColor } from '@energy/contracts/design';

export const houseTarget = new THREE.Vector3(0, 3.2, 0);
export const houseCamera = new THREE.Vector3(14, 14, 20).sub(houseTarget).multiplyScalar(1.1).add(houseTarget);
export type HouseView = 'perspective' | 'roof' | 'front';
export const cameraViews: Record<HouseView, THREE.Vector3> = {
  perspective: houseCamera.clone().sub(houseTarget),
  roof: new THREE.Vector3(0, 26, 3),
  front: new THREE.Vector3(0, 7, 26),
};
type Position = [number, number, number];

export function roofPosition(u: number, v: number, lift = .08): THREE.Vector3 {
  const z = .28 + v * 4.05;
  return new THREE.Vector3(-6.8 + u * 13.6, 9.6 - z * 3.4 / 4.65 + lift, z);
}

export function createHouseModel(interactive: boolean) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const material = (color: string) => new THREE.MeshLambertMaterial({ color });
  const wall = material('#eeeeee'), roof = material('#575757'), frame = material('#252525');
  roof.side = THREE.DoubleSide;
  const glass = material('#777777'), sill = material('#e4e4e4'), base = material('#d8d8d8');
  const moduleMaterial = material('#131313'), moduleFrame = material('#b0b0b0');
  const seamMaterial = new THREE.LineBasicMaterial({ color: '#3e3e3e', transparent: true, opacity: .65 });
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#888888', transparent: true, opacity: .55 });
  const availableMaterial = new THREE.LineBasicMaterial({ color: '#c0c0c0', transparent: true, opacity: .45 });

  function box(size: Position, position: Position, mat: THREE.Material, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function quad(points: THREE.Vector3[], mat: THREE.Material, parent: THREE.Object3D = scene) {
    const geometry = new THREE.BufferGeometry().setFromPoints([points[0], points[1], points[2], points[0], points[2], points[3]]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function line(points: THREE.Vector3[], mat: THREE.LineBasicMaterial, parent: THREE.Object3D = scene) {
    const item = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
    parent.add(item); return item;
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  scene.add(new THREE.AmbientLight('#ffffff', .65));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-8, 19, 14); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0005;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', .3); fill.position.set(14, 10, -9); scene.add(fill);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: .14 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.21; ground.receiveShadow = true; scene.add(ground);
  // A subtle geometric contact shadow adds depth without an image texture.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#bbbbbb', transparent: true, opacity: .13, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(10, 6.9, 1); shadow.position.set(.25, -.19, .2); scene.add(shadow);
  box([15.2, .24, 10.0], [0, -.04, 0], base);
  box([14, 6.2, 8.6], [0, 3.1, 0], wall);

  for (const x of [-7, 7]) {
    const corners = [v(x, 6.2, -4.3), v(x, 6.2, 4.3), v(x, 9.6, 0)];
    if (x > 0) corners.reverse();
    const geometry = new THREE.BufferGeometry().setFromPoints(corners);
    geometry.computeVertexNormals();
    const gable = new THREE.Mesh(geometry, wall); gable.castShadow = true; gable.receiveShadow = true; scene.add(gable);
  }
  quad([v(-7.5, 9.6, 0), v(-7.5, 6.2, 4.65), v(7.5, 6.2, 4.65), v(7.5, 9.6, 0)], roof);
  quad([v(-7.5, 9.6, 0), v(7.5, 9.6, 0), v(7.5, 6.2, -4.65), v(-7.5, 6.2, -4.65)], roof);
  for (const side of [-1, 1]) {
    for (let x = -7.3; x < 7.5; x += .63) line([v(x, 9.63, side * .015), v(x, 6.24, side * 4.64)], seamMaterial);
    line([v(-7.5, 6.2, side * 4.65), v(7.5, 6.2, side * 4.65)], seamMaterial);
    for (const x of [-7.5, 7.5]) line([v(x, 6.2, side * 4.65), v(x, 9.63, 0)], seamMaterial);
  }
  line([v(-7.5, 9.64, 0), v(7.5, 9.64, 0)], seamMaterial);

  function frontWindow(x: number, y: number, width: number, height: number, side = 1) {
    const z = side * 4.34;
    box([width, height, .12], [x, y, z], frame);
    box([width - .16, height - .16, .04], [x, y, z + side * .08], glass);
    box([.045, height - .16, .05], [x, y, z + side * .115], frame);
    box([width + .25, .1, .37], [x, y - height / 2 - .04, z + side * .08], sill);
    const glint = new THREE.MeshBasicMaterial({ color: '#cccccc', transparent: true, opacity: .18, side: THREE.DoubleSide });
    quad([v(x - width * .4, y + height * .4, z + side * .12), v(x - width * .4, y - height * .35, z + side * .12), v(x - width * .16, y - height * .35, z + side * .12), v(x + width * .05, y + height * .4, z + side * .12)], glint);
  }
  frontWindow(-3.2, 4.65, 3.6, 1.45); frontWindow(3.2, 4.65, 3.25, 1.45);
  frontWindow(-3.7, 1.65, 4.25, 2.8); frontWindow(4.7, 1.65, 1.65, 1.8);
  box([1.55, 2.8, .18], [1.35, 1.46, 4.36], frame);
  box([.07, .52, .07], [1.82, 1.44, 4.51], sill);
  box([2.2, .13, .95], [1.35, .08, 4.84], base);
  box([2.6, .1, 1.2], [1.35, -.015, 5.04], base);
  for (const x of [-4.4, 0, 4.4]) { frontWindow(x, 4.65, 2.5, 1.5, -1); frontWindow(x, 1.7, 2.5, 1.8, -1); }
  for (const side of [-1, 1]) for (const z of [-2, 2]) {
    const x = side * 7.035;
    for (const y of [1.7, 4.65]) {
      box([.12, 1.75, 1.5], [x, y, z], frame);
      box([.05, 1.59, 1.34], [x + side * .085, y, z], glass);
      box([.07, 1.59, .045], [x + side * .115, y, z], frame);
      box([.38, .1, 1.75], [x + side * .07, y - .92, z], sill);
    }
  }
  // Gutters and downpipes give the model depth without additional image assets.
  for (const side of [-1, 1]) {
    box([15.1, .12, .14], [0, 6.17, side * 4.64], frame);
    for (const x of [-6.9, 6.9]) box([.08, 6.1, .09], [x, 3.05, side * 4.4], frame);
  }

  const tiles: { corners: THREE.Vector3[]; module: THREE.Group; available: THREE.Line }[] = [];
  for (let slot = 0; slot < roofSlotCount; slot++) {
    const col = slot % roofColumns, row = Math.floor(slot / roofColumns);
    const u0 = col / roofColumns + .005, u1 = (col + 1) / roofColumns - .005;
    const v0 = row / roofRows + .015, v1 = (row + 1) / roofRows - .015;
    const points = (inset: number, lift: number) => [roofPosition(u0 + inset, v0 + inset, lift), roofPosition(u0 + inset, v1 - inset, lift), roofPosition(u1 - inset, v1 - inset, lift), roofPosition(u1 - inset, v0 + inset, lift)];
    const module = new THREE.Group(); scene.add(module);
    quad(points(0, .105), moduleFrame, module); quad(points(.003, .13), moduleMaterial, module);
    for (let colLine = 1; colLine < 4; colLine++) {
      const u = u0 + (u1 - u0) * colLine / 4;
      line([roofPosition(u, v0 + .004, .14), roofPosition(u, v1 - .004, .14)], gridMaterial, module);
    }
    for (let rowLine = 1; rowLine < 6; rowLine++) {
      const vv = v0 + (v1 - v0) * rowLine / 6;
      line([roofPosition(u0 + .004, vv, .14), roofPosition(u1 - .004, vv, .14)], gridMaterial, module);
    }
    const corners = points(0, .145);
    const available = line([...corners, corners[0]], availableMaterial);
    available.visible = interactive;
    tiles.push({ corners, module, available });
  }
  function updatePanels(panels: number[]) {
    const selected = new Set(panels);
    tiles.forEach((tile, slot) => { tile.module.visible = selected.has(slot); tile.available.visible = interactive && !selected.has(slot); });
  }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose());
    key.shadow.map?.dispose();
  }
  function updateRoofColor(color: RoofColor) { roof.color.set(roofColors[color].hex); }
  return { scene, ground, tiles, updatePanels, updateRoofColor, dispose };
}
