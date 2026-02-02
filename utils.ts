/**
 * Shared utility functions for link processing
 */

export class LinkUtils {
    private static blockedDomains = [
        "docs.google.com",
        "sheets.google.com",
        "sites.google.com",
        "drive.google.com"
    ];

    /**
     * Sanitize a link by removing markdown checkbox syntax
     */
    static sanitizeLink(link: string): string {
        // Drop leading list / checkbox markers
        const trimmed = link.replace(/^[-\s\[\]x]+/, "").trim();

        // Prefer explicit markdown link target: [text](url)
        const markdownTarget = trimmed.match(/\((https?:\/\/[^\s)]+)\)/);
        if (markdownTarget?.[1]) return markdownTarget[1];

        // Fall back to first bare http(s) token
        const bare = trimmed.match(/(https?:\/\/[^\s\]]+)/);
        if (bare?.[1]) return bare[1];

        return trimmed;
    }

    /**
     * Skip domains we know we cannot reliably parse (e.g., Google Docs)
     */
    static isBlockedDomain(link: string): boolean {
        try {
            const host = new URL(link).hostname.toLowerCase();
            return this.blockedDomains.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
        } catch {
            return false;
        }
    }

    /**
     * Extract YouTube video id if present
     */
    static getYouTubeId(link: string): string | null {
        try {
            const url = new URL(link);
            const host = url.hostname.toLowerCase();

            if (host === "youtu.be") {
                const id = url.pathname.split("/").filter(Boolean)[0];
                return id || null;
            }

            if (host.endsWith("youtube.com")) {
                if (url.searchParams.has("v")) {
                    return url.searchParams.get("v");
                }
                const pathParts = url.pathname.split("/").filter(Boolean);
                // Handle /embed/<id>, /shorts/<id>, or /live/<id>
                if (pathParts[0] === "embed" || pathParts[0] === "shorts" || pathParts[0] === "live") {
                    return pathParts[1] || null;
                }
            }
        } catch {
            return null;
        }

        return null;
    }

    /**
     * Detect if a YouTube URL is a channel (not a single video).
     * Recognizes paths like /channel/, /c/, /user/, or handles starting with '@'.
     */
    static isYouTubeChannel(link: string): boolean {
        try {
            const url = new URL(link);
            const host = url.hostname.toLowerCase();
            if (!(host === 'youtu.be' || host.endsWith('youtube.com'))) return false;
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length === 0) return false;
            const first = pathParts[0].toLowerCase();
            if (first === 'channel' || first === 'c' || first === 'user') return true;
            // handle /@handle or segments starting with '@'
            if (url.pathname.startsWith('/@') || pathParts.some(seg => seg.startsWith('@'))) return true;
            // If URL has no 'v' param and doesn't look like embed/shorts/watch/live, consider it a channel/landing page
            if (!url.searchParams.has('v') && first !== 'watch' && first !== 'embed' && first !== 'shorts' && first !== 'live') {
                // But youtu.be is always a video short link
                if (host === 'youtu.be') return false;
                return false;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Build the canonical YouTube watch URL for a given video id or link.
     * Ensures consistent redirects for thumbnails and embeds.
     */
    static canonicalizeYouTubeUrl(link: string, id?: string): string {
        try {
            if (id) {
                return `https://www.youtube.com/watch?v=${id}`;
            }
            const url = new URL(link);
            // If 'v' param present, use it
            if (url.searchParams.has('v')) {
                return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
            }
            // youtu.be short link
            if (url.hostname.toLowerCase() === 'youtu.be') {
                const pid = url.pathname.split('/').filter(Boolean)[0];
                if (pid) return `https://www.youtube.com/watch?v=${pid}`;
            }
            // /embed/<id>, /shorts/<id>, or /live/<id>
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'live') {
                const pid = pathParts[1];
                if (pid) return `https://www.youtube.com/watch?v=${pid}`;
            }
            // Fallback to original link
            return link;
        } catch {
            return link;
        }
    }

    /**
     * Validate if a string is a valid HTTP(S) URL
     */
    static isValidHttpLink(link: string): boolean {
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link);
    }

    /**
     * Check if URL has a non-HTML file extension
     */
    static hasNonHtmlExtension(link: string): boolean {
        const nonHtmlExtensions = [
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
            '.zip', '.rar', '.tar', '.gz', '.7z',
            '.txt', '.csv', '.xml', '.json',
            '.exe', '.dmg', '.pkg', '.deb', '.rpm'
        ];
        const urlPath = link.split('?')[0].toLowerCase(); // Remove query params
        return nonHtmlExtensions.some(ext => urlPath.endsWith(ext));
    }

    /**
     * Sanitize a string to be a valid filename across all platforms
     */
    static sanitizeFileName(name: string): string {
        return name
            // Replace em/en dashes and other dash-like characters with regular dash
            .replace(/[—–−]/g, "-")
            // Replace problematic characters with dash
            .replace(/[:/\\?%*"|<>]/g, "-")
            // Replace any remaining non-ASCII or control characters
            .replace(/[^\x20-\x7E]/g, "")
            // Replace spaces with underscores
            .replace(/\s+/g, "_")
            // Replace multiple dashes with single dash
            .replace(/-+/g, "-")
            // Replace multiple underscores with single underscore
            .replace(/_+/g, "_")
            // Trim spaces, dashes, and underscores from start/end
            .trim()
            .replace(/^[-_\s]+|[-_\s]+$/g, "")
            // Remove leading dot to avoid hidden files
            .replace(/^\.+/, "")
            // Limit length (reserve space for extension)
            .slice(0, 200)
            // Final cleanup
            .trim() || "Untitled";
    }

    /**
     * Check if a line is already processed (marked as done)
     */
    static isProcessed(line: string): boolean {
        return line.trim().startsWith("- [x]");
    }

    /**
     * Check if a line should be skipped (empty or already processed)
     */
    static shouldSkip(line: string): boolean {
        return !line.trim() || this.isProcessed(line);
    }

    /**
     * Create a processed line marker
     */
    static markAsProcessed(link: string): string {
        return `- [x] ${link}`;
    }
}

export class Logger {
    private static colors = {
        reset: "\x1b[0m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        red: "\x1b[31m",
        cyan: "\x1b[36m",
        gray: "\x1b[90m",
    };

    static info(message: string): void {
        console.log(`${this.colors.green}[INFO]${this.colors.reset} ${message}`);
    }

    static success(message: string): void {
        console.log(`${this.colors.green}[INFO]${this.colors.reset} ${message}`);
    }

    static warn(message: string): void {
        console.warn(`${this.colors.yellow}[WARN]${this.colors.reset} ${message}`);
    }

    static error(message: string): void {
        console.error(`${this.colors.red}[ERROR]${this.colors.reset} ${message}`);
    }

    static debug(message: string): void {
        if (process.env.DEBUG === "1") {
            console.log(`${this.colors.gray}[DEBUG]${this.colors.reset} ${message}`);
        }
    }
}

export class FileUtils {
    /**
     * Format article metadata into Obsidian-compatible YAML frontmatter
     */
    static buildFrontmatter(
        title: string,
        url: string,
        domain: string | undefined,
        author: string,
        published: string,
        description: string,
        image: string,
        favicon: string
    ): string {
        const today = new Date().toISOString().split("T")[0];
        const frontmatter = {
            title: title || "Untitled",
            source: domain ? `https://${domain}` : url,
            url: url,
            author: author || "",
            published: published || "",
            clipped: today,
            tags: ["clippings"],
            description: description || "",
            image: image || "",
            favicon: favicon || "",
        };

        return Object.entries(frontmatter)
            .filter(([_, value]) => {
                // Skip empty strings and empty arrays
                if (typeof value === "string" && value === "") return false;
                if (Array.isArray(value) && value.length === 0) return false;
                return true;
            })
            .map(([key, value]) => {
                if (Array.isArray(value)) {
                    return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
                }
                if (typeof value === "string") {
                    return `${key}: "${value.replace(/"/g, '\\"')}"`;
                }
                return `${key}: ${value}`;
            })
            .join("\n");
    }

    /**
     * Build complete markdown file with frontmatter and content
     */
    static buildMarkdownContent(
        title: string,
        url: string,
        domain: string | undefined,
        author: string,
        published: string,
        description: string,
        image: string,
        favicon: string,
        content: string
    ): string {
        const frontmatter = this.buildFrontmatter(
            title,
            url,
            domain,
            author,
            published,
            description,
            image,
            favicon
        );
        return `---\n${frontmatter}\n---\n# ${title || "Untitled"}\n\n${content}`;
    }

    /**
     * Fix relative image paths to absolute URLs
     */
    static fixImagePaths(content: string, baseUrl: string): string {
        // Normalize baseUrl so that relative paths resolve against the directory when appropriate.
        // If the base path doesn't end with '/' and the last path segment doesn't look like a filename (no dot),
        // append a trailing slash so resolving 'wiki.png' against 'https://site/foo/bar' yields
        // 'https://site/foo/bar/wiki.png' instead of 'https://site/foo/wiki.png'.
        let normalizedBase = baseUrl;
        try {
            const urlObj = new URL(baseUrl);
            const lastSegment = urlObj.pathname.split('/').filter(Boolean).pop() || '';
            if (!urlObj.pathname.endsWith('/') && lastSegment && !lastSegment.includes('.')) {
                urlObj.pathname = urlObj.pathname + '/';
                normalizedBase = urlObj.href;
            }
        } catch {
            // If parsing fails, fall back to the original baseUrl
        }

        return content.replace(
            /!\[([^\]]*)\]\((?!https?:\/\/)([^)]*)\)/g,
            (match, alt, path) => {
                try {
                    const resolved = new URL(path, normalizedBase).href;
                    return `![${alt}](${resolved})`;
                } catch {
                    return match;
                }
            }
        );
    }

    /**
     * Build a minimal stub markdown when extraction fails.
     */
    static buildStubMarkdown(title: string, url: string): string {
        const safeTitle = title || "Untitled Link";
        const domain = (() => {
            try {
                return new URL(url).hostname;
            } catch {
                return undefined;
            }
        })();

        const frontmatter = this.buildFrontmatter(
            safeTitle,
            url,
            domain,
            "",
            "",
            "",
            "",
            ""
        );

        const body = `Content could not be extracted automatically.\n\nLink: ${url}`;

        return `---\n${frontmatter}\n---\n# ${safeTitle}\n\n${body}`;
    }

    /**
     * Fetch YouTube title via oEmbed; returns null on failure.
     */
    static async fetchYouTubeTitle(url: string): Promise<string | null> {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const res = await fetch(oembedUrl);
            if (!res.ok) return null;
            const data = await res.json() as { title?: string };
            return typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
        } catch {
            return null;
        }
    }

    /**
     * Build a simple YouTube embed markdown block
     */
    static buildYouTubeEmbed(title: string, url: string, id: string): { frontmatter: string; frontmatterObj: Record<string, any>; content: string; body: string; title: string } {
        const safeTitle = title || "YouTube Video";
        const canonicalUrl = LinkUtils.canonicalizeYouTubeUrl(url, id);

        // Use the video thumbnail as the frontmatter image so clients can present a preview
        const thumbnailUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

        const frontmatterObj = {
            title: safeTitle,
            source: "https://youtube.com",
            url: canonicalUrl,
            clipped: new Date().toISOString().split("T")[0],
            tags: ["clippings", "youtube"],
            image: thumbnailUrl,
        };

        const frontmatter = this.buildFrontmatter(
            frontmatterObj.title,
            frontmatterObj.url,
            "youtube.com",
            "",
            "",
            "",
            thumbnailUrl,
            ""
        );

        // For YouTube, produce a simple markdown image link pointing to the canonical watch URL (no iframe or thumbnail)
        const body = `![${safeTitle}](${canonicalUrl})`;

        // 'content' remains the full markdown used when saving to disk
        const content = `---\n${frontmatter}\n---\n# ${safeTitle}\n\n${body}`;

        return { frontmatter, frontmatterObj, content, body, title: safeTitle };
    }
}
