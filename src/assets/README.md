# Offline sample clips

These clips are mock engine output, not generated footage: original procedural
scenes drawn frame by frame by `generate.mjs`. They contain no downloaded media,
external URLs, fonts, or audio. The look is deliberately neutral — natural
daylight color, studio product shots, and quiet b-roll — so the sample footage
never reads as brand decoration. Each intent has four scenes, each with a draft
and a render clip. Every clip is a three-second seamless loop: all motion
(camera drift, waves, swaying leaves and grass, light sweeps) completes a whole
cycle in the clip.

| Intent | Scenes (1–4) | Draft (12 fps) | Render (24 fps) | Ratio |
| --- | --- | --- | --- | --- |
| Social | Shoreline from above · window light on plaster · clouds over a rooftop · grass against the sky | 180 × 320 | 720 × 1280 | 9:16 |
| Ad | Ceramic mug · glass bottle on concrete · watch on marble · frosted jar | 256 × 320 | 864 × 1080 | 4:5 |
| Cinematic | Overcast highland · coastline · dunes at midday · winter valley | 320 × 180 | 1280 × 720 | 16:9 |

MP4/H.264, `yuv420p`, and fast-start metadata support ordinary browser `<video>`
playback. Use `muted`, `loop`, and `playsInline` for inline preview playback.
`src/engine/assets.ts` returns URLs that Vite includes in the production bundle.
Drafts and renders use the same zero-based variant, wrapped modulo four, and a
draft is the downscaled render so committing a draft keeps its look.

Regenerate with Node and ffmpeg installed (scenes render in parallel):

```sh
node src/assets/generate.mjs                    # all 24 clips
node src/assets/generate.mjs ad-3 social-1      # only these scenes
node src/assets/generate.mjs --preview <dir>    # one PNG still per scene
```

The application only needs the bundled clips; ffmpeg is a development-time tool.
