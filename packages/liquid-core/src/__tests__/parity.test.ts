import { describe, it, expect } from 'vitest';
import { createLiquidEngine } from '../engine';
import { renderSafe } from '../limits';

/**
 * Parity guarantee: SSR (services/edge) and the builder preview (useLiquidPreview)
 * both render through this exact `renderSafe` + shared-engine path. These
 * representative output templates (tags + filters + record context) assert the
 * single shared output both surfaces must agree on.
 */
const engine = createLiquidEngine();

async function render(template: string, ctx: Record<string, any>): Promise<string> {
    const r = await renderSafe(engine, template, ctx);
    if (!r.ok) throw new Error(r.error);
    return r.output ?? '';
}

describe('SSR/preview parity (shared core)', () => {
    it('renders a for-loop over record data', async () => {
        const out = await render('{% for n in record.nums %}{{ n }}{% endfor %}', {
            record: { nums: [1, 2, 3] },
        });
        expect(out).toBe('123');
    });

    it('renders if/else against record field', async () => {
        const on = await render("{% if record.active %}ON{% else %}OFF{% endif %}", {
            record: { active: true },
        });
        const off = await render("{% if record.active %}ON{% else %}OFF{% endif %}", {
            record: { active: false },
        });
        expect(on).toBe('ON');
        expect(off).toBe('OFF');
    });

    it('applies a Frontbase filter to a record token', async () => {
        const out = await render('{{ record.title | slugify }}', {
            record: { title: 'Hello World!' },
        });
        expect(out).toBe('hello-world');
    });

    it('mixes literals, tokens, filters and logic', async () => {
        const out = await render(
            'Hello {{ record.name }} — {% if record.pro %}Pro{% else %}Free{% endif %} ({{ record.cents | money }})',
            { record: { name: 'Ada', pro: true, cents: 5 } },
        );
        expect(out).toBe('Hello Ada — Pro ($5.00)');
    });
});
