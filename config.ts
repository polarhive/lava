import { join, isAbsolute } from "path";

export type Parser = "puppeteer" | "jsdom";
export type ReturnFormat = "md" | "json";

export class ConfigManager {
    private config: {
        clippingDir?: string;
        linksFile?: string;
        parser: Parser;
        returnFormat: ReturnFormat;
        saveToDisk: boolean;
        isDaemonMode: boolean;
    };

    constructor(isDaemonMode: boolean = false) {
        const parserEnv = (Bun.env.PARSER || "").toLowerCase();
        const returnFormatEnv = (Bun.env.RETURN_FORMAT || "").toLowerCase();
        const saveToDiskEnv = (Bun.env.SAVE_TO_DISK || "").toLowerCase();

        this.config = {
            clippingDir: Bun.env.CLIPPING_DIR,
            linksFile: Bun.env.LINKS_FILE,
            parser: parserEnv === "jsdom" ? "jsdom" : "puppeteer",
            returnFormat: returnFormatEnv === "md" ? "md" : "json",
            saveToDisk: saveToDiskEnv !== "false",
            isDaemonMode,
        };
        this.validate();
    }

    private validate(): void {
        // Only require these for daemon mode
        if (this.config.isDaemonMode) {
            if (!this.config.clippingDir) {
                throw new Error("CLIPPING_DIR environment variable not set (required for daemon mode)");
            }
            if (!this.config.linksFile) {
                throw new Error("LINKS_FILE environment variable not set (required for daemon mode)");
            }
        }
    }

    get clippingDir(): string {
        if (!this.config.clippingDir) {
            throw new Error("CLIPPING_DIR not configured");
        }
        return this.config.clippingDir;
    }

    get linksFile(): string | undefined {
        return this.config.linksFile;
    }

    get parser(): Parser {
        return this.config.parser;
    }

    get returnFormat(): ReturnFormat {
        return this.config.returnFormat;
    }

    get saveToDisk(): boolean {
        return this.config.saveToDisk;
    }

    getClippingPath(): string {
        if (!this.config.clippingDir) {
            throw new Error("CLIPPING_DIR not configured");
        }
        return isAbsolute(this.config.clippingDir)
            ? this.config.clippingDir
            : join(process.cwd(), this.config.clippingDir);
    }

    getLinksFilePath(): string {
        if (!this.config.linksFile) {
            throw new Error("LINKS_FILE not configured");
        }
        return isAbsolute(this.config.linksFile)
            ? this.config.linksFile
            : join(process.cwd(), this.config.linksFile);
    }
}