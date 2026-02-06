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
        const isPollRequested = args.includes('--poll') || args.includes('-p') || Bun.env.POLL === "1";
        const pollFile = args.find(arg => arg.startsWith('--file='))?.split('=')[1] || Bun.env.POLL_FILE;

        // Check if required daemon env vars are set
        const hasDaemonRequirements = !!Bun.env.CLIPPING_DIR && !!Bun.env.LINKS_FILE;

        // If daemon explicitly requested but requirements missing, error out
        if (isDaemonRequested && !hasDaemonRequirements) {
            throw new Error("Daemon mode requires CLIPPING_DIR and LINKS_FILE environment variables");
        }

        // If poll mode requested but no file specified, error out
        if (isPollRequested && !pollFile) {
            throw new Error("Poll mode requires POLL_FILE environment variable or --file= option");
        }

        const isDaemon = isDaemonRequested && hasDaemonRequirements;
        const isPoll = isPollRequested && pollFile;

        const config = new ConfigManager(isDaemon || isPoll);
        const processor = new LinkProcessor(config);

        if (isDaemon) {
            // Daemon mode: watch file and process on changes
            const watcher = new FileWatcher(config);

            // Initial process
            await watcher.initialProcess(processor);

            // Start watching
            watcher.startWatching(processor);
        } else if (isPoll) {
            // Poll mode: monitor markdown file for links every 10 seconds
            const watcher = new FileWatcher(config);

            // Start polling
            watcher.startPollingMarkdownFile(pollFile, processor);
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
