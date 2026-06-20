/**
 * Form Smart Block - Builder Wrapper
 * 
 * Thin wrapper around the pure @frontbase/form component.
 * Injects the Builder-specific FieldSettingsPopover so users can configure
 * each field individually without polluting the pure presentation logic.
 * 
 * Mirrors the InfoList IoC wrapper pattern.
 */

import React, { useState, useEffect } from 'react';
import { Form as PureForm, type FormBinding } from '@frontbase/form';
import { FieldSettingsPopover } from '@/components/builder/form/FieldSettingsPopover';
import { InlineTextEditor } from '@/components/builder/InlineTextEditor';
import { useDataBindingStore } from '@/stores/data-binding-simple';

/**
 * Inline-editable field label for the Builder. Click to edit the label text
 * in place (Tiptap); commits to `override.label` via onFieldOverrideChange.
 * Falls back to the default label when not editing.
 */
const InlineLabel: React.FC<{
    fieldName: string;
    labelText: string;
    isRequired: boolean;
    onCommit: (value: string) => void;
}> = ({ fieldName, labelText, isRequired, onCommit }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(labelText);

    useEffect(() => {
        if (!editing) setDraft(labelText);
    }, [labelText, editing]);

    if (editing) {
        return (
            <span className="inline-block" style={{ position: 'relative' }}>
                <InlineTextEditor
                    value={draft}
                    onChange={setDraft}
                    onSave={() => { onCommit(draft); setEditing(false); }}
                    onCancel={() => { setDraft(labelText); setEditing(false); }}
                    className="text-sm font-medium leading-none"
                />
                {isRequired && <span className="text-red-500 ml-0.5">*</span>}
            </span>
        );
    }

    return (
        <label
            htmlFor={`field-${fieldName}`}
            className="text-sm font-medium leading-none cursor-text hover:bg-accent/20 rounded-sm px-0.5"
            onClick={(e) => { e.preventDefault(); setDraft(labelText); setEditing(true); }}
        >
            {labelText}
            {isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
    );
};

export interface FormProps {
    componentId?: string;
    dataSourceId?: string;
    tableName?: string;
    recordId?: string;
    title?: string;
    excludeColumns?: string[];
    readOnlyColumns?: string[];
    showCard?: boolean;
    className?: string;
    style?: React.CSSProperties;
    fieldOverrides?: Record<string, any>;
    fieldOrder?: string[];
    isBuilderMode?: boolean;
    onFieldOverrideChange?: (fieldName: string, updates: any) => void;
    onSubmit?: (data: Record<string, any>) => void;
    onCancel?: () => void;
    // Binding is optionally passed down
    binding?: FormBinding;
}

export const Form: React.FC<FormProps> = ({
    componentId,
    dataSourceId,
    tableName,
    recordId,
    title,
    excludeColumns = [],
    readOnlyColumns = [],
    showCard = true,
    className,
    style,
    fieldOverrides = {},
    fieldOrder = [],
    isBuilderMode = false,
    onFieldOverrideChange,
    onSubmit,
    onCancel,
    binding: propBinding
}) => {
    // Get binding from store as fallback
    const { getComponentBinding } = useDataBindingStore();
    const binding: any = propBinding || getComponentBinding(componentId || 'form') || {};

    // Reconstruct the unified binding object for the pure component
    const unifiedBinding: FormBinding = {
        ...binding,
        dataSourceId: dataSourceId || binding.dataSourceId || binding.datasourceId,
        tableName: tableName || binding.tableName,
        recordId: recordId || binding.recordId,
        fieldOverrides: Object.keys(fieldOverrides).length > 0 ? fieldOverrides : binding.fieldOverrides,
        fieldOrder: fieldOrder.length > 0 ? fieldOrder : binding.fieldOrder,
        excludeColumns: excludeColumns.length > 0 ? excludeColumns : binding.excludeColumns,
    };

    return (
        <PureForm
            mode={isBuilderMode ? 'builder' : 'edge'}
            binding={unifiedBinding}
            title={title}
            showCard={showCard}
            className={className}
            style={style}
            excludeColumns={excludeColumns}
            readOnlyColumns={readOnlyColumns}
            onSubmit={onSubmit}
            onCancel={onCancel}
            // IoC Integration: Wrap each individual field with the Settings Popover
            fieldWrapper={
                isBuilderMode && onFieldOverrideChange
                ? (fieldName, children) => (
                    <FieldSettingsPopover
                        key={fieldName}
                        fieldName={fieldName}
                        settings={unifiedBinding.fieldOverrides?.[fieldName] || {}}
                        onSave={(updates) => onFieldOverrideChange(fieldName, updates)}
                        componentType="Form"
                        isBuilderMode={true}
                    >
                        {children}
                    </FieldSettingsPopover>
                )
                : undefined
            }
            // Inline-editable labels in the Builder (Tiptap). Falls back to the
            // default <label> in edge/non-builder mode.
            labelRenderer={
                isBuilderMode && onFieldOverrideChange
                    ? (fieldName, labelText, isRequired) => (
                        <InlineLabel
                            key={fieldName}
                            fieldName={fieldName}
                            labelText={labelText}
                            isRequired={isRequired}
                            onCommit={(value) => onFieldOverrideChange(fieldName, { label: value })}
                        />
                    )
                    : undefined
            }
        />
    );
};

export default Form;
