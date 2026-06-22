import { describe, it, expect } from 'vitest';
import {
    executeLoopNode,
    validateLoopNode,
    createLoopContextVars,
} from '../nodes/LoopNode.js';

describe('Loop Node', () => {
    describe('validateLoopNode', () => {
        it('passes with valid inputs', () => {
            expect(validateLoopNode({ items: [1, 2, 3] }).valid).toBe(true);
        });

        it('requires an items array', () => {
            const r = validateLoopNode({});
            expect(r.valid).toBe(false);
            expect(r.errors).toContain('items array is required');
        });

        it('validates items is an array', () => {
            const r = validateLoopNode({ items: 'nope' });
            expect(r.valid).toBe(false);
            expect(r.errors).toContain('items must be an array');
        });

        it('validates maxIterations is positive', () => {
            const r = validateLoopNode({ items: [1], maxIterations: -1 });
            expect(r.valid).toBe(false);
        });
    });

    describe('executeLoopNode', () => {
        it('passes each item through when no expression is set', async () => {
            const result = await executeLoopNode({ items: [1, 2, 3] });
            expect(result.iterations).toBe(3);
            expect(result.results).toEqual([1, 2, 3]);
        });

        it('evaluates a per-item path expression', async () => {
            const result = await executeLoopNode({
                items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
                expression: 'item.name',
            });
            expect(result.results).toEqual(['a', 'b', 'c']);
        });

        it('applies a transform function when provided', async () => {
            const result = await executeLoopNode({
                items: [1, 2, 3],
                transform: (scope: any) => scope.item * 2,
            });
            expect(result.results).toEqual([2, 4, 6]);
        });

        it('exposes loop context variables to the expression', async () => {
            const result = await executeLoopNode({
                items: ['a', 'b', 'c'],
                expression: 'index',
            });
            expect(result.results).toEqual([0, 1, 2]);
        });

        it('handles an empty array', async () => {
            const result = await executeLoopNode({ items: [] });
            expect(result.iterations).toBe(0);
            expect(result.results).toEqual([]);
        });

        it('wraps a single non-array item', async () => {
            const result = await executeLoopNode({ items: 'single', expression: 'item' });
            expect(result.iterations).toBe(1);
            expect(result.results).toEqual(['single']);
        });

        it('enforces maxIterations', async () => {
            await expect(
                executeLoopNode({ items: Array.from({ length: 11 }, (_, i) => i), maxIterations: 10 }),
            ).rejects.toThrow('exceeds max iterations');
        });

        it('breaks when the break condition is met', async () => {
            const result = await executeLoopNode({
                items: [1, 2, 3, 4, 5],
                expression: 'item',
                breakCondition: 'result === 3',
            });
            expect(result.iterations).toBe(3);
            expect(result.breakTriggered).toBe(true);
        });

        it('continues on error when continueOnError is true', async () => {
            const result = await executeLoopNode({
                items: [1, 2, 3],
                transform: (scope: any) => {
                    if (scope.item === 2) throw new Error('boom');
                    return scope.item;
                },
                continueOnError: true,
            });
            expect(result.iterations).toBe(3);
            expect(result.results[1].error).toBe('boom');
            expect(result.results[0]).toBe(1);
        });

        it('stops on error when continueOnError is false', async () => {
            await expect(
                executeLoopNode({
                    items: [1, 2, 3],
                    transform: (scope: any) => {
                        if (scope.item === 2) throw new Error('boom');
                        return scope.item;
                    },
                    continueOnError: false,
                }),
            ).rejects.toThrow('Loop failed at iteration 2');
        });
    });

    describe('createLoopContextVars', () => {
        it('creates context variables', () => {
            expect(createLoopContextVars('x', 1, 5)).toEqual({
                item: 'x',
                index: 1,
                isFirst: false,
                isLast: false,
                iterations: 2,
                total: 5,
            });
        });

        it('marks the first and last items', () => {
            expect(createLoopContextVars('a', 0, 3).isFirst).toBe(true);
            expect(createLoopContextVars('c', 2, 3).isLast).toBe(true);
        });
    });
});
