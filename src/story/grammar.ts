import type { LangCode, SceneTransition } from './types.ts';
import type { Random } from './random.ts';
import {
  ARC,
  heroSpeaksAt,
  heroVariants,
  narrationVariants,
  renderHero,
  renderNarration,
  type BeatKey,
} from './localize.ts';

export interface PlannedLine {
  speaker: 'narrator' | 'hero';
  text: string;
}

export interface PlannedBeat {
  key: BeatKey;
  index: number;
  transition: SceneTransition;
  posterSeed: string;
  lines: PlannedLine[];
}

export interface PlannedStory {
  subject: string;
  beats: PlannedBeat[];
}

const TRANSITIONS: readonly SceneTransition[] = ['cut', 'fade', 'slide'];

// Clauses that set the scene rather than name the hero ("In a small village, …").
const SETTING = /^(?:in|on|at|by|from|under|near|after|before|during|once|long|far|deep|high|inside|outside|beyond|across|among|between|somewhere)\b/i;

// Common story verbs. Third-person and past forms are matched by stripping
// suffixes, so "follows", "discovers", and "tried" all count.
const VERBS = new Set([
  'be', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'can', 'could', 'will', 'would', 'must', 'should',
  'may', 'might', 'do', 'does', 'did', 'follow', 'find', 'found', 'discover', 'learn', 'build', 'built', 'lose',
  'lost', 'search', 'travel', 'meet', 'met', 'try', 'want', 'go', 'went', 'run', 'ran', 'fly', 'flew', 'fall',
  'fell', 'return', 'help', 'save', 'escape', 'explore', 'dream', 'wake', 'woke', 'become', 'became', 'start',
  'set', 'get', 'got', 'make', 'made', 'take', 'took', 'give', 'gave', 'see', 'saw', 'hear', 'heard', 'leave',
  'left', 'look', 'walk', 'sail', 'climb', 'chase', 'wander', 'decide', 'sing', 'sang', 'paint', 'write', 'wrote',
  'open', 'keep', 'kept', 'bring', 'brought', 'carry', 'cross', 'wait', 'watch', 'fight', 'fought', 'protect',
  'guard', 'race', 'ride', 'rode', 'swim', 'swam', 'grow', 'grew', 'plant', 'fix', 'hide', 'hid', 'love', 'miss',
  'need', 'hope', 'tell', 'told', 'ask', 'answer', 'befriend', 'rescue', 'live', 'spend', 'spent', 'begin',
  'began', 'stumble', 'sneak', 'embark', 'journey', 'face', 'confront', 'uncover', 'unlock', 'solve', 'seek',
  'sought', 'win', 'won', 'lead', 'led', 'visit', 'arrive', 'teach', 'taught', 'play', 'dance', 'cook', 'bake',
]);

function isVerb(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (VERBS.has(w)) return true;
  const stems = [
    w.endsWith('ies') ? `${w.slice(0, -3)}y` : '',
    w.endsWith('es') ? w.slice(0, -2) : '',
    w.endsWith('s') ? w.slice(0, -1) : '',
    w.endsWith('ied') ? `${w.slice(0, -3)}y` : '',
    w.endsWith('ed') ? w.slice(0, -2) : '',
    w.endsWith('ed') ? w.slice(0, -1) : '',
  ];
  return stems.some((stem) => stem.length > 1 && VERBS.has(stem));
}

const DETERMINERS = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this', 'that', 'these', 'those', 'some',
  'every', 'each', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'no', 'many', 'few',
]);
const TRAILING = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'by', 'from']);

/**
 * Pull the hero's noun phrase out of a free-form prompt: the first clause that
 * names someone (not "In a small village"), cut before its first verb. English
 * narration gets a natural article ("the young lighthouse keeper"); other
 * languages get the bare phrase, since their templates supply the grammar.
 */
export function extractSubject(prompt: string, lang: LangCode = 'en-US'): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'the hero';
  const sentence = cleaned.split(/[.;:!?]/)[0];
  const clauses = sentence.split(',').map((c) => c.trim()).filter(Boolean);
  const clause = clauses.find((c) => !SETTING.test(c)) ?? clauses[0] ?? cleaned;
  const beforeClause = clause.replace(/\s+\b(?:who|that|which|where|when|while|because|and|but|with|without)\b.*/i, '');
  const words = beforeClause.split(' ').filter(Boolean);
  const verbAt = words.findIndex((w, i) => i > 0 && isVerb(w));
  const phrase = (verbAt > 0 ? words.slice(0, verbAt) : words).slice(0, 6);
  while (phrase.length > 1 && TRAILING.has(phrase[phrase.length - 1].toLowerCase())) phrase.pop();
  if (!phrase.length) return cleaned.split(' ').slice(0, 6).join(' ');

  const first = phrase[0].toLowerCase();
  const english = lang.toLowerCase().startsWith('en');
  if (first === 'a' || first === 'an' || first === 'the') {
    if (phrase.length === 1) return english ? 'the hero' : cleaned.split(' ').slice(0, 6).join(' ');
    if (english) phrase[0] = 'the';
    else phrase.shift();
  } else if (DETERMINERS.has(first)) {
    phrase[0] = first; // "Two brothers" reads "two brothers" mid-sentence
  } else if (english && phrase[0] === first) {
    phrase.unshift('the'); // a lowercase common noun: "robot" → "the robot"
  }
  return phrase.join(' ');
}

/**
 * Seeded prompt → ordered beats, each a scene with one narration line and,
 * on the turn and climax, a line of character dialogue. Deterministic for a
 * given prompt + seed, so the same story replays for QA and demo recordings.
 */
export function planStory(prompt: string, lang: LangCode, random: Random): PlannedStory {
  const subject = extractSubject(prompt, lang);
  const beats = ARC.map((key, index) => {
    const lines: PlannedLine[] = [
      {
        speaker: 'narrator',
        text: renderNarration(lang, key, Math.floor(random() * narrationVariants(lang, key)), subject),
      },
    ];
    if (heroSpeaksAt(key)) {
      const count = heroVariants(lang, key);
      if (count > 0) {
        lines.push({ speaker: 'hero', text: renderHero(lang, key, Math.floor(random() * count)) });
      }
    }
    const transition: SceneTransition = index === 0
      ? 'fade'
      : TRANSITIONS[Math.floor(random() * TRANSITIONS.length)];
    return { key, index, transition, posterSeed: `${subject}:${key}:${index}`, lines };
  });
  return { subject, beats };
}
