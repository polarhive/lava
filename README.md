# lava

lava is a daemon that seamlessly watches a file: **bookmarks.md** for new
links and populates your **Obsidian clippings** directory with fresh content.

## Prerequisites

- VPS or PC capable of running
- `node` and `pnpm`

## Installation

```sh
cd vault/.. # one level above where your vault is located
git clone https://github.com/polarhive/lava; cd lava
pnpm i
```

## Configuration

Rename the sample `.env.example` to `.env` and set your environment variables:

```sh
VAULT=vault
CLIPPING_DIR=Clippings
LINKS_FILE=bookmarks.md
```

## Usage

The usage is pretty much automated. Just add a new link to your **bookmarks.md** file
from any of your devices and lava will take care of the rest. (Assuming you have setup
your vault to sync ref: [remotely](https://polarhive.net/blog/obsidian) to the VPS or
server where the lava daemon is running).

```sh
pnpm exec node index.js
```

A new file will be created in your **Obsidian clippings** directory with the title of the link.

## LICENSE

- MIT 2025. Nathan Matthew Paul
- MIT 2024. Obsidian [clipper bookmarklet](https://gist.github.com/kepano/90c05f162c37cf730abb8ff027987ca3)
