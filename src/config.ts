import * as dotenv from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

const mcpDir = join(homedir(), '.whatsapp-mcp');
try {
    mkdirSync(mcpDir, { recursive: true });
} catch (e) {
    // Ignore folder creation errors
}

// Support loading `.env` from ~/.whatsapp-mcp/.env 
dotenv.config({ path: join(mcpDir, '.env') });
// Also fallback to the current working directory `.env` or MCP injected environments
dotenv.config();

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) {
        console.error(`[Config] Missing required env variable: ${key}`);
        console.error(`[Config] Please set ${key} in your MCP client env config, or in ~/.whatsapp-mcp/.env`);
        process.exit(1);
    }
    return val;
}

function normalizeWhatsappId(number: string): string {
    // Strip + signs and spaces, then ensure @s.whatsapp.net suffix
    const clean = number.replace(/[+\s]/g, '');
    return clean.endsWith('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
}

const rawTargetNumber = requireEnv('WHATSAPP_TARGET_NUMBER');

export const config = {
    /** The WhatsApp ID of the user that the agent will talk to */
    targetNumber: normalizeWhatsappId(rawTargetNumber),

    /** Directory where Baileys stores auth session files */
    authDir: join(mcpDir, 'baileys_auth_info'),

    /** How long (ms) to wait for a delivery receipt after sending a message */
    deliveryTimeoutMs: 3000,
} as const;
