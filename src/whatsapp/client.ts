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
import { rmSync, existsSync } from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { config } from '../config.js';
import { routeIncomingReply } from '../utils/question-queue.js';
import { pushIncomingMessage } from '../utils/inbox-queue.js';

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
let suppressReconnectAfterLogout = false;

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

/** Whether a connection attempt is currently in progress */
export function isConnecting(): boolean {
    return !!connectionPromise;
}

// ── Connection lifecycle ─────────────────────────────────────────────────────

let unsolicitedMessageHandler: ((text: string, sender: string) => void) | null = null;

export function setUnsolicitedMessageHandler(handler: (text: string, sender: string) => void) {
    unsolicitedMessageHandler = handler;
}

export type ConnectionResult = {
    status: 'connected' | 'qr' | 'connecting';
    qrDataUri?: string;
};

export type AuthState = 'connected' | 'connecting' | 'qr_pending' | 'disconnected';

let connectionPromise: Promise<ConnectionResult> | null = null;
let lastAuthState: AuthState = 'disconnected';
let connectOverrideForTest: ConnectionResult | null = null;

export function getAuthState(): AuthState {
    return lastAuthState;
}

export async function connect(): Promise<ConnectionResult> {
    if (connectOverrideForTest) {
        lastAuthState =
            connectOverrideForTest.status === 'qr'
                ? 'qr_pending'
                : connectOverrideForTest.status;
        _connected = connectOverrideForTest.status === 'connected';
        return connectOverrideForTest;
    }

    if (_connected && sock) {
        lastAuthState = 'connected';
        return { status: 'connected' };
    }

    // Prevent starting concurrent connection attempts
    if (connectionPromise) return connectionPromise;

    connectionPromise = new Promise(async (resolve, reject) => {
        let isResolved = false;
        const resolveSafe = (val: any) => {
            if (isResolved) return;
            isResolved = true;
            resolve(val);
        };
        const rejectSafe = (err: any) => {
            if (isResolved) return;
            isResolved = true;
            reject(err);
        };

        try {
            const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

            // If the auth folder exists and has creds, it means we are likely restoring a session.
            // We resolve immediately so the MCP client doesn't timeout waiting for Baileys to sync (which can take 60s+).
            const hasExistingAuth = existsSync(config.authDir) && !!state.creds?.me;

            sock = makeWASocket({
                auth: state,
                logger,
                printQRInTerminal: false, // We handle it manually
                browser: ['WhatsApp MCP', 'Chrome', '1.0.0'],
            });

            // ── Connection state updates ─────────────────────────────────────────────
            sock.ev.on('connection.update', async (update: any) => {
                const { connection, lastDisconnect, qr } = update;

                if (connection === 'connecting' && hasExistingAuth) {
                    console.error('[WhatsApp] Existing session found. Initializing connection in background...');
                    lastAuthState = 'connecting';
                    resolveSafe({ status: 'connecting' });
                }

                if (qr) {
                    try {
                        const dataUri = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'L', margin: 2, scale: 3 });
                        // Also print to stderr as a fallback reference
                        console.error('[WhatsApp] Scan QR code or retrieve via MCP GUI.');
                        qrcodeTerminal.generate(qr, { small: true }, (ascii) => {
                            console.error(ascii);
                        });
                        lastAuthState = 'qr_pending';
                        console.error('[WhatsApp] Resolving connect promise with status: qr');
                        resolveSafe({ status: 'qr', qrDataUri: dataUri });
                    } catch (err) {
                        console.error('[WhatsApp] Failed to generate QR data URI:', err);
                        rejectSafe(new Error(`Failed to generate QR data URI: ${err}`));
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                    const isLoggedOut =
                        statusCode === DisconnectReason.loggedOut ||
                        statusCode === 405 ||
                        statusCode === 403;

                    console.error('[WhatsApp] Connection closed.', { code: statusCode, loggedOut: isLoggedOut });

                    _connected = false;
                    lastAuthState = 'disconnected';
                    connectionPromise = null;
                    sock = null;

                    if (suppressReconnectAfterLogout) {
                        suppressReconnectAfterLogout = false;
                        resolveSafe({ status: 'connecting' });
                        return;
                    }

                    if (isLoggedOut) {
                        // Stale/expired/explicitly-logged-out session.
                        // Wipe auth files so the next connect() shows a fresh QR.
                        if (existsSync(config.authDir)) {
                            try {
                                rmSync(config.authDir, { recursive: true, force: true });
                                console.error('[WhatsApp] Cleared stale auth session.');
                            } catch (e) {
                                console.error('[WhatsApp] Failed to clear auth dir:', e);
                            }
                        }
                        // Resolve with a qr status so the `connect` tool retries and shows a new QR
                        console.error('[WhatsApp] Re-calling connect() due to logout');
                        connect().then(resolveSafe).catch(rejectSafe);
                    } else {
                        // Transient network disconnect — reconnect silently with a backoff to prevent tight loops
                        setTimeout(() => {
                            console.error('[WhatsApp] Re-calling connect() due to transient disconnect');
                            connect().then(resolveSafe).catch(rejectSafe);
                        }, 2000);
                    }
                }

                if (connection === 'open') {
                    console.error('[WhatsApp] Connected structure mapped and active.');
                    _connected = true;
                    lastAuthState = 'connected';
                    console.error('[WhatsApp] Resolving connect promise with status: connected');
                    resolveSafe({ status: 'connected' });
                }
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('messages.upsert', __messageUpsertHandlerForTest);

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

        } catch (err) {
            connectionPromise = null;
            rejectSafe(err);
        }
    });

    // When the promise finishes successfully or throws, optionally we could clear `connectionPromise`,
    // but caching it until a disconnect is generally safer so concurrent calls return the same status.
    return connectionPromise.catch(err => {
        connectionPromise = null;
        throw err;
    });
}

/** 
 * Disconnects the active socket and logs out of WhatsApp Web (invalidating the session credentials). 
 */
export async function disconnect(): Promise<void> {
    if (sock) {
        suppressReconnectAfterLogout = true;
        try {
            await sock.logout('Explicit disconnect via MCP tool');
        } catch (err) {
            suppressReconnectAfterLogout = false;
            throw err;
        }
        sock = null;
    }
    _connected = false;
    lastAuthState = 'disconnected';
    connectionPromise = null;
}

// ── Test helpers (never call in production code) ─────────────────────────────

export const __messageUpsertHandlerForTest = async (m: any) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
        const remoteJid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const participant = msg.key.participant; // Populated if message is from a group

        if (fromMe || !remoteJid) continue;

        // Always constrain processing to the configured active chat group/number
        if (remoteJid !== config.targetNumber) continue;

        const senderJid = participant || remoteJid;

        // If explicit allowed numbers are provided, only honor messages from those specific senders
        if (config.allowedNumbers && config.allowedNumbers.length > 0) {
            if (!config.allowedNumbers.includes(senderJid)) continue;
        }

        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '';

        if (text) {
            const replyStatus = routeIncomingReply(text, remoteJid);
            if (replyStatus === 'resolved') {
                console.error('[Tool:ask_question] Pending question resolved via incoming message.');
            } else if (replyStatus === 'expired') {
                console.error('[Tool:ask_question] Ignored late reply for a timed-out question.');
            } else if (remoteJid === config.targetNumber) {
                pushIncomingMessage(text, senderJid);
                if (unsolicitedMessageHandler) {
                    unsolicitedMessageHandler(text, senderJid);
                }
            }
        }
    }
};

/** Force-set connection state for unit tests */
export function __setConnectedForTest(val: boolean): void {
    _connected = val;
    lastAuthState = val ? 'connected' : 'disconnected';
}

/** Inject a mock socket for unit tests */
export function __setSocketForTest(mockSock: any): void {
    sock = mockSock;
}

export function __setConnectResultForTest(result: ConnectionResult | null): void {
    connectOverrideForTest = result;
}

/** Trigger the messages.upsert handler directly for tests */
export async function __triggerMessagesUpsertForTest(m: any): Promise<void> {
    if (!sock || !sock.ev) return;
    const upsertHandlers = (sock.ev as any)._events?.['messages.upsert'];
    if (Array.isArray(upsertHandlers)) {
        for (const handler of upsertHandlers) {
            await handler(m);
        }
    } else if (upsertHandlers) {
        await upsertHandlers(m);
    }
}
