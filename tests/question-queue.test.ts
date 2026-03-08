/**
 * question-queue.test.ts
 *
 * Unit tests for the FIFO question queue:
 *   - enqueue creates correct labels
 *   - resolveNext picks entries FIFO
 *   - Concurrent questions get distinct labels
 *   - Timeout rejects the promise
 *   - getQueueLength and getPendingLabels reflect state
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    enqueue,
    resolveNext,
    getQueueLength,
    getPendingLabels,
    __resetForTest,
} from '../src/utils/question-queue.js';

beforeEach(() => {
    __resetForTest();
});

describe('enqueue', () => {
    test('returns a label in [Q{n}: heading] format', () => {
        const { label, promise } = enqueue('Deploy to production?', 60_000);
        promise.catch(() => { });
        assert.match(label, /^\[Q\d+: .+\]$/);
    });

    test('increments the Q-number for each enqueue', () => {
        const { label: l1, promise: p1 } = enqueue('First question?', 60_000);
        const { label: l2, promise: p2 } = enqueue('Second question?', 60_000);
        p1.catch(() => { });
        p2.catch(() => { });
        const n1 = parseInt(l1.match(/Q(\d+)/)![1]);
        const n2 = parseInt(l2.match(/Q(\d+)/)![1]);
        assert.equal(n2, n1 + 1, 'Q-numbers should increment');
    });

    test('heading is derived from the first sentence of the question', () => {
        const { label, promise } = enqueue('Is it safe to proceed? More context here.', 60_000);
        promise.catch(() => { });
        assert.ok(label.includes('Is it safe to proceed?'), `Label was: ${label}`);
    });

    test('heading is truncated if longer than 45 chars', () => {
        const longQ = 'This is an extremely long question sentence that definitely exceeds the limit';
        const { label, promise } = enqueue(longQ, 60_000);
        promise.catch(() => { });
        // Extract just the heading part between ": " and "]"
        const heading = label.slice(label.indexOf(': ') + 2, -1);
        assert.ok(heading.length <= 45, `Heading too long: ${heading.length} chars`);
    });

    test('adds the question to the queue', () => {
        assert.equal(getQueueLength(), 0);
        const { promise } = enqueue('Question?', 60_000);
        promise.catch(() => { });
        assert.equal(getQueueLength(), 1);
    });
});

describe('resolveNext', () => {
    test('resolves the promise with the reply text', async () => {
        const { promise } = enqueue('Are you sure?', 60_000);
        resolveNext('yes');
        const reply = await promise;
        assert.equal(reply, 'yes');
    });

    test('removes the item from the queue after resolving', async () => {
        const { promise } = enqueue('Question?', 60_000);
        resolveNext('answer');
        await promise;
        assert.equal(getQueueLength(), 0);
    });

    test('returns true when a question was resolved', () => {
        const { promise } = enqueue('Question?', 60_000);
        promise.catch(() => { });
        assert.equal(resolveNext('reply'), true);
    });

    test('returns false and does nothing when queue is empty', () => {
        assert.equal(resolveNext('orphan reply'), false);
    });

    test('operates FIFO — resolves earliest question first', async () => {
        const { promise: p1 } = enqueue('First?', 60_000);
        const { promise: p2 } = enqueue('Second?', 60_000);

        resolveNext('reply-to-first');
        resolveNext('reply-to-second');

        const [r1, r2] = await Promise.all([p1, p2]);
        assert.equal(r1, 'reply-to-first');
        assert.equal(r2, 'reply-to-second');
    });
});

describe('concurrent questions', () => {
    test('supports multiple simultaneous questions with distinct labels', () => {
        const { label: l1, promise: p1 } = enqueue('Delete logs?', 60_000);
        const { label: l2, promise: p2 } = enqueue('Deploy to staging?', 60_000);
        const { label: l3, promise: p3 } = enqueue('What region?', 60_000);

        p1.catch(() => { });
        p2.catch(() => { });
        p3.catch(() => { });

        assert.equal(getQueueLength(), 3);
        assert.notEqual(l1, l2);
        assert.notEqual(l2, l3);
    });

    test('getPendingLabels returns all present labels in order', () => {
        const { label: l1, promise: p1 } = enqueue('A?', 60_000);
        const { label: l2, promise: p2 } = enqueue('B?', 60_000);

        p1.catch(() => { });
        p2.catch(() => { });

        const labels = getPendingLabels();
        assert.deepEqual(labels, [l1, l2]);
    });
});

describe('timeout', () => {
    test('rejects the promise when timeout elapses', async () => {
        const { promise } = enqueue('Will I time out?', 50); // 50ms timeout

        await assert.rejects(promise, (err: Error) => {
            assert.ok(err.message.includes('Timeout'), `Expected timeout message, got: ${err.message}`);
            return true;
        });
    });

    test('removes the item from the queue after timeout', async () => {
        const { promise } = enqueue('Timing out?', 50);

        try { await promise; } catch { /* expected */ }

        assert.equal(getQueueLength(), 0);
    });
});
