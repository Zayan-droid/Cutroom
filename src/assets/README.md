# Offline sample clips

These clips are mock engine output, not generated footage. They are original
procedural scenes rendered frame by frame by `generate.mjs`, and contain no
downloaded media, external URLs, fonts, or audio. Each intent has four scenes,
and each scene has a draft clip and a render clip. Every clip is a three-second
seamless loop: all motion (camera moves, waves, swaying grass and leaves, light
sweeps) completes a whole cycle within the clip.

| Intent | Scenes (1–4) | Draft (12 fps) | Render (24 fps) | Ratio |
| --- | --- | --- | --- | --- |
| Social | Shoreline from above · window light on plaster · alpine lake · grass against the sky | 360 × 640 | 720 × 1280 | 9:16 |
| Ad | Ceramic mug · amber dropper bottle · watch on marble · frosted jar | 432 × 540 | 864 × 1080 | 4:5 |
| Cinematic | Highland glen · coastline · dunes · alpine range | 640 × 360 | 1280 × 720 | 16:9 |

How the scenes are made (`scenes/`):

- `terrain.mjs` — raymarched landscapes: a heightfield with soft sun shadows,
  ambient occlusion, and fine surface detail (turf, sand ripples) filtered to
  the pixel size so it stays crisp up close without shimmering far away;
  water whose travelling waves reflect the land and sky; a cloud deck and
  distance haze; all filmed by a slowly drifting camera (real parallax).
- `studio.mjs` — raymarched product shots: signed-distance objects on a paper
  sweep or polished marble, with key, fill, rim, and strip lights, soft
  shadows, occlusion, and fresnel reflections, filmed by a slow orbiting camera.
- `flat.mjs` — subjects that are flat or seen straight on (a drone view of a
  beach, a sunlit wall, grass against the sky), shaded in 2-D.
- `kit.mjs` — shared math, noise, fields, camera, and tone mapping.

MP4/H.264, `yuv420p`, and fast-start metadata support ordinary browser `<video>`
playback. Use `muted`, `loop`, and `playsInline` for inline preview playback.
`src/engine/assets.ts` returns URLs that Vite includes in the production bundle.
Drafts and renders use the same zero-based variant, wrapped modulo four. A
draft is its render at half resolution and half the frame rate, so committing a
draft keeps its look.

Regenerate with Node and ffmpeg installed (scenes render in parallel, a few
minutes for all of them):

```sh
node src/assets/generate.mjs                    # all 24 clips
node src/assets/generate.mjs ad-3 social-1      # only these scenes
node src/assets/generate.mjs --preview <dir>    # one PNG still per scene
```

The application only needs the bundled clips; ffmpeg is a development-time tool.
