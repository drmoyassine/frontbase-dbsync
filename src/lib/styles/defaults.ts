import type { StylesData } from '@/types/builder';

/**
 * Get default styles for new pages
 */
export const getDefaultPageStyles = (): StylesData => {
    return {
        activeProperties: [
            'flexDirection',
            'gap',
            'flexWrap',
            'alignItems',
            'justifyContent',
            'backgroundColor',
            'padding'
        ],
        values: {
            flexDirection: 'row',
            gap: 30,
            flexWrap: 'nowrap',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            backgroundColor: '#FFFFFF',
            padding: {
                top: 50,
                right: 50,
                bottom: 50,
                left: 50
            }
        },
        stylingMode: 'visual'
    };
};
