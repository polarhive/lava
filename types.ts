/// <reference types="bun-types" />

export interface Config {
    vault: string;
    clippingDir: string;
    linksFile?: string;
}

export interface ProcessResult {
    updatedLinks: string[];
    markdown?: string[];
}

export interface LinkProcessor {
    processLinks(links: string[], returnMarkdown?: boolean): Promise<ProcessResult | string[]>;
}

export interface FileWatcher {
    startWatching(callback: (links: string[]) => Promise<void>): void;
    stopWatching(): void;
}

export interface Server {
    start(): void;
}