# Gravity Protocol — a Half-Life: Alyx fan tribute

A playable, fan-made first-person arena shooter inspired by **Half-Life: Alyx**, built with
Three.js and Vite. Survive eight waves of Combine hunter drones on a City 17 rooftop with a
Combine pistol and a gravity glove that lets you rip crates and barrels out of the air and hurl
them at the enemy.

This is an unofficial fan project. It is not affiliated with or endorsed by Valve.

## Play

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:3002`). Build a static copy with
`npm run build`; the output goes to `dist/`.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the canvas to capture the pointer) |
| Left mouse | Fire the pistol / hurl a held object |
| Right mouse | Gravity-pull a prop / release a held prop |
| `R` | Reload |
| `Shift` | Sprint |
| `Space` | Jump |
| `Esc` | Pause |

On touch devices a virtual stick, look area, fire, pull, reload and jump buttons appear
automatically. Add `?touch=1` to the URL to force the touch UI on a desktop browser.

## Rules

- Eight waves; every fourth wave includes a heavy hunter.
- Drones orbit and fire plasma bolts. Break line of sight and keep moving.
- Pulled props deal damage based on how fast they are travelling — a full-power throw can
  one-shot a scout drone.
- Medkits drop from destroyed drones. Clear a wave to earn a bonus and a guaranteed medkit.
- Your best score is stored in `localStorage`.

## Tech

- Three.js with procedurally generated geometry, canvas textures and synthesized WebAudio
  effects — no external models, textures or audio files.
- Vite for development and static builds.
- Desktop pointer-lock controls plus mobile touch controls.
- Debug hooks are exposed on `window.__gravity` for automated testing.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/joebenedict523-web/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/joebenedict523-web/PlayGround)

- 🎮 [Open the project](https://omgithub.com/joebenedict523-web/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=joebenedict523-web%2FPlayGround).
- 💻 [Explore the source](https://github.com/joebenedict523-web/PlayGround).
- 🛠️ [Check build runs](https://github.com/joebenedict523-web/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/joebenedict523-web/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/joebenedict523-web).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
