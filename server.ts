import { LinkProcessor } from "./processor";
import { ConfigManager } from "./config";
import { ProcessResult } from "./types";

export class LavaServer {
    private processor: LinkProcessor;
    private config: ConfigManager;

    constructor(processor: LinkProcessor, config: ConfigManager) {
        this.processor = processor;
        this.config = config;
    }

    start(): void {
        const self = this;

        const server = Bun.serve({
            port: 3000,
            async fetch(req) {
                if (req.method === 'POST' && req.url.endsWith('/api')) {
                    try {
                        const body = await req.text();
                        if (!body.trim()) {
                            return new Response(JSON.stringify({ error: 'Request body is empty' }), {
                                status: 400,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        const { links, returnMarkdown = false } = JSON.parse(body);
                        if (!Array.isArray(links)) {
                            return new Response(JSON.stringify({ error: 'links must be an array' }), {
                                status: 400,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        const result = await self.processor.processLinks(links, returnMarkdown);

                        if (returnMarkdown && links.length === 1) {
                            // For single link with returnMarkdown, return raw markdown
                            const processResult = result as ProcessResult;
                            return new Response(processResult.markdown?.[0] || "", {
                                headers: { 'Content-Type': 'text/markdown' }
                            });
                        } else {
                            // For multiple links or without returnMarkdown, return JSON
                            return new Response(JSON.stringify(result), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                    } catch (error) {
                        console.error('API Error:', error);
                        const errorMessage = error instanceof Error ? error.message : 'Invalid JSON';
                        return new Response(JSON.stringify({ error: errorMessage }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }

                return new Response('Lava Server - POST /api with { links: [...], returnMarkdown?: boolean }', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            },
        });

        console.log(`🌋 Lava server listening on http://localhost:${server.port}`);
    }
}