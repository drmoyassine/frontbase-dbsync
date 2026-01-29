/**
 * Footer Template
 * Professional 4-column footer with brand info, links, and copyright
 * Extracted from Frontbase homepage - the superior design
 */

import { ComponentTemplate } from '../types';
import { createFooterColumn2 } from '../builders/sectionBuilders';

export const footerTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        padding: '48px',
        gap: '32px',
        backgroundColor: 'var(--background)',
        borderTop: '1px solid var(--border)'
    },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '48px' },
            children: [
                createFooterColumn2('Frontbase', ['Open Source', 'MIT License']),
                createFooterColumn2('Product', ['Features', 'Pricing', 'Changelog']),
                createFooterColumn2('Resources', ['Documentation', 'GitHub', 'Discord']),
                createFooterColumn2('Legal', ['Privacy Policy', 'Terms of Service'])
            ]
        },
        { type: 'Separator', props: {} },
        { type: 'Text', props: { text: '© 2025 Frontbase. Built with ❤️ for the edge.' }, styles: { textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' } }
    ]
});
