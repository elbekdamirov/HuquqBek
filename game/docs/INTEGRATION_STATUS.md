# Integration inspection — 20 November 2026

Source assets: `C:\Users\miron\QonunVerse`. Source design: the QonunVerse_Production_Package in the creative-director chat outputs. No existing browser game, package.json or Git checkout was present at the asset root. Existing asset files and Blender sources are preserved.

Re-ran the supplied validator: all 40 GLBs passed. Re-ran the design-package validator: 16 checks passed, covering 58 dialogue nodes, 10 evidence items and 12 legal claims. These checks do not establish final art quality or gameplay performance.

## Integration decisions

- Runtime geometry and spawn coordinates follow the asset manifest's 15 × 15 m room, rather than distorting it to the design's 12 × 16 m room.
- M01 is civil. No prosecutor model is loaded. Runtime cover plates replace the criminal/prosecutor labels without modifying source GLBs.
- Dilnoza uses the available young female civilian base at the plaintiff station; Aziz uses the male civilian base at the witness station when called. These are temporary identity mappings, not finished likenesses. Other NPCs retain their supplied models. The remaining female witness model can be used as a spectator.
- Keep the exported QonunAI robot. The design's teal book was not produced in this asset pipeline.
- Preserve authored Uzbek dialogue, evidence IDs, claims and the scenario's bounded evaluator. No live legal-generation API or credentials are required. Recorded voice is absent. Browser speech is optional and only offered when an Uzbek voice is detected.
- The supplied medallion is an acknowledged placeholder. Hide it in the local civil scene; no generated symbol is presented as the official emblem.
- Final character likenesses, clothing, natural motion, official symbolism, recorded voices and local legal approval remain production work.

This is local development. No deployment is authorized by the implementation handoff.
