#!/usr/bin/env bun
/// <reference types="bun-types" />

import { ConfigManager } from "./config";
import { LinkProcessor } from "./processor";
import { FileWatcher } from "./watcher";
import { LavaServer } from "./server";
import { Logger } from "./utils";

async function main() {
    try {
        // Check if daemon mode is requested
        const args = process.argv.slice(2);
        const isDaemonRequested = args.includes('--daemon') || args.includes('-d') || Bun.env.DAEMON === "1";

        // Check if required daemon env vars are set
        const hasDaemonRequirements = !!Bun.env.CLIPPING_DIR && !!Bun.env.LINKS_FILE;

        // If daemon explicitly requested but requirements missing, error out
        if (isDaemonRequested && !hasDaemonRequirements) {
            throw new Error("Daemon mode requires CLIPPING_DIR and LINKS_FILE environment variables");
        }

        const isDaemon = isDaemonRequested && hasDaemonRequirements;

        const config = new ConfigManager(isDaemon);
        const processor = new LinkProcessor(config);

        if (isDaemon) {
            // Daemon mode: watch file and process on changes
            const watcher = new FileWatcher(config);

            // Initial process
            await watcher.initialProcess(processor);

            // Start watching
            watcher.startWatching(processor);
        } else {
            // Server mode: listen on port 3000
            const server = new LavaServer(processor, config);
            server.start();
        }
    } catch (error) {
        Logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
