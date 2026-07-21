import type { Status } from '../components/StatusBadge';

export interface ScheduledJob {
  id: string;
  prompt: string;
  cron: string;
  cronLabel: string;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  question: string;
  status: Status;
  model: string;
  tokens: number;
  latencyMs: number;
  when: string;
}

export type TraceStepKind = 'reasoning' | 'tool_call' | 'tool_result';

export interface TraceStep {
  id: string;
  kind: TraceStepKind;
  text?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  latencyMs?: number;
  tokens?: number;
  error?: boolean;
}

export interface RunTrace {
  id: string;
  question: string;
  status: Status;
  model: string;
  totalTokens: number;
  totalLatencyMs: number;
  steps: TraceStep[];
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    id: 'job_1',
    prompt: 'Summarize last night’s West conference results',
    cron: '0 12 * * *',
    cronLabel: 'Nightly 8:00am ET',
    createdAt: '2 days ago',
  },
  {
    id: 'job_2',
    prompt: 'Top 5 assist leaders and their trend this week',
    cron: '0 13 * * 1-5',
    cronLabel: 'Weekday mornings 9:00am ET',
    createdAt: '5 days ago',
  },
  {
    id: 'job_3',
    prompt: 'Weekly digest: standings movement + injury notes',
    cron: '0 15 * * 1',
    cronLabel: 'Weekly Mondays 11:00am ET',
    createdAt: '3 weeks ago',
  },
];

export const RECENT_RUNS: RunSummary[] = [
  {
    id: 'run_lc_curry',
    question: 'Compare LeBron and Curry this season',
    status: 'completed',
    model: 'gemini-flash',
    tokens: 4218,
    latencyMs: 3140,
    when: '4 min ago',
  },
  {
    id: 'run_east',
    question: 'Who leads the East?',
    status: 'completed',
    model: 'gemini-flash',
    tokens: 1877,
    latencyMs: 1820,
    when: '38 min ago',
  },
  {
    id: 'run_assists',
    question: 'Top 5 in assists this year',
    status: 'timeout',
    model: 'gemini-flash',
    tokens: 2402,
    latencyMs: 8020,
    when: '2 hours ago',
  },
  {
    id: 'run_scoreboard',
    question: 'Any close games tonight?',
    status: 'completed',
    model: 'groq-llama-3.1-70b',
    tokens: 1130,
    latencyMs: 940,
    when: '5 hours ago',
  },
  {
    id: 'run_playoffs',
    question: 'Playoff seeding scenarios if Denver loses out',
    status: 'error',
    model: 'gemini-flash',
    tokens: 812,
    latencyMs: 1210,
    when: 'Yesterday',
  },
];

export const TRACE_COMPARE: RunTrace = {
  id: 'run_lc_curry',
  question: 'Compare LeBron and Curry this season',
  status: 'completed',
  model: 'gemini-flash',
  totalTokens: 4218,
  totalLatencyMs: 3140,
  steps: [
    {
      id: 's1',
      kind: 'reasoning',
      tokens: 312,
      text: 'The user wants a head-to-head comparison. I need each player’s season averages — points, rebounds, assists, efficiency — plus their current team context.',
    },
    {
      id: 's2',
      kind: 'tool_call',
      tool: 'search_players',
      tokens: 84,
      args: { query: 'LeBron James', per_page: 1 },
    },
    {
      id: 's3',
      kind: 'tool_result',
      tool: 'search_players',
      latencyMs: 142,
      tokens: 96,
      result: {
        data: [
          {
            id: 237,
            first_name: 'LeBron',
            last_name: 'James',
            position: 'F',
            team: { id: 14, abbreviation: 'LAL', full_name: 'Los Angeles Lakers' },
          },
        ],
      },
    },
    {
      id: 's4',
      kind: 'tool_call',
      tool: 'search_players',
      tokens: 82,
      args: { query: 'Stephen Curry', per_page: 1 },
    },
    {
      id: 's5',
      kind: 'tool_result',
      tool: 'search_players',
      latencyMs: 118,
      tokens: 94,
      result: {
        data: [
          {
            id: 115,
            first_name: 'Stephen',
            last_name: 'Curry',
            position: 'G',
            team: { id: 9, abbreviation: 'GSW', full_name: 'Golden State Warriors' },
          },
        ],
      },
    },
    {
      id: 's6',
      kind: 'tool_call',
      tool: 'compare_players',
      tokens: 138,
      args: {
        player_ids: [237, 115],
        season: '2025-26',
        metrics: ['pts', 'reb', 'ast', 'fg_pct', 'ts_pct'],
      },
    },
    {
      id: 's7',
      kind: 'tool_result',
      tool: 'compare_players',
      latencyMs: 612,
      tokens: 268,
      result: {
        season: '2025-26',
        players: [
          {
            id: 237,
            name: 'LeBron James',
            gp: 52,
            pts: 24.6,
            reb: 7.9,
            ast: 8.1,
            fg_pct: 0.512,
            ts_pct: 0.605,
          },
          {
            id: 115,
            name: 'Stephen Curry',
            gp: 55,
            pts: 27.2,
            reb: 4.4,
            ast: 6.2,
            fg_pct: 0.462,
            ts_pct: 0.632,
          },
        ],
      },
    },
    {
      id: 's8',
      kind: 'reasoning',
      tokens: 411,
      text: 'Curry outscores LeBron (27.2 vs 24.6) on higher true-shooting (.632 vs .605), while LeBron leads in every non-scoring category — rebounds (7.9 vs 4.4) and assists (8.1 vs 6.2). LeBron is a better field-goal shooter by percentage (.512), but Curry’s volume from three drives his efficiency edge. Both have played a similar number of games (52 vs 55) so the sample is comparable.',
    },
  ],
};

export const CRON_PRESETS = [
  { value: '0 12 * * *', label: 'Nightly 8:00am ET' },
  { value: '0 13 * * 1-5', label: 'Weekday mornings 9:00am ET' },
  { value: '0 15 * * 1', label: 'Weekly Mondays 11:00am ET' },
] as const;
