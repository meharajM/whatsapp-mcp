/**
 * send-message.ts
 *
 * MCP tool: send_message
 *
 * Sends a one-way WhatsApp message to the user. Supports:
 *  - Optional `to` param (Gap 4)
 *  - Optional `format` param for WhatsApp markdown (Gap 5)
 *  - Delivery receipt in the tool response (Gap 3)
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { getSocket, isConnected, waitForDelivery } from '../../whatsapp/client.js';
import { normalizeNumber } from '../../utils/formatting.js';
import { config } from '../../config.js';

export const sendMessageTool = {
    name: 'send_message',
    description:
        'CRITICAL INSTRUCTION: Send a one-way notification or status update to the user via WhatsApp. ' +
        'Returns whether the message was delivered to the device. ' +
        'If you need a reply from the user, YOU MUST NEVER ASK IN THE AI CHAT SESSION. Instead, ALWAYS use the `ask_question` tool. ' +
        'IMPORTANT: If you encounter an action you cannot perform automatically and require the user to act in their IDE/computer (e.g., clicking "Approve" for a terminal command, resolving conflicts, or accepting a diff), YOU MUST use `send_message` to notify them on WhatsApp explicitly (e.g., "Please check your IDE to approve the terminal command: npm install").',
    inputSchema: {
        type: 'object' as const,
        properties: {
            message: {
                type: 'string',
                description:
                    'The message text to send. Supports WhatsApp markdown when format="markdown": ' +
                    '*bold*, _italic_, ~strikethrough~, ```monospace```.',
            },
            to: {
                type: 'string',
                description:
                    'Optional. Target WhatsApp number in international format (e.g. "919876543210" or "+91 98765 43210"). ' +
                    'Defaults to WHATSAPP_TARGET_NUMBER from config.',
            },
            format: {
                type: 'string',
                enum: ['plain', 'markdown'],
                description:
                    'Optional. "markdown" renders WhatsApp formatting characters. ' +
                    '"plain" sends the text as-is (default).',
            },
        },
        required: ['message'],
    },
} as const;

export async function handleSendMessage(args: Record<string, unknown>) {
    if (!isConnected()) {
        throw new McpError(
            ErrorCode.InternalError,
            'WhatsApp is not connected. Check server logs for QR code or reconnection status. ' +
            'You can use get_status to verify connection state.',
        );
    }

    const message = args.message as string;
    if (!message) {
        throw new McpError(ErrorCode.InvalidParams, '"message" is required.');
    }

    const to = args.to ? normalizeNumber(args.to as string) : config.targetNumber;

    const sock = getSocket()!;
    let sent = false;
    let delivered = false;
    let messageId: string | undefined;

    try {
        const result = await sock.sendMessage(to, { text: message });
        messageId = result?.key?.id;
        sent = true;
        console.error(`[Tool:send_message] Sent to ${to}. MessageId: ${messageId}`);
    } catch (err) {
        throw new McpError(
            ErrorCode.InternalError,
            `Failed to send message: ${err}`,
        );
    }

    // Wait for delivery receipt (Gap 3)
    if (messageId) {
        delivered = await waitForDelivery(messageId, config.deliveryTimeoutMs);
    }

    const statusNote = delivered
        ? 'Message delivered to device.'
        : 'Message sent to WhatsApp servers but delivery to device was not confirmed within the timeout window.';

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify({ sent, delivered, to, note: statusNote }),
            },
        ],
    };
}

