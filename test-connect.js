import { handleConnect } from './build/mcp/tools/connect.js';
import { handleGetStatus } from './build/mcp/tools/get-status.js';

async function run() {
    console.log("Calling connect...");
    try {
        const res = await handleConnect();
        console.log("Connect result:", res.content[0]?.text || "No text. Type: " + res.content[0]?.type);
        console.log("Status:", await handleGetStatus());
    } catch(e) {
        console.error("Connect failed:", e);
    }
    
    // forcefully exit
    process.exit(0);
}

run();
