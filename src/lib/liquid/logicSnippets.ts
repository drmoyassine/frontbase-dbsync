/**
 * Logic snippet schemas for the "Logic & Loops" picker group.
 *
 * Each snippet declares (a) plain-language help for a hover tooltip and (b) the
 * fields a mini-wizard collects, plus a `build()` that assembles valid LiquidJS
 * from those fields. This replaces the old "raw template + caret offset" model
 * so non-technical users never see empty `{%  %}` gaps — they fill a small form
 * and get complete, correct Liquid.
 */

export type SnippetFieldKind = 'condition' | 'variable' | 'text' | 'list';

export interface SnippetField {
    key: string;
    label: string;
    kind: SnippetFieldKind;
    placeholder?: string;
    /** Default value (text/variable) or default item (list). */
    default?: string;
    /** Field may be left blank (e.g. the right-hand side of a truthiness check). */
    optional?: boolean;
    /** Short helper under the field. */
    hint?: string;
}

/** A condition field's value: variable/operator/value (rhs optional → truthiness). */
export interface ConditionValue {
    lhs: string;
    op: string;
    rhs: string;
}

export type SnippetValues = Record<string, string | string[] | ConditionValue>;

export interface SnippetBuildResult {
    /** The complete Liquid string to insert. */
    text: string;
    /** Char offset within `text` to place the caret (usually the body). */
    caretOffset?: number;
}

export interface LogicSnippet {
    key: string;
    label: string;
    /** One-line plain-language tooltip (what it does). */
    tooltip: string;
    /** Concrete plain-language example (what it's for). */
    example: string;
    /** Right-aligned short tag in the list row. */
    description: string;
    fields: SnippetField[];
    build: (values: SnippetValues) => SnippetBuildResult;
}

// ── Operators offered in the condition builder (plain-language labels) ────────

export const CONDITION_OPERATORS: { value: string; label: string }[] = [
    { value: '==', label: 'is' },
    { value: '!=', label: 'is not' },
    { value: '>', label: 'greater than' },
    { value: '<', label: 'less than' },
    { value: '>=', label: 'at least' },
    { value: '<=', label: 'at most' },
    { value: 'contains', label: 'contains' },
];

// ── Operand normalization ────────────────────────────────────────────────────

/** Strip a `{{ … }}` wrapper to a bare Liquid expression (tags need bare exprs). */
export function toBareExpr(s: string): string {
    const t = (s ?? '').trim();
    const m = t.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
    return (m ? m[1] : t).trim();
}

/**
 * Normalize the right-hand operand of a condition: bare a `{{ }}` variable,
 * leave numbers / booleans / nil / already-quoted strings as-is, and quote a
 * bare word as a string literal (so users don't have to know Liquid quoting).
 */
export function toOperandValue(s: string): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    if (/^\{\{[\s\S]*\}\}$/.test(t)) return toBareExpr(t);
    if (/^-?\d+(\.\d+)?$/.test(t)) return t;               // number
    if (/^(true|false|nil|null|empty|blank)$/i.test(t)) return t.toLowerCase();
    if (/^['"][\s\S]*['"]$/.test(t)) return t;             // already quoted
    return `'${t.replace(/'/g, "\\'")}'`;                   // quote a bare string
}

/** Serialize a condition row into a Liquid boolean expression. */
export function serializeCondition(c: ConditionValue): string {
    const lhs = toBareExpr(c.lhs);
    if (!lhs) return '';
    const rhs = (c.rhs ?? '').trim();
    if (!c.op || !rhs) return lhs; // truthiness: {% if record.active %}
    return `${lhs} ${c.op} ${toOperandValue(rhs)}`;
}

function asCondition(v: SnippetValues, key: string): ConditionValue {
    const raw = v[key];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ConditionValue;
    return { lhs: '', op: '==', rhs: '' };
}
function asText(v: SnippetValues, key: string, fallback = ''): string {
    const raw = v[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}
function asList(v: SnippetValues, key: string): string[] {
    const raw = v[key];
    return Array.isArray(raw) ? raw.filter(x => x && x.trim()) : [];
}

// ── The snippets ─────────────────────────────────────────────────────────────

export const LOGIC_SNIPPETS: LogicSnippet[] = [
    {
        key: 'if',
        label: 'If',
        tooltip: 'Show content only when a test passes.',
        example: "e.g. show a 'VIP' badge only when the customer is premium.",
        description: 'Conditional',
        fields: [
            { key: 'cond', label: 'Show this when…', kind: 'condition' },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const prefix = `{% if ${cond} %}\n  `;
            return { text: `${prefix}\n{% endif %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'if_else',
        label: 'If / Else',
        tooltip: 'Show one thing when a test passes, another when it fails.',
        example: "e.g. show 'In stock' or 'Sold out' depending on quantity.",
        description: 'Conditional',
        fields: [
            { key: 'cond', label: 'Show the first block when…', kind: 'condition' },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const prefix = `{% if ${cond} %}\n  `;
            return {
                text: `${prefix}\n{% else %}\n  \n{% endif %}`,
                caretOffset: prefix.length,
            };
        },
    },
    {
        key: 'unless',
        label: 'Unless',
        tooltip: 'Show content only when a test does NOT pass.',
        example: "e.g. show a 'Complete your profile' note unless the profile is done.",
        description: 'Negated conditional',
        fields: [
            { key: 'cond', label: 'Hide this when…', kind: 'condition' },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const prefix = `{% unless ${cond} %}\n  `;
            return { text: `${prefix}\n{% endunless %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'for',
        label: 'For loop',
        tooltip: 'Repeat content once for every item in a list.',
        example: "e.g. show a row for each order in the customer's order history.",
        description: 'Iterate a list',
        fields: [
            { key: 'list', label: 'List to repeat over', kind: 'variable', placeholder: 'e.g. record.orders' },
            { key: 'item', label: 'Name each item', kind: 'text', default: 'item', hint: 'Refer to it inside as {{ item.field }}' },
        ],
        build: (v) => {
            const list = toBareExpr(asText(v, 'list')) || 'items';
            const item = asText(v, 'item', 'item');
            const prefix = `{% for ${item} in ${list} %}\n  `;
            return { text: `${prefix}\n{% endfor %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'case',
        label: 'Case / When',
        tooltip: 'Pick one of several blocks based on a value (a switch).',
        example: "e.g. show a different badge for plan = 'free', 'pro', or 'team'.",
        description: 'Switch',
        fields: [
            { key: 'subject', label: 'Value to check', kind: 'variable', placeholder: 'e.g. record.plan' },
            { key: 'whens', label: 'Cases to match', kind: 'list', default: '', hint: 'One block per value' },
        ],
        build: (v) => {
            const subject = toBareExpr(asText(v, 'subject')) || 'value';
            const whens = asList(v, 'whens');
            const branches = (whens.length ? whens : ['']).map(w => {
                const val = toOperandValue(w) || "''";
                return `{% when ${val} %}\n  `;
            });
            const head = `{% case ${subject} %}\n`;
            const body = branches.join('\n');
            return {
                text: `${head}${body}\n{% endcase %}`,
                // caret in the first when's body
                caretOffset: (head + `{% when ${toOperandValue(whens[0] || '') || "''"} %}\n  `).length,
            };
        },
    },
    {
        key: 'assign',
        label: 'Assign',
        tooltip: 'Save a value into a name you can reuse later on the page.',
        example: "e.g. assign fullName = record.first | append: record.last.",
        description: 'Set a variable',
        fields: [
            { key: 'name', label: 'Name', kind: 'text', placeholder: 'e.g. fullName' },
            { key: 'value', label: 'Value', kind: 'variable', placeholder: 'e.g. record.title' },
        ],
        build: (v) => {
            const name = asText(v, 'name', 'myVar');
            const value = toOperandValue(asText(v, 'value')) || "''";
            const text = `{% assign ${name} = ${value} %}`;
            return { text, caretOffset: text.length };
        },
    },
];

/** Whether a snippet's required fields are filled enough to insert. */
export function isSnippetValid(snippet: LogicSnippet, values: SnippetValues): boolean {
    return snippet.fields.every(f => {
        if (f.optional) return true;
        const raw = values[f.key];
        if (f.kind === 'condition') {
            const c = (raw as ConditionValue) || { lhs: '', op: '', rhs: '' };
            return !!c.lhs?.trim();
        }
        if (f.kind === 'list') {
            return Array.isArray(raw) && raw.some(x => x && x.trim());
        }
        // text / variable — allow a default to satisfy required
        const s = typeof raw === 'string' ? raw : '';
        return !!(s.trim() || f.default?.trim());
    });
}

/** Initial wizard values for a snippet (seeds defaults). */
export function initialSnippetValues(snippet: LogicSnippet): SnippetValues {
    const values: SnippetValues = {};
    for (const f of snippet.fields) {
        if (f.kind === 'condition') values[f.key] = { lhs: '', op: '==', rhs: '' };
        else if (f.kind === 'list') values[f.key] = [''];
        else values[f.key] = f.default ?? '';
    }
    return values;
}
