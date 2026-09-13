import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEFAULT_DATA_URL = new URL('./watch-soma.json', import.meta.url).href;

export type WatchAnatomyMetadata = {
  dataset: string;
  displayedSomaCount: number;
  availableSomaCount: number;
  retainedNeuronCount: number;
  skeletonCount: number;
  coordinateUnits: string;
  sourceUrl: string;
  classification: 'STATIC_ANATOMICAL_PREVIEW';
};

type AnatomyData = Omit<WatchAnatomyMetadata, 'skeletonCount' | 'sourceUrl'> & {
  schemaVersion: number;
  source: { url: string; sha256: string };
  positions: number[];
  bodyIds: string[];
  classes: string[];
  classIndices: number[];
  bounds: { min: number[]; max: number[] };
  skeletons: { id: string; type: string; positions: number[]; segments: number[] }[];
};

export type WatchAnatomyProps = {
  active?: boolean;
  lowPower?: boolean;
  dataUrl?: string;
  onMetadata?: (metadata: WatchAnatomyMetadata) => void;
};

function classColor(name: string) {
  if (name.includes('descending')) return '#f4bb70';
  if (name.startsWith('vnc') || name === 'ascending_neuron') return '#769ade';
  if (name.startsWith('ol') || name.startsWith('visual')) return '#66d4ea';
  return '#a29deb';
}

function validateData(value: AnatomyData) {
  const count = value?.displayedSomaCount;
  if (value?.schemaVersion !== 1 || value.classification !== 'STATIC_ANATOMICAL_PREVIEW'
    || !Number.isInteger(count) || count < 1 || count > 50000
    || !Array.isArray(value.positions) || value.positions.length !== count * 3
    || !value.positions.every(Number.isFinite) || value.bodyIds?.length !== count
    || value.classIndices?.length !== count || !Array.isArray(value.classes)
    || !value.classIndices.every(i => Number.isInteger(i) && i >= 0 && i < value.classes.length)
    || !value.bounds?.min?.every(Number.isFinite) || !value.bounds?.max?.every(Number.isFinite)) {
    throw new Error('The anatomical preview could not be verified.');
  }
  for (const skeleton of value.skeletons || []) {
    if (skeleton.positions.length % 3 || skeleton.segments.length % 2
      || !skeleton.positions.every(Number.isFinite)
      || !skeleton.segments.every(i => Number.isInteger(i) && i >= 0 && i < skeleton.positions.length / 3)) {
      throw new Error('The source skeleton coordinates could not be verified.');
    }
  }
  return value;
}

/** Actual source coordinates. Animation moves the camera, never neural activity. */
export default function WatchAnatomy({ active = true, lowPower = false, dataUrl = DEFAULT_DATA_URL, onMetadata }: WatchAnatomyProps) {
  const host = useRef<HTMLDivElement>(null);
  const options = useRef({ active, lowPower });
  const invalidate = useRef<() => void>(() => undefined);
  const metadataCallback = useRef(onMetadata);
  const [data, setData] = useState<AnatomyData | null>(null);
  const [error, setError] = useState('');
  options.current = { active, lowPower };
  metadataCallback.current = onMetadata;

  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    const deadline = setTimeout(() => abort.abort(), 15000);
    setData(null); setError('');
    fetch(dataUrl, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error(`Anatomical data unavailable (${response.status}).`);
      return response.json();
    }).then(value => {
      const verified = validateData(value);
      if (!alive) return;
      setData(verified);
      metadataCallback.current?.({ dataset: verified.dataset, displayedSomaCount: verified.displayedSomaCount,
        availableSomaCount: verified.availableSomaCount, retainedNeuronCount: verified.retainedNeuronCount,
        skeletonCount: verified.skeletons?.length || 0, coordinateUnits: verified.coordinateUnits,
        sourceUrl: verified.source.url, classification: 'STATIC_ANATOMICAL_PREVIEW' });
    }).catch(reason => { if (alive) setError(reason.name === 'AbortError' ? 'Anatomy loading timed out. Reload to retry.' : reason.message); })
      .finally(() => clearTimeout(deadline));
    return () => { alive = false; clearTimeout(deadline); abort.abort(); };
  }, [dataUrl]);

  useEffect(() => {
    if (!data || !host.current) return;
    const node = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      setError('This device cannot display the 3D anatomical preview.'); return;
    }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x07121c, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.setAttribute('aria-label', `${data.displayedSomaCount.toLocaleString()} recorded MaleCNS cell-body locations. Static anatomy, camera rotation only. Drag to rotate and scroll to zoom.`);
    renderer.domElement.setAttribute('role', 'img');
    node.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const center = data.bounds.min.map((p, axis) => (p + data.bounds.max[axis]) / 2);
    const extent = Math.max(...data.bounds.min.map((p, axis) => data.bounds.max[axis] - p));
    const positions = new Float32Array(data.positions.length);
    for (let i = 0; i < positions.length; i++) positions[i] = (data.positions[i] - center[i % 3]) / extent;
    const classColors = data.classes.map(name => new THREE.Color(classColor(name)));
    const colors = new Float32Array(positions.length);
    data.classIndices.forEach((index, i) => classColors[index].toArray(colors, i * 3));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { pointSize: { value: 1.7 } },
      vertexShader: 'attribute vec3 color; varying vec3 pointColor; uniform float pointSize; void main(){pointColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=pointSize;}',
      fragmentShader: 'varying vec3 pointColor; void main(){float d=length(gl_PointCoord-vec2(0.5)); if(d>0.5)discard; float a=0.63*(1.0-smoothstep(0.12,0.5,d)); gl_FragColor=vec4(pointColor,a);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Points(geometry, material));
    const skeletonResources: { geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial }[] = [];
    for (const skeleton of data.skeletons || []) {
      const segments = new Float32Array(skeleton.segments.length * 3);
      for (let i = 0; i < skeleton.segments.length; i++) {
        for (let axis = 0; axis < 3; axis++) segments[i * 3 + axis] = (skeleton.positions[skeleton.segments[i] * 3 + axis] - center[axis]) / extent;
      }
      const tractGeometry = new THREE.BufferGeometry();
      tractGeometry.setAttribute('position', new THREE.BufferAttribute(segments, 3));
      const tractMaterial = new THREE.LineBasicMaterial({ color: skeleton.type.startsWith('DN') ? '#efb16d' : '#86b3d4', transparent: true, opacity: .35, depthWrite: false });
      group.add(new THREE.LineSegments(tractGeometry, tractMaterial));
      skeletonResources.push({ geometry: tractGeometry, material: tractMaterial });
    }

    const camera = new THREE.PerspectiveCamera(34, 1, .01, 20);
    // Source x is horizontal, source z points downward. No anatomical transform
    // is inferred: this only sets a front-facing camera in the released EM frame.
    camera.position.set(.07, 1.84, .015); camera.up.set(0, 0, -1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = false;
    controls.minDistance = .9; controls.maxDistance = 4;
    controls.autoRotateSpeed = .22;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let intersecting = true, frame = 0, lastDraw = 0, dirty = true, disposed = false;

    const requestDraw = () => { dirty = true; if (!frame && !disposed && !document.hidden && intersecting) frame = requestAnimationFrame(draw); };
    const draw = (now: number) => {
      frame = 0;
      if (disposed || document.hidden || !intersecting) return;
      const animated = options.current.active && !motion.matches;
      const interval = 1000 / (options.current.lowPower ? 15 : 30);
      if (now - lastDraw >= interval || !lastDraw) {
        controls.autoRotate = animated;
        if (animated) controls.update(Math.min((now - lastDraw) / 1000, .05));
        if (dirty || animated) { renderer.render(scene, camera); dirty = false; }
        lastDraw = now;
      }
      if ((animated || dirty) && !frame) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const width = Math.max(1, node.clientWidth), height = Math.max(1, node.clientHeight);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`; renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      const anatomicalWidth = (data.bounds.max[0] - data.bounds.min[0]) / extent;
      const distance = Math.max(1.84, anatomicalWidth / (2 * Math.tan(34 * Math.PI / 360) * camera.aspect) * 1.16);
      camera.position.normalize().multiplyScalar(distance);
      controls.minDistance = distance * .5; controls.maxDistance = distance * 2.3;
      material.uniforms.pointSize.value = width < 460 ? 1.25 : 1.7;
      requestDraw();
    };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else { lastDraw = 0; requestDraw(); }
    };
    const observer = new ResizeObserver(resize); observer.observe(node);
    const intersection = new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting ?? true;
      if (!intersecting) { cancelAnimationFrame(frame); frame = 0; }
      else { lastDraw = 0; requestDraw(); }
    });
    intersection.observe(node);
    controls.addEventListener('change', requestDraw);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', requestDraw);
    invalidate.current = requestDraw;
    resize();
    return () => {
      disposed = true; invalidate.current = () => undefined;
      cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', requestDraw);
      controls.removeEventListener('change', requestDraw); controls.dispose();
      geometry.dispose(); material.dispose();
      skeletonResources.forEach(resource => { resource.geometry.dispose(); resource.material.dispose(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [data]);

  useEffect(() => { invalidate.current(); }, [active, lowPower]);

  return <div ref={host} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
    {(!data || error) && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, color: '#a6becb', font: '12px system-ui', textAlign: 'center' }}>{error || 'Loading recorded anatomy…'}</div>}
  </div>;
}
