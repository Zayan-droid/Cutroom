import type { SubtitleCue } from '../../story/types';

export function Subtitles({ cue, lang, enabled }: { cue?: SubtitleCue; lang: string; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div className="pointer-events-none flex min-h-24 items-center justify-center bg-bg/90 px-3 py-2 sm:absolute sm:inset-x-8 sm:bottom-6 sm:min-h-0 sm:bg-transparent sm:p-0">
      {cue && <p key={cue.id} lang={lang} dir="auto" className="max-w-3xl rounded-xl text-center text-sm leading-relaxed text-fg sm:bg-bg/90 sm:px-5 sm:py-3 sm:text-base sm:shadow-card">
        {cue.text}
      </p>}
    </div>
  );
}
