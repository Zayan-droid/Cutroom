import type { LangCode } from './types.ts';

// The dramatic arc: one beat per scene. Six beats ≈ a 3-minute story.
export type BeatKey = 'open' | 'setup' | 'rising' | 'turn' | 'climax' | 'resolve';
export const ARC: readonly BeatKey[] = ['open', 'setup', 'rising', 'turn', 'climax', 'resolve'];

// The character speaks on the turn and climax, giving the story real dialogue
// between the narrator's lines.
const HERO_BEATS: readonly BeatKey[] = ['turn', 'climax'];
export function heroSpeaksAt(key: BeatKey): boolean {
  return HERO_BEATS.includes(key);
}

interface Pack {
  title: (subject: string) => string;
  narration: Record<BeatKey, readonly string[]>;
  hero: Partial<Record<BeatKey, readonly string[]>>;
}

// Template packs. `{subject}` is filled verbatim from the prompt — the scaffolding
// is localized, the subject is not (a documented zero-cost limitation). Adding a
// language is just one more entry here plus a voice hint in voices.ts.
const PACKS: Record<LangCode, Pack> = {
  'en-US': {
    title: (s) => `The Story of ${s}`,
    narration: {
      open: ['This is the story of {subject}.', 'Our story begins with {subject}.'],
      setup: ['Everything seemed calm, and {subject} felt at home.', 'At first, the world of {subject} was quiet and bright.'],
      rising: ['But something was changing, and {subject} could feel it.', 'Then the ground shifted beneath {subject}.'],
      turn: ['A choice appeared that {subject} could not ignore.', 'Now {subject} stood at the edge of a decision.'],
      climax: ['With everything at stake, {subject} pressed forward.', 'There was no turning back for {subject} now.'],
      resolve: ['And so {subject} found the way home, changed for good.', 'In the end, {subject} discovered what truly mattered.'],
    },
    hero: {
      turn: ['I never thought it would come to this.', 'This is my moment, and I will not waste it.'],
      climax: ['Whatever happens, I will see it through.', 'I am ready. Let us finish this.'],
    },
  },
  'es-ES': {
    title: (s) => `La historia de ${s}`,
    narration: {
      open: ['Esta es la historia de {subject}.', 'Nuestra historia comienza con {subject}.'],
      setup: ['Todo parecía tranquilo, y {subject} se sentía en casa.', 'Al principio, el mundo de {subject} era silencioso y luminoso.'],
      rising: ['Pero algo estaba cambiando, y {subject} lo presentía.', 'Entonces el suelo tembló bajo {subject}.'],
      turn: ['Apareció una decisión que {subject} no podía ignorar.', 'Ahora {subject} estaba al borde de una decisión.'],
      climax: ['Con todo en juego, {subject} siguió adelante.', 'Ya no había vuelta atrás para {subject}.'],
      resolve: ['Y así {subject} encontró el camino a casa, cambiado para siempre.', 'Al final, {subject} descubrió lo que de verdad importaba.'],
    },
    hero: {
      turn: ['Nunca pensé que llegaría a esto.', 'Este es mi momento, y no lo desperdiciaré.'],
      climax: ['Pase lo que pase, llegaré hasta el final.', 'Estoy listo. Terminemos con esto.'],
    },
  },
  'fr-FR': {
    title: (s) => `L'histoire de ${s}`,
    narration: {
      open: ["Voici l'histoire de {subject}.", 'Notre histoire commence avec {subject}.'],
      setup: ['Tout semblait calme, et {subject} se sentait chez soi.', 'Au début, le monde de {subject} était paisible et lumineux.'],
      rising: ['Mais quelque chose changeait, et {subject} le sentait.', 'Puis le sol trembla sous {subject}.'],
      turn: ['Un choix apparut que {subject} ne pouvait ignorer.', "Maintenant, {subject} se tenait au bord d'une décision."],
      climax: ['Avec tout en jeu, {subject} avança.', "Il n'y avait plus de retour en arrière pour {subject}."],
      resolve: ['Et ainsi {subject} trouva le chemin du retour, changé à jamais.', 'À la fin, {subject} découvrit ce qui comptait vraiment.'],
    },
    hero: {
      turn: ["Je n'aurais jamais cru en arriver là.", "C'est mon moment, et je ne le gâcherai pas."],
      climax: ["Quoi qu'il arrive, j'irai jusqu'au bout.", 'Je suis prêt. Finissons-en.'],
    },
  },
  'de-DE': {
    title: (s) => `Die Geschichte von ${s}`,
    narration: {
      open: ['Das ist die Geschichte von {subject}.', 'Unsere Geschichte beginnt mit {subject}.'],
      setup: ['Alles schien ruhig, und {subject} fühlte sich zu Hause.', 'Zuerst war die Welt von {subject} still und hell.'],
      rising: ['Doch etwas veränderte sich, und {subject} spürte es.', 'Dann bebte der Boden unter {subject}.'],
      turn: ['Eine Entscheidung erschien, die {subject} nicht ignorieren konnte.', 'Jetzt stand {subject} am Rand einer Entscheidung.'],
      climax: ['Als alles auf dem Spiel stand, ging {subject} weiter.', 'Es gab kein Zurück mehr für {subject}.'],
      resolve: ['Und so fand {subject} den Weg nach Hause, für immer verändert.', 'Am Ende erkannte {subject}, was wirklich zählte.'],
    },
    hero: {
      turn: ['Ich hätte nie gedacht, dass es so weit kommt.', 'Das ist mein Moment, und ich werde ihn nutzen.'],
      climax: ['Was auch geschieht, ich bringe es zu Ende.', 'Ich bin bereit. Bringen wir es zu Ende.'],
    },
  },
  'pt-BR': {
    title: (s) => `A história de ${s}`,
    narration: {
      open: ['Esta é a história de {subject}.', 'Nossa história começa com {subject}.'],
      setup: ['Tudo parecia calmo, e {subject} se sentia em casa.', 'No início, o mundo de {subject} era silencioso e claro.'],
      rising: ['Mas algo estava mudando, e {subject} podia sentir.', 'Então o chão tremeu sob {subject}.'],
      turn: ['Surgiu uma escolha que {subject} não podia ignorar.', 'Agora {subject} estava à beira de uma decisão.'],
      climax: ['Com tudo em jogo, {subject} seguiu em frente.', 'Não havia mais volta para {subject}.'],
      resolve: ['E assim {subject} encontrou o caminho de casa, mudado para sempre.', 'No fim, {subject} descobriu o que realmente importava.'],
    },
    hero: {
      turn: ['Eu nunca pensei que chegaria a isso.', 'Este é o meu momento, e não vou desperdiçá-lo.'],
      climax: ['Aconteça o que acontecer, vou até o fim.', 'Estou pronto. Vamos terminar isto.'],
    },
  },
};

export const LANGUAGES: readonly LangCode[] = Object.keys(PACKS);

export function isSupported(lang: LangCode): boolean {
  return Object.prototype.hasOwnProperty.call(PACKS, lang);
}

function pack(lang: LangCode): Pack {
  if (!isSupported(lang)) throw new Error(`Unsupported language: ${lang}`);
  return PACKS[lang];
}

function fill(template: string, subject: string): string {
  return template.replaceAll('{subject}', subject);
}

function pick(list: readonly string[], variant: number): string {
  return list[((variant % list.length) + list.length) % list.length];
}

export function storyTitle(lang: LangCode, subject: string): string {
  return pack(lang).title(subject);
}

export function narrationVariants(lang: LangCode, key: BeatKey): number {
  return pack(lang).narration[key].length;
}

export function heroVariants(lang: LangCode, key: BeatKey): number {
  return pack(lang).hero[key]?.length ?? 0;
}

export function renderNarration(lang: LangCode, key: BeatKey, variant: number, subject: string): string {
  return fill(pick(pack(lang).narration[key], variant), subject);
}

export function renderHero(lang: LangCode, key: BeatKey, variant: number): string {
  const lines = pack(lang).hero[key];
  return lines && lines.length ? pick(lines, variant) : '';
}
