/**
 * Navbar Template
 * Creates a Navbar component with default configuration
 */

import { ComponentTemplate } from '../types';

export const navbarTemplate = (): ComponentTemplate => ({
    type: 'Navbar',
    props: {
        logo: {
            type: 'text',
            text: 'YourBrand',
            link: '/'
        },
        menuItems: [
            { id: 'menu-1', label: 'Features', navType: 'scroll', target: '#features' },
            { id: 'menu-2', label: 'Pricing', navType: 'scroll', target: '#pricing' },
            { id: 'menu-3', label: 'About', navType: 'link', target: '/about' }
        ],
        primaryButton: {
            enabled: true,
            text: 'Get Started',
            navType: 'link',
            target: '/signup'
        },
        secondaryButton: {
            enabled: false,
            text: 'Learn More',
            navType: 'scroll',
            target: '#features'
        }
    },
    styles: {
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--background)'
    }
});
