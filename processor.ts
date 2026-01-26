import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import { ConfigManager, Parser, ReturnFormat } from "./config";
import { ProcessResult } from "./types";
import { LinkUtils, Logger, FileUtils } from "./utils";

export class LinkProcessor {
    private config: ConfigManager;
    private browser: Browser | null = null;

    constructor(config: ConfigManager) {
        this.config = config;
    }

    private async initializePuppeteer(): Promise<Browser> {
        if (this.browser) {
            return this.browser;
        }

        // Find the installed Chrome executable
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        let chromePath: string | undefined;

        // Determine cache directory based on environment or platform
        let cacheDir = process.env.PUPPETEER_CACHE_DIR;
        if (!cacheDir) {
            // Use platform-specific defaults
            const homeDir = os.homedir();
            if (process.platform === 'darwin') {
                // macOS
                cacheDir = path.join(homeDir, '.cache', 'puppeteer');
            } else if (process.platform === 'linux') {
                // Linux
                cacheDir = process.env.XDG_CACHE_HOME
                    ? path.join(process.env.XDG_CACHE_HOME, 'puppeteer')
                    : path.join(homeDir, '.cache', 'puppeteer');
            } else if (process.platform === 'win32') {
                // Windows
                cacheDir = path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'puppeteer');
            } else {
                cacheDir = path.join(homeDir, '.cache', 'puppeteer');
            }
        }

        console.log(`Searching for Chrome in: ${cacheDir}`);

        // Helper function to find Chrome executable in directory
        const findChromeExecutable = (dir: string): string | undefined => {
            if (!fs.existsSync(dir)) return undefined;

            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const versionDirs = entries
                    .filter(entry => entry.isDirectory() && /^(linux|mac_arm|mac|win)-/.test(entry.name))
                    .map(entry => entry.name)
                    .sort((a, b) => b.localeCompare(a)); // Sort descending for latest version

                for (const versionDir of versionDirs) {
                    const versionPath = path.join(dir, versionDir);
                    const possiblePaths = [
                        path.join(versionPath, 'chrome-linux64', 'chrome'),
                        path.join(versionPath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
                        path.join(versionPath, 'chrome-win', 'chrome.exe'),
                        path.join(versionPath, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
                        path.join(versionPath, 'chrome-headless-shell-linux', 'chrome-headless-shell'),
                        path.join(versionPath, 'chrome-headless-shell-win', 'chrome-headless-shell.exe'),
                    ];

                    for (const possiblePath of possiblePaths) {
                        if (fs.existsSync(possiblePath)) {
                            return possiblePath;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error scanning ${dir}:`, error);
            }

            return undefined;
        };

        // Try to find Chrome in cache directory
        chromePath = findChromeExecutable(path.join(cacheDir, 'chrome'));
        if (chromePath) {
            console.log(`Using Chrome at: ${chromePath}`);
        } else {
            // Try to find Chrome-headless-shell in cache directory
            chromePath = findChromeExecutable(path.join(cacheDir, 'chrome-headless-shell'));
            if (chromePath) {
                console.log(`Using Chrome-headless-shell at: ${chromePath}`);
            }
        }

        // Final fallback: try system Chrome
        if (!chromePath) {
            const systemPaths = [
                '/usr/bin/google-chrome',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
            ];
            for (const sysPath of systemPaths) {
                if (fs.existsSync(sysPath)) {
                    chromePath = sysPath;
                    console.log(`Using system Chrome at: ${chromePath}`);
                    break;
                }
            }
        }

        if (!chromePath) {
            // List cache contents for debugging
            try {
                if (fs.existsSync(cacheDir)) {
                    console.log(`Cache directory contents (${cacheDir}):`);
                    const cacheContents = fs.readdirSync(cacheDir, { recursive: true });
                    cacheContents.slice(0, 20).forEach(item => console.log(`  ${item}`));
                }
            } catch (error) {
                console.warn('Could not list cache contents:', error);
            }
            throw new Error('Chrome executable not found. Please install with: bunx puppeteer browsers install chrome or bunx puppeteer browsers install chrome-headless-shell');
        }

        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer"
            ],
            executablePath: chromePath,
        });

        return this.browser;
    }

    private async processSingleLinkWithPuppeteer(
        link: string,
        browser: Browser,
        returnMarkdown: boolean,
        saveToDisk: boolean
    ): Promise<{ updatedLink: string; markdown?: string; frontmatter?: any; body?: string }> {
        const line = link.trim();

        if (LinkUtils.isProcessed(line)) {
            Logger.debug(`Skipping! already processed: ${line}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        const task = LinkUtils.sanitizeLink(line);
        if (!LinkUtils.isValidHttpLink(task)) {
            Logger.debug(`Skipping! non-URL task: ${task}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        try {
            Logger.info(`Processing link (Puppeteer): ${task}`);
            const page: Page = await browser.newPage();

            await page.goto(task, { waitUntil: "domcontentloaded", timeout: 30000 });

            const pageData = await page.evaluate(() => ({
                html: document.documentElement.outerHTML,
                url: document.URL,
            }));

            const dom = new JSDOM(pageData.html, { url: pageData.url });
            const result = await Defuddle(dom, pageData.url, {
                markdown: true,
                debug: false,
            });

            if (!result.content) {
                throw new Error("Failed to extract article content");
            }

            // Fix relative image paths to absolute
            result.content = FileUtils.fixImagePaths(result.content, pageData.url);

            const frontmatterObj = {
                title: result.title || "Untitled",
                source: result.domain ? `https://${result.domain}` : pageData.url,
                url: pageData.url,
                author: result.author || "",
                published: result.published || "",
                clipped: new Date().toISOString().split("T")[0],
                tags: ["clippings"],
                description: result.description || "",
                image: result.image || "",
                favicon: result.favicon || "",
            };

            const fileContent = this.buildFileContent(result, pageData.url);
            const fileName = LinkUtils.sanitizeFileName(result.title || "Untitled") + ".md";
            let filePath = "";

            if (saveToDisk) {
                filePath = join(this.config.getClippingPath(), fileName);
                const dir = dirname(filePath);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
                writeFileSync(filePath, fileContent, "utf-8");
                Logger.success(`Saved: ${filePath}`);
            } else {
                Logger.info(`Would save to: ${fileName}`);
            }

            await page.close();

            return {
                updatedLink: LinkUtils.markAsProcessed(task),
                markdown: returnMarkdown ? fileContent : undefined,
                frontmatter: frontmatterObj,
                body: result.content
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Failed to process link: ${task}. Error: ${errorMessage}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }
    }

    private async processSingleLinkWithFetch(
        link: string,
        returnMarkdown: boolean,
        saveToDisk: boolean
    ): Promise<{ updatedLink: string; markdown?: string; frontmatter?: any; body?: string }> {
        const line = link.trim();

        if (LinkUtils.isProcessed(line)) {
            Logger.debug(`Skipping! already processed: ${line}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        const task = LinkUtils.sanitizeLink(line);
        if (!LinkUtils.isValidHttpLink(task)) {
            Logger.debug(`Skipping! non-URL task: ${task}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        try {
            Logger.info(`Processing link (JSDOM): ${task}`);
            const response = await fetch(task);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();

            // Parse with Defuddle (used by official obsidian-clipper)
            const dom = new JSDOM(html, { url: task });
            const result = await Defuddle(dom, task, {
                markdown: true,
                debug: false,
            });

            if (!result.content) {
                throw new Error("Failed to extract article content");
            }

            // Fix relative image paths to absolute
            result.content = FileUtils.fixImagePaths(result.content, task);

            const frontmatterObj = {
                title: result.title || "Untitled",
                source: result.domain ? `https://${result.domain}` : task,
                url: task,
                author: result.author || "",
                published: result.published || "",
                clipped: new Date().toISOString().split("T")[0],
                tags: ["clippings"],
                description: result.description || "",
                image: result.image || "",
                favicon: result.favicon || "",
            };

            const fileContent = this.buildFileContent(result, task);
            const fileName = LinkUtils.sanitizeFileName(result.title || "Untitled") + ".md";
            let filePath = "";

            if (saveToDisk) {
                filePath = join(this.config.getClippingPath(), fileName);
                const dir = dirname(filePath);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
                writeFileSync(filePath, fileContent, "utf-8");
                Logger.success(`Saved: ${filePath}`);
            } else {
                Logger.info(`Would save to: ${fileName}`);
            }

            return {
                updatedLink: LinkUtils.markAsProcessed(task),
                markdown: returnMarkdown ? fileContent : undefined,
                frontmatter: frontmatterObj,
                body: result.content
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.error(`Failed to process link: ${task}. Error: ${errorMessage}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }
    }

    private buildFileContent(result: any, url: string): string {
        return FileUtils.buildMarkdownContent(
            result.title,
            url,
            result.domain,
            result.author,
            result.published,
            result.description,
            result.image,
            result.favicon,
            result.content
        );
    }

    async processLinks(
        links: string[],
        returnFormat?: ReturnFormat,
        parser?: Parser,
        saveToDisk?: boolean
    ): Promise<ProcessResult | string[] | any[]> {
        const finalReturnFormat = returnFormat || this.config.returnFormat;
        const finalParser = parser || this.config.parser;
        const finalSaveToDisk = saveToDisk !== undefined ? saveToDisk : this.config.saveToDisk;

        if (finalSaveToDisk) {
            Logger.info(`Clippings will be saved to: ${this.config.getClippingPath()}`);
        }
        Logger.info(`Using parser: ${finalParser}`);
        Logger.info(`Return format: ${finalReturnFormat}`);
        Logger.info(`Save to disk: ${finalSaveToDisk}`);

        const updatedLinks: string[] = [];
        const markdownResults: string[] = [];
        const jsonResults: any[] = [];
        const returnMarkdown = finalReturnFormat === "md";

        if (finalParser === "puppeteer") {
            const browser = await this.initializePuppeteer();

            try {
                for (const link of links) {
                    const result = await this.processSingleLinkWithPuppeteer(link, browser, returnMarkdown, finalSaveToDisk);
                    updatedLinks.push(result.updatedLink);
                    if (returnMarkdown && result.markdown !== undefined) {
                        markdownResults.push(result.markdown);
                    }
                    if (!returnMarkdown && result.frontmatter && result.body) {
                        jsonResults.push({
                            url: link,
                            frontmatter: result.frontmatter,
                            body: result.body
                        });
                    }
                }
            } finally {
                if (this.browser) {
                    await this.browser.close();
                    this.browser = null;
                }
                Logger.info("All links processed.");
            }
        } else {
            // Use JSDOM mode
            for (const link of links) {
                const result = await this.processSingleLinkWithFetch(link, returnMarkdown, finalSaveToDisk);
                updatedLinks.push(result.updatedLink);
                if (returnMarkdown && result.markdown !== undefined) {
                    markdownResults.push(result.markdown);
                }
                if (!returnMarkdown && result.frontmatter && result.body) {
                    jsonResults.push({
                        url: link,
                        frontmatter: result.frontmatter,
                        body: result.body
                    });
                }
            }
            Logger.info("All links processed.");
        }

        return returnMarkdown
            ? { updatedLinks, markdown: markdownResults }
            : jsonResults.length > 0 ? jsonResults : updatedLinks;
    }
}