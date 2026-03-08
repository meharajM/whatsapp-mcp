/**
 * ask-question.ts
 *
 * MCP tool: ask_question
 *
 * Sends a question to the user via WhatsApp and **blocks** the MCP call until
 * the user replies (or a timeout elapses). Supports:
 *  - FIFO queue with labelled headings: "[Q1: heading]\n\n..." (Gap 2)
 *  - Auto-formatting for yes/no confirmation prompts (Gap 5)
 *  - Optional `to` param for multi-user targeting (Gap 4)
 *  - Configurable timeout
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { getSocket, isConnected } from '../../whatsapp/client.js';
import { enqueue } from '../../utils/question-queue.js';
import { autoFormat, normalizeNumber } from '../../utils/formatting.js';
import { config } from '../../config.js';

export const askQuestionTool = {
    name: 'ask_question',
    description:
        'Send a question or prompt to the user via WhatsApp and wait for their reply. ' +
        'Use this for: getting permissions ("Can I delete the logs?"), confirmations ("Deploy to prod?"), ' +
        'or collecting inputs ("Which environment should I target?"). ' +
        'The MCP call blocks until the user replies or the timeout elapses. ' +
        'Multiple concurrent calls are supported — each is queued and labelled so the user knows which to answer.',
    inputSchema: {
        type: 'object' as const,
        properties: {
            question: {
                type: 'string',
                description:
                    'The question or prompt to send. For yes/no confirmations, a helpful ' +
                    '"Reply yes/no" hint is appended automatically.',
            },
            to: {
                type: 'string',
                description:
                    'Optional. Target WhatsApp number in international format. ' +
                    'Defaults to WHATSAPP_TARGET_NUMBER from config.',
            },
            timeout_minutes: {
                type: 'number',
                description:
                    'Optional. Minutes to wait for a reply before timing out. Defaults to 5.',
            },
        },
        required: ['question'],
    },
} as const;

export async function handleAskQuestion(args: Record<string, unknown>) {
    if (!isConnected()) {
        throw new McpError(
            ErrorCode.InternalError,
            'WhatsApp is not connected. Use get_status to check connection state.',
        );
    }

    const question = args.question as string;
    if (!question) {
        throw new McpError(ErrorCode.InvalidParams, '"question" is required.');
    }

    const to = args.to ? normalizeNumber(args.to as string) : config.targetNumber;
    const timeoutMs = ((args.timeout_minutes as number) ?? 5) * 60 * 1000;

    // Step 1: Enqueue first to reserve a label (Q-number) before sending
    const { label, promise } = enqueue(question, timeoutMs);

    // Step 2: Build the full WhatsApp message
    //   Line 1: label (helps user track concurrent questions)
    //   Then a blank line
    //   Then the auto-formatted question body
    const formattedBody = autoFormat(question);
    const fullMessage = `${label}\n\n${formattedBody}`;

    // Step 3: Send
    const sock = getSocket()!;
    try {
        await sock.sendMessage(to, { text: fullMessage });
        console.error(`[Tool:ask_question] Sent ${label} to ${to}. Awaiting reply...`);
    } catch (err) {
        throw new McpError(
            ErrorCode.InternalError,
            `Failed to send question: ${err}`,
        );
    }

    // Step 4: Block until user replies or timeout fires
    try {
        const reply = await promise;
        console.error(`[Tool:ask_question] ${label} answered: "${reply}"`);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `User replied to ${label}: ${reply}`,
                },
            ],
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Tool:ask_question] ${label} timed out.`);
        return {
            content: [{ type: 'text' as const, text: msg }],
            isError: true,
        };
    }
}

