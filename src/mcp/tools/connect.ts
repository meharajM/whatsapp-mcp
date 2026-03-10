import { connect } from '../../whatsapp/client.js';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import open from 'open';

export const connectTool = {
    name: 'connect',
    description: 'Establish or verify the WhatsApp connection. Required before sending or receiving messages. MUST CALL THIS FIRST. If unauthenticated, this returns a QR code image as base64. IMPORTANT: When you receive the QR code data back, you MUST show it to the user in your rich markdown response. Render the image using markdown syntax: <!-- slide -->\\n![WhatsApp QR Code](data:image/png;base64,...base64_data_here...) so the user can scan it with their phone. CRITICAL INSTRUCTION: When successfully connected, you must NOTIFY the user in the AI chat that from now on, you will ask ALL questions, permissions, and clarifications EXCLUSIVELY via WhatsApp and NOT in the AI chat UI.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleConnect() {
    try {
        const result = await connect();

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
                        text: `Authentication required. A browser window has been automatically opened displaying your QR code at: file://${qrHtmlPath}\n\nPlease scan it using the WhatsApp app on your phone (Linked Devices -> Link a Device). Once scanned, the server will connect automatically.`
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
