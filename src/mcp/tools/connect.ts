import { connect } from '../../whatsapp/client.js';
import { buildConnectToolResult } from './auth-flow.js';

export const connectTool = {
    name: 'connect',
    description: 'Establish or verify the WhatsApp connection. If authentication is needed, this returns a QR image directly in the tool result, with a local HTML fallback path when available. Other WhatsApp tools may auto-trigger this flow when needed.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleConnect() {
    try {
        const result = await connect();
        return await buildConnectToolResult(result);
    } catch (err: any) {
        throw new Error(`Failed to connect to WhatsApp: ${err?.message || err}`);
    }
}
