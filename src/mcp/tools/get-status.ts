/**
 * get-status.ts
 *
 * MCP tool: get_status
 *
 * Returns the current state of the WhatsApp connection so agents can
 * verify the server is ready before sending messages (Gap 6).
 */

import { isConnected } from '../../whatsapp/client.js';
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
    const pendingCount = getQueueLength();
    const pendingLabels = getPendingLabels();

    const statusMessage = connected
        ? `WhatsApp is connected and ready.`
        : `WhatsApp is NOT connected. Check server logs for QR code or reconnection status.`;

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        connected,
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
