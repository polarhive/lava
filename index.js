const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");
require("dotenv").config(); // Load environment variables from .env file

(async () => {
  const vault = process.env.VAULT;
  const clippingDir = process.env.CLIPPING_DIR;
  const linksFile = process.env.LINKS_FILE;
  const outputFolder = path.join(__dirname, vault);

  if (!fs.existsSync(linksFile)) {
    console.error(`File "${linksFile}" not found.`);
    process.exit(1);
  }

  const links = fs
    .readFileSync(linksFile, "utf-8")
    .split("\n")
    .filter((link) => link.trim() !== "");
  if (links.length === 0) {
    console.error(`No valid links found in "${linksFile}".`);
    process.exit(1);
  }

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  for (const link of links) {
    try {
      console.log(`Processing link: ${link}`);
      await page.goto(link, { waitUntil: "domcontentloaded" });

      // clipper logic
      const result = await page.evaluate(() => {
        return new Promise(async (resolve) => {
          const Turndown = (
            await import("https://unpkg.com/turndown@latest?module")
          ).default;
          const Readability = (
            await import("https://unpkg.com/@tehshrike/readability@latest")
          ).default;

          let tags = "clippings";

          if (document.querySelector('meta[name="keywords" i]')) {
            const keywords = document
              .querySelector('meta[name="keywords" i]')
              .getAttribute("content")
              .split(",");

            keywords.forEach((keyword) => {
              tags += " " + keyword.split(" ").join("");
            });
          }

          function getSelectionHtml() {
            let html = "";
            if (window.getSelection) {
              const sel = window.getSelection();
              if (sel.rangeCount) {
                const container = document.createElement("div");
                for (let i = 0; i < sel.rangeCount; i++) {
                  container.appendChild(sel.getRangeAt(i).cloneContents());
                }
                html = container.innerHTML;
              }
            }
            return html;
          }

          const selection = getSelectionHtml();
          const { title, byline, content } = new Readability(
            document.cloneNode(true),
          ).parse();

          function sanitizeFileName(name) {
            return name.replace(/[:/\\?%*"<>|]/g, "-").trim();
          }
          const fileName = sanitizeFileName(title) + ".md";

          const markdownify = selection || content;
          const markdownBody = new Turndown().turndown(markdownify);

          const today = new Date().toISOString().split("T")[0];

          const fileContent =
            "---\n" +
            `category: "[[Clippings]]"\n` +
            `author: "${byline || ""}"\n` +
            `title: "${title}"\n` +
            `source: ${document.URL}\n` +
            `clipped: ${today}\n` +
            `tags: [${tags}]\n` +
            "---\n\n" +
            markdownBody;

          resolve({ fileName, fileContent });
        });
      });

      // save file locally
      const filePath = path.join(outputFolder, clippingDir, result.fileName);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, result.fileContent, "utf-8");
      console.log(`Saved: ${filePath}`);
    } catch (error) {
      console.error(`Failed to process link: ${link}. Error: ${error.message}`);
    }
  }

  await browser.close();
  console.log("All links processed.");
})();