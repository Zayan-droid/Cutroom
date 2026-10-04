import type { StoryTimeline } from '../../story/types.ts';

// Hand-written previews, not a replacement for Half 1's prompt-to-story engine.
const scripts = {
  'en-US': {
    title: 'The last light',
    prompt: 'A young lighthouse keeper follows a wandering star and finds her way home.',
    lines: [
      'Every evening, Mira climbed the lighthouse steps and lit the lamp above the sea. Tonight, one small star was missing from its familiar place.',
      'She found it waiting by the shore, no brighter than a firefly. “I have forgotten the way home,” it whispered. Mira held out her hand.',
      'Beyond the harbor, the path divided. One road followed the cliffs; the other disappeared into the forest. The star trembled. Mira chose the quiet trees.',
      'Under the branches, their little light revealed a bridge she had never seen. “We do not need to see the whole road,” Mira said. “Just the next step.”',
      'At the top of the hill, the wind grew strong. Mira sheltered the star in her hands. Far below, the lighthouse shone through the gathering mist.',
      'The star recognized that patient light. “Home is not always a place,” it said. “Sometimes it is someone who keeps a light on while you are away.”',
      'Mira opened her hands. The star rose slowly, then found its place among the others. Across the water, a fishing boat turned safely toward the harbor.',
      'By morning, Mira was back at the lighthouse. She lit the lamp again that evening. High above the sea, one small star seemed to shine a little brighter.',
    ],
  },
  'es-ES': {
    title: 'La última luz',
    prompt: 'Una joven farera sigue a una estrella perdida y encuentra el camino a casa.',
    lines: [
      'Cada tarde, Mira subía las escaleras del faro y encendía la lámpara sobre el mar. Aquella noche, una pequeña estrella faltaba en su lugar habitual.',
      'La encontró esperando en la orilla, tan tenue como una luciérnaga. «He olvidado el camino a casa», susurró. Mira le ofreció la mano.',
      'Más allá del puerto, el sendero se dividía. Un camino seguía los acantilados; el otro entraba en el bosque. La estrella tembló. Mira eligió los árboles.',
      'Bajo las ramas, su pequeña luz reveló un puente desconocido. «No necesitamos ver todo el camino», dijo Mira. «Solo necesitamos ver el siguiente paso».',
      'En lo alto de la colina, el viento soplaba con fuerza. Mira protegió la estrella entre sus manos. Abajo, el faro brillaba a través de la niebla.',
      'La estrella reconoció aquella luz paciente. «El hogar no siempre es un lugar», dijo. «A veces es alguien que mantiene una luz encendida mientras estás lejos».',
      'Mira abrió las manos. La estrella ascendió despacio hasta encontrar su sitio entre las demás. En el mar, un barco de pesca regresaba a salvo al puerto.',
      'Al amanecer, Mira volvió al faro. Esa tarde encendió la lámpara una vez más. Sobre el mar, una pequeña estrella parecía brillar un poco más que antes.',
    ],
  },
};

function fixture(lang: keyof typeof scripts): StoryTimeline {
  const script = scripts[lang];
  const scenes = ['harbor', 'forest', 'hill', 'home'].map((seed, index) => ({
    id: `scene-${index}`, index, posterSeed: `last-light-${seed}`,
    startMs: index * 45_000, durationMs: 45_000,
    transition: (['cut', 'fade', 'slide', 'fade'] as const)[index],
  }));
  const dialogue = script.lines.map((text, index) => ({
    id: `line-${index}`, sceneId: scenes[Math.floor(index / 2)].id,
    speaker: 'Mira', text, lang, startMs: index * 22_500 + 1500, durationMs: 19_500, visemes: [],
  }));
  return {
    id: `last-light-${lang}`, title: script.title, prompt: script.prompt, lang,
    status: 'ready', progress: 1, totalMs: 180_000, scenes, dialogue,
    subtitles: dialogue.map((cue) => ({
      id: cue.id, cueId: cue.id, text: cue.text, startMs: cue.startMs, endMs: cue.startMs + cue.durationMs,
    })),
  };
}

export const STORY_FIXTURES: Readonly<Record<string, StoryTimeline>> = {
  'en-US': fixture('en-US'), 'es-ES': fixture('es-ES'),
};
