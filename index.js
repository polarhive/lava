const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");
const chokidar = require("chokidar");
require("dotenv").config();

let isProcessing = false;

(async () => {
  const vault = process.env.VAULT;
  const clippingDir = process.env.CLIPPING_DIR;
  const linksFile = process.env.LINKS_FILE;
  const outputFolder = path.join(__dirname, vault);

  console.log(`Watching: ${linksFile}`);
  console.log(`Clippings will be saved to: ${path.join(outputFolder, clippingDir)}`);

  if (!fs.existsSync(linksFile)) {
    console.error(`File "${linksFile}" not found.`);
    process.exit(1);
  }

  const sanitizeLink = (link) => link.replace(/^[-\s\[\]x]+/, "").trim();
  const isValidHttpLink = (link) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link);

  const processLinks = async () => {
    if (isProcessing) {
      console.log("Skipping! duplicate cycle.");
      return;
    }

    isProcessing = true;

    const links = fs
      .readFileSync(linksFile, "utf-8")
      .split("\n")
      .filter((line) => line.trim() !== "");

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    let updatedLinks = [...links];

    for (let i = 0; i < links.length; i++) {
      let line = links[i].trim();

      if (line.startsWith("- [x]")) {
        console.log(`Skipping! already processed: ${line}`);
        continue;
      }

      let task = sanitizeLink(line);
      if (!isValidHttpLink(task)) {
        console.log(`Skipping! non-URL task: ${task}`);
        continue;
      }

      try {
        console.log(`Processing link: ${task}`);
        await page.goto(task, { waitUntil: "domcontentloaded", timeout: 30000 });

        const result = await page.evaluate(() => {
          return new Promise(async (resolve, reject) => {
            try {
              const Turndown = (
                await import("https://unpkg.com/turndown@7.2.0/lib/turndown.es.js?module")
              ).default;
              const Readability = (
                await import("https://unpkg.com/@tehshrike/readability@0.2.0/readability.js")
              ).default;

              const { title, byline, content } = new Readability(
                document.cloneNode(true)
              ).parse();

              function sanitizeFileName(name) {
                return name.replace(/[:/\\?%*"<>|]/g, "-").trim();
              }
              const fileName = sanitizeFileName(title) + ".md";

              const markdownBody = new Turndown().turndown(content);
              const today = new Date().toISOString().split("T")[0];
              const tags = "clippings";

              const fileContent =
                "---\n" +
                `author: "${byline || ""}"\n` +
                `title: "${title}"\n` +
                `source: ${document.URL}\n` +
                `clipped: ${today}\n` +
                `tags: [${tags}]\n` +
                "---\n\n" +
                `# ${title}\n\n` +
                markdownBody;

              resolve({ fileName, fileContent });
            } catch (error) {
              reject(error);
            }
          });
        });

        const filePath = path.join(outputFolder, clippingDir, result.fileName);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, result.fileContent, "utf-8");

        updatedLinks[i] = `- [x] ${task}`;
      } catch (error) {
        console.error(`Failed to process link: ${task}. Error: ${error.message}`);
      }
    }

    fs.writeFileSync(linksFile, updatedLinks.join("\n"), "utf-8");
    await browser.close();
    console.log("All links processed.");
    isProcessing = false;
  };

  const watcher = chokidar.watch(linksFile, {
    persistent: true,
  });

  watcher.on("change", async (path) => {
    console.log(`File ${path} has been changed.`);
    await processLinks();
  });

  await processLinks();
})();
