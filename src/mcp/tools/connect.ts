import { connect } from '../../whatsapp/client.js';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import open from 'open';

export const connectTool = {
    name: 'connect',
    description: 'Establish or verify the WhatsApp connection. Required before sending or receiving messages. MUST CALL THIS FIRST. If unauthenticated, this returns a local HTML file path containing the QR code. IMPORTANT INSTRUCTION FOR AI AGENTS (Claude, Perplexity, Cursor, etc.): You MUST explicitly instruct the user to open this HTML file path in their web browser (Chrome, Safari, etc.) to view and scan the QR code. Provide the path as a clickable `file://` link or tell them to paste it into their browser url bar. CRITICAL INSTRUCTION: When successfully connected, you must NOTIFY the user in the AI chat that from now on, you will ask ALL questions, permissions, and clarifications EXCLUSIVELY via WhatsApp and NOT in the AI chat UI.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleConnect() {
    try {
        // We start the connection in the background if not already started.
        // We race it against a very short timeout so we can return a status to the MCP client quickly.
        const timeoutPromise = new Promise<{ status: 'timeout' }>((resolve) => {
            setTimeout(() => resolve({ status: 'timeout' }), 3000); // 3s timeout
        });

        // We call connect() which will either start a new attempt or return the existing promise.
        const result = await Promise.race([connect(), timeoutPromise]);

        if (result.status === 'timeout') {
            return {
                content: [{ type: 'text', text: 'WhatsApp connection is currently initializing in the background. Please wait a few moments for the QR code to be generated or for the connection to be established. You can check progress using the `get_status` tool.' }]
            };
        }

        if (result.status === 'qr' && result.qrDataUri) {
            const qrHtmlPath = join(homedir(), '.whatsapp-mcp', 'qr.html');
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp MCP Authentication</title>
    <style>
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #e5ddd5; font-family: sans-serif; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
        img { max-width: 400px; width: 100%; height: auto; }
        h1 { color: #128C7E; margin-top: 0; }
        p { color: #555; font-size: 16px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Scan QR Code</h1>
        <p>Open WhatsApp on your phone <b>></b> Linked Devices <b>></b> Link a Device</p>
        <img src="${result.qrDataUri}" alt="WhatsApp QR Code" />
    </div>
    <script>
        // Optional: auto-refresh the page checking an endpoint or just rely on the user to scan.
    </script>
</body>
</html>
`;
            try {
                writeFileSync(qrHtmlPath, htmlContent, 'utf-8');
                // Open the file in the default web browser seamlessly!
                open(qrHtmlPath).catch(e => console.error("Could not write or open QR html:", e));
            } catch (fsErr) {
                console.error("Could not write or open QR html:", fsErr);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Authentication required. We attempted to open a browser window displaying your QR code automatically.

If the browser did not open, the user MUST manually open the following local file in their web browser (e.g., Chrome, Safari) to scan the QR code:
file://${qrHtmlPath}

*** AI AGENT INSTRUCTIONS *** \nBecause you are an AI assistant (Claude/Perplexity/Cursor/etc) and might not have a built-in browser, you MUST present the above file path to the user as a clickable markdown link or instruct them to manually copy and paste the path into their web browser's URL bar.

Once the user scans the QR code via their WhatsApp app (Linked Devices -> Link a Device), the server will connect automatically.`
                    }
                ]
            };
        }

        if (result.status === 'connecting') {
            return {
                content: [{ type: 'text', text: 'WhatsApp session found. Connection is being restored in the background. This may take up to a minute. Use the `get_status` tool to verify when it is fully connected.' }]
            };
        }

        return {
            content: [{ type: 'text', text: 'WhatsApp is connected successfully and ready to use.' }]
        };
    } catch (err: any) {
        throw new Error(`Failed to connect to WhatsApp: ${err?.message || err}`);
    }
}
