#!/usr/bin/env bun
/// <reference types="bun-types" />

import { ConfigManager } from "./config";
import { LinkProcessor } from "./processor";
import { FileWatcher } from "./watcher";
import { LavaServer } from "./server";

async function main() {
    const args = process.argv.slice(2);
    const isDaemon = args.includes('--daemon') || args.includes('-d');

    const config = new ConfigManager();
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
}

main().catch(console.error);
