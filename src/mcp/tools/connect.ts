import { buildConnectToolResult, connectWithInitializationTimeout } from './auth-flow.js';

export const connectTool = {
    name: 'connect',
    description: 'Establish or verify the WhatsApp connection. If authentication is needed, this returns a QR image directly in the tool result, with a local HTML fallback path when available. Other WhatsApp tools may auto-trigger this flow when needed.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleConnect() {
    try {
        const result = await connectWithInitializationTimeout();
        if (result === 'timeout') {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'WhatsApp connection is currently initializing in the background. Please wait a few moments for the QR code to be generated or for the connection to be established. You can check progress using the `get_status` tool.',
                    },
                ],
            };
        }

        return await buildConnectToolResult(result);
    } catch (err: any) {
        throw new Error(`Failed to connect to WhatsApp: ${err?.message || err}`);
    }
}
