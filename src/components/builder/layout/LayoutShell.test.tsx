import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutShell } from './LayoutShell';

describe('LayoutShell', () => {
    it('renders its children', () => {
        render(
            <LayoutShell>
                <span>Hello</span>
            </LayoutShell>
        );
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('is layout-transparent (display: contents) when there are no tokens', () => {
        // This is the key safety property: an empty shell must generate no box,
        // so wrapping every non-layout component has zero effect on layout.
        const { container } = render(<LayoutShell><span>x</span></LayoutShell>);
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.className).toBe('fb-layout-shell');
        expect(shell.style.display).toBe('contents');
    });

    it('does NOT carry the fb-<id> hook (avoids duplicating the raw-CSS scope target)', () => {
        const { container } = render(<LayoutShell><span>x</span></LayoutShell>);
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.className).toBe('fb-layout-shell'); // no fb-<id>
    });

    it('applies spatial tokens as a real box when present', () => {
        const { container } = render(
            <LayoutShell layout={{ margin: '8px', width: '50%' }}>
                <span>x</span>
            </LayoutShell>
        );
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.style.display).not.toBe('contents');
        expect(shell.style.margin).toBe('8px');
        expect(shell.style.width).toBe('50%');
    });

    it('renders alignment as a column flex box', () => {
        const { container } = render(
            <LayoutShell layout={{ align: 'center' }}>
                <span>x</span>
            </LayoutShell>
        );
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.style.display).toBe('flex');
        expect(shell.style.flexDirection).toBe('column');
        expect(shell.style.alignItems).toBe('center');
    });
});
