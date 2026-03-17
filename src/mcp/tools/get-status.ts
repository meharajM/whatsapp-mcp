/**
 * get-status.ts
 *
 * MCP tool: get_status
 *
 * Returns the current state of the WhatsApp connection so agents can
 * verify the server is ready before sending messages (Gap 6).
 */

import { isConnected, isConnecting } from '../../whatsapp/client.js';
import { config } from '../../config.js';
import { getQueueLength, getPendingLabels } from '../../utils/question-queue.js';

export const getStatusTool = {
    name: 'get_status',
    description:
        'Returns the current status of the WhatsApp MCP server. ' +
        'Call this before sending messages to confirm the connection is ready, ' +
        'or to inspect which questions are currently awaiting user replies.',
    inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
    },
} as const;

export async function handleGetStatus() {
    const connected = isConnected();
    const connecting = isConnecting();
    const pendingCount = getQueueLength();
    const pendingLabels = getPendingLabels();

    let statusMessage = '';
    if (connected) {
        statusMessage = 'WhatsApp is connected successfully and ready to use.';
    } else if (connecting) {
        statusMessage = 'WhatsApp is currently attempting to connect in the background. Check server logs for QR code or scan manually.';
    } else {
        statusMessage = 'WhatsApp is NOT connected. Check server logs for QR code or reconnection status.';
    }

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        connected,
                        connecting,
                        targetNumber: config.targetNumber,
                        pendingQuestions: pendingCount,
                        pendingLabels,
                        status: statusMessage,
                    },
                    null,
                    2,
                ),
            },
        ],
    };
}
