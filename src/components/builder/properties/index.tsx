import React from 'react';
import { ContainerProperties } from './ContainerProperties';
import { TypographyProperties } from './TypographyProperties';
import { FormProperties } from './FormProperties';
import { ActionProperties } from './ActionProperties';
import { MediaProperties } from './MediaProperties';
import { DisplayProperties } from './DisplayProperties';

export interface PropertyComponentProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

/**
 * Registry mapping component types to their property panel components
 */
export const getPropertyComponent = (
    type: string,
    props: Record<string, any>,
    updateComponentProp: (key: string, value: any) => void,
    onDataBindingClick: () => void,
    hasBinding: boolean
): React.ReactNode => {
    const componentProps = {
        type,
        props,
        updateComponentProp,
        onDataBindingClick,
        hasBinding
    };

    switch (type) {
        case 'Container':
            return <ContainerProperties props={props} updateComponentProp={updateComponentProp} />;

        case 'Heading':
        case 'Text':
        case 'Link':
            return <TypographyProperties {...componentProps} />;

        case 'Button':
            return <ActionProperties {...componentProps} />;

        case 'Input':
        case 'Textarea':
        case 'Select':
        case 'Checkbox':
        case 'Switch':
            return <FormProperties {...componentProps} />;

        case 'Image':
        case 'Avatar':
            return <MediaProperties {...componentProps} />;

        case 'Alert':
        case 'Badge':
        case 'Progress':
        case 'Chart':
        case 'Grid':
            return <DisplayProperties {...componentProps} />;

        case 'DataTable':
            // DataTable uses its own dedicated component (imported in PropertiesPanel)
            return null;

        default:
            return (
                <p className="text-muted-foreground text-sm">
                    No properties available for {type} component.
                </p>
            );
    }
};
