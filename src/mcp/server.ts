/**
 * server.ts
 *
 * Creates and starts the MCP server over stdio transport.
 * This module owns the server instance — nothing else imports it directly.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/registry.js';
import { setUnsolicitedMessageHandler } from '../whatsapp/client.js';

export async function createAndStartServer(): Promise<void> {
    const server = new Server(
        { name: 'whatsapp-mcp', version: '2.0.1' },
        { capabilities: { tools: {}, prompts: {} } }, // Added prompts to avoid capability errors if AI tests it
    );

    registerTools(server);

    setUnsolicitedMessageHandler(async (text, sender) => {
        try {
            console.error(`[MCP] Received unsolicited WhatsApp message from ${sender}. Sending sampling request to AI Agent...`);

            // Backup: Send a notification to the client just in case sampling isn't fully supported
            server.notification({
                method: 'notifications/message',
                params: {
                    sender: sender,
                    text: text
                }
            });

            // We use MCP's createMessage (Sampling SDK) to push the message directly to the AI Agent.
            await server.createMessage({
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: `[Incoming WhatsApp Message from ${sender}]:\n"${text}"\n\nPlease process this message. If a reply is necessary, use the 'send_message' or 'ask_question' tool to respond to the user on WhatsApp.`
                        }
                    }
                ],
                maxTokens: 1000
            });
            console.error('[MCP] Successfully sampled response from AI Agent.');
        } catch (error) {
            console.error('[MCP] Failed to send sampled message to AI agent. It either does not support sampling or is busy:', error);
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[MCP] Server v2.0.1 running on stdio transport.');
}
