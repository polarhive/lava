import puppeteer, { type Browser, type Page } from "puppeteer";
import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import { ConfigManager } from "./config";
import { ProcessResult } from "./types";

export class LinkProcessor {
    private config: ConfigManager;

    constructor(config: ConfigManager) {
        this.config = config;
    }

    private sanitizeLink(link: string): string {
        return link.replace(/^[-\s\[\]x]+/, "").trim();
    }

    private isValidHttpLink(link: string): boolean {
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link);
    }

    private sanitizeFileName(name: string): string {
        return name.replace(/[:/\\?%*"|<>]/g, "-").replace(/\s+/g, " ").trim();
    }

    private async processSingleLink(
        link: string,
        browser: Browser,
        returnMarkdown: boolean
    ): Promise<{ updatedLink: string; markdown?: string }> {
        const line = link.trim();

        if (line.startsWith("- [x]")) {
            console.log(`Skipping! already processed: ${line}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        const task = this.sanitizeLink(line);
        if (!this.isValidHttpLink(task)) {
            console.log(`Skipping! non-URL task: ${task}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }

        try {
            console.log(`Processing link: ${task}`);
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
            result.content = result.content.replace(
                /!\[([^\]]*)\]\((?!https?:\/\/)([^)]*)\)/g,
                (match, alt, path) => {
                    try {
                        const resolved = new URL(path, pageData.url).href;
                        return `![${alt}](${resolved})`;
                    } catch {
                        return match;
                    }
                }
            );

            const fileName = this.sanitizeFileName(result.title || "Untitled") + ".md";

            // Build Obsidian-compatible frontmatter
            const today = new Date().toISOString().split("T")[0];
            const frontmatter = {
                title: result.title || "Untitled",
                source: result.domain ? `https://${result.domain}` : pageData.url,
                url: pageData.url,
                author: result.author || "",
                published: result.published || "",
                clipped: today,
                tags: ["clippings"],
                description: result.description || "",
                image: result.image || "",
                favicon: result.favicon || "",
            };

            // Create YAML frontmatter
            const yaml = Object.entries(frontmatter)
                .map(([key, value]) => {
                    if (Array.isArray(value)) {
                        return `${key}:\n${value.map((v) => `  - ${v}`).join("\n")}`;
                    }
                    if (typeof value === "string") {
                        return `${key}: "${value.replace(/"/g, '\\"')}"`;
                    }
                    return `${key}: ${value}`;
                })
                .join("\n");

            // Combine frontmatter and content
            const fileContent = `---\n${yaml}\n---\n# ${result.title || "Untitled"}\n\n${result.content}`;

            if (!returnMarkdown) {
                const filePath = join(this.config.getClippingPath(), fileName);
                const dir = dirname(filePath);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
                writeFileSync(filePath, fileContent, "utf-8");
                console.log(`✓ Saved: ${fileName}`);
            }

            await page.close();

            return {
                updatedLink: `- [x] ${task}`,
                markdown: returnMarkdown ? fileContent : undefined,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to process link: ${task}. Error: ${errorMessage}`);
            return { updatedLink: line, markdown: returnMarkdown ? "" : undefined };
        }
    }

    async processLinks(
        links: string[],
        returnMarkdown: boolean = false
    ): Promise<ProcessResult | string[]> {
        console.log(`Clippings will be saved to: ${this.config.getClippingPath()}`);

        const browser: Browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const updatedLinks: string[] = [];
        const markdownResults: string[] = [];

        try {
            for (const link of links) {
                const result = await this.processSingleLink(link, browser, returnMarkdown);
                updatedLinks.push(result.updatedLink);
                if (returnMarkdown && result.markdown !== undefined) {
                    markdownResults.push(result.markdown);
                }
            }
        } finally {
            await browser.close();
            console.log("All links processed.");
        }

        return returnMarkdown
            ? { updatedLinks, markdown: markdownResults }
            : updatedLinks;
    }
}