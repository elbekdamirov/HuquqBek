# Asset status: what is finished, what is a base, what is a placeholder

Legend: **Complete** means usable in production as is. **Base** means technically complete (rigged, animated,
optimised, validated) but still needs an artist pass for the visual target. **Placeholder** means it must be
replaced before release.

## Environment: `courtroom.glb`
| Item | Status | Notes |
|---|---|---|
| Floor plan, walls, ceiling, windows, doors | **Complete** | 15 × 15 m room, 5.6 m ceiling, real-world furniture heights. Layout follows the reference image. |
| Walnut paneling, raised panels, wainscot, pilasters, cornices | **Complete** | Procedural 1K PBR (albedo/ORM/normal) |
| Judge's dais + bench, high-back chair, monitor, mic, papers, codes | **Complete** | Bench top at 1.22 m, so the seated judge is visible as in the reference |
| Clerk station (SUD MAJLISI KOTIBI), advocate/plaintiff table, prosecutor desk, defendant desk (AYBLANUVCHI), witness stand (GUVOH), bar rail, 6 spectator benches | **Complete** | Brass nameplates with real text geometry |
| Microphones, documents, books, laptop, evidence folders | **Complete** | Evidence folders are separate interactive nodes |
| Uzbekistan flag | **Complete** (verify colours) | Procedural flag texture with crescent and 12 stars on a draped mesh |
| Court display (QonunVerse / Interaktiv sud simulyatori) | **Complete** | Screen material is swappable at runtime |
| State Emblem | **Placeholder** | Stylised medallion, not the official emblem. Replace with official artwork. |
| Lighting | **Complete in Blender** | Web lighting comes from the manifest recommendations, not baked lightmaps |
| Baked GI / lightmaps | Not done | Optional follow-up: bake a lightmap UV2 for ambient-occlusion realism |

## Human cast (MPFB 2 + MakeHuman CC0)
All 11 characters have the same technical state:

**Technically complete:**
* game-ready Mixamo-named skeleton (52 bones)
* 4 bone influences per vertex
* 18 facial morph targets: blink, brows, eyes, mouth, smile, frown
* about 40 procedural clips per character
* LOD0, LOD1 and LOD2
* textures capped at 1–2K
* validated height and scale

**Visual state: Base.** These are parametric MakeHuman bodies with recoloured CC0 clothing. They are not sculpted
likenesses of the people in the concept art.

| id | Role | Visual state | Outfit as built | Art pass still needed |
|---|---|---|---|---|
| sudya | Judge | Base | Black suit + procedural robe shell and skirt, silver trim | Proper judicial robe with ornamented placket (cloth sim), older face sculpt, grey hair |
| advokat | Defence lawyer | Base | Black jacket + skirt, pulled-back hair, low bun | Tailored suit with trousers and white blouse collar, hair cards for the bun, face likeness |
| prokuror | Prosecutor | Base | Navy suit + gold shoulder boards | Official prosecutor uniform cut and insignia (verify with official sources) |
| davogar | Plaintiff | Base | White shirt, dark trousers | Face and hair variation |
| javobgar | Defendant | Base | Charcoal shirt, dark trousers | Face and hair variation |
| guvoh | Witness | Base | Cream blouse, dark skirt, ponytail | Trousers instead of skirt per brief; face |
| kotib | Clerk | Base | Dark jacket + skirt, bob | White shirt collar |
| qoriqchi | Security officer | Base | Navy suit, peaked cap, badge, shoulder boards | Real uniform, belt and equipment (verify) |
| tomoshabin_ayol | Spectator (headscarf) | Base | Shrink-wrapped patterned headscarf, dark coat | Cloth-simulated scarf drape |
| tomoshabin_erkak | Spectator (grey jacket) | Base | Grey jacket, dark trousers | |
| tomoshabin_yosh | Spectator (young woman) | Base | Cream blouse, braid | |

Known limitations of the base models:
* Skin is a MakeHuman texture with a warm olive tint. There is no SSS map in glTF.
* Eyebrows use alpha blending, so check sorting in three.js and set `depthWrite` to false if needed.
* Procedural garments (robe, headscarf) are shells skinned to the body. Extreme poses can show clipping.
* The default clothes include a skirt for the female suit. The brief asks for trousers for the advocate and the witness.
* In `Idle_Seated_Lap` the forearms rest slightly above the thighs, so the hands float a few centimetres. This shows on the witness and spectators. Tune `seated_base(hands="lap")` in `qv_animation.py`.
* Faces are similar MPFB defaults (young, low variation). The defendant now uses the `short02` hairstyle.

## Animation
| Item | Status |
|---|---|
| Idle breathing (standing, seated desk, seated lap), walk (in place), turn ±90, sit down, stand up | **Complete** (procedural) |
| Talking (standing/seated) + `Face_Talk` mouth morphs, blinking in every face clip | **Complete** |
| Head nod, shake, look left/right; open-hand, point, objection; surprised and concerned reactions (standing + seated) | **Complete** |
| Address judge, present evidence, read document (standing/seated) | **Complete** (advocate priority) |
| Deliver verdict, typing, announce, testify, nervous idle, guard idle | **Complete** |
| Mocap realism | **Base**: procedural keys are clean but stylised. Licensed Mixamo/mocap clips can replace any clip one-for-one (same bone names). |
| Lip-sync to audio | Not done: `Face_Talk` is a generic loop. Drive `Mouth_Open`/`Mouth_Pursing`/`Mouth_Wide` from audio amplitude or visemes at runtime. |

## QonunAI
| Item | Status |
|---|---|
| Mascot model, rig (10 bones), 5 morphs, 9 clips, LOD1, UI portrait | **Complete** (original stylised design) |

## Tools / data
* Scripts, manifest, licences and validator: **Complete**.
* `blender/characters/*.blend` contain the editable MPFB humans with all actions on NLA tracks.
