import { describe, it, expect } from 'vitest';
import {
    LOGIC_SNIPPETS, serializeCondition, toOperandValue, isSnippetValid, initialSnippetValues,
} from './logicSnippets';

const byKey = Object.fromEntries(LOGIC_SNIPPETS.map(s => [s.key, s]));

describe('toOperandValue', () => {
    it('quotes bare strings', () => expect(toOperandValue('gold')).toBe("'gold'"));
    it('keeps numbers', () => expect(toOperandValue('42')).toBe('42'));
    it('keeps booleans/nil', () => {
        expect(toOperandValue('true')).toBe('true');
        expect(toOperandValue('nil')).toBe('nil');
    });
    it('bares a variable', () => expect(toOperandValue('{{ x.y }}')).toBe('x.y'));
    it('leaves already-quoted as-is', () => expect(toOperandValue("'x'")).toBe("'x'"));
    it('escapes embedded quotes', () => expect(toOperandValue("o'brien")).toBe("'o\\'brien'"));
});

describe('serializeCondition', () => {
    it('builds a comparison', () => {
        expect(serializeCondition({ lhs: '{{ user.role }}', op: '==', rhs: 'admin' }))
            .toBe("user.role == 'admin'");
    });
    it('falls back to truthiness when rhs blank', () => {
        expect(serializeCondition({ lhs: 'record.active', op: '==', rhs: '' }))
            .toBe('record.active');
    });
    it('returns empty when lhs blank', () => {
        expect(serializeCondition({ lhs: '', op: '==', rhs: 'x' })).toBe('');
    });
});

describe('snippet build output', () => {
    it('if wraps a condition', () => {
        const { text } = byKey.if.build({ cond: { lhs: 'record.vip', op: '==', rhs: 'true' } });
        expect(text).toBe('{% if record.vip == true %}\n  \n{% endif %}');
    });
    it('for uses item name + bare list', () => {
        const { text } = byKey.for.build({ list: '{{ record.orders }}', item: 'order' });
        expect(text).toBe('{% for order in record.orders %}\n  \n{% endfor %}');
    });
    it('case emits one when per value', () => {
        const { text } = byKey.case.build({ subject: 'record.plan', whens: ['free', 'pro'] });
        expect(text).toContain('{% case record.plan %}');
        expect(text).toContain("{% when 'free' %}");
        expect(text).toContain("{% when 'pro' %}");
        expect(text).toContain('{% endcase %}');
    });
    it('assign quotes a bare value but bares a variable', () => {
        expect(byKey.assign.build({ name: 'x', value: 'hello' }).text).toBe("{% assign x = 'hello' %}");
        expect(byKey.assign.build({ name: 'x', value: '{{ record.t }}' }).text).toBe('{% assign x = record.t %}');
    });
    it('caretOffset lands inside the body', () => {
        const { text, caretOffset } = byKey.if.build({ cond: { lhs: 'a', op: '==', rhs: '' } });
        // caret should be just after the opening tag + newline + indent
        expect(text.slice(0, caretOffset)).toBe('{% if a %}\n  ');
    });
});

describe('isSnippetValid', () => {
    it('requires a condition lhs', () => {
        expect(isSnippetValid(byKey.if, { cond: { lhs: '', op: '==', rhs: '' } })).toBe(false);
        expect(isSnippetValid(byKey.if, { cond: { lhs: 'a', op: '==', rhs: '' } })).toBe(true);
    });
    it('for is valid with default item name', () => {
        const vals = initialSnippetValues(byKey.for);
        vals.list = '{{ record.orders }}';
        expect(isSnippetValid(byKey.for, vals)).toBe(true);
    });
    it('case requires at least one when', () => {
        expect(isSnippetValid(byKey.case, { subject: 'record.plan', whens: [''] })).toBe(false);
        expect(isSnippetValid(byKey.case, { subject: 'record.plan', whens: ['free'] })).toBe(true);
    });
});
