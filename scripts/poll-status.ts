import { spawn } from 'child_process';
import { resolve } from 'path';

const WHATSAPP_TARGET_NUMBER = "917022364061@s.whatsapp.net";

async function runTool(toolName: string, toolArgs: any = {}) {
    return new Promise((resolveResult) => {
        const serverPath = resolve('build/index.js');
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
                        sendRpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
                        sendRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: toolArgs } });
                    } else if (parsed.id === 2) {
                        responseReceived = true;
                        proc.kill();
                        resolveResult(parsed.result);
                    }
                } catch (e) {
                }
            }
        });

        sendRpc({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'CLI-Tester', version: '1.0' } }
        });

        setTimeout(() => {
            if (!responseReceived) {
                proc.kill();
                resolveResult({ error: 'timeout' });
            }
        }, 5000);
    });
}

async function main() {
    let attempts = 0;
    
    // First call connect
    console.log("Calling connect...");
    const connectRes = await runTool('connect');
    console.log("Connect res:", JSON.stringify(connectRes));

    while (attempts < 20) {
        attempts++;
        const statusRes: any = await runTool('get_status');
        const content = statusRes?.content?.[0]?.text || '';
        const parsed = JSON.parse(content);
        console.log(`[Attempt ${attempts}] Connected: ${parsed.connected}`);
        if (parsed.connected) {
            console.log("Successfully connected!");
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}
main();
