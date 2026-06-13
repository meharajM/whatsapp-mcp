/**
 * get-incoming-messages.ts
 *
 * MCP tool: get_incoming_messages
 *
 * Returns unsolicited WhatsApp messages that were not used to answer a pending
 * ask_question. The queue is drained on read so clients can poll it safely.
 */

import { drainIncomingMessages } from '../../utils/inbox-queue.js';
import { isConnected } from '../../whatsapp/client.js';
import { ensureConnectedForAction } from './auth-flow.js';

export const getIncomingMessagesTool = {
    name: 'get_incoming_messages',
    description:
        'Returns unsolicited WhatsApp messages that were received since the last poll. ' +
        'Use this when you want to inspect human replies or new inbound messages without relying on client-side sampling support.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            limit: {
                type: 'number',
                description: 'Optional. Maximum number of messages to return in one call. Defaults to 10.',
            },
        },
        required: [],
    },
} as const;

export async function handleGetIncomingMessages(args: Record<string, unknown> = {}) {
    if (!isConnected()) {
        const authResult = await ensureConnectedForAction('receive WhatsApp messages');
        if (authResult) {
            return authResult;
        }
    }

    const rawLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : 10;
    const limit = Math.max(1, Math.floor(rawLimit));
    const messages = drainIncomingMessages(limit);

    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        count: messages.length,
                        messages,
                    },
                    null,
                    2,
                ),
            },
        ],
    };
}
