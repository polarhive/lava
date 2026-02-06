import { watch, FSWatcher } from "chokidar";
import { readFileSync, writeFileSync } from "fs";
import { existsSync } from "fs";
import { ConfigManager } from "./config";
import { ProcessResult } from "./types";
import { LinkUtils, Logger } from "./utils";

export class FileWatcher {
    private watcher: FSWatcher | null = null;
    private pollInterval: NodeJS.Timeout | null = null;
    private config: ConfigManager;
    private lastWriteTime = 0;
    private processedLinks = new Set<string>();

    constructor(config: ConfigManager) {
        this.config = config;
    }

    // Extract all links from markdown content
    private extractLinksFromMarkdown(content: string): Array<{ raw: string; sanitized: string; line: number }> {
        const links: Array<{ raw: string; sanitized: string; line: number }> = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            // Find markdown links: [text](url)
            const markdownLinks = line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g);
            for (const match of markdownLinks) {
                const url = match[2];
                if (LinkUtils.isValidHttpLink(url) && !LinkUtils.isBlockedDomain(url)) {
                    links.push({
                        raw: match[0],
                        sanitized: url,
                        line: index + 1
                    });
                }
            }

            // Find bare URLs
            const bareUrls = line.matchAll(/(https?:\/\/[^\s]+)/g);
            for (const match of bareUrls) {
                const url = match[1];
                if (LinkUtils.isValidHttpLink(url) && !LinkUtils.isBlockedDomain(url)) {
                    // Check if this URL is already captured as a markdown link
                    const alreadyCaptured = links.some(link => link.sanitized === url && link.line === index + 1);
                    if (!alreadyCaptured) {
                        links.push({
                            raw: url,
                            sanitized: url,
                            line: index + 1
                        });
                    }
                }
            }
        });

        return links;
    }

    startWatching(processor: { processLinks: (links: string[], returnFormat?: any, parser?: any, saveToDisk?: any) => Promise<ProcessResult | string[]> }): void {
        const linksFile = this.config.getLinksFilePath();

        if (!existsSync(linksFile)) {
            throw new Error(`File "${linksFile}" not found.`);
        }

        Logger.info(`🌋 Lava is watching for new links (parser: ${this.config.parser})...`);

        this.watcher = watch(linksFile, {
            persistent: true,
        });

        this.watcher.on("change", async (path: string) => {
            const now = Date.now();
            if (now - this.lastWriteTime < 500) return; // Ignore changes within 0.5 second of our write

            Logger.info(`File ${path} has been changed.`);
            await this.processFile(processor, linksFile);
        });

        Logger.debug("✓ Daemon mode ready with " + this.config.parser + " parser");
    }

    // New method for polling a markdown file every 10 seconds
    startPollingMarkdownFile(filePath: string, processor: { processLinks: (links: string[], returnFormat?: any, parser?: any, saveToDisk?: any) => Promise<ProcessResult | string[]> }): void {
        if (!existsSync(filePath)) {
            throw new Error(`File "${filePath}" not found.`);
        }

        Logger.info(`🌋 Lava is polling ${filePath} for new links every 10 seconds (parser: ${this.config.parser})...`);

        // Initial process
        this.processMarkdownFile(processor, filePath);

        // Poll every 10 seconds
        this.pollInterval = setInterval(() => {
            this.processMarkdownFile(processor, filePath);
        }, 10000);

        Logger.debug("✓ Polling mode ready with " + this.config.parser + " parser");
    }

    private async processFile(processor: { processLinks: (links: string[], returnFormat?: any, parser?: any, saveToDisk?: any) => Promise<ProcessResult | string[]> }, filePath: string): void {
        let content = readFileSync(filePath, "utf-8");
        let lines = content.split("\n");

        // Batch process all pending links to avoid repeated disk reads
        const pending: Array<{ index: number; raw: string; sanitized: string }> = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.trim();
            if (LinkUtils.shouldSkip(line)) continue;

            const sanitizedLink = LinkUtils.sanitizeLink(line);
            if (!LinkUtils.isValidHttpLink(sanitizedLink)) continue;

            pending.push({ index: i, raw: rawLine, sanitized: sanitizedLink });
        }

        if (pending.length === 0) return;

        const total = pending.length;
        Logger.info(`Processing ${total} new link(s)...`);

        try {
            const result = await processor.processLinks(
                pending.map(p => p.raw),
                "md",
                undefined,
                undefined,
                (idx: number, sanitized: string) => {
                    // Callback fired after each link is processed
                    const item = pending[idx];
                    lines[item.index] = sanitized;
                    this.lastWriteTime = Date.now();
                    writeFileSync(filePath, lines.join("\n"), "utf-8");
                    Logger.success(`✓ Checked off [${idx + 1}/${total}]: ${item.sanitized}`);
                }
            ) as ProcessResult;
        } catch (error) {
            Logger.error(`Failed batch processing: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async processMarkdownFile(processor: { processLinks: (links: string[], returnFormat?: any, parser?: any, saveToDisk?: any) => Promise<ProcessResult | string[]> }, filePath: string): void {
        let content = readFileSync(filePath, "utf-8");
        const allLinks = this.extractLinksFromMarkdown(content);

        // Filter to only new links
        const pending = allLinks.filter(link => !this.processedLinks.has(link.sanitized));

        if (pending.length === 0) return;

        const total = pending.length;
        Logger.info(`Processing ${total} new link(s) from ${filePath}...`);

        try {
            await processor.processLinks(
                pending.map(p => p.raw),
                "md",
                undefined,
                undefined,
                (idx: number, sanitized: string) => {
                    // Mark as processed
                    this.processedLinks.add(sanitized);
                    Logger.success(`✓ Processed [${idx + 1}/${total}]: ${sanitized}`);
                }
            );
        } catch (error) {
            Logger.error(`Failed batch processing: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async initialProcess(processor: { processLinks: (links: string[], returnFormat?: any, parser?: any, saveToDisk?: any) => Promise<ProcessResult | string[]> }): Promise<void> {
        const linksFile = this.config.getLinksFilePath();
        Logger.debug(`Initial processing with parser: ${this.config.parser}`);

        let content = readFileSync(linksFile, "utf-8");
        let lines = content.split("\n");

        // Batch process all pending links to avoid repeated disk reads
        const pending: Array<{ index: number; raw: string; sanitized: string }> = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.trim();
            if (LinkUtils.shouldSkip(line)) continue;

            const sanitizedLink = LinkUtils.sanitizeLink(line);
            if (!LinkUtils.isValidHttpLink(sanitizedLink)) continue;

            pending.push({ index: i, raw: rawLine, sanitized: sanitizedLink });
        }

        if (pending.length === 0) return;

        const total = pending.length;
        Logger.info(`Processing ${total} link(s) initially...`);

        try {
            const result = await processor.processLinks(
                pending.map(p => p.raw),
                "md",
                undefined,
                undefined,
                (idx: number, sanitized: string) => {
                    // Callback fired after each link is processed
                    const item = pending[idx];
                    lines[item.index] = sanitized;
                    this.lastWriteTime = Date.now();
                    writeFileSync(linksFile, lines.join("\n"), "utf-8");
                    Logger.success(`✓ Checked off [${idx + 1}/${total}]: ${item.sanitized}`);
                }
            ) as ProcessResult;
        } catch (error) {
            Logger.error(`Failed batch processing: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}