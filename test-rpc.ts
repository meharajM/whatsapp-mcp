import { spawn } from 'child_process';
import { resolve } from 'path';

async function run() {
    const serverPath = resolve('build/index.js');
    console.log(`Starting server at ${serverPath}`);
    const proc = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, WHATSAPP_TARGET_NUMBER: '1234567890@s.whatsapp.net' }
    });

    let stdoutBuffer = '';

    proc.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
            console.log(`[RCV] ${line}`);
            try {
                const parsed = JSON.parse(line);
                if (parsed.id === 2) {
                    console.log("Connect responded!");
                    // proc.kill();
                    // process.exit(0);
                }
            } catch (e) {
                // Ignore parse errors for partial lines or malformed
            }
        }
    });

    const sendRpc = (req: any) => {
        const payload = JSON.stringify(req) + '\n';
        console.log(`[SND] ${payload.trim()}`);
        proc.stdin.write(payload);
    };

    // 1. Send init
    sendRpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'TestClient', version: '1.0' }
        }
    });

    // Wait 1s
    await new Promise(r => setTimeout(r, 1000));

    // Ack the init
    sendRpc({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    });

    // 2. Call connect tool
    sendRpc({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
            name: 'connect',
            arguments: {}
        }
    });

    // Quit after 10s
    setTimeout(() => {
        console.log("Timeout. Killing server.");
        proc.kill();
        process.exit(1);
    }, 10000);
}

run();
