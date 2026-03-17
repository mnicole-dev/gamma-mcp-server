#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = 'https://public-api.gamma.app/v1.0';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 90;

function getApiKey(): string {
  const key = process.env['GAMMA_API_KEY'];
  if (!key) throw new Error('GAMMA_API_KEY environment variable is required');
  return key;
}

async function gammaFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

async function assertOk(resp: Response, action: string): Promise<unknown> {
  if (resp.ok) return resp.json();
  const body = await resp.text();
  throw new Error(`${action} failed (${resp.status}): ${body}`);
}

// ── Polling ────────────────────────────────────────────────

interface GenerationStatus {
  generationId?: string;
  status?: string;
  gammaUrl?: string;
  credits?: { deducted?: number; remaining?: number };
  error?: { message?: string; statusCode?: number };
  exportUrl?: string;
}

async function pollGeneration(generationId: string): Promise<GenerationStatus> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const resp = await gammaFetch(`/generations/${generationId}`);
    const data = (await assertOk(resp, 'Poll generation')) as GenerationStatus;
    const status = data.status ?? '';

    if (status === 'completed') return data;
    if (status !== 'pending' && status !== 'in_progress') {
      throw new Error(
        `Generation failed with status "${status}". ${data.error?.message ?? ''}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60_000} minutes. generationId: ${generationId}`,
  );
}

function formatResult(result: GenerationStatus): string {
  const url = result.gammaUrl ?? '';
  const credits =
    result.credits?.deducted != null
      ? `\nCredits used: ${result.credits.deducted} | Remaining: ${result.credits.remaining ?? 'unknown'}`
      : '';
  const exportUrl = result.exportUrl ? `\nExport: ${result.exportUrl}` : '';

  if (!url) return `Generation completed but no URL returned.${credits}`;
  return `Presentation generated successfully!\n\nURL: ${url}${exportUrl}${credits}\n\nYou can customize it directly in the Gamma editor.`;
}

// ── Server ─────────────────────────────────────────────────

const server = new McpServer({
  name: 'gamma-mcp-server',
  version: '1.0.0',
});

// ── Tool: generate ─────────────────────────────────────────

server.tool(
  'generate',
  'Generate a presentation, document, webpage, or social post using the Gamma API. Returns a link to the result.',
  {
    inputText: z
      .string()
      .min(1)
      .describe('Text and image URLs used to generate your gamma (1-100 000 tokens)'),
    textMode: z
      .enum(['generate', 'condense', 'preserve'])
      .default('generate')
      .describe(
        'generate: short prompts/outlines, condense: long content, preserve: keep text as-is',
      ),
    format: z
      .enum(['presentation', 'document', 'webpage', 'social'])
      .default('presentation')
      .describe('Output format'),
    numCards: z
      .number()
      .min(1)
      .max(60)
      .default(10)
      .describe('Number of cards/slides (max 60, max 75 for Ultra)'),
    cardSplit: z
      .enum(['auto', 'inputTextBreaks'])
      .default('auto')
      .describe('How to split content into cards'),
    language: z.string().default('en').describe('Language code (en, fr, es, de, …)'),
    textAmount: z
      .enum(['brief', 'medium', 'detailed', 'extensive'])
      .default('medium')
      .describe('Amount of text per card'),
    tone: z
      .string()
      .max(500)
      .optional()
      .describe('Tone of the content (e.g. "professional", "humorous and sarcastic")'),
    audience: z
      .string()
      .max(500)
      .optional()
      .describe('Intended audience (e.g. "investors", "students")'),
    imageSource: z
      .enum([
        'aiGenerated',
        'pictographic',
        'unsplash',
        'webAllImages',
        'webFreeToUse',
        'webFreeToUseCommercially',
        'giphy',
        'placeholder',
        'noImages',
      ])
      .default('aiGenerated')
      .describe('Image source for cards'),
    imageModel: z.string().optional().describe('Image model (e.g. "dall-e-3")'),
    imageStyle: z
      .string()
      .max(500)
      .optional()
      .describe('Image style (e.g. "minimal lineart style illustrations")'),
    dimensions: z
      .string()
      .default('16x9')
      .describe(
        'Card dimensions. Presentation: 16x9, 4x3, fluid. Document: fluid, pageless, letter, a4. Social: 1x1, 4x5, 9x16',
      ),
    additionalInstructions: z
      .string()
      .max(2000)
      .optional()
      .describe('Extra specifications about desired content'),
    themeId: z.string().optional().describe('Theme ID (use list-themes to find one)'),
    themeName: z
      .string()
      .optional()
      .describe('Theme name to search for (alternative to themeId)'),
    folderIds: z
      .array(z.string())
      .optional()
      .describe('Folder IDs to store the gamma in'),
    exportAs: z
      .enum(['pdf', 'pptx'])
      .optional()
      .describe('Also export as PDF or PPTX'),
    workspaceAccess: z
      .enum(['noAccess', 'view', 'comment', 'edit', 'fullAccess'])
      .optional()
      .describe('Workspace sharing level'),
    externalAccess: z
      .enum(['noAccess', 'view', 'comment', 'edit'])
      .optional()
      .describe('External sharing level'),
  },
  async (params) => {
    let resolvedThemeId = params.themeId;
    if (!resolvedThemeId && params.themeName) {
      const resp = await gammaFetch(
        `/themes?query=${encodeURIComponent(params.themeName)}&limit=5`,
      );
      if (resp.ok) {
        const data = (await resp.json()) as
          | Array<{ id: string; name: string }>
          | { data: Array<{ id: string; name: string }> };
        const themes = Array.isArray(data) ? data : (data.data ?? []);
        const match = themes.find((t) =>
          t.name.toLowerCase().includes(params.themeName!.toLowerCase()),
        );
        resolvedThemeId = match?.id ?? themes[0]?.id;
      }
    }

    const payload: Record<string, unknown> = {
      inputText: params.inputText,
      textMode: params.textMode,
      format: params.format,
      numCards: params.numCards,
      cardSplit: params.cardSplit,
      textOptions: {
        language: params.language,
        amount: params.textAmount,
        ...(params.tone ? { tone: params.tone } : {}),
        ...(params.audience ? { audience: params.audience } : {}),
      },
      imageOptions: {
        source: params.imageSource,
        ...(params.imageModel ? { model: params.imageModel } : {}),
        ...(params.imageStyle ? { style: params.imageStyle } : {}),
      },
      cardOptions: { dimensions: params.dimensions },
    };

    if (resolvedThemeId) payload['themeId'] = resolvedThemeId;
    if (params.additionalInstructions)
      payload['additionalInstructions'] = params.additionalInstructions;
    if (params.folderIds?.length) payload['folderIds'] = params.folderIds;
    if (params.exportAs) payload['exportAs'] = params.exportAs;
    if (params.workspaceAccess || params.externalAccess) {
      payload['sharingOptions'] = {
        ...(params.workspaceAccess ? { workspaceAccess: params.workspaceAccess } : {}),
        ...(params.externalAccess ? { externalAccess: params.externalAccess } : {}),
      };
    }

    const resp = await gammaFetch('/generations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const gen = (await assertOk(resp, 'Create generation')) as {
      generationId?: string;
    };
    const generationId = gen.generationId;
    if (!generationId) throw new Error('No generationId returned from API');

    const result = await pollGeneration(generationId);
    return { content: [{ type: 'text' as const, text: formatResult(result) }] };
  },
);

// ── Tool: generate-from-template ───────────────────────────

server.tool(
  'generate-from-template',
  'Generate a gamma by adapting an existing Gamma template. Returns a link to the result.',
  {
    gammaId: z.string().describe('The template gamma ID to adapt'),
    prompt: z
      .string()
      .min(1)
      .describe('Text, image URLs, and instructions used to adapt the template (1-100 000 tokens)'),
    themeId: z
      .string()
      .optional()
      .describe("Theme ID (uses template's theme if not specified)"),
    folderIds: z.array(z.string()).optional().describe('Folder IDs to store the gamma in'),
    exportAs: z.enum(['pdf', 'pptx']).optional().describe('Also export as PDF or PPTX'),
    imageModel: z.string().optional().describe('Image model (e.g. "dall-e-3")'),
    imageStyle: z
      .string()
      .max(500)
      .optional()
      .describe('Image style (e.g. "minimal lineart style illustrations")'),
    workspaceAccess: z
      .enum(['noAccess', 'view', 'comment', 'edit', 'fullAccess'])
      .optional()
      .describe('Workspace sharing level'),
    externalAccess: z
      .enum(['noAccess', 'view', 'comment', 'edit'])
      .optional()
      .describe('External sharing level'),
  },
  async (params) => {
    const payload: Record<string, unknown> = {
      gammaId: params.gammaId,
      prompt: params.prompt,
    };

    if (params.themeId) payload['themeId'] = params.themeId;
    if (params.folderIds?.length) payload['folderIds'] = params.folderIds;
    if (params.exportAs) payload['exportAs'] = params.exportAs;
    if (params.imageModel || params.imageStyle) {
      payload['imageOptions'] = {
        ...(params.imageModel ? { model: params.imageModel } : {}),
        ...(params.imageStyle ? { style: params.imageStyle } : {}),
      };
    }
    if (params.workspaceAccess || params.externalAccess) {
      payload['sharingOptions'] = {
        ...(params.workspaceAccess ? { workspaceAccess: params.workspaceAccess } : {}),
        ...(params.externalAccess ? { externalAccess: params.externalAccess } : {}),
      };
    }

    const resp = await gammaFetch('/generations/from-template', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const gen = (await assertOk(resp, 'Create from template')) as {
      generationId?: string;
    };
    const generationId = gen.generationId;
    if (!generationId) throw new Error('No generationId returned from API');

    const result = await pollGeneration(generationId);
    return { content: [{ type: 'text' as const, text: formatResult(result) }] };
  },
);

// ── Tool: get-generation-status ────────────────────────────

server.tool(
  'get-generation-status',
  'Check the status of a generation request. Useful if a previous generation timed out.',
  {
    generationId: z.string().describe('The generation ID to check'),
  },
  async ({ generationId }) => {
    const resp = await gammaFetch(`/generations/${generationId}`);
    const data = (await assertOk(resp, 'Get generation status')) as GenerationStatus;

    if (data.status === 'completed') {
      return { content: [{ type: 'text' as const, text: formatResult(data) }] };
    }

    const errorInfo = data.error ? ` Error: ${data.error.message}` : '';
    return {
      content: [
        {
          type: 'text' as const,
          text: `Status: ${data.status ?? 'unknown'}${errorInfo}\ngenerationId: ${generationId}`,
        },
      ],
    };
  },
);

// ── Tool: list-themes ──────────────────────────────────────

server.tool(
  'list-themes',
  'Search for available Gamma themes by name. Returns theme IDs for use in generation.',
  {
    query: z.string().default('').describe('Search query (case-insensitive)'),
    limit: z.number().min(1).max(50).default(10).describe('Max results per page'),
    after: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ query, limit, after }) => {
    let url = `/themes?query=${encodeURIComponent(query)}&limit=${limit}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    const resp = await gammaFetch(url);
    const raw = (await assertOk(resp, 'List themes')) as unknown;

    const themes: Array<{
      id: string;
      name: string;
      type?: string;
      colorKeywords?: string[];
      toneKeywords?: string[];
    }>  = [];
    let hasMore = false;
    let nextCursor = '';

    if (Array.isArray(raw)) {
      themes.push(...raw);
    } else {
      const paginated = raw as {
        data?: typeof themes;
        hasMore?: boolean;
        nextCursor?: string;
      };
      themes.push(...(paginated.data ?? []));
      hasMore = paginated.hasMore ?? false;
      nextCursor = paginated.nextCursor ?? '';
    }

    if (themes.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No themes found.' }] };
    }

    const lines = themes.map((t) => {
      const tags = [
        ...(t.colorKeywords ?? []),
        ...(t.toneKeywords ?? []),
      ].join(', ');
      return `- **${t.name}** (id: ${t.id}, type: ${t.type ?? 'unknown'})${tags ? ` — ${tags}` : ''}`;
    });

    if (hasMore && nextCursor) {
      lines.push(`\n_More results available. Use after: "${nextCursor}" to paginate._`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Tool: list-folders ─────────────────────────────────────

server.tool(
  'list-folders',
  'List workspace folders. Returns folder IDs for use in generation.',
  {
    query: z.string().default('').describe('Search query (case-sensitive)'),
    limit: z.number().min(1).max(50).default(10).describe('Max results per page'),
    after: z.string().optional().describe('Cursor for pagination'),
  },
  async ({ query, limit, after }) => {
    let url = `/folders?query=${encodeURIComponent(query)}&limit=${limit}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    const resp = await gammaFetch(url);
    const raw = (await assertOk(resp, 'List folders')) as unknown;

    const folders: Array<{ id: string; name: string }> = [];
    let hasMore = false;
    let nextCursor = '';

    if (Array.isArray(raw)) {
      folders.push(...raw);
    } else {
      const paginated = raw as {
        data?: typeof folders;
        hasMore?: boolean;
        nextCursor?: string;
      };
      folders.push(...(paginated.data ?? []));
      hasMore = paginated.hasMore ?? false;
      nextCursor = paginated.nextCursor ?? '';
    }

    if (folders.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No folders found.' }] };
    }

    const lines = folders.map((f) => `- **${f.name}** (id: ${f.id})`);

    if (hasMore && nextCursor) {
      lines.push(`\n_More results available. Use after: "${nextCursor}" to paginate._`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ── Start ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
