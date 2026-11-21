import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type manifestType from '../public/assets/manifest.json';
import type { Session } from './domain';
import { nodes } from './domain';
import { findPath, slide } from './navigation';
import type { Obstacle } from './navigation';
import { speech } from './speech';
import { toRevised } from './alphabet.mjs';
import { gazeYaw } from './gaze';
import GalleryAudience from './GalleryAudience';
import {translateText,languageText}from'./i18n';
import { phaseNames } from './court';
import type { CourtPhase } from './court';

const manifestResponse = await fetch('/assets/manifest.json');
if (!manifestResponse.ok) throw Error('Sud zali manifesti yuklanmadi.');
const manifest: typeof manifestType = await manifestResponse.json();

type V3 = [number, number, number];
type Character = typeof manifest.characters[number];
type Marker = { position: number[]; yaw_rad: number };
export const meta = (id: string) => manifest.characters.find(c => c.id === id)!;
const human = manifest.action_map.humans;
const markers = manifest.environment.markers as unknown as Record<string, Marker>;
const reference = markers.CAM_reference as Marker & { target: number[] };
const FEMALE = ['advokat', 'kotib', 'guvoh', 'tomoshabin_ayol', 'tomoshabin_yosh'];

function budgetMaterials(root: THREE.Object3D, maxSize: number, tint?: string) {
  const replacements = new Map<THREE.Texture, THREE.Texture>();
  const tintColor = tint ? new THREE.Color(tint) : null;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    const materials = originals.map(original => {
      const material = original.clone();
      if (tintColor && /clothes/.test(`${material.name} ${object.name}`) && 'color' in material) (material as THREE.MeshStandardMaterial).color.multiply(tintColor);
      for (const [key, value] of Object.entries(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        const image = value.image as { width?: number; height?: number } | undefined;
        if (!image?.width || !image.height || Math.max(image.width, image.height) <= maxSize) continue;
        if (!replacements.has(value)) {
          const scale = maxSize / Math.max(image.width, image.height), canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d')!.drawImage(value.image, 0, 0, canvas.width, canvas.height);
          const texture = value.clone(); texture.image = canvas; texture.needsUpdate = true; replacements.set(value, texture);
        }
        (material as unknown as Record<string, unknown>)[key] = replacements.get(value);
      }
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
  return () => { root.traverse(object => { if (object instanceof THREE.Mesh) for (const m of Array.isArray(object.material) ? object.material : [object.material]) m.dispose(); }); for (const texture of replacements.values()) texture.dispose(); };
}

/** Kept for API compatibility with HuquqBek 0.3; lip-sync now reads speech.level(). */
export function setSpeechLevel(_v: number) { /* no-op */ }

// ======================================================================= room
function removeMedallionBacking(mesh: THREE.Mesh): THREE.BufferGeometry {
  // The gold disc behind the placeholder emblem is merged into the brass mesh; remove it together with the emblem.
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const position = geometry.getAttribute('position'); const kept: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(position, i + k));
    c.divideScalar(3).applyMatrix4(mesh.matrixWorld);
    if (!(Math.abs(c.x) < .95 && c.y > 2.8 && c.y < 4.7 && c.z < -8.7)) kept.push(i, i + 1, i + 2);
  }
  geometry.setIndex(kept); geometry.computeBoundingSphere();
  return geometry;
}

function displayCanvas(phase: string, presented: { id: string; title: string } | null, lessonTitle?: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 576;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, '#1d1611'); g.addColorStop(1, '#3a2617');
  c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
  // Same courthouse motif as the supplied identity, drawn only on the runtime display texture.
  c.save();c.translate(65,45);c.scale(.19,.19);c.fillStyle='#74dfb6';c.beginPath();c.moveTo(115,140);c.lineTo(240,82);c.lineTo(365,140);c.closePath();c.fill();for(const[x,y,w,h]of[[130,154,220,24],[154,197,34,134],[223,197,34,134],[293,197,34,134],[120,350,240,29]]){c.beginPath();c.roundRect(x,y,w,h,6);c.fill();}c.restore();
  c.strokeStyle = '#c9a25a'; c.lineWidth = 6; c.strokeRect(18, 18, 988, 540);
  c.textAlign = 'center'; c.fillStyle = '#e8c27a'; c.font = '600 92px Georgia, serif'; c.fillText('HuquqBek', 512, presented ? 140 : 230);
  c.fillStyle = '#f4ead8'; c.font = lessonTitle ? '25px "Segoe UI", sans-serif' : '34px "Segoe UI", sans-serif'; c.fillText(languageText(lessonTitle?.slice(0,68) || translateText('Interaktiv sud simulyatori')), 512, presented ? 195 : 290, 920);
  c.fillStyle = '#d8c4a0'; c.font = '30px "Segoe UI", sans-serif'; c.fillText(translateText(phase), 512, presented ? 250 : 380);
  if (presented) {
    c.fillStyle = '#f4ead8'; c.fillRect(120, 290, 784, 220); c.fillStyle = '#2a1d14';
    c.font = '600 40px Georgia, serif'; c.fillText(`Dalil ${presented.id}`, 512, 355);
    c.font = '32px Georgia, serif';
    const words = toRevised(presented.title).split(' '); let line = '', y = 410;
    for (const w of words) { if (c.measureText(line + w).width > 720) { c.fillText(line.trim(), 512, y); line = ''; y += 42; } line += w + ' '; }
    c.fillText(line.trim(), 512, y);
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  return t;
}

export function Courtroom({ quality, onWalk, phase = 'preparation', presented = null, lessonTitle }: { quality: string; onWalk: (point: THREE.Vector3) => void; criminal?: boolean; phase?: string; presented?: { id: string; title: string } | null; lessonTitle?: string }) {
  const gltf = useGLTF(quality === 'low' ? manifest.environment.files.lod1 : manifest.environment.files.lod0);
  const room = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.name === 'ENV_Wood_Walnut'; object.receiveShadow = true;
      // Old nameplate and display lettering is redrawn at runtime (case-aware, revised alphabet, HuquqBek brand).
      if (['ENV_Emblem_PLACEHOLDER', 'ENV_Nameplate_Text', 'ENV_Nameplate_Gold', 'ENV_Screen_Text', 'ENV_Screen_Gold'].includes(object.name)) object.visible = false;
      if (object.name === 'ENV_Brass_Gold') object.geometry = removeMedallionBacking(object);
    });
    return scene;
  }, [gltf.scene]);
  useEffect(() => () => { room.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'ENV_Brass_Gold') o.geometry.dispose(); }); }, [room]);
  const label = phaseNames[phase as CourtPhase] || phase;
  useEffect(() => {
    const screen = room.getObjectByName('INTERACT_CourtDisplay_Screen') as THREE.Mesh | undefined;
    if (!screen) return;
    const texture = displayCanvas(label, presented, lessonTitle);
    const old = screen.material as THREE.MeshStandardMaterial;
    const material = old.clone();
    material.map = texture; material.emissiveMap = texture; material.emissive = new THREE.Color('#ffffff'); material.emissiveIntensity = .9;
    screen.material = material;
    return () => { screen.material = old; material.dispose(); texture.dispose(); };
  }, [room, label, presented?.id, presented?.title, lessonTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={room} onClick={(event: { point: THREE.Vector3; object: THREE.Object3D; stopPropagation: () => void }) => { if (event.object.name === 'ENV_Floor_Stone') { event.stopPropagation(); onWalk(event.point); } }} dispose={null}/>;
}

export function Plaque({ text, position, width = .9, rotation = 0 }: { text: string; position: V3; width?: number; rotation?: number }) {
  const label = toRevised(text);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#b8954f'; ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#e3c88f'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 502, 86);
    ctx.fillStyle = '#2b2116'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 38px Georgia, serif'; ctx.fillText(label, 256, 50, 480);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={[0, rotation, 0]}><planeGeometry args={[width, .17]}/><meshStandardMaterial map={texture} roughness={.45} metalness={.35}/></mesh>;
}

/** Case-aware nameplates placed on the actual desk fronts of the exported courtroom. */
export function Plaques({ criminal }: { criminal: boolean }) {
  return <>
    <Plaque text="SUDYA" position={[0, 1.02, -6.355]}/>
    <Plaque text="ADVOKAT" position={[-2.3, .6, -2.0]}/>
    <Plaque text={criminal ? 'JABRLANUVÇI' : 'DAʼVOGAR'} position={[-4.1, .6, -2.0]} width={1.1}/>
    {criminal && <Plaque text="PROKUROR" position={[1.9, .62, -4.6]}/>}
    <Plaque text={criminal ? 'SUDLANUVÇI' : 'JAVOBGAR'} position={[4.92, .62, -2.64]} rotation={-.21} width={1.05}/>
    <Plaque text="GUVOH" position={[4.2, .86, -.52]}/>
    <Plaque text="SUD MAJLISI KOTIBI" position={[4.9, .92, -6.53]} width={1.4}/>
  </>;
}

/** Wall clock above the flag niche; hands follow local time. */
function Clock() {
  const hour = useRef<THREE.Mesh>(null), minute = useRef<THREE.Mesh>(null), second = useRef<THREE.Mesh>(null);
  const face = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!;
    c.fillStyle = '#f3ead9'; c.beginPath(); c.arc(128, 128, 124, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b2116'; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 112 : 98; c.lineWidth = i % 5 ? 2 : 6; c.beginPath(); c.moveTo(128 + Math.sin(a) * r1, 128 - Math.cos(a) * r1); c.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  // Hands pivot at the centre: geometry is shifted so rotation.z turns around one end.
  const geo = (len: number, w: number) => { const g = new THREE.BoxGeometry(w, len, .004); g.translate(0, len / 2 - .02, 0); return g; };
  const hands = useMemo(() => ({ h: geo(.12, .014), m: geo(.18, .009), s: geo(.2, .004) }), []);
  useEffect(() => () => { face.dispose(); hands.h.dispose(); hands.m.dispose(); hands.s.dispose(); }, [face, hands]);
  useFrame(() => {
    const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    if (hour.current) hour.current.rotation.z = -h / 12 * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -m / 60 * Math.PI * 2;
    if (second.current) second.current.rotation.z = -s / 60 * Math.PI * 2;
  });
  return <group position={[-5.55, 4.72, -8.93]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.27, .27, .04, 40]}/><meshStandardMaterial color="#8a6a35" metalness={.7} roughness={.3}/></mesh>
    <mesh position={[0, 0, .021]}><circleGeometry args={[.245, 40]}/><meshStandardMaterial map={face} roughness={.6}/></mesh>
    <mesh ref={hour} geometry={hands.h} position={[0, 0, .028]}><meshStandardMaterial color="#1c1510"/></mesh>
    <mesh ref={minute} geometry={hands.m} position={[0, 0, .032]}><meshStandardMaterial color="#1c1510"/></mesh>
    <mesh ref={second} geometry={hands.s} position={[0, 0, .036]}><meshStandardMaterial color="#9b2f22"/></mesh>
  </group>;
}

// ======================================================================= simple model (CourtView, LegacyApp, player, QonunAI)
export function Model({ asset, seated, talking, walking, reduced, quality, mascot = false }: { asset: Character; seated: boolean; talking: boolean; walking?: RefObject<boolean>; reduced: boolean; quality: string; mascot?: boolean }) {
  // Stable LOD choice: switching LOD when a character starts talking made it vanish and download mid-sentence (bug #8).
  const full = mascot || (quality !== 'low' && ['advokat', 'sudya', 'javobgar', 'prokuror', 'kotib', 'guvoh', 'davogar', 'tomoshabin_yosh', 'tomoshabin_erkak'].includes(asset.id));
  const gltf = useGLTF(full ? asset.files.lod0 : asset.files.lod2 || asset.files.lod1);
  const library = useGLTF(mascot ? asset.files.lod0 : FEMALE.includes(asset.id) ? manifest.animation_libraries.female.file : manifest.animation_libraries.male.file);
  const model = useMemo(() => { const root = clone(gltf.scene); const cleanup = budgetMaterials(root, quality === 'high' ? 2048 : full && quality !== 'low' ? 1024 : 512); root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = asset.id === 'advokat'; o.receiveShadow = true; o.frustumCulled = false; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.transparent) m.depthWrite = false; } }); return { root, cleanup }; }, [gltf.scene, asset.id, quality, full]);
  useEffect(() => model.cleanup, [model]);
  const group = useRef<THREE.Group>(null);
  const clips = useMemo(() => mascot ? gltf.animations : [...library.animations, ...gltf.animations.filter(a => a.name.startsWith('Face_'))], [gltf.animations, library.animations, mascot]);
  const { actions } = useAnimations(clips, group);
  const current = useRef(''), face = useRef('');
  useFrame(() => {
    let desired = mascot ? talking ? manifest.action_map.qonunai.speak : manifest.action_map.qonunai.idle : walking?.current ? human.walk : talking ? human.talk[seated ? 'seated' : 'standing'] : human.idle[seated ? 'seated' : 'standing'];
    if (!actions[desired]) desired = Object.keys(actions).find(a => a.startsWith(seated ? 'Idle_Seated' : 'Idle_Stand')) || Object.keys(actions)[0];
    if (current.current !== desired) { actions[current.current]?.fadeOut(.22); actions[desired]?.reset().fadeIn(.22).play(); current.current = desired; }
    if (actions[desired]) actions[desired]!.paused = reduced;
    if (!mascot && full) {
      const desiredFace = human.face[talking ? 'talk' : 'neutral'];
      if (face.current !== desiredFace && actions[desiredFace]) { actions[face.current]?.fadeOut(.15); actions[desiredFace]!.reset().fadeIn(.15).play(); face.current = desiredFace; }
      model.root.traverse(o => { if (o instanceof THREE.Mesh && o.morphTargetDictionary && o.morphTargetInfluences) { const i = o.morphTargetDictionary.Mouth_Open; if (i !== undefined) o.morphTargetInfluences[i] = talking ? Math.min(1, speech.level() * 1.6) : 0; } });
    }
  });
  return <group ref={group}><primitive object={model.root} dispose={null}/></group>;
}

// ======================================================================= immersive actors
const GESTURE_CLIP: Record<string, string> = { open_hand: 'Gesture_OpenHand', point: 'Gesture_Point', present: 'Present_Evidence', nod: 'Head_Nod', shake: 'Head_Shake', concerned: 'React_Concerned', surprised: 'React_Surprised', objection: 'Objection' };
const EMOTION_FACE: Record<string, string> = { serious: 'Face_Stern', stern: 'Face_Stern', concerned: 'Face_Concerned', nervous: 'Face_Concerned', surprised: 'Face_Surprised', warm: 'Face_Smile' };

export interface ActorSpec {
  content: string; asset: string; pos: V3; yaw: number; seated: boolean; fixed?: boolean; audience?: boolean; tint?: string;
  talkClip: string; idleClip: string; standClearance: number; speakSeated?: boolean;
}
interface ActorProps {
  spec: ActorSpec; speaking: boolean; gesture: string | null; emotion: string | null; standToSpeak: boolean;
  lookTarget: RefObject<THREE.Vector3>; walkGoal?: { pos: V3; yaw: number; key: number } | null; obstacles: Obstacle[];
  quality: string; reduced: boolean; onArrive?: () => void; worldPos?: (p: THREE.Vector3) => void;
}
type ActorState = 'idle' | 'standing_up' | 'speaking' | 'standing' | 'sitting_down' | 'walking';
const STAND_UP_SECONDS = 1.55;

/**
 * Event-driven character: SEATED -> STANDING_UP -> SPEAKING (turn to listener, gesture, talk, lip-sync) -> SITTING_DOWN.
 * Fixed actors (the judge) never walk: walk goals are ignored and the root never leaves its station.
 */
function Actor({ spec, speaking, gesture, emotion, standToSpeak, lookTarget, walkGoal, obstacles, quality, reduced, onArrive, worldPos }: ActorProps) {
  const { gl } = useThree();
  const asset = meta(spec.asset);
  // Speaking roles need LOD0 (mouth morphs); on low quality they fall back to LOD1 (body animation, no lip-sync).
  const gltf = useGLTF(spec.audience ? asset.files.lod2 || asset.files.lod1 : quality === 'low' ? asset.files.lod1 || asset.files.lod0 : asset.files.lod0);
  const library = useGLTF(FEMALE.includes(spec.asset) ? manifest.animation_libraries.female.file : manifest.animation_libraries.male.file);
  const model = useMemo(() => {
    const root = clone(gltf.scene);
    const cleanup = budgetMaterials(root, spec.audience ? 512 : quality === 'high' ? 2048 : 1024, spec.tint);
    const morphs: THREE.Mesh[] = [];
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = !spec.audience && quality !== 'low'; o.receiveShadow = true; o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.transparent) m.depthWrite = false;
      if (o.morphTargetDictionary?.Mouth_Open !== undefined) morphs.push(o);
    });
    return { root, cleanup, morphs, head: root.getObjectByName('mixamorigHead') as THREE.Bone | undefined };
  }, [gltf.scene, quality, spec.audience, spec.tint]);
  useEffect(() => model.cleanup, [model]);
  const clips = useMemo(() => [...library.animations, ...gltf.animations.filter(a => a.name.startsWith('Face_'))], [library.animations, gltf.animations]);
  const outer = useRef<THREE.Group>(null), offset = useRef<THREE.Group>(null), turn = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  // Remove last frame's additive gaze BEFORE the mixer. Constant tracks may skip writes.
  const gazeOffset = useRef(new THREE.Quaternion());
  const undoGaze = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => { if (model.head) model.head.quaternion.multiply(undoGaze.copy(gazeOffset.current).invert()); gazeOffset.current.identity(); });
  const { actions } = useAnimations(clips, body);
  const st = useRef({ state: 'idle' as ActorState, t: 0, current: '', face: '', seated: spec.seated, path: null as [number, number][] | null, goalYaw: spec.yaw, gestureUntil: 0, headYaw: 0, pendingWalk: false, arrived: false });
  const lastWalk = useRef(-1);
  const live = useRef({ speaking, gesture, emotion, standToSpeak }); live.current = { speaking, gesture, emotion, standToSpeak };
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Quaternion(), pq: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) }), []);

  const play = (name: string, { once = false, fade = .25, random = false, speed = 1 } = {}) => {
    const s = st.current; const next = actions[name];
    if (!next || (s.current === name && !once)) return;
    if (s.current) actions[s.current]?.fadeOut(fade);
    next.reset(); next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); next.clampWhenFinished = once;
    next.timeScale = speed; next.fadeIn(fade).play();
    if (random) next.time = Math.random() * next.getClip().duration;
    s.current = name;
  };
  const talkClip = () => st.current.seated ? (spec.idleClip === 'Typing' ? 'Announce' : 'Talk_Seated') : spec.talkClip;
  const startTalk = () => {
    const s = st.current; const g = live.current.gesture ? GESTURE_CLIP[live.current.gesture] : '';
    const name = g ? (s.seated ? (actions[`${g}_Seated`] ? `${g}_Seated` : '') : g) : '';
    if (name && actions[name]) { play(name, { once: true }); s.gestureUntil = Math.min(2.4, actions[name]!.getClip().duration * .9); }
    else { s.gestureUntil = 0; play(talkClip()); }
  };
  const beginWalk = () => {
    const s = st.current; const o = outer.current; if (!o || !walkGoal) return;
    s.path = findPath([o.position.x, o.position.z], [walkGoal.pos[0], walkGoal.pos[2]], obstacles) || [[walkGoal.pos[0], walkGoal.pos[2]]];
    s.state = 'walking'; s.seated = false; s.arrived = false;
    const clipSpeed = (asset.clips as unknown as Record<string, { speed_mps?: number } | undefined>).Walk?.speed_mps || 1.1;
    play('Walk', { speed: 1.05 / clipSpeed }); // timeScale matches stride to root speed: no foot sliding
  };

  // Desynchronised idles: random phase and slightly different speed per actor.
  useEffect(() => { play(spec.idleClip, { random: true, speed: .9 + Math.random() * .2 }); }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!walkGoal || spec.fixed || walkGoal.key === lastWalk.current) return; // fixed actors (judge) never walk
    lastWalk.current = walkGoal.key;
    const s = st.current; s.goalYaw = walkGoal.yaw;
    if (s.seated) { s.pendingWalk = true; s.state = 'standing_up'; s.t = 0; play('Stand_Up', { once: true }); }
    else beginWalk();
  }, [walkGoal?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, .05); const s = st.current; const p = live.current; s.t += dt;
    const o = outer.current, off = offset.current, tr = turn.current; if (!o || !off || !tr) return;
    const stand = Math.min(.32, spec.standClearance);
    const ease = (k: number) => k * k * (3 - 2 * k);
    switch (s.state) {
      case 'idle':
        if (p.speaking) {
          if (s.seated && p.standToSpeak && !spec.speakSeated) { s.state = 'standing_up'; s.t = 0; play('Stand_Up', { once: true }); }
          else { s.state = 'speaking'; s.t = 0; startTalk(); }
        }
        break;
      case 'standing_up': {
        // Stand_Up rises 0.32 m forward; the root slides back (chair pushed back) so the body clears the desk.
        const k = Math.min(1, s.t / STAND_UP_SECONDS); off.position.z = -(.32 - stand) * ease(k);
        if (s.t >= STAND_UP_SECONDS) {
          s.seated = false; off.position.z = stand; // standing clips are centred on the feet
          if (s.pendingWalk) { s.pendingWalk = false; o.position.add(tmp.v.set(0, 0, stand).applyAxisAngle(tmp.up, o.rotation.y)); off.position.z = 0; beginWalk(); }
          else if (p.speaking) { s.state = 'speaking'; s.t = 0; startTalk(); }
          else { s.state = 'sitting_down'; s.t = 0; play('Sit_Down', { once: true }); }
        }
        break;
      }
      case 'speaking':
        if (s.gestureUntil && s.t >= s.gestureUntil) { s.gestureUntil = 0; play(talkClip()); }
        if (!p.speaking) {
          if (spec.seated && !s.seated && !walkGoal) { s.state = 'sitting_down'; s.t = 0; play('Sit_Down', { once: true }); }
          else { s.state = s.seated ? 'idle' : 'standing'; play(s.seated ? spec.idleClip : 'Idle_Stand'); }
        }
        break;
      case 'standing':
        if (p.speaking) { s.state = 'speaking'; s.t = 0; startTalk(); }
        break;
      case 'sitting_down': {
        // Sit_Down starts 0.32 m in front of the seat; slide forward from the cleared position back onto the seat.
        const k = Math.min(1, s.t / STAND_UP_SECONDS); off.position.z = -(.32 - stand) * (1 - ease(k));
        if (s.t >= STAND_UP_SECONDS) { off.position.z = 0; s.seated = true; s.state = 'idle'; play(spec.idleClip, { random: true }); }
        break;
      }
      case 'walking': {
        const path = s.path;
        if (!path?.length) { s.path = null; s.state = 'standing'; play('Idle_Stand'); if (!s.arrived) { s.arrived = true; onArrive?.(); } break; }
        const [tx, tz] = path[0]; const dx = tx - o.position.x, dz = tz - o.position.z, d = Math.hypot(dx, dz);
        const step = 1.05 * dt;
        if (d <= step) { o.position.x = tx; o.position.z = tz; path.shift(); }
        else {
          o.position.x += dx / d * step; o.position.z += dz / d * step;
          const want = Math.atan2(dx, dz); o.rotation.y += Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y)) * Math.min(1, dt * 8);
        }
        break;
      }
    }
    if (s.state === 'standing' && walkGoal) o.rotation.y += Math.atan2(Math.sin(s.goalYaw - o.rotation.y), Math.cos(s.goalYaw - o.rotation.y)) * Math.min(1, dt * 4);
    // A standing speaker turns toward the listener (bounded); otherwise returns to the station orientation.
    let wantTurn = 0;
    if (!s.seated && (s.state === 'speaking' || s.state === 'standing') && lookTarget.current) {
      o.updateMatrixWorld(); tmp.v.copy(lookTarget.current); o.worldToLocal(tmp.v);
      wantTurn = THREE.MathUtils.clamp(Math.atan2(tmp.v.x, tmp.v.z), -1.1, 1.1);
    }
    tr.rotation.y += (wantTurn - tr.rotation.y) * Math.min(1, dt * 3);
    worldPos?.(o.position);
  });

  // Face, mouth and head run after the mixer (this callback is registered after useAnimations').
  useFrame((_, rawDt) => {
    const s = st.current; const p = live.current;
    const talking = p.speaking && s.state === 'speaking';
    const face = talking ? EMOTION_FACE[p.emotion || ''] || 'Face_Talk' : 'Face_Idle';
    if (s.face !== face && actions[face]) { if (s.face) actions[s.face]?.fadeOut(.2); actions[face]!.reset().fadeIn(.2).play(); s.face = face; }
    const level = talking ? Math.min(1, speech.level() * 1.7) : 0; // stops instantly when speech stops
    for (const m of model.morphs) m.morphTargetInfluences![m.morphTargetDictionary!.Mouth_Open] = level;
    const head = model.head, target = lookTarget.current, o = outer.current;
    if (!head || !target || !o || reduced) return;
    head.updateWorldMatrix(true, false); head.getWorldPosition(tmp.v);
    const forward = o.rotation.y + (turn.current?.rotation.y || 0);
    const want = gazeYaw(target.x - tmp.v.x, target.z - tmp.v.z, forward);
    s.headYaw += (want - s.headYaw) * (1 - Math.exp(-Math.min(rawDt, .05) * 4));
    gazeOffset.current.setFromAxisAngle(tmp.up, s.headYaw);
    head.quaternion.multiply(gazeOffset.current);
    // Read-only runtime diagnostics used to verify real animated bones.
    model.root.userData.gazeYaw = s.headYaw;
    if (spec.content === 'CH_CLERK') gl.domElement.dataset.clerkGaze = JSON.stringify({ yaw: s.headYaw, quaternion: head.quaternion.toArray(), target: target.toArray() });

  });

  return <group ref={outer} position={spec.pos} rotation={[0, spec.yaw, 0]}>
    <group ref={offset}><group ref={turn}><group ref={body}><primitive object={model.root} dispose={null}/></group></group></group>
  </group>;
}

// ======================================================================= cast
const seat = (id: string, floor = 0): { pos: V3; yaw: number } => { const m = markers[`SEAT_Chair_${id}`]; return { pos: [m.position[0], floor, m.position[2]], yaw: m.yaw_rad }; };
const spawn = (id: string): { pos: V3; yaw: number } => { const m = markers[`SPAWN_${id}`]; return { pos: m.position as V3, yaw: m.yaw_rad }; };

/** Case- and role-aware cast without duplicate key characters; reused audience bodies get tinted clothing. */
export function resolveCast(playerRole: string | undefined, playerAsset: string | undefined, criminal: boolean): ActorSpec[] {
  const used = new Set<string>(playerAsset ? [playerAsset] : []);
  const pickKey = (prefs: string[]) => { const a = prefs.find(x => !used.has(x)) || prefs[0]; used.add(a); return a; };
  const cast: ActorSpec[] = [];
  if (playerRole !== 'sudya') cast.push({ content: 'CH_JUDGE', asset: pickKey(['sudya']), ...spawn('sudya'), seated: true, fixed: true, talkClip: 'Talk_Standing', idleClip: 'Idle_Seated', standClearance: .32 });
  cast.push({ content: 'CH_CLERK', asset: pickKey(['kotib', 'guvoh']), ...spawn('kotib'), seated: true, speakSeated: true, talkClip: 'Announce', idleClip: 'Typing', standClearance: 0 });
  cast.push({ content: 'CH_SECURITY', asset: pickKey(['qoriqchi']), ...spawn('qoriqchi'), seated: false, talkClip: 'Talk_Standing', idleClip: 'Guard_Idle', standClearance: 0 });
  if (criminal && playerRole !== 'prokuror') cast.push({ content: 'CH_PROSECUTOR', asset: pickKey(['prokuror']), ...spawn('prokuror'), seated: true, talkClip: 'Talk_Standing', idleClip: 'Idle_Seated', standClearance: .13 });
  cast.push({ content: 'CH_RESPONDENT', asset: pickKey(['javobgar', 'davogar']), ...spawn('javobgar'), seated: true, talkClip: 'Talk_Standing', idleClip: 'Idle_Seated', standClearance: .2 });
  if (playerRole !== 'fuqaro') cast.push({ content: criminal ? 'CH_VICTIM' : 'CH_PLAINTIFF', asset: pickKey(['tomoshabin_yosh', 'davogar', 'guvoh']), ...spawn('davogar'), seated: true, talkClip: 'Talk_Standing', idleClip: 'Idle_Seated', standClearance: .1 });
  if (playerRole !== 'advokat') cast.push({ content: 'CH_ADVOCATE', asset: pickKey(['advokat']), ...seat('advokat'), seated: true, talkClip: 'Address_Judge', idleClip: 'Idle_Seated', standClearance: .22 });
  // The witness waits in the front gallery row and walks to the stand when the judge calls them.
  cast.push({ content: 'CH_WITNESS', asset: pickKey(['guvoh', 'tomoshabin_ayol', 'kotib']), pos: [2.0, 0, 2.07], yaw: Math.PI, seated: true, talkClip: 'Talk_Standing', idleClip: 'Idle_Seated_Lap', standClearance: .32 });
  const audience: [string, string[], V3, number, string?][] = [
    ['CH_PUBLIC_1', ['tomoshabin_ayol', 'kotib'], spawn('tomoshabin_ayol').pos, spawn('tomoshabin_ayol').yaw],
    ['CH_PUBLIC_2', ['tomoshabin_erkak', 'davogar'], spawn('tomoshabin_erkak').pos, spawn('tomoshabin_erkak').yaw],
    ['CH_PUBLIC_3', ['tomoshabin_yosh', 'guvoh', 'kotib'], spawn('tomoshabin_yosh').pos, spawn('tomoshabin_yosh').yaw, '#c9d4e6'],
    ['CH_RELATIVE_1', ['davogar', 'tomoshabin_erkak', 'javobgar'], [-2.6, 0, 3.37], Math.PI, '#7d8a73'],
    ['CH_RELATIVE_2', ['kotib', 'guvoh', 'tomoshabin_ayol'], [5.3, 0, 4.67], Math.PI - .08, '#b48a6a'],
    ['CH_VISITOR_1', ['javobgar', 'davogar', 'tomoshabin_erkak'], [-5.6, 0, 4.67], Math.PI + .06, '#5e6f86'],
  ];
  for (const [content, prefs, pos, yaw, tint] of audience) {
    const asset = prefs.find(x => x !== playerAsset) || prefs[0];
    const dup = cast.some(c => c.asset === asset);
    cast.push({ content, asset, pos, yaw, seated: true, audience: true, tint: tint || (dup ? '#9aa6b5' : undefined), talkClip: 'Talk_Seated', idleClip: 'Idle_Seated_Lap', standClearance: 0, speakSeated: true });
  }
  return cast;
}

// ======================================================================= immersive world
export interface ImmersiveProps {
  prosecutorPresent?:boolean;
  fullTrial?: boolean;
  learningCast?: boolean;
  lessonTitle?: string;
  screen: 'immersive'; playerRole: string; playerAsset: string; criminal: boolean; blocked: boolean; quality: string; reduced: boolean;
  activeActor: string; speakerId: string; speaking: boolean; gesture: string | null; emotion: string | null; animation: string | null;
  witnessCalled: boolean; phase: string; presented: { id: string; title: string; at: number } | null;
  joystick: RefObject<{ x: number; y: number }>; playerTalking: boolean;
  onInteract: (id: string) => void; onNear: (id: string) => void; onFailure: () => void; onWitnessArrived?: () => void;
}

function ImmersiveWorld(props: ImmersiveProps) {
  const { camera, gl } = useThree();
  const colliders = useGLTF(manifest.environment.files.colliders);
  const obstacles = useMemo<Obstacle[]>(() => {
    colliders.scene.updateMatrixWorld(true); const boxes: Obstacle[] = [];
    colliders.scene.traverse(o => { if (o instanceof THREE.Mesh && !/Wall/.test(o.name)) { const b = new THREE.Box3().setFromObject(o); boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }); } });
    return boxes;
  }, [colliders.scene]);
  const witnessAtStart = useRef(props.witnessCalled); // resumed session: the witness is already at the stand
  const cast = useMemo(() => {
    if(props.fullTrial){const actors=resolveCast(props.playerRole,props.playerAsset,props.criminal).filter(a=>!a.audience);for(const a of actors)if(a.content==='CH_WITNESS'){a.pos=witnessAtStart.current?spawn('guvoh').pos:[markers.POINT_gallery_gate.position[0],0,markers.POINT_gallery_gate.position[2]+5.5];a.seated=false;a.idleClip=human.idle.standing;}if(props.prosecutorPresent&&props.playerRole!=='prokuror'&&!actors.some(a=>a.content==='CH_PROSECUTOR'))actors.push({content:'CH_PROSECUTOR',asset:'prokuror',...spawn('prokuror'),seated:true,talkClip:human.talk.standing,idleClip:human.idle.seated,standClearance:.13});const opposite=spawn('javobgar');actors.push({content:'CH_OPPOSING_COUNSEL',asset:'tomoshabin_erkak',pos:[opposite.pos[0]-1.15,0,opposite.pos[2]],yaw:opposite.yaw,seated:true,talkClip:human.talk.standing,idleClip:human.idle.seated,standClearance:.16});return actors;}
    if (props.learningCast) {
      const own: Record<string,string> = {advokat:'CH_ADVOCATE',sudya:'CH_JUDGE',prokuror:'CH_PROSECUTOR'};
      return resolveCast('fuqaro', props.playerAsset, true).filter(a => ['CH_ADVOCATE','CH_JUDGE','CH_PROSECUTOR'].includes(a.content) && a.content !== own[props.playerRole]);
    }
    return resolveCast(props.playerRole, props.playerAsset, props.criminal).map(a => a.content === 'CH_WITNESS' && witnessAtStart.current
      ? { ...a, pos: [4.75, 0, -.12] as V3, yaw: Math.PI, seated: false, idleClip: 'Idle_Stand' } : a);
  }, [props.playerRole, props.playerAsset, props.criminal, props.learningCast,props.fullTrial,props.prosecutorPresent]);
  const judgePlayer = props.playerRole === 'sudya';
  const startPos: Record<string, V3> = { advokat: [-2.05, 0, -3.45], fuqaro: [-4.3, 0, -3.35], prokuror: [1.9, 0, -6.0], sudya: spawn('sudya').pos };
  const hero = useRef<THREE.Group>(null);
  const positions = useRef(new Map<string, THREE.Vector3>());
  const moving = useRef(false), keys = useRef(new Set<string>()), yaw = useRef(0), pitch = useRef(.24);
  const target = useRef<THREE.Vector3 | null>(null);
  const drag = useRef<{ x: number; y: number; total: number } | null>(null);
  const interacted = useRef(''), nearest = useRef('');
  const velocity = useRef(new THREE.Vector2());
  const current = useRef(props); current.current = props;
  const gazeTargets = useMemo(() => new Map(cast.map(a => [a.content, { current: new THREE.Vector3(0, 1.45, 0) }])), [cast]);
  const lookAt = useRef(new THREE.Vector3(...reference.target as V3));
  const evidenceShot = useRef(0);
  const frame = useRef(0);
  const witnessGoal = useMemo(() => props.witnessCalled && !witnessAtStart.current ? { pos: [4.75, 0, -.12] as V3, yaw: Math.PI, key: 1 } : null, [props.witnessCalled]);
  useEffect(() => { if (props.presented) evidenceShot.current = 2.8; }, [props.presented?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[role="dialog"]')) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      keys.current.add(e.code);
      if (e.code === 'KeyE' && !current.current.blocked && nearest.current) current.current.onInteract(nearest.current);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => { keys.current.clear(); drag.current = null; };
    const pointerDown = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, total: 0 }; };
    const pointerMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current.total += Math.abs(dx) + Math.abs(dy);
      yaw.current -= dx * .005; pitch.current = THREE.MathUtils.clamp(pitch.current + dy * .003, -.1, .8); drag.current.x = e.clientX; drag.current.y = e.clientY;
    };
    const pointerUp = () => { interacted.current = (drag.current?.total || 0) > 5 ? 'drag' : ''; drag.current = null; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    gl.domElement.addEventListener('pointerdown', pointerDown); window.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp);
    const lost = (event: Event) => { event.preventDefault(); current.current.onFailure(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); gl.domElement.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp); gl.domElement.removeEventListener('webglcontextlost', lost); };
  }, [gl]);
  useEffect(() => { keys.current.clear(); target.current = null; }, [props.blocked]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, .05), p = hero.current; if (!p) return;
    const P = current.current;
    const free = !P.blocked && !judgePlayer; // a player-judge never walks
    const input = new THREE.Vector2();
    if (free) {
      input.x = Number(keys.current.has('KeyD') || keys.current.has('ArrowRight')) - Number(keys.current.has('KeyA') || keys.current.has('ArrowLeft'));
      input.y = Number(keys.current.has('KeyS') || keys.current.has('ArrowDown')) - Number(keys.current.has('KeyW') || keys.current.has('ArrowUp'));
      const j = P.joystick.current; if (j && (Math.abs(j.x) > .08 || Math.abs(j.y) > .08)) { input.x = j.x; input.y = j.y; }
      if (input.lengthSq()) { if (input.lengthSq() > 1) input.normalize(); target.current = null; }
      else if (target.current) { const d = target.current.clone().sub(p.position); if (d.length() > .15) input.set(d.x, d.z).normalize().rotateAround(new THREE.Vector2(), yaw.current); else target.current = null; }
    }
    input.rotateAround(new THREE.Vector2(), -yaw.current);
    const speed = keys.current.has('ShiftLeft') ? 2.6 : 1.25;
    velocity.current.lerp(input.multiplyScalar(speed), 1 - Math.exp(-dt * 10)); if (!free) velocity.current.set(0, 0);
    const old = p.position.clone();
    const [x, z] = slide(p.position.x, p.position.z, velocity.current.x * dt, velocity.current.y * dt, obstacles);
    p.position.set(x, p.position.y, z); moving.current = old.distanceToSquared(p.position) > 1e-6;
    if (moving.current) { const dir = Math.atan2(velocity.current.x, velocity.current.y); p.rotation.y += Math.atan2(Math.sin(dir - p.rotation.y), Math.cos(dir - p.rotation.y)) * (1 - Math.exp(-dt * 12)); }
    positions.current.set('PLAYER', p.position);
    let near = '', distance = judgePlayer ? 0 : 2.5;
    for (const a of cast) { if (a.audience||(P.fullTrial&&a.content==='CH_WITNESS'&&!P.witnessCalled)) continue; const pos = positions.current.get(a.content); if (!pos) continue; const d = p.position.distanceTo(pos); if (d < distance) { near = a.content; distance = d; } }
    if (near !== nearest.current) { nearest.current = near; P.onNear(near); }
    const speakerPos = P.playerTalking ? p.position : positions.current.get(P.speakerId) || positions.current.get(P.activeActor) || p.position;
    for (const spec of cast) {
      const own = positions.current.get(spec.content);
      // A speaker addresses the player; listeners follow the speaker. Never target self.
      const listener = spec.content === P.speakerId || spec.content === P.activeActor ? p.position : speakerPos;
      const target = gazeTargets.get(spec.content)!.current;
      if (!P.speaking && !P.playerTalking && spec.content === 'CH_CLERK' && own) target.set(own.x + Math.sin(spec.yaw) * 2, 1.1, own.z + Math.cos(spec.yaw) * 2);
      else target.set(listener.x, 1.45, listener.z);
    }
    // ---- cameras: evidence shot, judge POV, speaker close-up, third-person follow
    const view = new THREE.Vector3(), aim = new THREE.Vector3();
    evidenceShot.current = Math.max(0, evidenceShot.current - dt);
    const focusId = P.speaking ? P.speakerId : P.activeActor;
    const focus = focusId && focusId !== 'CH_QONUNAI' ? positions.current.get(focusId) : undefined;
    const fspec = cast.find(c => c.content === focusId);
    if (evidenceShot.current > 0) { view.set(3.4, 2.9, -5.4); aim.set(5.5, 3.5, -8.9); }
    else if (judgePlayer) {
      view.set(0, 1.85, -7.3);
      if (P.blocked && focus) aim.set(focus.x, 1.2, focus.z);
      else aim.set(Math.sin(yaw.current) * 7, 1.1 - pitch.current * 2, -7.3 + Math.cos(yaw.current) * 7);
    } else if (P.blocked && focus && fspec) {
      const fy = fspec.yaw, judge = fspec.content === 'CH_JUDGE';
      const dist = judge ? 2.6 : 2.1;
      view.set(focus.x + Math.sin(fy) * dist + Math.cos(fy) * .55, judge ? 1.95 : 1.55, focus.z + Math.cos(fy) * dist - Math.sin(fy) * .55);
      view.x = THREE.MathUtils.clamp(view.x, -6.9, 6.9); view.z = THREE.MathUtils.clamp(view.z, -5.9, 5.7);
      aim.set(focus.x, (judge ? .45 : 0) + (fspec.seated ? 1.15 : 1.45), focus.z);
    } else {
      view.copy(p.position).add(new THREE.Vector3(Math.sin(yaw.current) * 3.2, 1.6 + pitch.current * 3, Math.cos(yaw.current) * 3.2));
      view.x = THREE.MathUtils.clamp(view.x, -6.9, 6.9); view.z = THREE.MathUtils.clamp(view.z, -5.9, 5.7);
      aim.copy(p.position).add(new THREE.Vector3(0, 1.1, 0));
    }
    const blend = P.reduced ? 1 : 1 - Math.exp(-dt * 2.6);
    camera.position.lerp(view, blend); lookAt.current.lerp(aim, blend); camera.lookAt(lookAt.current);
    gl.domElement.dataset.visitorCount=props.fullTrial?'24':'0';
    gl.domElement.dataset.playerPosition = p.position.toArray().map(v => v.toFixed(2)).join(',');
    if ((frame.current = (frame.current + 1) % 30) === 0) gl.domElement.dataset.cast = JSON.stringify(Object.fromEntries([...positions.current].map(([k, v]) => [k, [+v.x.toFixed(2), +v.z.toFixed(2)]])));
    gl.domElement.dataset.renderStats = JSON.stringify({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries });
  });

  const quality = props.quality;
  const start = startPos[props.playerRole] || startPos.advokat;
  const qonunai = spawn('qonunai');
  return <>
    <hemisphereLight args={['#fff1de', '#4a3526', 1.05]}/><ambientLight intensity={.22}/>
    <directionalLight position={[8, 6, -2]} intensity={2.4} color="#ffefd6" castShadow={quality !== 'low'} shadow-mapSize-width={quality === 'high' ? 2048 : 1024} shadow-mapSize-height={quality === 'high' ? 2048 : 1024} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-normalBias={.035}/>
    <pointLight position={[0, 4.5, -3]} intensity={50} distance={15} color="#ffe9cc"/><pointLight position={[-4, 3, -5]} intensity={32} distance={10} color="#ffd9a8"/><pointLight position={[4, 3, -6]} intensity={32} distance={10} color="#ffd9a8"/>
    <Courtroom quality={quality} lessonTitle={props.lessonTitle} criminal={props.criminal} phase={props.phase} presented={props.presented} onWalk={point => { if (!props.blocked && !judgePlayer && interacted.current !== 'drag') target.current = point.clone().setY(0); }}/>
    <Plaques criminal={props.criminal}/>
    <Clock/>
    <group ref={hero} position={start} rotation={[0, judgePlayer ? 0 : Math.PI, 0]}>
      <Model asset={meta(props.playerAsset || 'advokat')} seated={judgePlayer} talking={props.playerTalking} walking={moving} quality={quality} reduced={props.reduced}/>
    </group>
    {props.fullTrial&&<PublicGallery/>}
    {cast.map(spec => <Suspense key={spec.content} fallback={null}>
      <group visible={!props.fullTrial||spec.content!=='CH_WITNESS'||props.witnessCalled} onClick={e => { e.stopPropagation(); if (!props.blocked && !spec.audience) props.onInteract(spec.content); }}>
        <Actor spec={spec} speaking={props.speaking && props.speakerId === spec.content} gesture={props.gesture} emotion={props.emotion}
          standToSpeak={props.animation !== 'speak_seated'} lookTarget={gazeTargets.get(spec.content)!} quality={quality} reduced={props.reduced} obstacles={obstacles}
          walkGoal={spec.content === 'CH_WITNESS' ? witnessGoal : null} onArrive={spec.content === 'CH_WITNESS' ? props.onWitnessArrived : undefined}
          worldPos={v => { const m = positions.current.get(spec.content); if (m) m.copy(v); else positions.current.set(spec.content, v.clone()); }}/>
      </group>
      {!spec.audience && (!props.fullTrial||spec.content!=='CH_WITNESS'||props.witnessCalled)&& <NearLabel id={spec.content} nearest={nearest} positions={positions} blocked={props.blocked} onInteract={props.onInteract}/>}
    </Suspense>)}
    {!props.learningCast && <Suspense fallback={null}><group position={qonunai.pos} rotation={[0, qonunai.yaw, 0]} onClick={e => { e.stopPropagation(); props.onInteract('CH_QONUNAI'); }}>
      <Model asset={meta('qonunai')} seated={false} talking={props.speaking && props.speakerId === 'CH_QONUNAI'} quality={quality} reduced={props.reduced} mascot/>
    </group></Suspense>}
  </>;
}

function NearLabel({ id, nearest, positions, blocked, onInteract }: { id: string; nearest: RefObject<string>; positions: RefObject<Map<string, THREE.Vector3>>; blocked: boolean; onInteract: (id: string) => void }) {
  // drei <Html> ignores parent visibility, so the label is mounted only while this actor is the nearest one.
  const group = useRef<THREE.Group>(null);
  const [shown, setShown] = useState(false);
  useFrame(() => { const g = group.current; const p = positions.current.get(id); if (g && p) g.position.set(p.x, 1.95, p.z); const on = !blocked && nearest.current === id; if (on !== shown) setShown(on); });
  return <group ref={group}>{shown && <Html center zIndexRange={[20, 0]}><button className="npc-label" onClick={() => onInteract(id)}>E · Gaplaşiş</button></Html>}</group>;
}

// ======================================================================= legacy world (LegacyApp)
interface Props { playerAsset?: string; playerRole?: string; speakerId?: string; speaking?: boolean; criminal?: boolean; screen: string; session: Session; blocked: boolean; seated: boolean; quality: string; reduced: boolean; onInteract: (id: string) => void; onNear: (id: string) => void; onFailure: () => void }
const actorMap = [
  { content: 'CH_JUDGE', asset: 'sudya', station: 'sudya', seated: true },
  { content: 'CH_PLAINTIFF', asset: 'tomoshabin_yosh', station: 'davogar', seated: true },
  { content: 'CH_RESPONDENT', asset: 'javobgar', station: 'javobgar', seated: true },
  { content: 'CH_CLERK', asset: 'kotib', station: 'kotib', seated: true },
  { content: 'CH_SECURITY', asset: 'qoriqchi', station: 'qoriqchi', seated: false },
  { content: 'CH_PUBLIC_1', asset: 'tomoshabin_ayol', station: 'tomoshabin_ayol', seated: true },
  { content: 'CH_PUBLIC_2', asset: 'tomoshabin_erkak', station: 'tomoshabin_erkak', seated: true },
];
function LegacyWorld(props: Props) {
  const { camera, gl } = useThree();
  const colliders = useGLTF(manifest.environment.files.colliders);
  const obstacles = useMemo<Obstacle[]>(() => { colliders.scene.updateMatrixWorld(true); const boxes: Obstacle[] = []; colliders.scene.traverse(o => { if (o instanceof THREE.Mesh && !/Wall/.test(o.name)) { const b = new THREE.Box3().setFromObject(o); boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }); } }); return boxes; }, [colliders.scene]);
  const hero = useRef<THREE.Group>(null);
  const moving = useRef(false), keys = useRef(new Set<string>()), yaw = useRef(0), pitch = useRef(.24);
  const target = useRef<THREE.Vector3 | null>(null), drag = useRef<{ x: number; y: number; total: number } | null>(null);
  const interacted = useRef(''), nearest = useRef('');
  const velocity = useRef(new THREE.Vector2());
  const baseNode = nodes.get(props.session.case.nodeId)!; const node = { ...baseNode, speaker: props.speakerId || baseNode.speaker };
  const currentProps = useRef(props); currentProps.current = props;
  const lookAt = useRef(new THREE.Vector3(...reference.target as V3));
  useEffect(() => {
    function down(e: KeyboardEvent) { if (e.target instanceof Element && e.target.closest('input,textarea,select,[role="dialog"]')) return; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); keys.current.add(e.code); if (e.code === 'KeyE' && !currentProps.current.blocked && nearest.current) currentProps.current.onInteract(nearest.current); }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code); const clear = () => { keys.current.clear(); drag.current = null; };
    const pointerDown = (e: PointerEvent) => { if (!currentProps.current.blocked) drag.current = { x: e.clientX, y: e.clientY, total: 0 }; };
    const pointerMove = (e: PointerEvent) => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current.total += Math.abs(dx) + Math.abs(dy); yaw.current -= dx * .005; pitch.current = THREE.MathUtils.clamp(pitch.current + dy * .003, -.1, .8); drag.current.x = e.clientX; drag.current.y = e.clientY; };
    const pointerUp = () => { interacted.current = (drag.current?.total || 0) > 5 ? 'drag' : ''; drag.current = null; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    gl.domElement.addEventListener('pointerdown', pointerDown); window.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp);
    const lost = (event: Event) => { event.preventDefault(); currentProps.current.onFailure(); }; gl.domElement.addEventListener('webglcontextlost', lost);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); gl.domElement.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp); gl.domElement.removeEventListener('webglcontextlost', lost); };
  }, [gl]);
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, .05), p = hero.current; if (!p) return;
    const free = props.screen === 'game' && !props.blocked && !props.seated && props.session.case.phase === 'preparation';
    const input = new THREE.Vector2();
    if (free) { input.x = Number(keys.current.has('KeyD') || keys.current.has('ArrowRight')) - Number(keys.current.has('KeyA') || keys.current.has('ArrowLeft')); input.y = Number(keys.current.has('KeyS') || keys.current.has('ArrowDown')) - Number(keys.current.has('KeyW') || keys.current.has('ArrowUp')); if (input.lengthSq()) { input.normalize(); target.current = null; } else if (target.current) { const d = target.current.clone().sub(p.position); if (d.length() > .15) input.set(d.x, d.z).normalize().rotateAround(new THREE.Vector2(), yaw.current); else target.current = null; } }
    input.rotateAround(new THREE.Vector2(), -yaw.current);
    velocity.current.lerp(input.multiplyScalar(1.25), 1 - Math.exp(-dt * 10)); if (!free) velocity.current.set(0, 0);
    const old = p.position.clone(); const [x, z] = slide(p.position.x, p.position.z, velocity.current.x * dt, velocity.current.y * dt, obstacles); p.position.set(x, 0, z); moving.current = old.distanceToSquared(p.position) > 1e-6;
    let near = '', distance = 2.5; for (const actor of actorMap) { const d = p.position.distanceTo(new THREE.Vector3(...meta(actor.station).spawn.position as V3)); if (d < distance) { near = actor.content; distance = d; } }
    if (near !== nearest.current) { nearest.current = near; props.onNear(near); }
    const view = new THREE.Vector3(...reference.position as V3), aim = new THREE.Vector3(...reference.target as V3);
    if (props.screen === 'menu' || props.screen === 'roles') { view.set(-.3, 1.75, 2.5); aim.set(.8, 1.65, -6.5); }
    else if (!props.blocked && !props.seated) { view.copy(p.position).add(new THREE.Vector3(Math.sin(yaw.current) * 3.2, 1.6 + pitch.current * 3, Math.cos(yaw.current) * 3.2)); view.x = THREE.MathUtils.clamp(view.x, -6.9, 6.9); view.z = THREE.MathUtils.clamp(view.z, -5.9, 5.7); aim.copy(p.position).add(new THREE.Vector3(0, 1.1, 0)); }
    else if (props.screen === 'game') { if (node.speaker === 'CH_PLAINTIFF') { view.set(-1.3, 1.5, -.25); aim.set(-4.75, 1, -2.75); } else if (node.speaker === 'CH_RESPONDENT') { view.set(3.2, 1.5, -1.4); aim.set(5, 1.1, -3.72); } else if (node.speaker === 'CH_JUDGE') { view.set(-.25, 1.7, -2.8); aim.set(0, 1.65, -7.62); } }
    const blend = props.reduced ? 1 : 1 - Math.exp(-dt * 3); camera.position.lerp(view, blend); lookAt.current.lerp(aim, blend); camera.lookAt(lookAt.current);
  });
  const hearing = ['hearing', 'outcome', 'debrief', 'complete'].includes(props.session.case.phase);
  return <>
    <hemisphereLight args={['#fff4e6', '#5a4635', 1.15]}/><ambientLight intensity={.25}/>
    <directionalLight position={[8, 6, -2]} intensity={2.2} color="#fff1dd" castShadow={props.quality !== 'low'}/>
    <pointLight position={[0, 4.5, -3]} intensity={55} distance={15} color="#fff2dd"/>
    <Courtroom quality={props.quality} onWalk={point => { if (!props.blocked && !props.seated && !hearing && interacted.current !== 'drag') target.current = point.clone().setY(0); }}/>
    <Plaques criminal={false}/>
    <group ref={hero} position={[-.45, 0, .3]} rotation={[0, Math.PI, 0]}><Model asset={meta(props.playerAsset || 'advokat')} seated={hearing && props.seated} talking={node.speaker === 'CH_ADVOCATE' && props.blocked} walking={moving} quality={props.quality} reduced={props.reduced}/></group>
    {actorMap.map(actor => { const station = meta(actor.station).spawn; return <Suspense key={actor.content} fallback={null}><group position={station.position as V3} rotation={[0, station.yaw_rad, 0]} onClick={e => { e.stopPropagation(); if (!props.blocked && nearest.current === actor.content) props.onInteract(actor.content); }}><Model asset={meta(actor.asset)} seated={actor.seated} talking={props.screen === 'game' && !!props.speaking && node.speaker === actor.content} quality={props.quality} reduced={props.reduced}/></group></Suspense>; })}
  </>;
}

export default function Scene(props: Props | ImmersiveProps) {
  const immersive = props.screen === 'immersive';
  const quality = props.quality;
  return <Canvas shadows={quality !== 'low' ? { type: THREE.PCFShadowMap } : false} dpr={quality === 'high' ? [1, 1.5] : [1, 1.25]} camera={{ position: reference.position as V3, fov: 55, near: .08, far: 60 }} gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }} onCreated={({ gl }) => { gl.setClearColor('#2a201a'); gl.domElement.setAttribute('aria-label', 'HuquqBek interaktiv 3D sud zali'); }} fallback={<div className="scene-loading">3D mavjud emas. Matnli rejimdan foydalaning.</div>}>
    <Suspense fallback={null}>{immersive ? <ImmersiveWorld {...props as ImmersiveProps}/> : <LegacyWorld {...props as Props}/>}</Suspense>
  </Canvas>;
}

function PublicGallery(){const seats=useMemo(()=>{const front=spawn('tomoshabin_ayol').pos[2],middle=spawn('tomoshabin_yosh').pos[2],rows=[front,middle,middle+(middle-front)];return rows.flatMap(z=>[-5.15,-4.12,-3.09,-2.06,2.06,3.09,4.12,5.15].map(x=>({pos:[x,0,z]as V3,yaw:Math.PI})));},[]);return <>{['tomoshabin_ayol','tomoshabin_erkak','tomoshabin_yosh'].map((id,i)=><Suspense key={id} fallback={null}><GalleryAudience assetFile={meta(id).files.lod2||meta(id).files.lod1} animationFile={FEMALE.includes(id)?manifest.animation_libraries.female.file:manifest.animation_libraries.male.file} clipName={human.idle.seated} seats={seats.filter((_,n)=>n%3===i)} tint={['#a8b4ab','#8198ad','#c4b99b'][i]}/></Suspense>)}</>;}
