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

// ── Connection lifecycle ─────────────────────────────────────────────────────

let connectionPromise: Promise<{ status: 'connected' | 'qr' | 'connecting'; qrDataUri?: string }> | null = null;

export async function connect(): Promise<{ status: 'connected' | 'qr' | 'connecting'; qrDataUri?: string }> {
    if (_connected && sock) {
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
                    resolveSafe({ status: 'connecting' });
                }

                if (qr) {
                    try {
                        const dataUri = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'L', margin: 2, scale: 6 });
                        // Also print to stderr as a fallback reference
                        console.error('[WhatsApp] Scan QR code or retrieve via MCP GUI.');
                        qrcodeTerminal.generate(qr, { small: true }, (ascii) => {
                            console.error(ascii);
                        });
                        resolveSafe({ status: 'qr', qrDataUri: dataUri });
                    } catch (err) {
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
                    connectionPromise = null;
                    sock = null;

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
                        connect().then(resolveSafe).catch(rejectSafe);
                    } else {
                        // Transient network disconnect — reconnect silently with a backoff to prevent tight loops
                        setTimeout(() => {
                            connect().then(resolveSafe).catch(rejectSafe);
                        }, 2000);
                    }
                }

                if (connection === 'open') {
                    console.error('[WhatsApp] Connected structure mapped and active.');
                    _connected = true;
                    resolveSafe({ status: 'connected' });
                }
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('messages.upsert', async (m: any) => {
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
                        const didResolve = resolveNext(text);
                        if (didResolve) {
                            console.error('[Tool:ask_question] Pending question resolved via incoming message.');
                        }
                    }
                }
            });

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
        await sock.logout('Explicit disconnect via MCP tool');
        sock = null;
    }
    _connected = false;
    connectionPromise = null;
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
