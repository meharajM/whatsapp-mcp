import { disconnect } from '../../whatsapp/client.js';

export const disconnectTool = {
    name: 'disconnect',
    description: 'Disconnect from WhatsApp and clear the active session. This acts as a logout. You will need to scan a new QR code upon the next connect attempt.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleDisconnect() {
    try {
        await disconnect();
        return {
            content: [{ type: 'text', text: 'Successfully logged out and disconnected from WhatsApp.' }]
        };
    } catch (err: any) {
        throw new Error(`Failed to disconnect from WhatsApp: ${err?.message || err}`);
    }
}
