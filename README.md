# lava

lava is a daemon that monitors a file within your vault for new links and
automatically populates your Obsidian clippings directory with fresh content.

## Prerequisites

- [Bun](https://bun.sh) v1.0 or higher
- An Obsidian vault with a .md file containing links

## Setup

```sh
git clone --depth=1 https://github.com/polarhive/lava; cd lava
bun i
```

## Configuration

Rename the sample `.env.example` to `.env` and set your environment variables:

```sh
VAULT=vault
CLIPPING_DIR=Clippings
LINKS_FILE=vault/bookmarks.md
```

## Usage

The process is mostly automated. Simply add a new link to your bookmarks.md
file from any device, and lava will handle the rest.

```sh
bun start
```

Or for development with auto-reload:

```sh
bun dev
```

## LICENSE

- MIT 2025. Nathan Matthew Paul
- MIT 2024. Obsidian [clipper](https://github.com/obsidianmd/obsidian-clipper)
- MIT 2024. Defuddle [content extraction](https://github.com/kepano/defuddle)


