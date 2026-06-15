import * as dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { normalizeNumber } from './utils/formatting.js';

const mcpDir = join(homedir(), '.whatsapp-mcp');
try {
    mkdirSync(mcpDir, { recursive: true });
} catch (e) {
    // Ignore folder creation errors
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, '..');

function loadEnvFile(path: string): void {
    if (existsSync(path)) {
        dotenv.config({ path, quiet: true });
    }
}

// Support loading ~/.whatsapp-mcp/.env, the repo root .env, and the current working directory .env.
loadEnvFile(join(mcpDir, '.env'));
loadEnvFile(join(repoRoot, '.env'));
loadEnvFile(join(process.cwd(), '.env'));

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
    return normalizeNumber(number);
}

const rawTargetNumber = requireEnv('WHATSAPP_TARGET_NUMBER');
const rawAllowedNumbers = process.env.WHATSAPP_ALLOWED_NUMBERS;

export const config = {
    /** The default WhatsApp number (with @s.whatsapp.net suffix) to send messages to */
    targetNumber: normalizeWhatsappId(rawTargetNumber),

    /** 
     * Specific numbers allowed to interact with the bot.
     * Prevents random people in a group or random DMs from controlling the agent.
     */
    allowedNumbers: rawAllowedNumbers
        ? rawAllowedNumbers.split(',').map(n => normalizeWhatsappId(n.trim())).filter(Boolean)
        : null,

    /** Directory where Baileys stores auth session files */
    authDir: join(mcpDir, 'baileys_auth_info'),

    /** How long (ms) to wait for a delivery receipt after sending a message */
    deliveryTimeoutMs: 3000,
} as const;
