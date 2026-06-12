/**
 * server.ts
 *
 * Creates and starts the MCP server over stdio transport.
 * This module owns the server instance — nothing else imports it directly.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/registry.js';
import { registerPrompts } from './prompts.js';
import { setUnsolicitedMessageHandler } from '../whatsapp/client.js';

export async function createAndStartServer(): Promise<void> {
    const server = new Server(
        { name: 'whatsapp-mcp', version: '2.0.2' },
        {
            capabilities: {
                tools: {},
                prompts: {
                    listChanged: false,
                },
            },
            instructions:
                'Use WhatsApp as the primary human-in-the-loop channel for this server. ' +
                'If any WhatsApp tool returns a QR image, show it to the user and retry the original tool after the QR is scanned. ' +
                'Prefer ask_question for confirmations and send_message for one-way updates. ' +
                'Normal tool usage may trigger authentication automatically when needed.',
        },
    );

    registerTools(server);
    registerPrompts(server);

    setUnsolicitedMessageHandler((text, sender) => {
        console.error(`[MCP] Queued unsolicited WhatsApp message from ${sender}. Use get_incoming_messages to retrieve it.`);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[MCP] Server v2.0.2 running on stdio transport.');
}
