import { handleConnect } from './src/mcp/tools/connect.js';
import { handleGetStatus } from './src/mcp/tools/get-status.js';

async function run() {
    console.log("Starting test script...");
    console.log("Calling handleConnect()...");
    const res = await handleConnect();
    console.log("Connect 1 resolved.");
    const res2 = await handleConnect();
    console.log("Connect 2 resolved.");
    process.exit(0);
}

run();
