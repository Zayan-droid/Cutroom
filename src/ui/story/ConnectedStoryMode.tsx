import { useStoryStore } from '@/store';
import { StoryMode } from './StoryMode';

/** Checkpoint 2: the store owns generation; presentation receives snapshots. */
export function ConnectedStoryMode() {
  const store = useStoryStore();
  return <StoryMode binding={{
    timeline: store.timeline,
    status: store.timeline?.status ?? null,
    languages: store.languages(),
    error: store.lastError?.message,
    credits: store.credits,
    quote: (input) => store.quoteStory(input.prompt, input.lang, input.targetMs),
    composeStory: (input) => store.composeStory(input.prompt, input.lang, input.targetMs),
  }} />;
}
