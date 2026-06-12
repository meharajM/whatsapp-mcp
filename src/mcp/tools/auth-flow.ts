import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
    connect,
    ConnectionResult,
    getAuthState,
    isConnected,
} from '../../whatsapp/client.js';

const CONNECT_INIT_TIMEOUT_MS = 3000;

function buildQrHtml(dataUri: string): string {
    return `<!DOCTYPE html>
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
        <img src="${dataUri}" alt="WhatsApp QR Code" />
    </div>
</body>
</html>
`;
}

function getQrFallbackFileUrl(dataUri: string): string | null {
    try {
        const qrHtmlPath = join(homedir(), '.whatsapp-mcp', 'qr.html');
        writeFileSync(qrHtmlPath, buildQrHtml(dataUri), 'utf-8');
        return pathToFileURL(qrHtmlPath).href;
    } catch {
        return null;
    }
}

function buildQrResult(result: ConnectionResult, actionLabel: string): CallToolResult {
    const dataUri = result.qrDataUri ?? '';
    const base64Data = dataUri.includes(',') ? dataUri.split(',', 2)[1] : '';
    const qrFileUrl = dataUri ? getQrFallbackFileUrl(dataUri) : null;
    const fallbackLine = qrFileUrl
        ? `\nFallback file: ${qrFileUrl}`
        : '';

    return {
        content: [
            {
                type: 'text',
                text:
                    `WhatsApp authentication is required before I can ${actionLabel}. ` +
                    'Show the attached QR image to the user and ask them to scan it from WhatsApp > Linked Devices > Link a Device. ' +
                    `After the QR is scanned, retry the original tool.${fallbackLine}`,
            },
            ...(base64Data
                ? [{
                    type: 'image' as const,
                    data: base64Data,
                    mimeType: 'image/png',
                }]
                : []),
        ],
    };
}

function buildConnectingResult(actionLabel: string): CallToolResult {
    return {
        content: [
            {
                type: 'text',
                text:
                    `WhatsApp session restoration is in progress before I can ${actionLabel}. ` +
                    'Retry this tool shortly, or call `get_status` to confirm when the server is fully connected.',
            },
        ],
    };
}

export async function buildConnectToolResult(result: ConnectionResult): Promise<CallToolResult> {
    if (result.status === 'qr') {
        return buildQrResult(result, 'continue');
    }

    if (result.status === 'connecting') {
        return buildConnectingResult('continue');
    }

    return {
        content: [{ type: 'text', text: 'WhatsApp is connected successfully and ready to use.' }],
    };
}

export async function connectWithInitializationTimeout(): Promise<ConnectionResult | 'timeout'> {
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), CONNECT_INIT_TIMEOUT_MS);
    });

    return Promise.race([connect(), timeoutPromise]);
}

export async function ensureConnectedForAction(actionLabel: string): Promise<CallToolResult | null> {
    if (isConnected()) {
        return null;
    }

    const result = await connectWithInitializationTimeout();
    if (result === 'timeout') {
        return buildConnectingResult(actionLabel);
    }

    if (result.status === 'connected' || isConnected()) {
        return null;
    }

    if (result.status === 'qr') {
        return buildQrResult(result, actionLabel);
    }

    return buildConnectingResult(actionLabel);
}

export function getAuthStatusMessage(): string {
    const authState = getAuthState();

    if (authState === 'connected') {
        return 'WhatsApp is connected successfully and ready to use.';
    }

    if (authState === 'connecting') {
        return 'WhatsApp is currently restoring an existing session.';
    }

    if (authState === 'qr_pending') {
        return 'WhatsApp authentication is waiting for the user to scan the QR code.';
    }

    return 'WhatsApp is not connected yet. The first tool call will trigger authentication automatically if needed.';
}
