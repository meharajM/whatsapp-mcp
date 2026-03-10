import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    __messageUpsertHandlerForTest,
    setUnsolicitedMessageHandler,
} from '../src/whatsapp/client.js';
import { enqueue, __resetForTest } from '../src/utils/question-queue.js';
import { config } from '../src/config.js';

let unsolicitedCalls: Array<{ text: string; sender: string }> = [];

beforeEach(() => {
    __resetForTest();
    unsolicitedCalls = [];
    setUnsolicitedMessageHandler((text, sender) => {
        unsolicitedCalls.push({ text, sender });
    });
});

function makeMessage(opts: { text?: string; fromMe?: boolean; remoteJid?: string; participant?: string }) {
    return {
        type: 'notify',
        messages: [
            {
                key: {
                    remoteJid: opts.remoteJid ?? config.targetNumber,
                    fromMe: opts.fromMe ?? false,
                    participant: opts.participant,
                },
                message: {
                    conversation: opts.text,
                },
            },
        ],
    };
}

describe('unsolicited message handler', () => {
    test('ignores messages from me', async () => {
        await __messageUpsertHandlerForTest(makeMessage({ text: 'hello', fromMe: true }));
        assert.equal(unsolicitedCalls.length, 0);
    });

    test('ignores messages not from targetNumber', async () => {
        await __messageUpsertHandlerForTest(makeMessage({ text: 'hello', remoteJid: 'wrong@s.whatsapp.net' }));
        assert.equal(unsolicitedCalls.length, 0);
    });

    test('ignores messages without text', async () => {
        await __messageUpsertHandlerForTest(makeMessage({ text: undefined }));
        assert.equal(unsolicitedCalls.length, 0);
    });

    test('ignores non-notify type events', async () => {
        const msg = makeMessage({ text: 'hello' });
        msg.type = 'other';
        await __messageUpsertHandlerForTest(msg);
        assert.equal(unsolicitedCalls.length, 0);
    });

    test('calls unsolicitedMessageHandler when there are NO pending questions', async () => {
        await __messageUpsertHandlerForTest(makeMessage({ text: 'user randomly talking' }));
        assert.equal(unsolicitedCalls.length, 1);
        assert.equal(unsolicitedCalls[0].text, 'user randomly talking');
        assert.equal(unsolicitedCalls[0].sender, config.targetNumber);
    });

    test('DOES NOT call unsolicitedMessageHandler when there IS a pending question', async () => {
        // Enqueue a question
        const { promise } = enqueue('Are you sure?', 10000);

        // Push message, triggering resolveNext
        await __messageUpsertHandlerForTest(makeMessage({ text: 'yes' }));

        // Assert unsolicited handler was not hit
        assert.equal(unsolicitedCalls.length, 0);

        // Assert promise resolved (clean up)
        const result = await promise;
        assert.equal(result, 'yes');
    });

    test('handles participant correctly in group contexts', async () => {
        // Even if the target is a group, the sender might be an individual participant
        await __messageUpsertHandlerForTest(makeMessage({
            text: 'I pushed the button',
            participant: 'user123@s.whatsapp.net'
        }));
        assert.equal(unsolicitedCalls.length, 1);
        assert.equal(unsolicitedCalls[0].sender, 'user123@s.whatsapp.net');
    });
});
