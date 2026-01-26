import { watch, FSWatcher } from "chokidar";
import { readFileSync, writeFileSync } from "fs";
import { existsSync } from "fs";
import { ConfigManager } from "./config";
import { ProcessResult } from "./types";
import { LinkUtils, Logger } from "./utils";

export class FileWatcher {
    private watcher: FSWatcher | null = null;
    private config: ConfigManager;
    private lastWriteTime = 0;

    constructor(config: ConfigManager) {
        this.config = config;
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
                        writeFileSync(linksFile, lines.join("\n"), "utf-8");
                        Logger.success(`✓ Checked off [${idx + 1}/${total}]: ${item.sanitized}`);
                    }
                ) as ProcessResult;
            } catch (error) {
                Logger.error(`Failed batch processing: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        Logger.debug("✓ Daemon mode ready with " + this.config.parser + " parser");
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
    }
}