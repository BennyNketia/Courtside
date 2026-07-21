import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

import type { NbaClient } from '../lib/nba-client.js';
import { logger } from '../lib/logger.js';

import { comparePlayers } from './compare-players.js';
import { getLeagueLeaders } from './get-league-leaders.js';
import { getPlayerSeasonAverages } from './get-player-season-averages.js';
import { getScoreboard } from './get-scoreboard.js';
import { getStandings } from './get-standings.js';
import { getTeam } from './get-team.js';
import { getTeamGames } from './get-team-games.js';
import { searchPlayers } from './search-players.js';
import type { ToolDefinition } from './shared.js';

type AnyTool = ToolDefinition<Record<string, z.ZodTypeAny>>;

export function buildTools(client: NbaClient): AnyTool[] {
  return [
    searchPlayers(client) as unknown as AnyTool,
    getTeam(client) as unknown as AnyTool,
    getTeamGames(client) as unknown as AnyTool,
    getScoreboard(client) as unknown as AnyTool,
    getStandings(client) as unknown as AnyTool,
    getPlayerSeasonAverages(client) as unknown as AnyTool,
    getLeagueLeaders(client) as unknown as AnyTool,
    comparePlayers(client) as unknown as AnyTool,
  ];
}

export function registerTools(server: McpServer, client: NbaClient): AnyTool[] {
  const tools = buildTools(client);
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        const started = Date.now();
        try {
          const result = await tool.handler(args as never);
          logger.info('tool_call', {
            tool: tool.name,
            ms: Date.now() - started,
            ok: !result.isError,
          });
          return result;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          logger.error('tool_threw', { tool: tool.name, ms: Date.now() - started, message });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message, retryable: false }) }],
            structuredContent: { error: message, retryable: false },
            isError: true,
          };
        }
      },
    );
  }
  return tools;
}
