/**
 * formatting.test.ts
 *
 * Unit tests for pure formatting utilities:
 *   - autoFormat (yes/no detection + hint appending)
 *   - normalizeNumber (WhatsApp JID normalization)
 *   - extractHeading (heading extraction for Q-labels)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { autoFormat, normalizeNumber, extractHeading } from '../src/utils/formatting.js';

// ── autoFormat ────────────────────────────────────────────────────────────────

describe('autoFormat', () => {
    const YES_NO_HINT = '✅ Reply *yes* to confirm\n❌ Reply *no* to cancel';

    test('appends hint for "confirm" keyword', () => {
        const result = autoFormat('Please confirm you want to proceed.');
        assert.ok(result.includes(YES_NO_HINT), 'Expected yes/no hint to be appended');
    });

    test('appends hint for "proceed" keyword', () => {
        const result = autoFormat('Should I proceed with the deployment?');
        assert.ok(result.includes(YES_NO_HINT));
    });

    test('appends hint for "delete" keyword', () => {
        const result = autoFormat('Can I delete the old log files?');
        assert.ok(result.includes(YES_NO_HINT));
    });

    test('appends hint for "deploy" keyword', () => {
        const result = autoFormat('Deploy to production now?');
        assert.ok(result.includes(YES_NO_HINT));
    });

    test('appends hint for "approve" keyword', () => {
        const result = autoFormat('Do you approve this change?');
        assert.ok(result.includes(YES_NO_HINT));
    });

    test('appends hint for "?" at end of line', () => {
        const result = autoFormat('Are you ready?');
        assert.ok(result.includes(YES_NO_HINT));
    });

    test('does NOT append hint for open-ended question with no keywords', () => {
        const result = autoFormat('What is your preferred database name');
        assert.equal(result, 'What is your preferred database name');
    });

    test('does NOT append hint for plain statement', () => {
        const result = autoFormat('Task execution started successfully.');
        assert.equal(result, 'Task execution started successfully.');
    });

    test('preserves original question text before the hint', () => {
        const question = 'Can I delete the temp folder?';
        const result = autoFormat(question);
        assert.ok(result.startsWith(question.trimEnd()));
    });

    test('appends hint with a blank line separator', () => {
        const result = autoFormat('Should I proceed?');
        assert.ok(result.includes('\n\n✅'), 'Expected double newline before hint');
    });
});

// ── normalizeNumber ───────────────────────────────────────────────────────────

describe('normalizeNumber', () => {
    test('adds @s.whatsapp.net suffix to bare number', () => {
        assert.equal(normalizeNumber('919876543210'), '919876543210@s.whatsapp.net');
    });

    test('strips leading + before adding suffix', () => {
        assert.equal(normalizeNumber('+919876543210'), '919876543210@s.whatsapp.net');
    });

    test('strips spaces from formatted number', () => {
        assert.equal(normalizeNumber('+91 98765 43210'), '919876543210@s.whatsapp.net');
    });

    test('strips dashes from formatted number', () => {
        assert.equal(normalizeNumber('1-800-555-0100'), '18005550100@s.whatsapp.net');
    });

    test('strips parentheses from formatted number', () => {
        assert.equal(normalizeNumber('(1) 800 555 0100'), '18005550100@s.whatsapp.net');
    });

    test('does not double-append suffix if already present', () => {
        const id = '919876543210@s.whatsapp.net';
        assert.equal(normalizeNumber(id), id);
    });

    test('handles US number format', () => {
        assert.equal(normalizeNumber('+1 (415) 555-1234'), '14155551234@s.whatsapp.net');
    });
});

// ── extractHeading ────────────────────────────────────────────────────────────

describe('extractHeading', () => {
    test('returns full text for short question', () => {
        assert.equal(extractHeading('Deploy to production?'), 'Deploy to production?');
    });

    test('truncates to 45 chars with ellipsis for long text', () => {
        const longQ = 'This is a very long question that goes well beyond the 45 character limit for headings';
        const result = extractHeading(longQ);
        assert.ok(result.length <= 45, `Expected ≤45 chars, got ${result.length}`);
        assert.ok(result.endsWith('...'));
    });

    test('uses only the first line for multi-line questions', () => {
        const result = extractHeading('First line here\nSecond line here\nThird line');
        assert.ok(!result.includes('Second'), 'Should not include second line');
    });

    test('uses only the first sentence', () => {
        const result = extractHeading('First sentence. Second sentence continues.');
        assert.equal(result, 'First sentence.');
    });

    test('handles a single word', () => {
        assert.equal(extractHeading('Proceed'), 'Proceed');
    });
});
