/**
 * inbox-queue.ts
 *
 * FIFO buffer for unsolicited WhatsApp messages.
 * Incoming text that does not answer a pending ask_question is queued here so
 * any MCP client can poll it later with a standard tool.
 */

export type IncomingMessage = {
    id: number;
    sender: string;
    text: string;
    receivedAt: string;
};

let messageCounter = 0;
const inbox: IncomingMessage[] = [];

export function pushIncomingMessage(text: string, sender: string): IncomingMessage {
    messageCounter += 1;
    const message: IncomingMessage = {
        id: messageCounter,
        sender,
        text,
        receivedAt: new Date().toISOString(),
    };

    inbox.push(message);
    return message;
}

export function drainIncomingMessages(limit?: number): IncomingMessage[] {
    if (!limit || limit <= 0 || limit >= inbox.length) {
        return inbox.splice(0, inbox.length);
    }

    return inbox.splice(0, limit);
}

export function getIncomingMessageCount(): number {
    return inbox.length;
}

export function getIncomingMessageSummaries(): string[] {
    return inbox.map((message) => `[${message.id}] ${message.sender}: ${message.text}`);
}

export function __resetForTest(): void {
    messageCounter = 0;
    inbox.length = 0;
}
