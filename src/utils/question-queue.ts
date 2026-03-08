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
): { label: string; promise: Promise<string> } {
    questionCounter += 1;
    const id = questionCounter;
    const heading = extractHeading(question);
    const label = `[Q${id}: ${heading}]`;

    const promise = new Promise<string>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            const idx = queue.findIndex((q) => q.id === id);
            if (idx !== -1) queue.splice(idx, 1);
            reject(new Error(`Timeout: no reply received for ${label}`));
        }, timeoutMs);

        queue.push({ id, label, resolve, reject, timeoutHandle });
    });

    return { label, promise };
}

/**
 * Called when a WhatsApp message arrives from the target user.
 * Dequeues the oldest pending question and resolves it with the reply.
 * Returns true if a pending question was resolved, false if the queue was empty.
 */
export function resolveNext(reply: string): boolean {
    const item = queue.shift();
    if (!item) return false;
    clearTimeout(item.timeoutHandle);
    item.resolve(reply);
    return true;
}

/** Returns the number of questions currently waiting for a reply */
export function getQueueLength(): number {
    return queue.length;
}

/** Returns the labels of all questions currently in the queue */
export function getPendingLabels(): string[] {
    return queue.map((q) => q.label);
}

/** Reset queue counter and entries — only for use in tests */
export function __resetForTest(): void {
    questionCounter = 0;
    queue.length = 0;
}
