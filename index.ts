import { watch } from "chokidar";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { join, dirname, isAbsolute } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";

/// <reference types="bun-types" />

let isProcessing = false;

(async () => {
    const vault = Bun.env.VAULT || "";
    const clippingDir = Bun.env.CLIPPING_DIR || "";
    const linksFile = Bun.env.LINKS_FILE || "";

    const finalClippingDir = isAbsolute(clippingDir) ? clippingDir : join(process.cwd(), vault, clippingDir);
    console.log(`Clippings will be saved to: ${finalClippingDir}`);

    if (!existsSync(linksFile)) {
        console.error(`File "${linksFile}" not found.`);
        process.exit(1);
    }

    const sanitizeLink = (link: string): string => link.replace(/^[-\s\[\]x]+/, "").trim();
    const isValidHttpLink = (link: string): boolean => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link);

    const processLinks = async (): Promise<void> => {
        if (isProcessing) {
            console.log("Skipping! duplicate cycle.");
            return;
        }

        isProcessing = true;

        const links = readFileSync(linksFile, "utf-8")
            .split("\n")
            .filter((line) => line.trim() !== "");

        const browser: Browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page: Page = await browser.newPage();
        const updatedLinks = [...links];

        for (let i = 0; i < links.length; i++) {
            const line = links[i].trim();

            if (line.startsWith("- [x]")) {
                console.log(`Skipping! already processed: ${line}`);
                continue;
            }

            const task = sanitizeLink(line);
            if (!isValidHttpLink(task)) {
                console.log(`Skipping! non-URL task: ${task}`);
                continue;
            }

            try {
                console.log(`Processing link: ${task}`);
                await page.goto(task, { waitUntil: "domcontentloaded", timeout: 30000 });

                // Get the page HTML and URL from browser
                const pageData = await page.evaluate(() => ({
                    html: document.documentElement.outerHTML,
                    url: document.URL,
                }));

                // Parse with Defuddle (used by official obsidian-clipper)
                const dom = new JSDOM(pageData.html, { url: pageData.url });
                const result = await Defuddle(dom, pageData.url, {
                    markdown: true,
                    debug: false,
                });

                if (!result.content) {
                    throw new Error("Failed to extract article content");
                }

                // Fix relative image paths to absolute
                result.content = result.content.replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]*)\)/g, (match, alt, path) => {
                    try {
                        const resolved = new URL(path, pageData.url).href;
                        return `![${alt}](${resolved})`;
                    } catch {
                        return match;
                    }
                });

                function sanitizeFileName(name: string): string {
                    return name.replace(/[:/\\?%*"|<>]/g, "-").replace(/\s+/g, " ").trim();
                }

                const fileName = sanitizeFileName(result.title || "Untitled") + ".md";

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

                const filePath = join(finalClippingDir, fileName);
                const dir = dirname(filePath);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }
                writeFileSync(filePath, fileContent, "utf-8");

                updatedLinks[i] = `- [x] ${task}`;
                console.log(`✓ Saved: ${fileName}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Failed to process link: ${task}. Error: ${errorMessage}`);
            }
        }

        writeFileSync(linksFile, updatedLinks.join("\n"), "utf-8");
        await browser.close();
        console.log("All links processed.");
        isProcessing = false;
    };

    const watcher = watch(linksFile, {
        persistent: true,
    });

    watcher.on("change", async (path: string) => {
        console.log(`File ${path} has been changed.`);
        await processLinks();
    });

    console.log("🌋 Lava is watching for new links...");
    await processLinks();
})();
