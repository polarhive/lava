import { watch, FSWatcher } from "chokidar";
import { readFileSync, writeFileSync } from "fs";
import { existsSync } from "fs";
import { ConfigManager } from "./config";
import { ProcessResult } from "./types";

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

        this.watcher = watch(linksFile, {
            persistent: true,
        });

        this.watcher.on("change", async (path: string) => {
            const now = Date.now();
            if (now - this.lastWriteTime < 500) return; // Ignore changes within 0.5 second of our write

            console.log(`File ${path} has been changed.`);
            let content = readFileSync(linksFile, "utf-8");
            let lines = content.split("\n");

            // Process each line individually
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith("- [x]")) continue; // Skip empty lines and already processed

                const sanitizedLink = line.replace(/^[-\s\[\]x]+/, "").trim();
                if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(sanitizedLink)) continue; // Skip non-URLs

                console.log(`Processing: ${sanitizedLink}`);
                try {
                    const result = await processor.processLinks([line], false) as string[];
                    if (result[0] !== line) { // Only update if the link was actually processed
                        lines[i] = result[0];
                        this.lastWriteTime = Date.now();
                        writeFileSync(linksFile, lines.join("\n"), "utf-8");
                        console.log(`✓ Checked off: ${sanitizedLink}`);
                    }
                } catch (error) {
                    console.error(`Failed to process ${sanitizedLink}:`, error);
                }
            }
        });

        console.log("🌋 Lava is watching for new links...");
    }

    async initialProcess(processor: { processLinks: (links: string[]) => Promise<ProcessResult | string[]> }): Promise<void> {
        const linksFile = this.config.getLinksFilePath();
        let content = readFileSync(linksFile, "utf-8");
        let lines = content.split("\n");

        // Process each line individually
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith("- [x]")) continue; // Skip empty lines and already processed

            const sanitizedLink = line.replace(/^[-\s\[\]x]+/, "").trim();
            if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(sanitizedLink)) continue; // Skip non-URLs

            console.log(`Processing: ${sanitizedLink}`);
            try {
                const result = await processor.processLinks([line], false) as string[];
                if (result[0] !== line) { // Only update if the link was actually processed
                    lines[i] = result[0];
                    this.lastWriteTime = Date.now();
                    writeFileSync(linksFile, lines.join("\n"), "utf-8");
                    console.log(`✓ Checked off: ${sanitizedLink}`);
                }
            } catch (error) {
                console.error(`Failed to process ${sanitizedLink}:`, error);
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