import { App, Plugin, TFile, Notice, requestUrl, normalizePath } from 'obsidian';
import { LinkMonitorSettings, DEFAULT_SETTINGS, LinkMonitorSettingTab } from './settings';

export default class LinkMonitorPlugin extends Plugin {
    settings: LinkMonitorSettings;
    private processedLinks = new Set<string>();
    private statusBarItem: HTMLElement;
    private inProgressCount = 0;

    async onload() {
        await this.loadSettings();

        this.statusBarItem = this.addStatusBarItem();
        this.updateStatusBar();

        this.addSettingTab(new LinkMonitorSettingTab(this.app, this));

        // Add file watchers to trigger processing on file changes (debounced)
        this.registerFileWatchers();

        // Add command to manually trigger processing
        this.addCommand({
            id: 'process-links',
            name: 'Process link bookmark file',
            callback: () => this.processLinks()
        });

        // Run a first pass
        this.processLinks();
    }

    onunload() {
    }

    async loadSettings() {
        const loaded = await this.loadData();

        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
        // Apply saved stability threshold (seconds) to ms internal value
        this.stabilityThresholdMs = (this.settings.stabilityThresholdSeconds || 2) * 1000;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private extractLinksFromMarkdown(content: string): Array<{ raw: string; url: string; line: number }> {
        const links: Array<{ raw: string; url: string; line: number }> = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            // Find markdown links: [text](url)
            const markdownLinks = line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g);
            for (const match of markdownLinks) {
                const url = match[2];
                if (this.isValidHttpLink(url) && !this.isBlockedDomain(url)) {
                    links.push({
                        raw: match[0],
                        url: url,
                        line: index + 1
                    });
                }
            }

            // Find bare URLs
            const bareUrls = line.matchAll(/(https?:\/\/[^\s]+)/g);
            for (const match of bareUrls) {
                const url = match[1];
                if (this.isValidHttpLink(url) && !this.isBlockedDomain(url)) {
                    // Check if this URL is already captured as a markdown link
                    const alreadyCaptured = links.some(link => link.url === url && link.line === index + 1);
                    if (!alreadyCaptured) {
                        links.push({
                            raw: url,
                            url: url,
                            line: index + 1
                        });
                    }
                }
            }
        });

        return links;
    }

    private isValidHttpLink(link: string): boolean {
        try {
            const url = new URL(link);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    private isBlockedDomain(link: string): boolean {
        const blockedDomains = this.settings.blockedDomains.split(',').map(d => d.trim());

        try {
            const host = new URL(link).hostname.toLowerCase();
            return blockedDomains.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
        } catch {
            return false;
        }
    }

    // Minimum idle time after edits before processing (ms)
    private stabilityThresholdMs = 2000;
    private bookmarkProcessTimer: NodeJS.Timeout | null = null;

    private scheduleProcessingForBookmark(immediate = false): void {
        // If immediate, cancel any pending timer and run now
        if (immediate) {
            if (this.bookmarkProcessTimer) {
                clearTimeout(this.bookmarkProcessTimer);
                this.bookmarkProcessTimer = null;
            }
            this.processLinks();
            return;
        }

        // Otherwise schedule processing after stabilityThresholdMs of inactivity
        if (this.bookmarkProcessTimer) {
            clearTimeout(this.bookmarkProcessTimer);
        }
        this.bookmarkProcessTimer = setTimeout(() => {
            this.bookmarkProcessTimer = null;
            this.processLinks();
        }, this.stabilityThresholdMs);
    }

    private registerFileWatchers(): void {
        const bookmarkFilePath = normalizePath(this.settings.linkBookmarkFilePath);
        // Watch for modifications and creations of the link bookmark file
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (!(file instanceof TFile)) return;

            if (file.path === bookmarkFilePath) {
                this.scheduleProcessingForBookmark();
            }

            if (this.settings.watchDailyNote) {
                const dailyPath = this.getDailyNotePath();
                if (file.path === dailyPath) {
                    this.scheduleProcessingForBookmark();
                }
            }
        }));

        this.registerEvent(this.app.vault.on('create', (file) => {
            if (!(file instanceof TFile)) return;

            if (file.path === bookmarkFilePath) {
                this.scheduleProcessingForBookmark();
            }

            if (this.settings.watchDailyNote) {
                const dailyPath = this.getDailyNotePath();
                if (file.path === dailyPath) {
                    this.scheduleProcessingForBookmark();
                }
            }
        }));


    }

    private async processLinks() {
        const bookmarkFilePath = normalizePath(this.settings.linkBookmarkFilePath);
        let bookmarkFile = this.app.vault.getAbstractFileByPath(bookmarkFilePath) as TFile | null;
        if (!(bookmarkFile instanceof TFile)) {
            // File missing — create a starter file so users have somewhere to put links
            try {
                // Ensure any parent folders exist before creating the file
                await this.ensureParentFolders(bookmarkFilePath);
                await this.app.vault.create(this.settings.linkBookmarkFilePath, '# dump your links here\n\n');
                bookmarkFile = this.app.vault.getAbstractFileByPath(this.settings.linkBookmarkFilePath) as TFile | null;
            } catch (e) {
                // If another process created the file concurrently, wait briefly and retry
                const msg = String(e || '');
                if (msg.includes('File already exists')) {
                    let found = false;
                    for (let i = 0; i < 5; i++) {
                        bookmarkFile = this.app.vault.getAbstractFileByPath(this.settings.linkBookmarkFilePath) as TFile | null;
                        if (bookmarkFile instanceof TFile) {
                            found = true;
                            break;
                        }
                        await this.sleep(200);
                    }

                    if (found) {
                    } else {
                        console.warn(`lava: creation failed and file not found afterwards: ${this.settings.linkBookmarkFilePath}`, e);
                        return;
                    }
                } else {
                    console.warn(`lava: Failed to create ${this.settings.linkBookmarkFilePath}:`, e);
                    return;
                }
            }
        }

        // Read bookmark file content
        const bookmarkContent = await this.app.vault.read(bookmarkFile as TFile);
        let allLinks: Array<{ raw: string; url: string; line: number; file: TFile; content: string }> = this.extractLinksFromMarkdown(bookmarkContent).map(l => ({ ...l, file: bookmarkFile as TFile, content: bookmarkContent }));

        // If watching daily note, include it too
        if (this.settings.watchDailyNote) {
            try {
                const dailyPath = this.getDailyNotePath();
                const dailyFile = this.app.vault.getAbstractFileByPath(dailyPath) as TFile | null;
                if (dailyFile instanceof TFile) {
                    const dailyContent = await this.app.vault.read(dailyFile);
                    const dailyLinks = this.extractLinksFromMarkdown(dailyContent).map(l => ({ ...l, file: dailyFile, content: dailyContent }));
                    allLinks = allLinks.concat(dailyLinks);
                }
            } catch (e) {
                console.warn('Failed to include daily note links:', e);
            }
        }

        // Filter to only new links and skip links already checked in their respective files
        const pending = allLinks.filter(link => {
            if (this.processedLinks.has(link.url)) return false;
            if (this.isLinkChecked(link.content, link)) {
                return false;
            }
            return true;
        });

        if (pending.length === 0) return;

        for (const link of pending) {
            console.log(`lava: Processing ${link.url}`);
            try {
                this.inProgressCount++;
                this.updateStatusBar();
                await this.processLink(link.url);
                this.inProgressCount--;
                this.updateStatusBar();
                this.processedLinks.add(link.url);
                // Mark all occurrences of the link as checked in its source file
                try {
                    await this.markLinkChecked(link.file, link.url);
                } catch (e) {
                    console.warn(`Failed to mark link checked for ${link.url}:`, e);
                }
                new Notice(`✓ Processed: ${link.url}`);
            } catch (error) {
                console.error(`Failed to process ${link.url}:`, error);
                this.inProgressCount--;
                this.updateStatusBar();
                // Still mark as processed to avoid repeated failures
                this.processedLinks.add(link.url);
                try {
                    await this.markLinkChecked(link.file, link.line, link.raw);
                } catch (e) {
                    console.warn(`Failed to mark link checked for ${link.url}:`, e);
                }
                new Notice(`✗ Failed to process: ${link.url}`);
            }
        }
    }

    private updateStatusBar() {
        this.statusBarItem.setText(`🔗 ${this.inProgressCount}`);
    }

    private async processLink(url: string): Promise<void> {
        await this.processLinkWithLavaServer(url);
    }

    private async processLinkWithLavaServer(url: string): Promise<void> {
        try {
            const requestBody = {
                links: [url],
                returnFormat: 'md',
                parser: this.settings.parserType,
                saveToDisk: false
            };

            const requestHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                'Accept': 'text/markdown'
            };

            const response = await requestUrl({
                url: this.settings.lavaServerUrl,
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(requestBody)
            });

            // Safe JSON/text preview
            const textLen = response.text ? response.text.length : 0;
            let jsonPreview = 'null';
            try {
                const contentType = String(response.headers?.['content-type'] || '');
                if (/application\/(json|ld\+json)/i.test(contentType)) {
                    if (response.text) {
                        const parsed = JSON.parse(response.text);
                        jsonPreview = typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 200);
                    }
                } else if (response.text) {
                    jsonPreview = response.text.slice(0, 200);
                }
            } catch (e) {
                jsonPreview = `parse_error:${String(e).slice(0, 200)}`;
            }

            if (response.status !== 200) {
                throw new Error(`lava server returned status ${response.status}`);
            }

            const markdown = response.text;
            if (!markdown || markdown.trim() === '') {
                throw new Error('lava server returned empty content');
            }

            // Fix relative image paths in markdown
            let fixedMarkdown = this.fixImagePaths(markdown, url);

            // Extract title from frontmatter (if present) or first heading
            const title = this.extractTitleFromMarkdown(fixedMarkdown) || 'Untitled';

            // Ensure clipping folder exists
            const clippingFolderPath = normalizePath(this.settings.clippingFolder);
            const clippingFolder = this.app.vault.getAbstractFileByPath(clippingFolderPath);
            if (!clippingFolder) {
                await this.app.vault.createFolder(clippingFolderPath);
            }

            // Ensure frontmatter exists and contains at least title and source
            const frontmatterObj: { [k: string]: any } = {
                title: title,
                source: url,
                url: url,
                clipped: new Date().toISOString().split('T')[0],
                tags: this.settings.defaultTags.split(',').map(t => t.trim())
            };

            fixedMarkdown = this.ensureFrontmatter(fixedMarkdown, frontmatterObj);

            // Create the clipping file (overwrite if exists)
            const baseName = this.sanitizeFileName(title);
            const fileName = baseName + '.md';
            const filePath = `${clippingFolderPath}/${fileName}`;

            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile instanceof TFile) {
                await this.app.vault.process(existingFile, () => fixedMarkdown);
            } else {
                await this.app.vault.create(filePath, fixedMarkdown);
            }
            return;
        } catch (error) {
            throw error;
        }
    }

    private fixImagePaths(content: string, baseUrl: string): string {
        // Normalize baseUrl so that relative paths resolve against the directory when appropriate
        let normalizedBase = baseUrl;
        try {
            const urlObj = new URL(baseUrl);
            const lastSegment = urlObj.pathname.split('/').filter(Boolean).pop() || '';
            if (!urlObj.pathname.endsWith('/') && lastSegment && !lastSegment.includes('.')) {
                urlObj.pathname = urlObj.pathname + '/';
                normalizedBase = urlObj.href;
            }
        } catch {
            // If parsing fails, fall back to the original baseUrl
        }

        return content.replace(
            /!\[([^\]]*)\]\((?!https?:\/\/)([^)]*)\)/g,
            (match, alt, path) => {
                try {
                    const resolved = new URL(path, normalizedBase).href;
                    return `![${alt}](${resolved})`;
                } catch {
                    return match;
                }
            }
        );
    }

    private sanitizeFileName(name: string): string {
        return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
    }

    // Computes the daily note path using user settings
    private getDailyNotePath(date: Date = new Date()): string {
        const y = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        let name = this.settings.dailyNoteFormat.replace(/YYYY/g, String(y)).replace(/MM/g, mm).replace(/DD/g, dd);
        if (!name.endsWith('.md')) name = `${name}.md`;
        const path = this.settings.dailyNotePath ? `${this.settings.dailyNotePath}/${name}` : name;
        return normalizePath(path);
    }

    // Extracts a title from markdown response. Prefers frontmatter title, then first H1
    private extractTitleFromMarkdown(markdown: string): string | null {
        try {
            const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/m);
            if (fmMatch) {
                const fm = fmMatch[1];
                const titleMatch = fm.match(/title:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/i);
                if (titleMatch) {
                    return (titleMatch[1] || titleMatch[2] || titleMatch[3]).trim();
                }
            }

            const h1Match = markdown.match(/^#\s+(.+)$/m);
            if (h1Match) return h1Match[1].trim();
            return null;
        } catch (e) {
            return null;
        }
    }

    // Ensures markdown contains a minimal frontmatter block. If frontmatter exists, returns original markdown.
    private ensureFrontmatter(markdown: string, fmObj: { [k: string]: any }): string {
        try {
            if (/^---\s*[\s\S]*?\s*---/m.test(markdown)) {
                // Already has frontmatter; do not modify
                return markdown;
            }

            const fmLines: string[] = [];
            for (const [key, value] of Object.entries(fmObj)) {
                if (Array.isArray(value)) {
                    const arr = value.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(', ');
                    fmLines.push(`${key}: [${arr}]`);
                } else if (typeof value === 'string') {
                    fmLines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
                } else {
                    fmLines.push(`${key}: ${String(value)}`);
                }
            }

            const fmBlock = `---\n${fmLines.join('\n')}\n---\n\n`;

            // If no H1 in markdown, add one using title
            const hasH1 = /^#\s+/m.test(markdown);
            const title = fmObj.title || '';
            const titleLine = !hasH1 && title ? `# ${title}\n\n` : '';

            return fmBlock + titleLine + markdown;
        } catch (e) {
            return markdown;
        }
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Ensure that all parent folders for a given file path exist in the vault
    private async ensureParentFolders(filePath: string): Promise<void> {
        try {
            const parts = filePath.split('/').slice(0, -1);
            if (parts.length === 0) return;

            let current = '';
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                const existing = this.app.vault.getAbstractFileByPath(current);
                if (!existing) {
                    try {
                        await this.app.vault.createFolder(current);
                        console.log(`lava: created folder ${current}`);
                    } catch (err) {
                        // If folder creation fails because it already exists concurrently, ignore
                        const msg = String(err || '');
                        if (msg.includes('already exists') || msg.includes('File already exists')) {
                            continue;
                        }
                        throw err;
                    }
                }
            }
        } catch (error) {
            console.warn('ensureParentFolders failed:', error);
        }
    }

    // Marks all occurrences of the specified URL as checked in the given file.
    private async markLinkChecked(file: TFile, url: string): Promise<void> {
        try {
            await this.app.vault.process(file, (content) => {
                const lines = content.split('\n');
                let modified = false;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    // Skip if already checked
                    if (/\[\s*[xX]\s*\]/.test(line)) continue;

                    // Check if this line contains the URL
                    if (line.includes(url)) {
                        // Detect leading bullet if any
                        const bulletMatch = line.match(/^(\s*[-*+]\s*)(.*)$/);
                        let newLine: string;
                        if (bulletMatch) {
                            const bullet = bulletMatch[1];
                            const rest = bulletMatch[2];
                            // If rest starts with a checkbox, replace it
                            const restCheckboxMatch = rest.match(/^\[\s*[xX\s]?\s*\]\s*(.*)$/);
                            if (restCheckboxMatch) {
                                newLine = `${bullet}[x] ${restCheckboxMatch[1]}`;
                            } else {
                                newLine = `${bullet}[x] ${rest}`;
                            }
                        } else {
                            // No bullet; prefix with a checkbox bullet
                            newLine = `- [x] ${line.trim()}`;
                        }

                        lines[i] = newLine;
                        modified = true;
                    }
                }

                return modified ? lines.join('\n') : content;
            });
        } catch (error) {
            // Silently fail
        }
    }

    // Returns true if the provided link is already marked checked in the file content
    private isLinkChecked(fileContent: string, link: { raw: string; url: string; line: number }): boolean {
        try {
            const lines = fileContent.split('\n');
            const idx = Math.max(0, Math.min(lines.length - 1, link.line - 1));
            const line = lines[idx] || '';
            const checkboxRegex = /\[\s*[xX]\s*\]/;

            return checkboxRegex.test(line);
        } catch (e) {
            return false;
        }
    }
}