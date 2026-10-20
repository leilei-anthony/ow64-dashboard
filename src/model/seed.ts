import type { Action, Cadence, Chart, DayKey, Pillar, QuickLink } from './types';
import { uid } from './ids';

/** Pillar colors sampled from the original chart image. */
export const PILLAR_COLORS = [
  '#F4A236', // orange
  '#F2D543', // yellow
  '#E8609F', // magenta
  '#7CC46A', // green
  '#F3B3CE', // light pink
  '#8DB4E8', // blue
  '#C6DA58', // lime
  '#5EC4B9', // teal
];

const daily: Cadence = { kind: 'daily' };
const milestone: Cadence = { kind: 'milestone' };
const weekly = (times: number): Cadence => ({ kind: 'weekly', times });
const monthly = (times: number): Cadence => ({ kind: 'monthly', times });

type SeedAction = string | [string, Cadence];

const SEED: { title: string; actions: SeedAction[] }[] = [
  {
    title: 'Japanese',
    actions: [
      ['JLPT goals with dates', milestone],
      ['Daily new Anki cards', daily],
      'Sentence mining',
      'Read VN / LN / manga',
      'Passive listening',
      'Active immersion',
      'Track immersion hours',
      'Phone in Japanese',
    ],
  },
  {
    title: 'Fitness',
    actions: [
      ['Train 4+ a week', weekly(4)],
      'Progressive overload',
      'Choose protein',
      'Eat at maintenance',
      ['Monthly body check', monthly(1)],
      ['Bike 2–3× a week', weekly(2)],
      'Deload every 6–8 wks',
      ['Daily creatine', daily],
    ],
  },
  {
    title: 'Research & publications',
    actions: [
      'Apply to MEXT each cycle',
      'Living research plan',
      'Update mentors',
      '1 paper per year',
      ['Pilot my PhD topic', milestone],
      ['Read 1 paper weekly', weekly(1)],
      'Release code',
      'Research idea log',
    ],
  },
  {
    title: 'ML engineer',
    actions: [
      ['Pick a niche', milestone],
      'Learn deployment',
      ['3 portfolio projects', milestone],
      'Freelance profiles',
      ['First gig + review', milestone],
      'AI eval contracts',
      'Cap work at 10 h/wk',
      'Save for Japan',
    ],
  },
  {
    title: 'Finish my BSMS',
    actions: [
      ['Thesis timeline', milestone],
      'Weekly writing quota',
      'Advisor check-ins',
      'Send drafts early',
      'Reproducible experiments',
      'Results → draft',
      ['Complete practicum', milestone],
      ['Audit grad requirements', milestone],
    ],
  },
  {
    title: 'Sleep & recovery',
    actions: [
      'Fixed sleep schedule',
      '30-min wind-down',
      'Brain dump',
      'Cool, dark room',
      'Morning light',
      'Bed = sleep only',
      ['Sunday wind-down', weekly(1)],
      'No heavy late meals',
    ],
  },
  {
    title: 'Mindset & discipline',
    actions: [
      ['Sunday weekly review', weekly(1)],
      'Time-block the week',
      ['Daily top 3', daily],
      'Deep work blocks',
      'Habit stacking',
      'Minimum version',
      'Rejection log',
      ['Monthly chart check', monthly(1)],
    ],
  },
  {
    title: 'Communication',
    actions: [
      ['Explain 1 idea weekly', weekly(1)],
      'Active listening',
      'Record & review',
      'Mock before interviews',
      ['Monthly writing feedback', monthly(1)],
      'Lead with the point',
      'Q&A bank',
      'Present on my interests',
    ],
  },
];

function makeAction(seed: SeedAction, today: DayKey): Action {
  const [text, cadence] = typeof seed === 'string' ? [seed, { kind: 'anytime' } as Cadence] : seed;
  return { id: uid(), text, cadence, createdAt: today };
}

export function seedChart(today: DayKey): Chart {
  const pillars: Pillar[] = SEED.map((p, i) => ({
    id: uid(),
    title: p.title,
    color: PILLAR_COLORS[i],
    actions: p.actions.map((a) => makeAction(a, today)),
  }));
  return {
    goal: { text: 'Begin my PhD at NAIST by 2028', targetDate: '2028-04-01' },
    pillars,
    archive: [],
  };
}

export function blankChart(today: DayKey): Chart {
  return {
    goal: { text: 'Your main goal' },
    pillars: PILLAR_COLORS.map((color, i) => ({
      id: uid(),
      title: `Pillar ${i + 1}`,
      color,
      actions: Array.from({ length: 8 }, () => makeAction('', today)),
    })),
    archive: [],
  };
}

export function seedQuickLinks(): QuickLink[] {
  return [
    ['Gemini', 'https://gemini.google.com/'],
    ['YouTube', 'https://www.youtube.com/'],
    ['Messenger', 'https://www.messenger.com/'],
    ['Gmail', 'https://mail.google.com/'],
    ['Netflix', 'https://www.netflix.com/'],
  ].map(([title, url]) => ({ id: uid(), title, url }));
}
