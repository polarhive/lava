/**
 * Shared utility functions for link processing
 */

export class LinkUtils {
    /**
     * Sanitize a link by removing markdown checkbox syntax
     */
    static sanitizeLink(link: string): string {
        return link.replace(/^[-\s\[\]x]+/, "").trim();
    }

    /**
     * Validate if a string is a valid HTTP(S) URL
     */
    static isValidHttpLink(link: string): boolean {
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link);
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
    static info(message: string): void {
        console.log(`[INFO] ${message}`);
    }

    static success(message: string): void {
        console.log(`✓ ${message}`);
    }

    static warn(message: string): void {
        console.warn(`[WARN] ${message}`);
    }

    static error(message: string): void {
        console.error(`[ERROR] ${message}`);
    }

    static debug(message: string): void {
        if (process.env.DEBUG === "1") {
            console.log(`[DEBUG] ${message}`);
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
}
