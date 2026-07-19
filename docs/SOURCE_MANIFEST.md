# Clean-room Source and Asset Manifest

**Audited:** 2026-07-18

## Shipped runtime

| Path | Purpose | Provenance |
| --- | --- | --- |
| `index.html` | One-screen mission and accessible Agent Workbench | Authored clean-room for this repository |
| `src/app.js` | Progressive Bert lesson state, execution timeline, receipt, teaser, automation hooks | Authored clean-room for this repository |
| `src/compiler.js` | Non-executable prefix validator and four-line allowlisted compiler | Authored clean-room for this repository |
| `src/mission.js` | Deterministic East Channel world transitions and proof | Authored clean-room for this repository |
| `src/debrief.js` | Receipt-derived plain-language learning recap | Authored clean-room for this repository |
| `src/world.js` | Layered procedural Canvas 2D farm, presentation evidence, humanoid Bert, water, crops, and props | Authored clean-room for this repository |
| `src/styles.css` | Voxel Field Rig material system and responsive game layout | Authored clean-room for this repository |
| `feedback/` | Local session-preserving feedback form and evidence export | Authored clean-room for this repository |

## Assets

The shipped game has no external image, model, texture, font, audio, or video assets. The two-layer terrain, stepped sky and fields, channel stones, bridge, shed, waterworks, fences, crates, hay, rocks, flowers, trees, crops, obstruction, route, and Bert are rendered from Canvas 2D geometry and color values. Bert's humanoid anatomy, face, clothing, hat, tool, and poses are procedural drawing operations in `src/world.js`; the dedicated Bert PNG is validation evidence, not a runtime asset. Bert's question, lightbulb cue, agent-boundary note, and weather bulletin are local HTML/CSS text and shapes. The interface uses CSS and local font fallbacks already installed on the visitor's system.

The small grain treatment and Voxel Field Rig grid are inline procedural CSS/SVG treatments authored in `src/styles.css`; neither is a copied bitmap.

## Development-only dependency

| Package | Version | Use | Shipped to `dist/` |
| --- | --- | --- | --- |
| `playwright` | `1.61.1` | Automated Chromium smoke and evidence capture | No |

Playwright is licensed by Microsoft under Apache-2.0. Its package license remains in `node_modules` after local installation and is not redistributed in the static artifact.

## Excluded material

`/Volumes/beefybackup/AgentVille` was reference-only. No implementation file, art asset, screenshot, generated artifact, dependency bundle, or documentation passage from that repository is present here.

## Build manifest

`npm run build` copies only:

```text
index.html
src/
feedback/
build-meta.json
```

No `.env`, test dependency, source-control metadata, evidence response, or unrelated external-volume file enters `dist/`.
