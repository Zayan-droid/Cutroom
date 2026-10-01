# Offline generation placeholders

These original procedural motion graphics are mock output, not generated footage.
They contain no downloaded media, external URLs, fonts, or audio. Four color and
composition variants are bundled for every intent, with corresponding draft and
render clips. Each clip is a three-second camera-motion loop.

| Intent | Scene | Draft (12 fps) | Render (24 fps) | Ratio |
| --- | --- | --- | --- | --- |
| Social | Abstract orbital sculpture | 180 × 320 | 720 × 1280 | 9:16 |
| Ad | Bottle on a lit pedestal | 256 × 320 | 864 × 1080 | 4:5 |
| Cinematic | Layered landscape at dusk | 320 × 180 | 1280 × 720 | 16:9 |

MP4/H.264, `yuv420p`, and fast-start metadata support ordinary browser `<video>`
playback. Use `muted`, `loop`, and `playsInline` for inline preview playback.
`src/engine/assets.ts` returns URLs that Vite includes in the production bundle.
Drafts and renders use the same zero-based variant, wrapped modulo four.

Regenerate all 24 clips with Node and ffmpeg installed:

```sh
node src/assets/generate.mjs
```

The application only needs the bundled clips; ffmpeg is a development-time tool.
