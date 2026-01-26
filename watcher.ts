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

    startWatching(processor: { processLinks: (links: string[]) => Promise<ProcessResult | string[]> }): void {
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

            // Process each line individually
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (LinkUtils.shouldSkip(line)) continue;

                const sanitizedLink = LinkUtils.sanitizeLink(line);
                if (!LinkUtils.isValidHttpLink(sanitizedLink)) continue;

                Logger.info(`Processing: ${sanitizedLink}`);
                try {
                    const result = await processor.processLinks([line]) as string[];
                    if (result[0] !== line) { // Only update if the link was actually processed
                        lines[i] = result[0];
                        this.lastWriteTime = Date.now();
                        writeFileSync(linksFile, lines.join("\n"), "utf-8");
                        Logger.success(`Checked off: ${sanitizedLink}`);
                    }
                } catch (error) {
                    Logger.error(`Failed to process ${sanitizedLink}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });

        Logger.info("✓ Daemon mode ready with " + this.config.parser + " parser");
    }

    async initialProcess(processor: { processLinks: (links: string[]) => Promise<ProcessResult | string[]> }): Promise<void> {
        const linksFile = this.config.getLinksFilePath();
        Logger.info(`Initial processing with parser: ${this.config.parser}`);

        let content = readFileSync(linksFile, "utf-8");
        let lines = content.split("\n");

        // Process each line individually
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (LinkUtils.shouldSkip(line)) continue;

            const sanitizedLink = LinkUtils.sanitizeLink(line);
            if (!LinkUtils.isValidHttpLink(sanitizedLink)) continue;

            Logger.info(`Processing: ${sanitizedLink}`);
            try {
                const result = await processor.processLinks([line]) as string[];
                if (result[0] !== line) { // Only update if the link was actually processed
                    lines[i] = result[0];
                    this.lastWriteTime = Date.now();
                    writeFileSync(linksFile, lines.join("\n"), "utf-8");
                    Logger.success(`Checked off: ${sanitizedLink}`);
                }
            } catch (error) {
                Logger.error(`Failed to process ${sanitizedLink}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}