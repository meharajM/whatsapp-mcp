/**
 * get-status.ts
 *
 * MCP tool: get_status
 *
 * Returns the current state of the WhatsApp connection so agents can
 * verify the server is ready before sending messages (Gap 6).
 */

import { getAuthState, isConnected, isConnecting } from '../../whatsapp/client.js';
import { config } from '../../config.js';
import { getQueueLength, getPendingLabels } from '../../utils/question-queue.js';
import { getIncomingMessageCount, getIncomingMessageSummaries } from '../../utils/inbox-queue.js';
import { getAuthStatusMessage } from './auth-flow.js';

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
    const authState = getAuthState();
    const pendingCount = getQueueLength();
    const pendingLabels = getPendingLabels();
    const incomingCount = getIncomingMessageCount();
    const incomingSummaries = getIncomingMessageSummaries();
    const statusMessage = getAuthStatusMessage();

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        connected,
                        connecting,
                        authState,
                        targetNumber: config.targetNumber,
                        pendingQuestions: pendingCount,
                        pendingLabels,
                        pendingIncomingMessages: incomingCount,
                        pendingIncomingSummaries: incomingSummaries,
                        status: statusMessage,
                    },
                    null,
                    2,
                ),
            },
        ],
    };
}
