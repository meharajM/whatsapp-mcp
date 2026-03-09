import { spawn } from 'child_process';
import { resolve } from 'path';

const WHATSAPP_TARGET_NUMBER = "917022364061@s.whatsapp.net";

async function runTool(toolName: string, toolArgs: any = {}) {
    return new Promise((resolveResult) => {
        const serverPath = resolve('build/index.js');
        console.log(`\nCalling tool: ${toolName}...`);

        const proc = spawn('node', [serverPath], {
            stdio: ['pipe', 'pipe', 'inherit'],
            env: { ...process.env, WHATSAPP_TARGET_NUMBER }
        });

        const sendRpc = (req: any) => proc.stdin.write(JSON.stringify(req) + '\n');

        let responseReceived = false;

        proc.stdout.on('data', (data) => {
            const output = data.toString();
            for (const line of output.split('\n')) {
                if (!line) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.id === 1) {
                        // Initialize handshake
                        sendRpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
                        // Call tool
                        sendRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
                    } else if (parsed.id === 2) {
                        responseReceived = true;
                        proc.kill();
                        resolveResult(parsed.result);
                    }
                } catch (e) {
                    // Partial JSON or other output
                }
            }
        });

        sendRpc({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'CLI-Tester', version: '1.0' } }
        });

        setTimeout(() => {
            if (!responseReceived) {
                console.error(`Timeout for ${toolName}`);
                proc.kill();
                resolveResult({ error: 'timeout' });
            }
        }, 15000);
    });
}

async function main() {
    console.log("=== WA-MCP CLI TESTER ===");

    // 1. Get Status
    const statusRes: any = await runTool('get_status');
    console.log("Status:", JSON.stringify(statusRes, null, 2));

    const content = statusRes?.content?.[0]?.text || '';
    const isConnected = content.includes('WhatsApp is connected');

    if (!isConnected) {
        console.log("\n---\nWhatsApp is NOT connected yet. Calling 'connect' tool...");
        const connectRes: any = await runTool('connect');
        console.log("Connect Tool Output:", JSON.stringify(connectRes, null, 2));
        console.log("Please scan the QR code in the browser. After scanning, run this script again.");
        return;
    }

    console.log("\n---\nWhatsApp IS connected! Proceeding to test active tools...");

    // 2. Send Message Notification Test
    console.log("\nSending a test direct message...");
    const sendRes = await runTool('send_message', {
        message: "Hello from the WhatsApp MCP CLI tester! This is an automated system notification.\n\nPlease reply with 'Hi' if you received this."
    });
    console.log("Send Message Result:", JSON.stringify(sendRes, null, 2));

    // 3. Ask Question Test (Blocks until reply)
    console.log("\nAsking a test question and waiting for reply...");
    console.log("(Check your WhatsApp on your phone to reply!)");
    const askRes = await runTool('ask_question', {
        question: "This is a test prompt from the MCP. Should I proceed with the simulated deployment?",
        timeout_minutes: 2
    });
    console.log("Ask Question Result:", JSON.stringify(askRes, null, 2));

    console.log("\nTests complete.");
}

main().catch(console.error);
