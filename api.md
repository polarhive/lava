# Lava API Documentation

## Overview

Lava is a web clipping API that extracts content from URLs and returns it in structured formats. The API supports both JSON and Markdown output formats, with options for different parsing engines and disk storage.

**Base URL:** `http://localhost:3000` (default port)  
**Content-Type:** `application/json`

## Endpoints

### POST /api

Process one or more URLs and extract their content.

#### Request

```http
POST /api
Content-Type: application/json

{
  "links": ["https://example.com"],
  "returnFormat": "json",
  "parser": "puppeteer",
  "saveToDisk": true
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `links` | `string[]` | Yes | - | Array of URLs to process |
| `returnFormat` | `"json" \| "md"` | No | `"json"` | Output format |
| `parser` | `"puppeteer" \| "jsdom"` | No | `"puppeteer"` | Content extraction method |
| `saveToDisk` | `boolean` | No | `true` | Whether to save clippings to disk |

#### Parser Options

- **puppeteer**: Uses headless Chrome browser for JavaScript-heavy sites
- **jsdom**: Lightweight HTTP fetch with JSDOM parsing for static content

#### Return Format Behavior

- **Single link + `returnFormat: "md"`**: Returns raw markdown content (`text/markdown`)
- **Multiple links**: Always returns JSON format regardless of `returnFormat`
- **JSON format**: Returns structured data with frontmatter and body

#### Response Examples

**JSON Response (default):**
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

**Markdown Response (single link):**
```markdown
---
title: Example Domain
source: https://example.com
url: https://example.com
author: ""
published: ""
clipped: 2026-01-26
tags: [clippings]
description: ""
image: ""
favicon: https://example.com/favicon.ico
---

Document content here...
```

**Error Response:**
```json
{
  "error": "Error message"
}
```

#### Status Codes

- `200`: Success
- `400`: Bad request (invalid JSON, missing links array, etc.)
- `500`: Internal server error

### GET /ping

Health check endpoint.

#### Request

```http
GET /ping
```

#### Response

```json
{
  "status": "ok",
  "timestamp": "2026-01-26T10:30:00.000Z"
}
```

### GET /health

Alias for `/ping`.

#### Request

```http
GET /health
```

#### Response

Same as `/ping`.

## Usage Examples

### Basic Usage

```bash
# Process a single URL with default settings
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{"links": ["https://example.com"]}'
```

### Markdown Output

```bash
# Get markdown content without saving to disk
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "links": ["https://example.com"],
    "returnFormat": "md",
    "saveToDisk": false
  }'
```

### Lightweight Parser

```bash
# Use JSDOM parser for faster processing
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "links": ["https://example.com"],
    "parser": "jsdom"
  }'
```

### Multiple Links

```bash
# Process multiple URLs (always returns JSON)
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -d '{
    "links": [
      "https://example.com",
      "https://another-site.com"
    ]
  }'
```

## Configuration

The API behavior can be configured via environment variables:

- `PORT`: Server port (default: 3000)
- `PARSER`: Default parser (`"puppeteer"` or `"jsdom"`)
- `RETURN_FORMAT`: Default return format (`"json"` or `"md"`)
- `SAVE_TO_DISK`: Default save behavior (`true` or `false`)
- `CLIPPING_DIR`: Directory for saved clippings (required if `saveToDisk: true`)
- `LINKS_FILE`: Path to links file for daemon mode

## Special Handling

### YouTube Links

YouTube URLs are automatically detected and return embedded content with video information.

### Blocked Domains

Certain domains may be blocked for content extraction. The API will skip these links and mark them as processed.

### File Extensions

Links with non-HTML file extensions (e.g., `.pdf`, `.jpg`) are skipped.

### Link Processing State

Links are marked as processed using special markers. Already processed links are skipped in subsequent requests.

## Error Handling

The API provides detailed error messages for common issues:

- Invalid JSON in request body
- Missing or invalid `links` parameter
- Network errors during content fetching
- Parser-specific errors

All errors return a JSON response with an `error` field and appropriate HTTP status code.