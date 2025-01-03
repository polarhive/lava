# lava

lava is a daemon that monitors a file within your vault for new links and
automatically populates your Obsidian clippings directory with fresh content.

## Prerequisites

- VPS or PC capable of running `node`
- An Obsidian vault with a .md file containing links

## Setup

```sh
git clone --depth=1 https://github.com/polarhive/lava
cd lava; npm i
ln -s /path/to/vault vault -f; # symlink from lava/vault
npx puppeteer browsers install chrome-headless-shell
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
file from any device, and lava will handle the rest. (This assumes you've set
up your vault to sync with the VPS or PC running the lava daemon).

ref: [remotely](https://polarhive.net/blog/obsidian)

```sh
node index.js
```

A new file will be created in your **Obsidian clippings** directory with the title of the link.

## LICENSE

- MIT 2025. Nathan Matthew Paul
- MIT 2024. Obsidian [clipper bookmarklet](https://gist.github.com/kepano/90c05f162c37cf730abb8ff027987ca3)

