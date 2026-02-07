# lava plugin for Obsidian

Extract links from your vault and save them as durable Markdown documents and clippings.

## Features

- Monitors specified markdown files (e.g., bookmarks.md, daily notes) for links
- Automatically processes links by fetching content from a lava server
- Saves processed content as clippings in a designated folder
- Supports markdown links and bare URLs
- Configurable polling interval and blocked domains

## Installation

1. Download the latest release from the [GitHub releases page](https://github.com/polarhive/lava/releases).
2. Extract the zip file into your `.obsidian/plugins/` folder.
3. Reload Obsidian and enable the "Lava" plugin in the Community Plugins settings.

## Configuration

After enabling the plugin, go to Settings → Community plugins → Lava to configure:

- **Link bookmark file**: Path to the markdown file containing links to monitor (e.g., `bookmarks.md`).
- **Processing delay (seconds)**: Delay after file changes before processing links.
- **Watch daily note**: Enable monitoring of today's daily note for links.
- **Daily note path**: Folder where daily notes are stored.
- **Daily note format**: Date format for daily note filenames.
- **Clipping folder**: Folder where processed clippings are saved.
- **Lava server URL**: URL of the lava server for processing links.
- **Parser type**: HTML parser to use (default: jsdom).
- **Blocked domains**: Comma-separated list of domains to skip.
- **Default tags**: Tags to add to all clippings.

## Usage

1. Create a bookmark file (e.g., `bookmarks.md`) in your vault root.
2. Add links to the file, either as markdown links `[text](url)` or bare URLs.
3. The plugin will automatically detect changes and process new links.
4. Processed clippings will appear in the specified clipping folder.

You can also manually trigger processing using the "Process link bookmark file" command from the command palette.

## Requirements

- [Obsidian](https://obsidian.md/)
- A running lava server (see [lava server repository](https://github.com/polarhive/lava) for setup)

## How it works

The plugin monitors file changes in the specified bookmark file and daily notes. When a new link is detected, it sends a request to the lava server to fetch and process the content. The server returns markdown content, which is then saved as a clipping with frontmatter containing title, source URL, and tags.

## Contributing

Contributions are welcome! Please open issues or pull requests on the [GitHub repository](https://github.com/polarhive/lava).

## License

This plugin is licensed under the MIT License. See the LICENSE file for details.