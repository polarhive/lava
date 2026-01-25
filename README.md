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

For daemon mode, create a `.env` file with your environment variables:

```sh
VAULT=vault
CLIPPING_DIR=Clippings
LINKS_FILE=vault/bookmarks.md
```

For server mode, set `VAULT` and `CLIPPING_DIR` to specify where clippings are saved.

## Usage

### Server Mode (Default)

Run lava as a web server on port 3000:

```sh
bun start
```

The server provides an API endpoint to process links programmatically.

#### API Usage

Process links via HTTP POST:

To return markdown content instead of saving to files, include the `returnMarkdown` flag:

```bash
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"links": ["https://example.com"], "returnMarkdown": true}'
```

When `returnMarkdown` is `true`:
- For a single link: returns the raw markdown content with `Content-Type: text/markdown`
- For multiple links: returns JSON with `updatedLinks` and `markdown` arrays
### Daemon Mode

Monitor a file for new links and automatically process them:

```sh
bun start --daemon
```

Simply add a new link to your bookmarks.md file from any device, and lava will handle the rest.

### Development

For development with auto-reload:

```sh
bun dev
```

## Deployment

### Render.com

This project is configured for deployment on Render.com. The `postinstall` script automatically installs Chrome for Puppeteer during the build process.

Set the following environment variables in your Render.com service:
- `VAULT`: Path to your vault directory (optional for API mode)
- `CLIPPING_DIR`: Directory where clippings are saved (optional for API mode)
- `LINKS_FILE`: Path to links file for daemon mode (optional)

## LICENSE

- MIT 2025. Nathan Matthew Paul
- MIT 2024. Obsidian [clipper](https://github.com/obsidianmd/obsidian-clipper)
- MIT 2024. Defuddle [content extraction](https://github.com/kepano/defuddle)
