# Clean-room Source and Asset Manifest

**Audited:** 2026-07-16

## Shipped runtime

| Path | Purpose | Provenance |
| --- | --- | --- |
| `index.html` | One-screen mission and accessible Agent Workbench | Authored clean-room for this repository |
| `src/app.js` | Lesson state machine, execution timeline, receipt, automation hooks | Authored clean-room for this repository |
| `src/compiler.js` | Four-line allowlisted teaching-language compiler | Authored clean-room for this repository |
| `src/mission.js` | Deterministic East Channel world transitions and proof | Authored clean-room for this repository |
| `src/world.js` | Procedural Canvas 2D isometric farm, Bert, water, crops, and debris | Authored clean-room for this repository |
| `src/styles.css` | Field-manual visual system and responsive layout | Authored clean-room for this repository |
| `feedback/` | Local session-preserving feedback form and evidence export | Authored clean-room for this repository |

## Assets

The shipped game has no external image, model, texture, font, audio, or video assets. Farm tiles, buildings, plants, channel, obstruction, particles, route, and Bert are rendered from Canvas 2D geometry and color values. The interface uses CSS and local font fallbacks already installed on the visitor's system.

The small grain treatment is an inline procedural SVG turbulence filter authored in `src/styles.css`; it is not a copied bitmap.

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
