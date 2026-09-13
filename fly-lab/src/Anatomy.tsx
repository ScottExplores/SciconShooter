import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api } from './api';
import { Empty, Icon, Panel } from './components';

type Neuron = { id: string; type: string; region: string; superclass: string; points: number[][]; segments: number[][]; source: string; original_segment_count?: number; displayed_segment_count?: number };
const COLORS = ['#6addf5', '#65a6e7', '#9e8ddb', '#cfad6f', '#e69b77', '#dc788b', '#4bbfae', '#72a6af'];
export default function Anatomy() {
  const [anatomy, setAnatomy] = useState<{ neurons: Neuron[]; units?: string; status?: string } | null>(null);
  const [error, setError] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState<string[]>([]); const [rotate, setRotate] = useState(false); const [reset, setReset] = useState(0);
  const host = useRef<HTMLDivElement>(null); const objects = useRef<any[]>([]); const controls = useRef<any>(null); const redraw = useRef(true);
  useEffect(() => { const abort = new AbortController(); let retry: ReturnType<typeof setTimeout>; const fetchAnatomy = () => api('/anatomy', undefined, abort.signal).then(value => { if (!Array.isArray(value?.neurons)) throw new Error(value?.error || 'Source morphology is unavailable.'); setAnatomy(value); setVisible(value.neurons.map((n: Neuron) => n.id)); setError(value.neurons.length ? '' : value.reason || 'No source morphology is cached.'); }).catch(e => { if (e.name !== 'AbortError') { setError(e.message); retry = setTimeout(fetchAnatomy, 5000); } }); fetchAnatomy(); return () => { abort.abort(); clearTimeout(retry); }; }, []);
  useEffect(() => {
    if (!host.current || !anatomy?.neurons?.length) return;
    const node = host.current; let renderer: any;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { setError('WebGL is unavailable. Source neuron metadata is still accessible below.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setClearColor(0x061018, 0); node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive source neuron skeletons. Drag to rotate, wheel to zoom.');
    const scene = new THREE.Scene(); const group = new THREE.Group(); scene.add(group);
    const bounds = new THREE.Box3();
    anatomy.neurons.forEach((neuron, index) => {
      const vertices: number[] = [];
      for (const [a, b] of neuron.segments) { if (neuron.points[a] && neuron.points[b]) vertices.push(...neuron.points[a], ...neuron.points[b]); }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!);
      const material = new THREE.LineBasicMaterial({ color: COLORS[index % COLORS.length], transparent: true, opacity: .8 });
      const line = new THREE.LineSegments(geometry, material); line.userData = { id: neuron.id, color: COLORS[index % COLORS.length] }; group.add(line);
    });
    objects.current = group.children;
    const center = bounds.getCenter(new THREE.Vector3()); const size = bounds.getSize(new THREE.Vector3()); const extent = Math.max(size.x, size.y, size.z) || 1;
    group.position.copy(center).multiplyScalar(-1); group.scale.setScalar(1 / extent); group.position.divideScalar(extent);
    // The coordinate axes are unchanged: this camera transform only frames the actual geometry.
    const camera = new THREE.PerspectiveCamera(35, 1, .001, 100); camera.position.set(0, 0, 2.15); camera.up.set(0, -1, 0);
    const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.minDistance = .15; orbit.maxDistance = 8; orbit.autoRotateSpeed = .6; controls.current = orbit;
    const raycaster = new THREE.Raycaster(); raycaster.params.Line.threshold = .008;
    let down = [0, 0];
    const pointerDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const select = (event: PointerEvent) => { if (Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4) return; const box = renderer.domElement.getBoundingClientRect(); const mouse = new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1); raycaster.setFromCamera(mouse, camera); const hit = raycaster.intersectObjects(group.children.filter((item: any) => item.visible))[0]; if (hit) setSelected(hit.object.userData.id); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', select);
    const resize = () => { const width = node.clientWidth, height = node.clientHeight; renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); redraw.current = true; };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame: number; const draw = () => { const changed = orbit.update(); if (changed || redraw.current) { renderer.render(scene, camera); redraw.current = false; } frame = requestAnimationFrame(draw); }; draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); orbit.dispose(); group.children.forEach((item: any) => { item.geometry.dispose(); item.material.dispose(); }); renderer.dispose(); renderer.domElement.remove(); objects.current = []; controls.current = null; };
  }, [anatomy, reset]);
  useEffect(() => { objects.current.forEach(item => { item.visible = visible.includes(item.userData.id); item.material.opacity = !selected || selected === item.userData.id ? .95 : .23; item.material.color.set(selected === item.userData.id ? '#f2d196' : item.userData.color); }); redraw.current = true; }, [visible, selected, anatomy, reset]);
  useEffect(() => { if (controls.current) controls.current.autoRotate = rotate; }, [rotate, anatomy, reset]);
  const neuron = anatomy?.neurons.find(n => n.id === selected);
  return <Panel className="anatomy-panel" title="MALECNS MORPHOLOGY" note="Measured anatomy" action={<button className="icon-button" title="Reset anatomical view" aria-label="Reset anatomical view" onClick={() => setReset(v => v + 1)}><Icon name="reset" /></button>}>
    <div className="anatomy-topline"><span>Brain + ventral nerve cord</span><span>{anatomy?.neurons.length || 0} source skeletons</span></div>
    <div className="anatomy-stage"><div className="anatomy-canvas" ref={host} />{!anatomy?.neurons.length && <Empty title={error || 'Loading source morphology'}>Only released neuronal geometry is displayed.</Empty>}
      {anatomy?.neurons.length > 0 && <div className="anatomy-legend"><span className="section-label">VISIBLE SAMPLE</span>{anatomy.neurons.map((n, i) => <div className={`neuron-option ${selected === n.id ? 'selected' : ''}`} key={n.id}><input aria-label={`Show ${n.type} neuron ${n.id}`} type="checkbox" checked={visible.includes(n.id)} onChange={() => setVisible(value => value.includes(n.id) ? value.filter(id => id !== n.id) : [...value, n.id])} /><button onClick={() => setSelected(selected === n.id ? null : n.id)} style={{ '--neuron-color': COLORS[i % COLORS.length] } as React.CSSProperties}><i />{n.type}</button></div>)}</div>}
      <div className="anatomy-orientation"><span>Y ↓</span><span>X →</span><span>EM space</span></div><div className="anatomy-interaction">Drag to rotate · Scroll to zoom</div>
    </div>
    <div className="anatomy-inspector">{neuron ? <><div><strong>{neuron.type}</strong><span>Body {neuron.id} · {neuron.region || neuron.superclass.replaceAll('_', ' ')}</span></div><a href={neuron.source} target="_blank" rel="noreferrer">Source SWC <Icon name="arrow" size={13} /></a></> : <><div><strong>Select a neuron</strong><span>Eight authentic skeleton samples · not a complete CNS rendering</span></div></>}
    </div>
    <div className="anatomy-foot"><span>Coordinates: {anatomy?.units || 'nm'} · Released SWC</span><label><input type="checkbox" checked={rotate} onChange={e => setRotate(e.target.checked)} /> Auto rotate</label></div>
  </Panel>;
}
