import type { SubtitleCue } from '../../story/types';

// Captions use a fixed dark plate regardless of the UI theme — legibility on
// footage, not decoration. On phones they sit in a caption strip below the
// frame (reserved height, so the player never jumps); wider screens overlay them.
export function Subtitles({ cue, lang, enabled }: { cue?: SubtitleCue; lang: string; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="pointer-events-none flex min-h-24 items-center justify-center bg-[#1A1814] px-3 py-2 sm:absolute sm:inset-x-8 sm:bottom-5 sm:min-h-0 sm:bg-transparent sm:p-0">
      {cue && <p key={cue.id} lang={lang} dir="auto" className="max-w-3xl text-center text-[15px] leading-relaxed text-[#F7F3EA] sm:rounded-sm sm:bg-[rgb(20_18_15/0.84)] sm:px-4 sm:py-2 sm:text-base">
        {cue.text}
      </p>}
    </div>
  );
}
