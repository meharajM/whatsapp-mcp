/**
 * question-queue.ts
 *
 * FIFO queue for ask_question calls.
 * Each entry holds: a unique label (e.g. "[Q3: Deploy to prod?]"), the timeout
 * handle, and a promise resolver/rejector so the MCP tool call can block until
 * the user replies on WhatsApp.
 */

import { extractHeading } from './formatting.js';

export type QueuedQuestion = {
    id: number;
    label: string;
    targetJid: string;
    expired: boolean;
    resolve: (reply: string) => void;
    reject: (err: Error) => void;
    timeoutHandle: ReturnType<typeof setTimeout>;
};

/** Auto-incrementing counter — never resets so labels are always unique per session */
let questionCounter = 0;

/** The live queue of questions waiting for replies */
const queue: QueuedQuestion[] = [];

/**
 * Adds a question to the queue.
 * Returns the label (to prepend to the WhatsApp message) and a promise that
 * resolves with the user's reply text or rejects on timeout.
 */
export function enqueue(
    question: string,
    timeoutMs: number,
    targetJid: string,
): { label: string; promise: Promise<string> } {
    questionCounter += 1;
    const id = questionCounter;
    const heading = extractHeading(question);
    const label = `[Q${id}: ${heading}]`;

    const promise = new Promise<string>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            const idx = queue.findIndex((q) => q.id === id);
            if (idx !== -1) {
                queue[idx].expired = true;
            }
            reject(new Error(`Timeout: no reply received for ${label}`));
        }, timeoutMs);

        queue.push({ id, label, targetJid, expired: false, resolve, reject, timeoutHandle });
    });

    return { label, promise };
}

/**
 * Called when a WhatsApp message arrives from the target user.
 * Dequeues the oldest pending question and resolves it with the reply.
 * Returns true if a pending question was resolved, false if the queue was empty.
 */
export function routeIncomingReply(
    reply: string,
    remoteJid?: string,
): 'resolved' | 'expired' | 'no_match' {
    if (remoteJid) {
        const idx = queue.findIndex((q) => q.targetJid === remoteJid);
        if (idx === -1) return 'no_match';

        const item = queue[idx];
        queue.splice(idx, 1);
        clearTimeout(item.timeoutHandle);

        if (item.expired) {
            return 'expired';
        }

        item.resolve(reply);
        return 'resolved';
    }

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return 'no_match';
        clearTimeout(item.timeoutHandle);
        if (item.expired) {
            continue;
        }

        item.resolve(reply);
        return 'resolved';
    }

    return 'no_match';
}

export function resolveNext(reply: string, remoteJid?: string): boolean {
    return routeIncomingReply(reply, remoteJid) === 'resolved';
}

/** Returns the number of questions currently waiting for a reply */
export function getQueueLength(): number {
    return queue.filter((q) => !q.expired).length;
}

/** Returns the labels of all questions currently in the queue */
export function getPendingLabels(): string[] {
    return queue.filter((q) => !q.expired).map((q) => q.label);
}

/** Reset queue counter and entries — only for use in tests */
export function __resetForTest(): void {
    questionCounter = 0;
    queue.length = 0;
}
