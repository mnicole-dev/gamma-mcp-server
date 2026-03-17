# @mnicole-dev/gamma-mcp-server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the [Gamma](https://gamma.app) public API (v1.0). Generate presentations, documents, webpages, and social posts programmatically from any MCP-compatible client.

## Why this package?

Existing Gamma MCP servers on npm (`@mercuryml/gamma-mcp-server`, `@iflow-mcp/nickloveinvesting-gamma-mcp-server`) call a deprecated API endpoint (`v0.1`) that returns 404 errors. This package targets the **current Gamma API v1.0** and covers **all available endpoints**.

## Features

| Tool | Description |
|------|-------------|
| `generate` | Create a presentation, document, webpage, or social post from a text prompt |
| `generate-from-template` | Adapt an existing Gamma template with new content |
| `get-generation-status` | Check the status of a generation (useful for timeouts) |
| `list-themes` | Search available themes by name (with pagination) |
| `list-folders` | List workspace folders (with pagination) |

## Requirements

- Node.js 18+
- A Gamma API key ([get one here](https://gamma.app/settings/api))

## Installation

```bash
npm install -g @mnicole-dev/gamma-mcp-server
```

Or run directly with `npx`:

```bash
npx @mnicole-dev/gamma-mcp-server
```

## Configuration

Set the `GAMMA_API_KEY` environment variable:

```bash
export GAMMA_API_KEY=sk-gamma-xxxxx
```

### Claude Code

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "gamma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mnicole-dev/gamma-mcp-server"],
      "env": {
        "GAMMA_API_KEY": "sk-gamma-xxxxx"
      }
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "gamma": {
      "command": "npx",
      "args": ["-y", "@mnicole-dev/gamma-mcp-server"],
      "env": {
        "GAMMA_API_KEY": "sk-gamma-xxxxx"
      }
    }
  }
}
```

### Cursor / Windsurf / other MCP clients

Use the stdio transport with `npx -y @mnicole-dev/gamma-mcp-server` as the command and pass `GAMMA_API_KEY` in the environment.

## Tools reference

### `generate`

Create a new gamma from a text prompt or outline.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `inputText` | string | Yes | — | Text and image URLs for the gamma (1–100,000 tokens) |
| `textMode` | string | No | `generate` | `generate` (short prompts), `condense` (long content), `preserve` (keep as-is) |
| `format` | string | No | `presentation` | `presentation`, `document`, `webpage`, `social` |
| `numCards` | number | No | `10` | Number of cards/slides (1–60, up to 75 for Ultra plans) |
| `cardSplit` | string | No | `auto` | `auto` or `inputTextBreaks` |
| `language` | string | No | `en` | Language code (`en`, `fr`, `es`, `de`, …) |
| `textAmount` | string | No | `medium` | `brief`, `medium`, `detailed`, `extensive` |
| `tone` | string | No | — | Tone of the content (e.g. `"professional"`, `"humorous"`) |
| `audience` | string | No | — | Intended audience (e.g. `"investors"`, `"students"`) |
| `imageSource` | string | No | `aiGenerated` | `aiGenerated`, `pictographic`, `unsplash`, `webAllImages`, `webFreeToUse`, `webFreeToUseCommercially`, `giphy`, `placeholder`, `noImages` |
| `imageModel` | string | No | — | Image model (e.g. `"dall-e-3"`) |
| `imageStyle` | string | No | — | Image style (e.g. `"minimal lineart style illustrations"`) |
| `dimensions` | string | No | `16x9` | Presentation: `16x9`, `4x3`, `fluid`. Document: `fluid`, `pageless`, `letter`, `a4`. Social: `1x1`, `4x5`, `9x16` |
| `additionalInstructions` | string | No | — | Extra instructions for the generator (max 2,000 chars) |
| `themeId` | string | No | — | Theme ID (use `list-themes` to find one) |
| `themeName` | string | No | — | Theme name to search for (alternative to `themeId`) |
| `folderIds` | string[] | No | — | Folder IDs to store the gamma in |
| `exportAs` | string | No | — | `pdf` or `pptx` |
| `workspaceAccess` | string | No | — | `noAccess`, `view`, `comment`, `edit`, `fullAccess` |
| `externalAccess` | string | No | — | `noAccess`, `view`, `comment`, `edit` |

### `generate-from-template`

Adapt an existing Gamma template with new content.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `gammaId` | string | Yes | — | The template gamma ID to adapt |
| `prompt` | string | Yes | — | Instructions and content for adaptation (1–100,000 tokens) |
| `themeId` | string | No | — | Theme ID (uses template's theme if omitted) |
| `folderIds` | string[] | No | — | Folder IDs to store the gamma in |
| `exportAs` | string | No | — | `pdf` or `pptx` |
| `imageModel` | string | No | — | Image model |
| `imageStyle` | string | No | — | Image style |
| `workspaceAccess` | string | No | — | Workspace sharing level |
| `externalAccess` | string | No | — | External sharing level |

### `get-generation-status`

Check the status of a previously started generation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `generationId` | string | Yes | The generation ID to check |

Returns the current status (`pending`, `in_progress`, `completed`, `failed`) and the gamma URL if completed.

### `list-themes`

Search for available Gamma themes.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | No | `""` | Search query (case-insensitive) |
| `limit` | number | No | `10` | Max results per page (1–50) |
| `after` | string | No | — | Cursor for pagination |

### `list-folders`

List workspace folders.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | No | `""` | Search query (case-sensitive) |
| `limit` | number | No | `10` | Max results per page (1–50) |
| `after` | string | No | — | Cursor for pagination |

## Examples

### Generate a presentation

```
> Create a 5-slide presentation about renewable energy in French
```

The `generate` tool will be called with:
```json
{
  "inputText": "Renewable energy: solar, wind, hydro, geothermal, and biomass",
  "numCards": 5,
  "language": "fr"
}
```

### Generate from a template

```
> Adapt template abc123 for our Q1 sales report
```

The `generate-from-template` tool will be called with:
```json
{
  "gammaId": "abc123",
  "prompt": "Q1 2026 sales report with revenue figures and growth metrics"
}
```

### Export as PowerPoint

```
> Create a 10-slide investor deck and export as PPTX
```

```json
{
  "inputText": "Series A investor deck for a B2B SaaS startup",
  "numCards": 10,
  "audience": "investors",
  "tone": "professional",
  "exportAs": "pptx"
}
```

## How it works

1. The MCP client sends a tool call to the server via stdio
2. The server sends the request to the Gamma API (`https://public-api.gamma.app/v1.0`)
3. For generation requests, the server polls the status endpoint every 10 seconds until completion (up to 15 minutes)
4. The server returns the gamma URL and credit usage information

## Development

```bash
git clone https://github.com/mnicole-dev/gamma-mcp-server.git
cd gamma-mcp-server
pnpm install
pnpm dev          # Run with tsx (requires GAMMA_API_KEY)
pnpm build        # Build to dist/
```

## License

MIT
