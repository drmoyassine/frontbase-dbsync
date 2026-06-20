import { describe, it, expect } from 'vitest';
import {
    LAYOUT_COMPONENT_TYPES,
    hasLayoutTokens,
    layoutTokensToStyle,
    type LayoutTokens,
} from './layoutTokens';

describe('LAYOUT_COMPONENT_TYPES', () => {
    it('excludes the layout-owning components that must not be double-wrapped', () => {
        // These establish their own flex/grid layout context.
        expect(LAYOUT_COMPONENT_TYPES.has('Container')).toBe(true);
        expect(LAYOUT_COMPONENT_TYPES.has('Row')).toBe(true);
        expect(LAYOUT_COMPONENT_TYPES.has('Column')).toBe(true);
        expect(LAYOUT_COMPONENT_TYPES.has('Card')).toBe(true);
        expect(LAYOUT_COMPONENT_TYPES.has('Repeater')).toBe(true);
    });

    it('does NOT exclude ordinary content components', () => {
        expect(LAYOUT_COMPONENT_TYPES.has('Heading')).toBe(false);
        expect(LAYOUT_COMPONENT_TYPES.has('Text')).toBe(false);
        expect(LAYOUT_COMPONENT_TYPES.has('Button')).toBe(false);
        expect(LAYOUT_COMPONENT_TYPES.has('DataTable')).toBe(false);
    });
});

describe('hasLayoutTokens', () => {
    it('returns false for null/undefined/empty', () => {
        expect(hasLayoutTokens(null)).toBe(false);
        expect(hasLayoutTokens(undefined)).toBe(false);
        expect(hasLayoutTokens({})).toBe(false);
    });

    it('returns true when any spatial token is set', () => {
        expect(hasLayoutTokens({ margin: '8px' })).toBe(true);
        expect(hasLayoutTokens({ width: '100%' })).toBe(true);
        expect(hasLayoutTokens({ align: 'center' })).toBe(true);
        expect(hasLayoutTokens({ alignSelf: 'stretch' })).toBe(true);
    });
});

describe('layoutTokensToStyle', () => {
    it('returns an empty object (no box) when there are no tokens', () => {
        // Empty → the LayoutShell renders display: contents (zero layout effect).
        expect(layoutTokensToStyle(null)).toEqual({});
        expect(layoutTokensToStyle({})).toEqual({});
    });

    it('maps scalar spacing/sizing tokens directly', () => {
        const style = layoutTokensToStyle({
            margin: '10px',
            padding: '4px 8px',
            width: '50%',
            maxWidth: 600,
        });
        expect(style.margin).toBe('10px');
        expect(style.padding).toBe('4px 8px');
        expect(style.width).toBe('50%');
        expect(style.maxWidth).toBe(600);
    });

    it('expands per-side margin/padding objects to CSS shorthand (px for numbers)', () => {
        const style = layoutTokensToStyle({
            margin: { top: 8, right: 4, bottom: 8, left: 4 },
        });
        expect(style.margin).toBe('8px 4px 8px 4px');
    });

    it('renders alignment as a column flex container', () => {
        const style = layoutTokensToStyle({ align: 'center' });
        expect(style.display).toBe('flex');
        expect(style.flexDirection).toBe('column');
        expect(style.alignItems).toBe('center');
    });

    it('maps align "start"/"end" to flex-start/flex-end', () => {
        expect(layoutTokensToStyle({ align: 'start' }).alignItems).toBe('flex-start');
        expect(layoutTokensToStyle({ align: 'end' }).alignItems).toBe('flex-end');
    });

    it('passes alignSelf through', () => {
        const tokens: LayoutTokens = { alignSelf: 'flex-end' };
        expect(layoutTokensToStyle(tokens).alignSelf).toBe('flex-end');
    });
});
