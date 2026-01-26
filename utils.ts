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
                // Handle /embed/<id> or /shorts/<id>
                if (pathParts[0] === "embed" || pathParts[0] === "shorts") {
                    return pathParts[1] || null;
                }
            }
        } catch {
            return null;
        }

        return null;
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
        return content.replace(
            /!\[([^\]]*)\]\((?!https?:\/\/)([^)]*)\)/g,
            (match, alt, path) => {
                try {
                    const resolved = new URL(path, baseUrl).href;
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
    static buildYouTubeEmbed(title: string, url: string, id: string): { frontmatter: string; frontmatterObj: Record<string, any>; content: string; title: string } {
        const safeTitle = title || "YouTube Video";
        const embedUrl = `https://www.youtube.com/embed/${id}`;

        const frontmatterObj = {
            title: safeTitle,
            source: "https://youtube.com",
            url,
            clipped: new Date().toISOString().split("T")[0],
            tags: ["clippings", "youtube"],
        };

        const frontmatter = this.buildFrontmatter(
            frontmatterObj.title,
            frontmatterObj.url,
            "youtube.com",
            "",
            "",
            "",
            "",
            ""
        );

        const body = `<iframe width="560" height="315" src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n\n[Watch on YouTube](${url})`;

        const content = `---\n${frontmatter}\n---\n# ${safeTitle}\n\n${body}`;

        return { frontmatter, frontmatterObj, content, title: safeTitle };
    }
}
