/**
 * formatting.ts
 *
 * Pure utility functions — extracted from tool handlers so they can be
 * unit-tested without any WhatsApp or MCP dependencies.
 */

/**
 * Keywords that suggest a yes/no confirmation-style question.
 * When matched, autoFormat() appends a ✅/❌ hint.
 */
const CONFIRMATION_PATTERN =
    /\b(confirm|proceed|allow|approve|permit|delete|remove|deploy|grant|permission|shall i|should i|can i|do you want|are you sure|yes or no)\b|\?$/im;

/**
 * If the question looks like a yes/no confirmation, appends a WhatsApp-formatted
 * "Reply yes/no" hint. Otherwise returns the question unchanged.
 */
export function autoFormat(question: string): string {
    if (CONFIRMATION_PATTERN.test(question)) {
        return (
            question.trimEnd() +
            '\n\n' +
            '✅ Reply *yes* to confirm\n' +
            '❌ Reply *no* to cancel'
        );
    }
    return question;
}

/**
 * Normalises a WhatsApp phone number to the Baileys JID format.
 * Accepts numbers with +, spaces, dashes, or parentheses.
 * Examples:
 *   "+91 98765 43210"  → "919876543210@s.whatsapp.net"
 *   "1234567890"       → "1234567890@s.whatsapp.net"
 *   "123@s.whatsapp.net" → "123@s.whatsapp.net"  (already correct, unchanged)
 */
export function normalizeNumber(number: string): string {
    const clean = number.replace(/[+\s\-()]/g, '');
    return clean.endsWith('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
}

/**
 * Extracts a short human-readable heading from a question string.
 * Takes the first sentence of the first line, capped at 45 characters.
 */
export function extractHeading(question: string): string {
    const firstLine = question.split('\n')[0].trim();
    const [firstSentence] = firstLine.split(/(?<=[.!?])\s/);
    const raw = (firstSentence ?? firstLine).trim();
    return raw.length > 45 ? raw.slice(0, 42) + '...' : raw;
}
