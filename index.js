const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");
const chokidar = require("chokidar");
require("dotenv").config(); // Load environment variables from .env file

(async () => {
  const vault = process.env.VAULT;
  const clippingDir = process.env.CLIPPING_DIR;
  const linksFile = process.env.LINKS_FILE;
  const outputFolder = path.join(__dirname, vault);

  console.log(`Watching: ${linksFile}`);
  console.log(
    `Clippings will be saved to: ${path.join(outputFolder, clippingDir)}`,
  );

  if (!fs.existsSync(linksFile)) {
    console.error(`File "${linksFile}" not found.`);
    process.exit(1);
  }

  let isProcessing = false;

  // Watch for changes in the bookmarks file
  chokidar.watch(linksFile, { persistent: true }).on("change", async () => {
    if (isProcessing) {
      console.log("Currently processing links. Skipping this change.");
      return;
    }

    console.log("Detected changes in bookmarks.md. Processing...");
    isProcessing = true;

    const links = fs
      .readFileSync(linksFile, "utf-8")
      .split("\n")
      .filter((link) => link.trim() !== "");
    if (links.length === 0) {
      console.error(`No valid links found in "${linksFile}".`);
      isProcessing = false;
      return;
    }

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // fix for ubuntu VPS
    });
    const page = await browser.newPage();

    let updatedLinks = [...links];
    for (let i = 0; i < links.length; i++) {
      let link = links[i].trim();

      // Skip if the link is already processed (starts with "- [x]")
      if (link.startsWith("- [x]")) {
        console.log(`Skipping already visited link: ${link}`);
        continue;
      }

      // Remove the leading "- [ ]" or "- " (checkbox and hyphen) to get the URL
      link = link
        .replace(/^-\s*\[([x\s])\]\s*/, "")
        .replace(/^-\s*/, "")
        .trim();

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
              `# ${title}\n\n` +
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

        updatedLinks = updatedLinks.map((linkLine, idx) => {
          if (idx === i && linkLine.trim() === links[i].trim()) {
            return `- [x] ${link}`; // Mark the link as processed
          }
          return linkLine;
        });
      } catch (error) {
        console.error(
          `Failed to process link: ${link}. Error: ${error.message}`,
        );
      }
    }

    // Write the updated links back to bookmarks.md after processing all links
    fs.writeFileSync(linksFile, updatedLinks.join("\n"), "utf-8");
    console.log("Updated bookmarks.md with processed links.");

    await browser.close();
    console.log("All links processed.");

    isProcessing = false;
  });
})();
