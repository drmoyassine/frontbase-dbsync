import React from 'react';
import { generateStyles } from '@/lib/styleUtils';
import { ComponentStyles, ResponsiveStyles } from '@/types/styles';
import { cn } from '@/lib/utils';
import { useBuilderStore } from '@/stores/builder';
import { useSimpleData, ComponentDataBinding } from '@/hooks/useSimpleData';
import { useComponentTextEditor } from './hooks/useComponentTextEditor';
import { useRecord } from './context/RecordContext';
import { renderSync, isSimpleInterpolation } from '@frontbase/liquid-core';

// Import style processing utilities
import { processStylesData, processLegacyStyles } from './styling/styleProcessor';
import { isHiddenForViewport, getHiddenComponentStyles } from './styling/visibilityHelper';
import { getRenderer } from './registry/componentRegistry';
import { deepEqual } from '@/lib/equality';
import { LayoutShell } from './layout/LayoutShell';
import { LAYOUT_COMPONENT_TYPES, type LayoutTokens } from './layout/layoutTokens';

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

/**
 * Custom comparator for ComponentRenderer's React.memo.
 *
 * Compares only what affects the rendered output:
 *  - `component` identity and style/prop data (deep — these hold bound data,
 *    text content, styling-panel values, and viewport overrides)
 *  - `isSelected`, `children`, and the click/double-click callbacks by
 *    reference (callers should memoize the callbacks)
 *
 * Deep-comparing the component payload means a sibling re-rendered with a new
 * object reference (but identical content) is skipped — the main cause of
 * cascading drops when typing in inline editors.
 */
function areComponentRendererPropsEqual(
  prev: ComponentRendererProps,
  next: ComponentRendererProps
): boolean {
  const p = prev.component;
  const n = next.component;

  return (
    prev.isSelected === next.isSelected &&
    prev.children === next.children &&
    prev.onComponentClick === next.onComponentClick &&
    prev.onDoubleClick === next.onDoubleClick &&
    p.id === n.id &&
    p.type === n.type &&
    deepEqual(p.props, n.props) &&
    deepEqual(p.styles, n.styles) &&
    deepEqual((p as any).stylesData, (n as any).stylesData) &&
    deepEqual((p as any).layout, (n as any).layout) &&
    deepEqual(p.responsiveStyles, n.responsiveStyles)
  );
}

const ComponentRendererBase: React.FC<ComponentRendererProps> = ({
  component,
  isSelected,
  children,
  onComponentClick,
  onDoubleClick
}) => {
  const { id, type, props, styles = {}, className = '' } = component;
  const { currentViewport, setFocusedField } = useBuilderStore();
  const { createEditableText } = useComponentTextEditor(id);
  // The current Repeater row, when this component lives inside a Repeater template.
  const record = useRecord();

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
    let newProps = props;

    // 1) Single-record field mapping (KPICard-style own data binding).
    if (binding?.fieldMapping && boundData && boundData.length > 0) {
      const mappedRecord = boundData[0];
      newProps = { ...props };
      Object.entries(binding.fieldMapping).forEach(([propName, fieldName]) => {
        const field = fieldName as string;
        if (mappedRecord[field] !== undefined) {
          newProps[propName] = mappedRecord[field];
        }
      });
    }

    // 2) Repeater record-token pass. When this component is inside a Repeater,
    // resolve simple {{ record.* }} interpolation in string props against the
    // current row (synchronous fast path). Strings with {% %} logic are left
    // untouched here — Stage 7 (useLiquidPreview) renders those with the full
    // shared Liquid core.
    if (record) {
      let mutated = false;
      const resolved: Record<string, any> = {};
      for (const key of Object.keys(newProps)) {
        const v = newProps[key];
        if (
          typeof v === 'string' &&
          v.includes('{{') &&
          v.includes('record') &&
          isSimpleInterpolation(v)
        ) {
          resolved[key] = renderSync(v, { record });
          mutated = true;
        }
      }
      if (mutated) newProps = { ...newProps, ...resolved };
    }

    return newProps;
  }, [props, binding, boundData, record]);

  // Generate styles from the merged styles object
  const { classes: generatedClasses, inlineStyles } = generateStyles(
    mergedStyles as ComponentStyles,
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

  // Select the component in the properties panel from the canvas (used by
  // data components' "Configure Data" affordance).
  const handleConfigureBinding = React.useCallback(() => {
    if (id) useBuilderStore.getState().setSelectedComponentId(id);
  }, [id]);

  const rendererProps = {
    effectiveProps,
    combinedClassName,
    inlineStyles: { ...inlineStyles, ...hiddenStyles },
    createEditableText,
    children,
    componentId: id,
    onColumnOverrideChange: type === 'DataTable' ? handleColumnOverrideChange : undefined,
    onConfigureBinding: handleConfigureBinding,
    styles, // Passed for ContainerRenderer
    rawChildren: component.children, // Passed for RepeaterRenderer
  };

  // Try to get renderer from registry first
  const Renderer = getRenderer(type);

  // Spatial layout (margin/size/align) is applied by a LayoutShell wrapper,
  // SEPARATE from the component's aesthetic styles (which stay on the
  // component element via combinedClassName/inlineStyles). Components that own
  // their own layout (Container, Row, Column, …) are never wrapped, so an
  // intermediate box never overrides their flex/grid. With no layout tokens the
  // shell renders layout-transparent (display: contents) — zero effect.
  const layoutTokens = (component as any).layout as LayoutTokens | undefined;
  const shouldWrapLayout = !LAYOUT_COMPONENT_TYPES.has(type);

  if (Renderer) {
    const rendered = <Renderer {...rendererProps} />;
    return shouldWrapLayout
      ? <LayoutShell layout={layoutTokens}>{rendered}</LayoutShell>
      : rendered;
  }

  // Special case: JSON Forms Smart Blocks (not in registry - need special handling)
  if (type === 'Form') {
    return (
      <LayoutShell layout={layoutTokens}>
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
      </LayoutShell>
    );
  }

  if (type === 'InfoList') {
    return (
      <LayoutShell layout={layoutTokens}>
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
      </LayoutShell>
    );
  }

  // Unknown component type
  return (
    <div className="p-4 border border-dashed border-muted-foreground rounded-lg text-center text-muted-foreground">
      Unknown component: {type}
    </div>
  );
};

export const ComponentRenderer = React.memo(ComponentRendererBase, areComponentRendererPropsEqual);