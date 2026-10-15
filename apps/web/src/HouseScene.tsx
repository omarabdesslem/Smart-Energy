import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roofColors, roofColumns, roofRows, roofSlotCount, type RoofColor } from '@energy/contracts';
import { cameraViews, createHouseModel, houseCamera, houseTarget, type HouseView } from './house-model';

type ProjectedTile = { points: string; center: [number, number]; visible: boolean };
type Runtime = { update: (panels: number[]) => void; updateRoofColor: (color: RoofColor) => void; zoomTo: (zoom: number) => void; view: (preset: HouseView) => void; rotate: (theta: number, phi?: number) => void };
type Props = { panels: number[]; roofColor?: RoofColor; onToggle?: (slot: number) => void; zoom?: number; onZoomChange?: (zoom: number) => void; disabled?: boolean; resetKey?: number; onModeChange?: (mode: '3d' | 'fixed') => void };

export function RoofScene({ panels, roofColor = 'dark-grey', onToggle, zoom = 1, onZoomChange, disabled = false, resetKey = 0, onModeChange }: Props) {
  const viewport = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null), runtime = useRef<Runtime | null>(null);
  const props = useRef({ panels, roofColor, onToggle, onZoomChange, zoom, disabled, onModeChange });
  props.current = { panels, roofColor, onToggle, onZoomChange, zoom, disabled, onModeChange };
  const [projected, setProjected] = useState<ProjectedTile[]>([]), [preset, setPreset] = useState<HouseView>('perspective');
  const [rendererKind, setRendererKind] = useState('loading');
  const [printSnapshot, setPrintSnapshot] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; slot: number | null; moved: boolean }>());
  const interactive = Boolean(onToggle);

  useEffect(() => {
    const element = viewport.current!, container = host.current!;
    const model = createHouseModel(interactive);
    const camera = new THREE.PerspectiveCamera(34, 1.5, .1, 220);
    camera.position.copy(houseCamera); camera.lookAt(houseTarget);
    const homeDistance = houseCamera.distanceTo(houseTarget);
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !interactive });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
        setRendererKind('webgl'); props.current.onModeChange?.('3d');
    } catch {
      model.dispose(); setRendererKind('fixed'); props.current.onModeChange?.('fixed');
      return () => { container.replaceChildren(); runtime.current = null; };
    }
    renderer.setClearColor(new THREE.Color('#ffffff'), 1);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, element);
    controls.target.copy(houseTarget); controls.enabled = interactive; controls.enablePan = false;
    controls.enableDamping = false; controls.rotateSpeed = .65;
    controls.minPolarAngle = .12 * Math.PI; controls.maxPolarAngle = .48 * Math.PI;
    controls.minDistance = homeDistance / 1.6; controls.maxDistance = homeDistance;
    let width = 1, height = 1, frame = 0, alive = true, lastCameraZoom = 1;

    function render() {
      frame = 0;
      if (!alive) return;
      model.scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      renderer.render(model.scene, camera);
      if (!interactive && renderer instanceof THREE.WebGLRenderer) setPrintSnapshot(renderer.domElement.toDataURL('image/png'));
      if (interactive) {
        const frontFacing = new THREE.Vector3(0, 4.65, 3.4).dot(camera.position.clone().sub(new THREE.Vector3(0, 7.9, 2.3))) > 0;
        setProjected(model.tiles.map(tile => {
          const vertices = tile.corners.map(corner => corner.clone().project(camera));
          return { visible: frontFacing && vertices.every(p => p.z > -1 && p.z < 1), points: vertices.map(p => `${(p.x + 1) * width / 2},${(1 - p.y) * height / 2}`).join(' '), center: [vertices.reduce((n, p) => n + (p.x + 1) * width / 2, 0) / 4, vertices.reduce((n, p) => n + (1 - p.y) * height / 2, 0) / 4] };
        }));
        const currentZoom = Math.max(1, Math.min(1.6, homeDistance / camera.position.distanceTo(controls.target)));
        if (Math.abs(currentZoom - lastCameraZoom) > .005) {
          lastCameraZoom = currentZoom;
          if (Math.abs(currentZoom - props.current.zoom) > .005) props.current.onZoomChange?.(currentZoom);
        }
      }
    }
    function requestRender() { if (!frame && alive) frame = requestAnimationFrame(render); }
    function updateSize() {
      width = element.clientWidth; height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height; camera.fov = 34 * Math.max(1, 1.55 / camera.aspect);
      camera.updateProjectionMatrix(); renderer.setSize(width, height); requestRender();
    }
    controls.addEventListener('change', requestRender);
    const observer = new ResizeObserver(updateSize); observer.observe(element);
    model.updatePanels(props.current.panels); model.updateRoofColor(props.current.roofColor); controls.update(); updateSize();
    runtime.current = {
      update(next) { model.updatePanels(next); requestRender(); },
      updateRoofColor(next) { model.updateRoofColor(next); requestRender(); },
      zoomTo(next) {
        const distance = homeDistance / next;
        if (Math.abs(camera.position.distanceTo(controls.target) - distance) < .01) return;
        camera.position.sub(controls.target).normalize().multiplyScalar(distance).add(controls.target);
        controls.update(); requestRender();
      },
      view(view) {
        camera.position.copy(cameraViews[view]).normalize().multiplyScalar(homeDistance).add(houseTarget);
        controls.target.copy(houseTarget); controls.update(); requestRender(); props.current.onZoomChange?.(1);
      },
      rotate(theta, phi = 0) {
        const offset = camera.position.clone().sub(controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += theta; spherical.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, spherical.phi + phi));
        camera.position.copy(new THREE.Vector3().setFromSpherical(spherical)).add(controls.target); controls.update(); requestRender();
      },
    };
    return () => {
      alive = false; cancelAnimationFrame(frame); observer.disconnect(); controls.removeEventListener('change', requestRender); controls.dispose();
      if (renderer instanceof THREE.WebGLRenderer) renderer.dispose();
      model.dispose(); container.replaceChildren(); runtime.current = null;
    };
  }, [interactive]);

  useEffect(() => runtime.current?.update(panels), [panels]);
  useEffect(() => runtime.current?.updateRoofColor(roofColor), [roofColor]);
  useEffect(() => runtime.current?.zoomTo(zoom), [zoom]);
  useEffect(() => { if (resetKey) { runtime.current?.view('perspective'); setPreset('perspective'); } }, [resetKey]);
  function changeView(view: HouseView) { setPreset(view); runtime.current?.view(view); }

  if (rendererKind === 'fixed') return <FixedRoofView panels={panels} roofColor={roofColor} onToggle={onToggle} zoom={zoom} disabled={disabled}/>;

  return <div className={`house-viewport true-3d ${interactive ? 'interactive' : ''} ${printSnapshot ? 'has-print-snapshot' : ''}`} data-renderer={rendererKind} data-roof-color={roofColor}>
    <div ref={viewport} className="scene-interaction" tabIndex={interactive ? 0 : undefined} role="group" aria-label={interactive ? 'Interactive 3D house. Drag to rotate, scroll to zoom, or use arrow keys.' : 'Three-dimensional house with the proposed solar layout'}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); runtime.current?.rotate(e.key === 'ArrowLeft' ? -.15 : e.key === 'ArrowRight' ? .15 : 0, e.key === 'ArrowUp' ? -.1 : e.key === 'ArrowDown' ? .1 : 0); } }}
      onPointerDownCapture={e => {
        const slotElement = (e.target as Element).closest('[data-slot]');
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, slot: slotElement ? Number(slotElement.getAttribute('data-slot')) : null, moved: false });
        if (pointers.current.size > 1) pointers.current.forEach(pointer => { pointer.moved = true; });
      }}
      onPointerMoveCapture={e => { const pointer = pointers.current.get(e.pointerId); if (pointer && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 4) pointer.moved = true; }}
      onPointerUpCapture={e => { const pointer = pointers.current.get(e.pointerId); pointers.current.delete(e.pointerId); if (pointer && !pointer.moved && pointer.slot !== null && !disabled) onToggle?.(pointer.slot); }}
      onPointerCancel={e => { pointers.current.delete(e.pointerId); }}>
      <div ref={host} className="renderer-host"/>
      {printSnapshot && <img className="scene-print-snapshot" src={printSnapshot} alt="Three-dimensional house with the proposed solar panels"/>}
      {interactive && <svg className="roof-overlay" aria-label="Roof sections" role="group">{projected.map((tile, slot) => tile.visible && <g key={slot} role="button" tabIndex={disabled ? -1 : 0} aria-label={`Roof section ${slot + 1}`} aria-pressed={panels.includes(slot)} aria-disabled={disabled} data-slot={slot} className={`roof-slot ${panels.includes(slot) ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onToggle?.(slot); } }}
        onClick={e => { if (e.detail === 0 && !disabled) onToggle?.(slot); }}>
        <title>{panels.includes(slot) ? 'Remove' : 'Add'} solar panel · Section {slot + 1}</title><polygon className="roof-cell" points={tile.points}/><g className="slot-action" pointerEvents="none"><circle cx={tile.center[0]} cy={tile.center[1]} r="9"/><path d={`M${tile.center[0] - 4} ${tile.center[1]}h8${panels.includes(slot) ? '' : `M${tile.center[0]} ${tile.center[1] - 4}v8`}`}/></g>
      </g>)}</svg>}
    </div>
    {interactive && <div className="scene-view-controls" aria-label="Camera views">{(['perspective', 'roof', 'front'] as const).map(view => <button key={view} className={preset === view ? 'active' : ''} aria-label={`${view === 'roof' ? 'Roof' : view === 'front' ? 'Front' : 'Perspective'} view`} aria-pressed={preset === view} onClick={() => changeView(view)}>{view === 'perspective' ? '3D' : view === 'roof' ? 'Roof' : 'Front'}</button>)}</div>}
  </div>;
}

// The earlier single-image planner remains a reliable, explicitly labeled
// fallback when the browser cannot create a WebGL context.
function FixedRoofView({ panels, roofColor = 'dark-grey', onToggle, zoom, disabled }: Props) {
  const point = (u: number, v: number): [number, number] => {
    const a = [382, 94], b = [1231, 169], c = [1078, 505], d = [153, 380];
    return [(1 - v) * ((1 - u) * a[0] + u * b[0]) + v * ((1 - u) * d[0] + u * c[0]), (1 - v) * ((1 - u) * a[1] + u * b[1]) + v * ((1 - u) * d[1] + u * c[1])];
  };
  const path = (points: [number, number][]) => points.map(p => p.join(',')).join(' ');
  return <div className="house-viewport true-3d fixed-roof-view" data-renderer="fixed" data-roof-color={roofColor}><span className="fixed-view-caption">3D unavailable · Fixed roof view</span><svg className="fixed-house-scene" viewBox="0 0 1536 1024" style={{ transform: `scale(${(zoom || 1) / 1.1})` }} role="group" aria-label="Fixed house roof planner">
    <image href="/images/house-3d.png" width="1536" height="1024" role="img" aria-label="House roof in a fixed perspective"/>
    {roofColor !== 'dark-grey' && <polygon className="fixed-roof-tint" points="363,76 1255,155 1095,526 132,390" fill={roofColors[roofColor].hex} opacity=".75" style={{ mixBlendMode: 'color', pointerEvents: 'none' }}/>}
    {Array.from({ length: roofSlotCount }, (_, slot) => {
      const row = Math.floor(slot / roofColumns), col = slot % roofColumns, selected = panels.includes(slot);
      if (!selected && !onToggle) return null;
      const u0 = col / roofColumns + .006, u1 = (col + 1) / roofColumns - .006;
      const v0 = row / roofRows + .014, v1 = (row + 1) / roofRows - .014;
      return <g key={slot} role={onToggle ? 'button' : undefined} tabIndex={onToggle && !disabled ? 0 : undefined} aria-label={onToggle ? `Roof section ${slot + 1}` : undefined} aria-pressed={onToggle ? selected : undefined} aria-disabled={onToggle ? disabled : undefined} className={`roof-slot ${selected ? 'selected' : ''}`} onClick={() => { if (!disabled) onToggle?.(slot); }} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onToggle?.(slot); } }}>
        <polygon className="roof-cell" points={path([point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)])}/>
        {selected && <g className="panel-lines" pointerEvents="none">{[1, 2, 3].map(n => <polyline key={`v${n}`} points={path([point(u0 + (u1 - u0) * n / 4, v0), point(u0 + (u1 - u0) * n / 4, v1)])}/>)}{[1, 2, 3, 4, 5].map(n => <polyline key={`h${n}`} points={path([point(u0, v0 + (v1 - v0) * n / 6), point(u1, v0 + (v1 - v0) * n / 6)])}/>)}</g>}
      </g>;
    })}
  </svg></div>;
}
