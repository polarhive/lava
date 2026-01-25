import { join, isAbsolute } from "path";

export class ConfigManager {
    private config: {
        vault: string;
        clippingDir: string;
        linksFile?: string;
    };

    constructor() {
        this.config = {
            vault: Bun.env.VAULT || "",
            clippingDir: Bun.env.CLIPPING_DIR || "",
            linksFile: Bun.env.LINKS_FILE,
        };
    }

    get vault(): string {
        return this.config.vault;
    }

    get clippingDir(): string {
        return this.config.clippingDir;
    }

    get linksFile(): string | undefined {
        return this.config.linksFile;
    }

    getClippingPath(): string {
        return isAbsolute(this.config.clippingDir)
            ? this.config.clippingDir
            : join(process.cwd(), this.config.vault, this.config.clippingDir);
    }

    getLinksFilePath(): string {
        if (!this.config.linksFile) {
            throw new Error("LINKS_FILE environment variable not set");
        }
        return isAbsolute(this.config.linksFile)
            ? this.config.linksFile
            : join(process.cwd(), this.config.vault, this.config.linksFile);
    }
}