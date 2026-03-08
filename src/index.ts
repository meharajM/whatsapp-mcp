#!/usr/bin/env node

/**
 * index.ts — Entry point
 *
 * Starts the WhatsApp connection first, then launches the MCP server.
 * All logging goes to stderr so it never interferes with the MCP stdio protocol.
 */

import { connect } from './whatsapp/client.js';
import { createAndStartServer } from './mcp/server.js';

async function main(): Promise<void> {
    // 1. Connect to WhatsApp (prints QR to stderr if not yet authenticated)
    await connect();

    // 2. Start the MCP server (listens on stdin/stdout for agent requests)
    await createAndStartServer();
}

main().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});
