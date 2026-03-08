/**
 * server.ts
 *
 * Creates and starts the MCP server over stdio transport.
 * This module owns the server instance — nothing else imports it directly.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/registry.js';

export async function createAndStartServer(): Promise<void> {
    const server = new Server(
        { name: 'whatsapp-mcp', version: '2.0.0' },
        { capabilities: { tools: {} } },
    );

    registerTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[MCP] Server v2.0.0 running on stdio transport.');
}
