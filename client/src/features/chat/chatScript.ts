export interface ChatEventAppend {
  at: number;
  type: 'append';
  text: string;
}

export interface ChatEventToolStart {
  at: number;
  type: 'tool_start';
  toolCallId: string;
  tool: string;
}

export interface ChatEventToolEnd {
  at: number;
  type: 'tool_end';
  toolCallId: string;
  latencyMs: number;
  failed?: boolean;
}

export interface ChatEventDone {
  at: number;
  type: 'done';
}

export type ChatEvent = ChatEventAppend | ChatEventToolStart | ChatEventToolEnd | ChatEventDone;

export const COMPARE_SCRIPT: ChatEvent[] = [
  { at: 120, type: 'append', text: 'Looking up both players' },
  { at: 260, type: 'append', text: ' — one moment. ' },
  { at: 380, type: 'tool_start', toolCallId: 'a', tool: 'search_players' },
  { at: 780, type: 'tool_end', toolCallId: 'a', latencyMs: 142 },
  { at: 900, type: 'append', text: ' ' },
  { at: 1000, type: 'tool_start', toolCallId: 'b', tool: 'search_players' },
  { at: 1380, type: 'tool_end', toolCallId: 'b', latencyMs: 118 },
  { at: 1500, type: 'append', text: ' Pulling their season averages ' },
  { at: 1620, type: 'tool_start', toolCallId: 'c', tool: 'compare_players' },
  { at: 2240, type: 'tool_end', toolCallId: 'c', latencyMs: 612 },
  {
    at: 2420,
    type: 'append',
    text:
      '\n\nThis season **Curry is the higher scorer at 27.2 ppg** on .632 TS%, versus LeBron at 24.6 ppg on .605 TS%. But LeBron leads every non-scoring category: 7.9 rebounds and 8.1 assists a night, against Curry’s 4.4 and 6.2. Field-goal percentage flips the other way — .512 for LeBron, .462 for Curry — because Curry’s volume from three drives his efficiency edge. Sample sizes are comparable (52 vs 55 games), so the comparison holds.',
  },
  { at: 3600, type: 'done' },
];

export const EAST_SCRIPT: ChatEvent[] = [
  { at: 100, type: 'append', text: 'Checking the Eastern Conference standings. ' },
  { at: 260, type: 'tool_start', toolCallId: 'a', tool: 'get_standings' },
  { at: 780, type: 'tool_end', toolCallId: 'a', latencyMs: 428 },
  {
    at: 900,
    type: 'append',
    text:
      '\n\n**Boston leads the East at 42–13**, four games clear of Milwaukee (38–17) and five up on Cleveland (37–18). Their defensive rating (109.1) is the best in the conference and the tiebreaker over the Bucks is already secured from the season series.',
  },
  { at: 2200, type: 'done' },
];

export const ASSISTS_SCRIPT: ChatEvent[] = [
  { at: 100, type: 'append', text: 'Fetching league leaders in assists. ' },
  { at: 240, type: 'tool_start', toolCallId: 'a', tool: 'get_league_leaders' },
  { at: 820, type: 'tool_end', toolCallId: 'a', latencyMs: 486 },
  {
    at: 940,
    type: 'append',
    text:
      '\n\n**Top 5 assist leaders this season:**\n\n1. Trae Young — 11.4 apg\n2. Tyrese Haliburton — 10.8 apg\n3. Nikola Jokić — 9.6 apg\n4. LaMelo Ball — 9.1 apg\n5. Luka Dončić — 8.9 apg',
  },
  { at: 2400, type: 'done' },
];

export interface Suggestion {
  label: string;
  script: ChatEvent[];
}

export const SUGGESTIONS: Suggestion[] = [
  { label: 'Compare LeBron and Curry this season', script: COMPARE_SCRIPT },
  { label: 'Who leads the East?', script: EAST_SCRIPT },
  { label: 'Top 5 in assists this year', script: ASSISTS_SCRIPT },
];
