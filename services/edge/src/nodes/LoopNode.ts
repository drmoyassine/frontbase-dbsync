/**
 * Loop / Iterator Node (Automations A5)
 *
 * Iterates over an array and produces a transformed result per item
 * (map-style). Per-item evaluation uses the shared `safeEval` expression engine,
 * so the loop body is a configurable expression referencing `item`, `index`,
 * `isFirst`, `isLast`, `iterations`, and any upstream `inputs`.
 *
 * Full per-iteration sub-graph execution (executing a chain of downstream nodes
 * per item) is a follow-up that requires runtime graph integration; this
 * expression-based map covers the common transform-each-row use case and is
 * fully unit-tested.
 *
 * Node inputs:
 *   - items:           any[]                (required; non-arrays are wrapped)
 *   - maxIterations:   number               (default 1000)
 *   - expression:      string               (per-item transform expression)
 *   - breakCondition:  string               (optional, evaluated per result)
 *   - continueOnError: boolean              (default true)
 */

import { safeEval } from '../engine/expr.js';

export interface LoopContext {
    item: any;
    index: number;
    isFirst: boolean;
    isLast: boolean;
    iterations: number;
}

export interface LoopNodeResult {
    iterations: number;
    results: any[];
    breakTriggered?: boolean;
    error?: string;
}

/** Validate loop node inputs. */
export function validateLoopNode(inputs: Record<string, any>): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    if (inputs.items === undefined || inputs.items === null) {
        errors.push('items array is required');
    } else if (!Array.isArray(inputs.items)) {
        errors.push('items must be an array');
    }
    if (inputs.maxIterations !== undefined) {
        const max = Number(inputs.maxIterations);
        if (!Number.isFinite(max) || max < 1) errors.push('maxIterations must be a positive number');
    }
    return { valid: errors.length === 0, errors };
}

/** Build the per-iteration context variables. */
export function createLoopContextVars(item: any, index: number, total: number): Record<string, any> {
    return {
        item,
        index,
        isFirst: index === 0,
        isLast: index === total - 1,
        iterations: index + 1,
        total,
    };
}

/**
 * Execute a loop node. For each item, evaluates `expression` against the loop
 * context (+ upstream inputs) and collects the results.
 */
export async function executeLoopNode(inputs: Record<string, any>): Promise<LoopNodeResult> {
    const itemsInput = inputs.items;
    const items = Array.isArray(itemsInput) ? itemsInput : [itemsInput];

    if (items.length === 0) {
        return { iterations: 0, results: [] };
    }

    const maxIterations = Number(inputs.maxIterations ?? 1000);
    if (!Number.isFinite(maxIterations) || maxIterations < 1) {
        throw new Error('maxIterations must be a positive number');
    }
    if (items.length > maxIterations) {
        throw new Error(
            `Loop exceeds max iterations: ${items.length} > ${maxIterations}. Raise maxIterations or filter the input.`,
        );
    }

    const expression = inputs.expression as string | undefined;
    const transform = typeof inputs.transform === 'function' ? (inputs.transform as (scope: Record<string, any>) => any) : null;
    const breakCondition = inputs.breakCondition as string | undefined;
    const continueOnError = inputs.continueOnError !== false;

    const results: any[] = [];
    let breakTriggered = false;

    for (let i = 0; i < items.length; i++) {
        const ctxVars = createLoopContextVars(items[i], i, items.length);
        const scope = { ...inputs, ...ctxVars };

        try {
            const result = transform
                ? transform(scope)
                : expression
                  ? safeEval(expression, scope)
                  : items[i];
            results.push(result);

            if (breakCondition) {
                try {
                    if (safeEval(breakCondition, { result, ...scope })) {
                        breakTriggered = true;
                        break;
                    }
                } catch {
                    // malformed break condition — ignore (no break)
                }
            }
        } catch (error: any) {
            results.push({ error: error.message, item: items[i], index: i });
            if (!continueOnError) {
                throw new Error(`Loop failed at iteration ${i + 1}: ${error.message}`);
            }
        }
    }

    return { iterations: results.length, results, breakTriggered };
}
