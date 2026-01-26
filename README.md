# lava

lava is a web clipping tool that can run as a server or daemon to automatically populate your Obsidian clippings directory with fresh content from URLs.

## Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- An Obsidian vault (for daemon mode)

## Setup

```sh
git clone --depth=1 https://github.com/polarhive/lava; cd lava
bun i
```

## Configuration

Create a `.env` file with your configuration:

```sh
# Required
CLIPPING_DIR=Clippings
LINKS_FILE=bookmarks.md

# Optional (defaults shown)
PARSER=puppeteer           # "puppeteer" or "jsdom"
RETURN_FORMAT=json         # "json" or "md"
SAVE_TO_DISK=true          # "true" or "false"
DAEMON=1                   # Run in daemon mode
```

Paths can be absolute or relative to the current working directory.

### Parser Options

**Puppeteer** (default)
- Uses headless Chrome/Chromium browser
- Better for JavaScript-heavy websites
- Requires Chrome/Puppeteer installation
- Higher resource usage

**JSDOM** (lightweight)
- HTTP fetch + JSDOM parsing
- Good for static content
- No browser required
- Lower resource usage

### Return Formats

**JSON** (default)
- Returns structured data with `updatedLinks` array
- Useful for automation

**Markdown**
- Returns raw markdown content
- Single link returns raw markdown file
- Multiple links return JSON with markdown array

## Usage

### Server Mode (Default)

Run lava as a web server on port 3000:

```sh
bun start
```

The server provides an API endpoint to process links programmatically.

#### API Usage

Process links via HTTP POST to `/api`:

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "links": ["https://example.com"],
    "returnFormat": "md",
    "parser": "puppeteer",
    "saveToDisk": true
  }'
```

**Request Parameters:**
- `links` (required): Array of URLs to process
- `returnFormat` (optional): `"md"` for markdown, `"json"` for JSON (default: env var or `"json"`)
- `parser` (optional): `"puppeteer"` or `"jsdom"` (default: env var or `"puppeteer"`)
- `saveToDisk` (optional): `true` or `false` (default: env var or `true`)

**Response:**

When `returnFormat: "json"`:
```json
[
  {
    "url": "https://example.com",
    "frontmatter": {
      "title": "Example Domain",
      "source": "https://example.com",
      "url": "https://example.com",
      "author": "",
      "published": "",
      "clipped": "2026-01-26",
      "tags": ["clippings"],
      "description": "",
      "image": "",
      "favicon": "https://example.com/favicon.ico"
    },
    "body": "Document content here..."
  }
]
```

When `returnFormat: "md"` with single link: raw markdown content (`text/markdown`)

**Note:** `CLIPPING_DIR` and `LINKS_FILE` are only required when using daemon mode or when `saveToDisk: true`. You can run the server API without these env vars if you're only extracting content without saving to disk.

**Examples:**

```bash
# Return markdown content without saving
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"links": ["https://example.com"], "returnFormat": "md", "saveToDisk": false}'

# Use lightweight JSDOM parser
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"links": ["https://example.com"], "parser": "jsdom"}'

# Use environment defaults
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"links": ["https://example.com"]}'
```
### Daemon Mode

Monitor a file for new links and automatically process them:

```sh
bun start --daemon
# or
DAEMON=1 bun start
```

Simply add a new link to your bookmarks.md file from any device, and lava will handle the rest.

### Combining Options

```sh
# Daemon with JSDOM parser (lightweight, no browser)
DAEMON=1 PARSER=jsdom bun start

# Server with markdown output by default
RETURN_FORMAT=md bun start

# Daemon, don't save to disk (just return content)
DAEMON=1 SAVE_TO_DISK=false bun start
```

### Development

For development with auto-reload:

```sh
bun dev
```

## Project Architecture

### Core Files

- **index.ts** - Entry point, handles CLI arguments and mode selection
- **config.ts** - Configuration management with types and validation
- **processor.ts** - Core link processing with Puppeteer & JSDOM parsers
- **watcher.ts** - File watcher for daemon mode
- **server.ts** - HTTP server for API mode
- **utils.ts** - Shared utilities (link validation, logging, file operations)
- **types.ts** - TypeScript interfaces

### Key Design Patterns

#### Separation of Concerns
- **LinkUtils**: Link validation, sanitization, and processing state
- **Logger**: Centralized logging with levels (info, success, warn, error, debug)
- **FileUtils**: Markdown generation and image path normalization
- **ConfigManager**: Configuration with validation and type safety

#### Flexible Processing
The `LinkProcessor` class abstracts the processing details:
- `processSingleLinkWithPuppeteer()` - Browser-based extraction
- `processSingleLinkWithFetch()` - Lightweight JSDOM extraction
- Both support independent `returnFormat` and `saveToDisk` control
- Both use the same `buildFileContent()` method for consistency

#### Request-Level Overrides
API requests can override environment defaults:
- Parser can be switched per-request
- Return format can be changed without server restart
- Save behavior can be toggled on-the-fly

## Deployment

### Render.com

This project is configured for deployment on Render.com. The `postinstall` script automatically installs Chrome for Puppeteer during the build process.

Set the following environment variables in your Render.com service:
- `CLIPPING_DIR`: Directory where clippings are saved
- `LINKS_FILE`: Path to links file for daemon mode

## LICENSE

- MIT 2025. Nathan Matthew Paul
- MIT 2024. Obsidian [clipper](https://github.com/obsidianmd/obsidian-clipper)
- MIT 2024. Defuddle [content extraction](https://github.com/kepano/defuddle)
