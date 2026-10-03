# Story player — Half 2

Open **Story studio** in the app, enter an idea, choose a language, and compose.
The quoted cost and available story credits come from the story store. Composition
shows the engine's progress; failed jobs keep the prompt available for retry.

`ConnectedStoryMode` is the integration boundary: it reads `useStoryStore` through
the store barrel and supplies a `StoryBinding` to `StoryMode`. Presentation never
calls an engine or mutates a timeline. The only imports from `src/story/` are the
shared types and contract. Rendering `StoryMode` without a binding opens the
hand-written English/Spanish preview; those fixtures also support isolated QA.

## Playback

- One monotonic `PlaybackClock` drives scenes, transitions, dialogue, subtitles,
  and recording. Play, pause, replay, the slider, and scene buttons share it.
- `Narrator` selects an exact-locale voice, then a matching base-language voice.
  It waits for actual speech before animating the mouth and uses live boundary
  events when available. Precomputed visemes or timed character estimates cover
  voices without boundary events. These are stylized mouth movements, not
  phoneme-accurate lip sync.
- Speech synthesis cannot seek or expose its audio as a stream. Seeking cancels
  the old utterance and resumes at an estimated word; cues are stopped at their
  scheduled end to prevent drift into the next scene. Timelines stay unchanged.
- Missing voices and speech errors leave the visual timeline and subtitles
  available. Online voices are labeled. A hidden tab pauses playback; unmounting,
  replacing a story, muting, and seeking cancel owned speech and stale callbacks.
- Canvas drawing is shared with export. Optional still images use CORS-safe
  loading and fall back to procedural scenery on failure. Reduced motion removes
  scene slides, fades, and landscape movement. Mobile captions sit below the
  frame so the avatar stays visible.

## Downloads

The subtitle track is always downloadable as UTF-8 WebVTT, independent of speech
or recorder support. Caption text is escaped so markup is displayed literally.

**Record silent video** starts at the beginning and captures the canvas in real
time, using a supported WebM or MP4 codec. The recorder warms up before the clock
starts. Pausing playback pauses recording; seeking and caption changes are locked
during capture. The video contains the avatar and, if enabled, burned subtitles.
Speech is audible during browser playback but is **not** included in the file.
The finished video is explicitly saved by the user. Cancel, errors, and unmount
release capture tracks and discard unfinished recordings.

No WASM/ffmpeg payload or paid API is added. Audio muxing remains outside this
canvas export path. See the browser documentation for
[speech boundaries](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event)
and [recorder codec detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static).

## Validation

`node --test tests/story-player.test.mjs` covers clock continuity, cue boundaries,
immutable input, regional voice matching, stale speech events after seeking,
missing voices/mute/error recovery, viseme estimates, VTT escaping, and recorder
resource cleanup. It also runs with the full `npm test` suite.

Browser QA should cover compose/failure/retry, playback to the end, seeking while
paused and playing, language/voice changes, missing voice support, subtitle
toggle/download, tab visibility, recording completion/pause/cancel, and mode
switch cleanup. Check layouts at 375, 768, 1024, and 1440 pixels. Native voice
quality and boundary support depend on the installed browser/OS voices.
