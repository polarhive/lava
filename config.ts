import { join, isAbsolute } from "path";

export type Parser = "jsdom";
export type ReturnFormat = "md";

function _getEnv(name: string): string | undefined {
    // Bun provides Bun.env; Node/Electron provides process.env
    try {
        // @ts-ignore
        if (typeof Bun !== 'undefined' && Bun && Bun.env) return Bun.env[name];
    } catch (e) {
        // ignore
    }
    return process.env[name];
}

export class ConfigManager {
    private config: {
        clippingDir?: string;
        linksFile?: string;
        parser: Parser;
        returnFormat: ReturnFormat;
        saveToDisk: boolean;
        isDaemonMode: boolean;
    };

    constructor(isDaemonMode: boolean = false, overrides?: Partial<{ clippingDir: string; linksFile: string; parser: Parser; returnFormat: ReturnFormat; saveToDisk: boolean }>) {
        const parserEnv = ((_getEnv("PARSER") || "") as string).toLowerCase();
        const returnFormatEnv = ((_getEnv("RETURN_FORMAT") || "") as string).toLowerCase();
        const saveToDiskEnv = ((_getEnv("SAVE_TO_DISK") || "") as string).toLowerCase();

        this.config = {
            clippingDir: overrides?.clippingDir || _getEnv("CLIPPING_DIR"),
            linksFile: overrides?.linksFile || _getEnv("LINKS_FILE"),
            parser: (overrides && overrides.parser) ? overrides.parser : (parserEnv === "jsdom" ? "jsdom" : "puppeteer"),
            returnFormat: (overrides && overrides.returnFormat) ? overrides.returnFormat : (returnFormatEnv === "md"),
            saveToDisk: overrides && overrides.saveToDisk !== undefined ? overrides.saveToDisk : (saveToDiskEnv !== "false"),
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