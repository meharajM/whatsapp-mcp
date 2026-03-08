#!/usr/bin/env node

/**
 * index.ts — Entry point
 *
 * Starts the WhatsApp connection first, then launches the MCP server.
 * All logging goes to stderr so it never interferes with the MCP stdio protocol.
 */

import { createAndStartServer } from './mcp/server.js';

async function main() {
    // Start the MCP server (listens on stdin/stdout for agent requests)
    // The WhatsApp connection itself is now established explicitly using the `connect` tool.
    await createAndStartServer();
}

main().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});
