# QonunVerse 3D assets: integration guide for Codex (React Three Fiber)

This guide is for the agent wiring the assets into the website. **Do not edit anything under `blender/`
or `public/assets/` by hand.** Regenerate them with `run_pipeline.ps1`. Everything you need at runtime
is described in **`public/assets/manifest.json`**.

## 1. Files

| Path | What it is |
|---|---|
| `public/assets/environment/courtroom.glb` | Courtroom. Static meshes are merged by material (~29 draw calls). Includes interactive nodes `INTERACT_*` and marker nodes. |
| `public/assets/environment/courtroom_lod1.glb` | Same room without small props, for low-end and mobile devices. |
| `public/assets/environment/courtroom_colliders.glb` | Invisible boxes (`COL_*`) for physics and navigation. Never render it. |
| `public/assets/characters/<id>.glb` | LOD0: skinned human, 18 face morphs, all of the character's clips. |
| `public/assets/characters/<id>_lod1.glb`, `_lod2.glb` | About 45% and 18% of the triangles. Skeleton only, with **no clips and no morphs**. |
| `public/assets/characters/qonunai.glb` (+ `_lod1`) | QonunAI mascot: own small rig, 5 morphs, 9 clips. |
| `public/assets/characters/qonunai_portrait.png` | 512 px transparent still for the UI when WebGL is unavailable. |
| `public/assets/animations/qv_{female,male}_clips.glb` | Skeleton plus **every** procedural clip, for reuse on any Mixamo-named rig. |
| `public/assets/manifest.json` | Spawns, markers, clip list per character, action map, lighting hints. |
| `public/assets/LICENSES.json` | Asset licences. |
| `public/assets/validation_report.json` | Budgets and per-file stats. |

Character ids: `sudya` (judge), `advokat` (defence lawyer), `prokuror` (prosecutor), `davogar` (plaintiff),
`javobgar` (defendant, plaque "AYBLANUVCHI"), `guvoh` (witness), `kotib` (clerk), `qoriqchi` (security),
`tomoshabin_ayol`, `tomoshabin_erkak`, `tomoshabin_yosh` (spectators), `qonunai` (guide).

## 2. Coordinates
* Metres, +Y up, three.js space. All manifest positions are already converted.
* The judge's bench is at −Z and the public gallery at +Z.
* A character at `yaw_rad = 0` faces **+Z** (toward the gallery). Apply `rotation.y = spawn.yaw_rad`.
* Do not rescale models. Humans are 1.55–1.85 m tall and QonunAI is about 1 m tall.

## 3. Loading (drei)
```tsx
import { useGLTF, useAnimations, Clone } from '@react-three/drei'
import manifest from '/public/assets/manifest.json'   // or fetch('/assets/manifest.json')

function Courtroom() {
  const { scene } = useGLTF('/assets/environment/courtroom.glb')
  return <primitive object={scene} />
}

function Character({ id, clip = 'Idle_Seated', face = 'Face_Idle' }) {
  const meta = manifest.characters.find(c => c.id === id)!
  const { scene, animations } = useGLTF(meta.files.lod0)
  const group = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions[clip]?.reset().fadeIn(0.3).play()
    actions[face]?.reset().play()              // face layer: morph-only clip, plays alongside
    return () => { actions[clip]?.fadeOut(0.3); actions[face]?.stop() }
  }, [clip, face])
  return <group ref={group} position={meta.spawn.position} rotation-y={meta.spawn.yaw_rad}>
    <primitive object={scene} />
  </group>
}
useGLTF.preload('/assets/environment/courtroom.glb')
```
* Use `SkeletonUtils.clone` (drei `<Clone>` does not deep-clone skinned meshes) when you need the same model twice.
* Set `castShadow` and `receiveShadow` on meshes yourself. The GLBs do not contain lights.

## 4. Clips
Body clip names come from `manifest.characters[i].clips`. Each entry has `duration_s`, `loop` and optional meta:

| Meta key | Meaning |
|---|---|
| `layer: "face"` | Morph-only clip (`Face_Idle`, `Face_Talk`, `Face_Smile`, `Face_Concerned`, `Face_Surprised`, `Face_Stern`, `Face_Blink`). Run **one** face clip at a time on top of the body clip. Every face clip already includes blinking. |
| `face_clip` | Suggested face clip for this body clip (talking clips → `Face_Talk`). |
| `speed_mps` | `Walk` is in place. Move the root at this speed (about 1.2 m/s) and set `timeScale` if you change it. |
| `root_yaw_delta_deg` | `Turn_Left_90` and `Turn_Right_90` rotate the hips in the clip. When the clip ends, add the delta to the root's `rotation.y` and cross-fade to idle. |
| `start_offset_m` / `end_offset_m` | `Sit_Down` starts standing 0.32 m in front of the seat. Place the root on the **seat marker** and cross-fade from `Walk` or `Idle_Stand` while the character stands at `seat + forward*0.32`. `Stand_Up` is the reverse. |
| `prop_socket`, `events` | `Present_Evidence`: attach the evidence folder to bone `mixamorigRightHand` at `events.grab` seconds and hand it over at `events.handover`. |

Use `manifest.action_map.humans` so gameplay code never hard-codes clip strings. For example,
`action_map.humans.nod.seated → "Head_Nod_Seated"`.
Gestures, reactions and head moves exist in standing and `_Seated` versions, and both are full-body.

Advocate beat (the hero scene). Waypoints are `WAYPOINT_advokat_0..3` in `manifest.environment.markers`:
`Idle_Seated` → `Stand_Up` → `Walk` (follow waypoints, `Turn_*` at corners) → `Address_Judge` + `Face_Talk`
→ `Present_Evidence` at `POINT_evidence_handover` → `Walk` back → `Sit_Down`.

### Bone names
GLTFLoader turns `mixamorig:Hips` into **`mixamorigHips`**, the same names three.js uses for Mixamo FBX.
Any clip from `qv_*_clips.glb` or licensed Mixamo FBX clips therefore play directly on every human:
```ts
const lib = useGLTF('/assets/animations/qv_female_clips.glb')
mixer.clipAction(lib.animations.find(a => a.name === 'Objection')!, characterRoot).play()
```

### LODs
```ts
const lod = new THREE.LOD()
lod.addLevel(lod0Scene, 0); lod.addLevel(lod1Scene, 9); lod.addLevel(lod2Scene, 18)
// drive all levels from LOD0's clips: one AnimationMixer per level root, same clip objects
```
Spectators can use LOD1 at all times on mobile.

## 5. Markers (`manifest.environment.markers`, also nodes inside courtroom.glb with `userData`)
| Prefix | Use |
|---|---|
| `SPAWN_<id>` | Station of each role (`pose`: seated, standing or floating) |
| `SEAT_Chair_<id>` | Seat origin for `Sit_Down` / `Stand_Up` (`seat_height` in userData) |
| `WAYPOINT_<path>_<n>` | Ordered paths (`advokat_to_bench`, `witness_entry`, `gallery_gate`) |
| `POINT_*` | Interaction spots (evidence handover, security door) |
| `PROP_*` | Pickable props (evidence folders) |
| `CAM_*` | Camera presets with `fov_deg` and `target`. `CAM_reference` reproduces the concept art. |

Interactive nodes in `courtroom.glb`:
* `INTERACT_*_Leaf*`: door leaves, with the pivot at the object origin.
* `INTERACT_CourtDisplay_Screen`: replace its `material.map` with a `CanvasTexture` or `VideoTexture`.
* `INTERACT_Flag_Uzbekistan`: drapery, which can take a wind vertex shader.
* `INTERACT_EvidenceFolder_*`: evidence folders.

## 6. Lighting suggestion
The GLB contains no lights, so the website owns the look. A starting point is in
`manifest.environment.recommended_lighting`:
* a hemisphere light;
* a warm directional "sun" through the right-wall windows, with shadows;
* sconce point lights from `lights_reference`;
* ACES or AgX tone mapping.

The windows use an emissive daylight card, so bloom (`@react-three/postprocessing`) at low intensity sells the daylight.

## 7. QonunAI
* Clips: `Idle_Float`, `Greet`, `Point`, `Explain`, `Positive`, `Concerned`, `Speak`, `Appear`, `Disappear`.
  Face morphs are already inside each clip, so play one action at a time.
* For the UI overlay, render the same GLB in a second small `<Canvas>` (orthographic or 35° perspective camera, transparent background). Use `qonunai_portrait.png` as the fallback.
* In the courtroom, spawn it at `SPAWN_qonunai` (beside the flag). It is a guide, so keep it out of the well during scenes.

## 8. Performance notes
* Total first-load payload is about 6.4 MB: courtroom plus a seated hero cast at LOD1/LOD2 with QonunAI. Stream LOD0 for the camera-target character.
* Optional extra compression without touching Blender:
  `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp`
  If you do this, add `MeshoptDecoder` to the loader.
* Morph normals are not exported, which keeps files smaller. Lighting on expressions is approximate.

## 9. What not to assume
* Human characters are **MPFB base models** with recoloured CC0 clothing and procedural garments. They still need an art pass. See `docs/ASSET_STATUS.md`. Do not market them as final likenesses.
* `StateEmblem_PLACEHOLDER` is **not** the official emblem.
* Uniform and insignia details are approximations, not verified against regulations.
