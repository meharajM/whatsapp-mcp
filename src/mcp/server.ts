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

    setUnsolicitedMessageHandler(async (text, sender) => {
        console.error(`[MCP] Queued unsolicited WhatsApp message from ${sender}. Attempting passive delivery to the client.`);

        try {
            server.notification({
                method: 'notifications/message',
                params: {
                    sender,
                    text,
                },
            });

            await server.createMessage({
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text:
                                `[Incoming WhatsApp Message from ${sender}]:\n"${text}"\n\n` +
                                "Please process this message. If a reply is necessary, use the 'send_message' or 'ask_question' tool to respond to the user on WhatsApp.",
                        },
                    },
                ],
                maxTokens: 1000,
            });
            console.error('[MCP] Successfully sampled unsolicited WhatsApp message to the client.');
        } catch (error) {
            console.error('[MCP] Passive unsolicited delivery failed; message remains available via get_incoming_messages:', error);
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[MCP] Server v2.0.2 running on stdio transport.');
}
