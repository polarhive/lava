import { LinkProcessor } from "./processor";
import { ConfigManager, Parser, ReturnFormat } from "./config";
import { ProcessResult } from "./types";
import { Logger } from "./utils";

export class LavaServer {
    private processor: LinkProcessor;
    private config: ConfigManager;

    constructor(processor: LinkProcessor, config: ConfigManager) {
        this.processor = processor;
        this.config = config;
    }

    start(): void {
        const self = this;

        const port = Number(process.env.PORT) || 3000;

        const server = Bun.serve({
            port: port,
            async fetch(req) {
                // Health check endpoint
                if (req.method === 'GET' && (req.url.endsWith('/ping') || req.url.endsWith('/health'))) {
                    return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (req.method === 'POST' && req.url.endsWith('/api')) {
                    try {
                        const body = await req.text();
                        if (!body.trim()) {
                            return new Response(JSON.stringify({ error: 'Request body is empty' }), {
                                status: 400,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        const {
                            links,
                            returnFormat,
                            parser,
                            saveToDisk
                        } = JSON.parse(body);

                        if (!Array.isArray(links)) {
                            return new Response(JSON.stringify({ error: 'links must be an array' }), {
                                status: 400,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        // Use config defaults or request overrides
                        const finalParser: Parser = parser === "jsdom" || parser === "puppeteer"
                            ? parser
                            : self.config.parser;
                        // Force JSON format when multiple links, otherwise use requested format
                        const finalReturnFormat: ReturnFormat = links.length > 1
                            ? "json"
                            : (returnFormat === "md" || returnFormat === "json" ? returnFormat : self.config.returnFormat);
                        const finalSaveToDisk = saveToDisk !== undefined ? saveToDisk : self.config.saveToDisk;

                        const result = await self.processor.processLinks(
                            links,
                            finalReturnFormat,
                            finalParser,
                            finalSaveToDisk
                        );

                        if (finalReturnFormat === "md" && links.length === 1) {
                            // For single link with markdown format, return raw markdown
                            const processResult = result as ProcessResult;
                            return new Response(processResult.markdown?.[0] || "", {
                                headers: { 'Content-Type': 'text/markdown' }
                            });
                        } else {
                            // Return JSON
                            return new Response(JSON.stringify(result), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                    } catch (error) {
                        Logger.error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
                        const errorMessage = error instanceof Error ? error.message : 'Invalid JSON';
                        return new Response(JSON.stringify({ error: errorMessage }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }

                return new Response('Lava Server - POST /api with { links: string[], returnFormat?: "md" | "json", parser?: "puppeteer" | "jsdom", saveToDisk?: boolean } | GET /ping or /health for status', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            },
        });

        console.log(`🌋 Lava server listening on http://localhost:${server.port}`);
    }
}