/**
 * Vertical Layout Renderer - Renders form fields in a vertical stack.
 */

import React from 'react';
import { LayoutProps, RankedTester, rankWith, uiTypeIs } from '@jsonforms/core';
import { withJsonFormsLayoutProps, JsonFormsDispatch } from '@jsonforms/react';

interface VerticalLayoutProps extends LayoutProps { }

const VerticalLayoutComponent: React.FC<VerticalLayoutProps> = ({
    uischema,
    schema,
    path,
    enabled,
    renderers,
    cells,
}) => {
    const elements = (uischema as any).elements || [];

    return (
        <div className="space-y-4">
            {elements.map((element: any, index: number) => (
                <JsonFormsDispatch
                    key={`${path}-${index}`}
                    uischema={element}
                    schema={schema}
                    path={path}
                    enabled={enabled}
                    renderers={renderers}
                    cells={cells}
                />
            ))}
        </div>
    );
};

export const VerticalLayoutRenderer = withJsonFormsLayoutProps(VerticalLayoutComponent);

// Tester: match VerticalLayout type
export const verticalLayoutTester: RankedTester = rankWith(1, uiTypeIs('VerticalLayout'));
