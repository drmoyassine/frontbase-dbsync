import React from 'react';
import { generateStyles } from '@/lib/styleUtils';
import { ComponentStyles, ResponsiveStyles } from '@/types/styles';
import { cn } from '@/lib/utils';
import { useBuilderStore } from '@/stores/builder';
import { useSimpleData } from '@/hooks/useSimpleData';
import { useComponentTextEditor } from './hooks/useComponentTextEditor';

// Import style processing utilities
import { processStylesData, processLegacyStyles } from './styling/styleProcessor';
import { isHiddenForViewport, getHiddenComponentStyles } from './styling/visibilityHelper';
import { getRenderer } from './registry/componentRegistry';

// JSON Forms Smart Blocks (not in registry - special handling needed)
import { Form } from '@/components/jsonforms/Form';
import { InfoList } from '@/components/jsonforms/InfoList';

interface ComponentRendererProps {
  component: {
    id?: string;
    type: string;
    props: Record<string, any>;
    styles?: ComponentStyles;
    responsiveStyles?: ResponsiveStyles;
    className?: string;
    children?: any[];
  };
  isSelected?: boolean;
  children?: React.ReactNode;
  onComponentClick?: (componentId: string, event: React.MouseEvent) => void;
  onDoubleClick?: (componentId: string, event: React.MouseEvent) => void;
}

export const ComponentRenderer: React.FC<ComponentRendererProps> = ({
  component,
  isSelected,
  children,
  onComponentClick,
  onDoubleClick
}) => {
  const { id, type, props, styles = {}, className = '' } = component;
  const { currentViewport, setFocusedField } = useBuilderStore();
  const { createEditableText } = useComponentTextEditor(id);

  // Check visibility for current viewport using extracted helper
  const visibility = (component as any).visibility;
  const componentIsHidden = isHiddenForViewport(visibility, currentViewport);
  const hiddenStyles = componentIsHidden ? getHiddenComponentStyles() : {};

  // Process stylesData (new visual styling panel format)
  const stylesDataStyles = React.useMemo(() => {
    return processStylesData((component as any).stylesData, currentViewport);
  }, [(component as any).stylesData, currentViewport]);

  // Process legacy styles object
  const processedLegacyStyles = React.useMemo(() => {
    return processLegacyStyles(styles);
  }, [styles]);

  // Merge legacy styles with new stylesData styles  
  const mergedStyles = { ...processedLegacyStyles, ...stylesDataStyles };

  // Data Binding Logic
  const binding = props.binding as ComponentDataBinding | undefined;

  // DEBUG: Check if binding is in props
  if (type === 'DataTable') {
    console.log('[ComponentRenderer] DataTable render:', {
      componentId: id,
      hasBinding: !!props.binding,
      binding: props.binding,
      tableName: binding?.tableName
    });
  }

  // For DataTable, we don't need fieldMapping (it shows all columns)
  // For other components, we need fieldMapping to know which props to bind
  const shouldAutoFetch = type === 'DataTable'
    ? false // DataTable handles its own fetching internally
    : !!binding?.tableName && !!binding?.fieldMapping;

  // Transform binding to include componentId for useSimpleData
  const simpleDataBinding = binding ? {
    componentId: id || '',
    dataSourceId: binding.dataSourceId || '',
    tableName: binding.tableName || '',
    refreshInterval: binding.refreshInterval,
    pagination: {
      enabled: binding.pagination?.enabled ?? false,
      pageSize: binding.pagination?.pageSize ?? 20,
      page: binding.pagination?.page ?? 0,
    },
    sorting: {
      enabled: binding.sorting?.enabled ?? false,
      column: binding.sorting?.column,
      direction: binding.sorting?.direction,
    },
    filtering: {
      searchEnabled: binding.filtering?.searchEnabled ?? false,
      filters: binding.filtering?.filters ?? {},
    },
    columnOverrides: binding.columnOverrides ?? {},
    columnOrder: binding.columnOrder,
  } : null;

  const { data: boundData } = useSimpleData({
    componentId: id || '',
    binding: simpleDataBinding,
    autoFetch: shouldAutoFetch
  });

  // Calculate effective props with data binding
  const effectiveProps = React.useMemo(() => {
    if (!binding?.fieldMapping || !boundData || boundData.length === 0) {
      return props;
    }

    const record = boundData[0];
    const newProps = { ...props };

    Object.entries(binding.fieldMapping).forEach(([propName, fieldName]) => {
      if (record[fieldName] !== undefined) {
        newProps[propName] = record[fieldName];
      }
    });

    return newProps;
  }, [props, binding, boundData]);

  // Generate styles from the merged styles object
  const { classes: generatedClasses, inlineStyles } = generateStyles(
    mergedStyles,
    component.responsiveStyles,
    currentViewport
  );
  const combinedClassName = cn(
    generatedClasses,
    className
  );

  // Handler for column configuration changes from the table
  const handleColumnOverrideChange = React.useCallback((columnName: string, updates: any) => {
    if (!id || !binding) return;

    const currentOverrides = binding.columnOverrides || {};

    const newOverrides = {
      ...currentOverrides,
      [columnName]: {
        ...currentOverrides[columnName],
        ...updates
      }
    };

    // Update the component props in the builder store
    const store = useBuilderStore.getState();
    store.updateComponent(id, {
      binding: {
        ...binding,
        columnOverrides: newOverrides
      }
    });
  }, [id, binding]);

  const rendererProps = {
    effectiveProps,
    combinedClassName,
    inlineStyles: { ...inlineStyles, ...hiddenStyles },
    createEditableText,
    children,
    componentId: id,
    onColumnOverrideChange: type === 'DataTable' ? handleColumnOverrideChange : undefined,
    styles // Passed for ContainerRenderer
  };

  // Try to get renderer from registry first
  const Renderer = getRenderer(type);

  if (Renderer) {
    return <Renderer {...rendererProps} />;
  }

  // Special case: JSON Forms Smart Blocks (not in registry - need special handling)
  if (type === 'Form') {
    return (
      <Form
        dataSourceId={effectiveProps.dataSourceId}
        tableName={effectiveProps.tableName}
        recordId={effectiveProps.recordId}
        title={effectiveProps.title}
        excludeColumns={effectiveProps.excludeColumns}
        readOnlyColumns={effectiveProps.readOnlyColumns}
        showCard={effectiveProps.showCard ?? true}
        className={combinedClassName}
        style={inlineStyles}
        fieldOverrides={effectiveProps.fieldOverrides}
        fieldOrder={effectiveProps.fieldOrder}
        isBuilderMode={true}
        onFieldOverrideChange={(fieldName: string, updates: any) => {
          if (id) {
            const store = useBuilderStore.getState();
            const currentOverrides = effectiveProps.fieldOverrides || {};
            store.updateComponent(id, {
              fieldOverrides: {
                ...currentOverrides,
                [fieldName]: {
                  ...currentOverrides[fieldName],
                  ...updates
                }
              }
            });
          }
        }}
      />
    );
  }

  if (type === 'InfoList') {
    return (
      <InfoList
        dataSourceId={effectiveProps.dataSourceId}
        tableName={effectiveProps.tableName}
        recordId={effectiveProps.recordId}
        title={effectiveProps.title}
        excludeColumns={effectiveProps.excludeColumns}
        showCard={effectiveProps.showCard ?? true}
        className={combinedClassName}
        style={inlineStyles}
        fieldOverrides={effectiveProps.fieldOverrides}
        layout={effectiveProps.layout || '2'}
        fieldSpacing={effectiveProps.fieldSpacing || 'normal'}
        isBuilderMode={true}
        onFieldOverrideChange={(fieldName: string, updates: any) => {
          if (id) {
            const store = useBuilderStore.getState();
            const currentOverrides = effectiveProps.fieldOverrides || {};
            store.updateComponent(id, {
              fieldOverrides: {
                ...currentOverrides,
                [fieldName]: {
                  ...currentOverrides[fieldName],
                  ...updates
                }
              }
            });
          }
        }}
      />
    );
  }

  // Unknown component type
  return (
    <div className="p-4 border border-dashed border-muted-foreground rounded-lg text-center text-muted-foreground">
      Unknown component: {type}
    </div>
  );
};