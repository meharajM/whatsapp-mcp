import { connect } from '../../whatsapp/client.js';

export const connectTool = {
    name: 'connect',
    description: 'Establish or verify the WhatsApp connection. Required before sending or receiving messages. MUST CALL THIS FIRST. If unauthenticated, this returns a QR code image as base64. IMPORTANT: When you receive the QR code data back, you MUST show it to the user in your rich markdown response. Render the image using markdown syntax: <!-- slide -->\\n![WhatsApp QR Code](data:image/png;base64,...base64_data_here...) so the user can scan it with their phone.',
    inputSchema: { type: 'object', properties: {} }
};

export async function handleConnect() {
    try {
        const result = await connect();

        if (result.status === 'qr' && result.qrDataUri) {
            // Data URI format: data:image/png;base64,iVBORw0KGgo...
            // Extract the base64 payload
            const base64Data = result.qrDataUri.split(',')[1];

            return {
                content: [
                    { type: 'text', text: 'WhatsApp is not authenticated. Please scan this QR code using the WhatsApp app on your phone (Linked Devices -> Link a Device). Once scanned, the server will connect automatically.' },
                    { type: 'image', data: base64Data, mimeType: 'image/png' }
                ]
            };
        }

        return {
            content: [{ type: 'text', text: 'WhatsApp is connected successfully and ready to use.' }]
        };
    } catch (err: any) {
        throw new Error(`Failed to connect to WhatsApp: ${err?.message || err}`);
    }
}
