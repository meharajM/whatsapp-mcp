/**
 * client.ts
 *
 * Manages the Baileys WhatsApp WebSocket connection lifecycle:
 *  - Initial connection + QR display (on stderr, never stdout)
 *  - Auto-reconnect on disconnect
 *  - Routing incoming messages to the question queue
 *  - Delivery receipt tracking for send_message tool
 */

import makeWASocketImport, {
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import { resolveNext } from '../utils/question-queue.js';

// Baileys exports as default in ESM but the types use a namespace export; handle both.
// We use `any` for the socket because the type constraint on ReturnType<typeof makeWASocket>
// fails on some Baileys 6.x builds where the default export is typed as a namespace.
const makeWASocket: (...args: any[]) => any =
    ((makeWASocketImport as any).default as any) ?? (makeWASocketImport as any);

/** Silent logger so Baileys internals don't pollute MCP stdout */
const logger = pino({ level: 'silent' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sock: any | null = null;
let _connected = false;

// ── Receipt tracking ────────────────────────────────────────────────────────

type ReceiptWaiter = {
    resolve: (delivered: boolean) => void;
};

/** Map from messageId → waiting resolver */
const receiptWaiters = new Map<string, ReceiptWaiter>();

/**
 * Returns a promise that resolves to true if the message with the given ID
 * receives a delivery receipt within `timeoutMs`, or false otherwise.
 */
export function waitForDelivery(
    messageId: string,
    timeoutMs: number,
): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            receiptWaiters.delete(messageId);
            resolve(false);
        }, timeoutMs);

        receiptWaiters.set(messageId, {
            resolve: (delivered) => {
                clearTimeout(timer);
                resolve(delivered);
            },
        });
    });
}

// ── Connection ──────────────────────────────────────────────────────────────

/** Expose the socket instance for tool handlers */
export function getSocket() {
    return sock;
}

/** Whether WhatsApp is currently connected */
export function isConnected(): boolean {
    return _connected;
}

/**
 * Opens (or re-opens) the WhatsApp Web connection.
 * Called once at startup and automatically on non-logout disconnects.
 */
export async function connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

    sock = makeWASocket({
        auth: state,
        // QR is printed manually to stderr below; we don't want Baileys to print to stdout
        printQRInTerminal: false,
        logger,
        browser: ['WhatsApp MCP', 'Chrome', '1.0.0'],
    });

    // ── Connection state updates ─────────────────────────────────────────────
    sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // QR goes to stderr so it never interferes with the MCP stdio protocol
            qrcode.generate(qr, { small: true }, (code: string) => {
                console.error('\n=== WhatsApp MCP: Scan QR to link your device ===');
                console.error(code);
                console.error('=================================================\n');
            });
        }

        if (connection === 'close') {
            _connected = false;
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.error(
                `[WA] Connection closed (reason: ${reason}). Reconnecting: ${shouldReconnect}`,
            );
            if (shouldReconnect) connect();
        } else if (connection === 'open') {
            _connected = true;
            console.error('[WA] Connected to WhatsApp.');
        }
    });

    // ── Persist credentials ──────────────────────────────────────────────────
    sock.ev.on('creds.update', saveCreds);

    // ── Incoming messages → resolve pending questions ────────────────────────
    sock.ev.on('messages.upsert', async (m: any) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            // Only process messages from the configured target number, not our own
            if (msg.key.fromMe) continue;
            if (msg.key.remoteJid !== config.targetNumber) continue;

            const text =
                msg.message?.conversation ??
                msg.message?.extendedTextMessage?.text;

            if (!text) continue;

            const resolved = resolveNext(text);
            if (!resolved) {
                console.error(
                    `[WA] Received message with no waiting question: "${text}"`,
                );
            }
        }
    });

    // ── Delivery receipts → unblock waitForDelivery ──────────────────────────
    sock.ev.on('message-receipt.update', (updates: any[]) => {
        for (const update of updates) {
            const msgId = update.key?.id;
            if (!msgId) continue;

            const waiter = receiptWaiters.get(msgId);
            if (waiter) {
                receiptWaiters.delete(msgId);
                waiter.resolve(true);
            }
        }
    });
}

// ── Test helpers (never call in production code) ─────────────────────────────

/** Force-set connection state for unit tests */
export function __setConnectedForTest(val: boolean): void {
    _connected = val;
}

/** Inject a mock socket for unit tests */
export function __setSocketForTest(mockSock: any): void {
    sock = mockSock;
}
