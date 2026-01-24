import React from 'react';
import { generateStyles } from '@/lib/styleUtils';
import { ComponentStyles, ResponsiveStyles } from '@/types/styles';
import { cn } from '@/lib/utils';
import { useBuilderStore } from '@/stores/builder';
import { useSimpleData } from '@/hooks/useSimpleData';
import { ComponentDataBinding } from '@/lib/data-sources/types';
import { useComponentTextEditor } from './hooks/useComponentTextEditor';

// Import Renderers
import {
  ButtonRenderer,
  TextRenderer,
  HeadingRenderer,
  CardRenderer,
  BadgeRenderer,
  ImageRenderer,
  AlertRenderer,
  SeparatorRenderer,
  AvatarRenderer,
  ProgressRenderer,
  LinkRenderer,
  IconRenderer
} from './renderers/BasicRenderers';

import {
  InputRenderer,
  TextareaRenderer,
  SelectRenderer,
  CheckboxRenderer,
  SwitchRenderer
} from './renderers/FormRenderers';

import {
  ContainerRenderer,
  RowRenderer,
  ColumnRenderer,
  TabsRenderer,
  AccordionRenderer,
  BreadcrumbRenderer
} from './renderers/LayoutRenderers';

import {
  DataTableRenderer,
  KPICardRenderer,
  ChartRenderer,
  GridRenderer
} from './renderers/DataRenderers';

// JSON Forms Smart Blocks
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

  // Convert stylesData to CSS styles (new system)
  const stylesDataStyles = React.useMemo(() => {
    const stylesData = (component as any).stylesData;
    if (!stylesData?.values) return {};

    const cssStyles: Record<string, any> = {};
    const values = stylesData.values;

    // Map property values to CSS
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'padding' && typeof value === 'object') {
        cssStyles.paddingTop = `${(value as any).top}px`;
        cssStyles.paddingRight = `${(value as any).right}px`;
        cssStyles.paddingBottom = `${(value as any).bottom}px`;
        cssStyles.paddingLeft = `${(value as any).left}px`;
      } else if (key === 'margin' && typeof value === 'object') {
        cssStyles.marginTop = `${(value as any).top}px`;
        cssStyles.marginRight = `${(value as any).right}px`;
        cssStyles.marginBottom = `${(value as any).bottom}px`;
        cssStyles.marginLeft = `${(value as any).left}px`;
      } else if (key === 'size' && typeof value === 'object') {
        const sizeVal = value as any;
        if (sizeVal.width !== 'auto' && sizeVal.width !== undefined) {
          const widthUnit = sizeVal.widthUnit || 'px';
          cssStyles.width = `${sizeVal.width}${widthUnit}`;
        }
        if (sizeVal.height !== 'auto' && sizeVal.height !== undefined) {
          const heightUnit = sizeVal.heightUnit || 'px';
          cssStyles.height = `${sizeVal.height}${heightUnit}`;
        }
      } else if ((key === 'minWidth' || key === 'maxWidth' || key === 'minHeight' || key === 'maxHeight') && typeof value === 'object') {
        // Handle dimension format: { value, unit }
        const dimVal = value as { value: number | 'auto' | 'none'; unit: string };
        if (dimVal.value !== 'auto' && dimVal.value !== 'none' && dimVal.value !== undefined) {
          cssStyles[key] = `${dimVal.value}${dimVal.unit || 'px'}`;
        } else if (dimVal.value === 'none') {
          cssStyles[key] = 'none';
        }
      } else if (key === 'gap' && typeof value === 'number') {
        cssStyles.gap = `${value}px`;
      } else if (key === 'fontSize' && typeof value === 'number') {
        cssStyles.fontSize = `${value}px`;
      } else if (key === 'borderRadius' && typeof value === 'number') {
        cssStyles.borderRadius = `${value}px`;
      } else if (key === 'opacity' && typeof value === 'number') {
        cssStyles.opacity = value / 100;
      } else if (key === 'horizontalAlign' && typeof value === 'string') {
        // Handle horizontal alignment via auto margins
        // Also set display: block and width: fit-content to match SSR behavior
        // This is needed because margin auto doesn't work on inline-flex elements
        cssStyles.display = 'block';
        cssStyles.width = 'fit-content';
        if (value === 'center') {
          cssStyles.marginLeft = 'auto';
          cssStyles.marginRight = 'auto';
        } else if (value === 'right') {
          cssStyles.marginLeft = 'auto';
          cssStyles.marginRight = '0';
        } else {
          cssStyles.marginLeft = '0';
          cssStyles.marginRight = 'auto';
        }
      } else if (typeof value === 'string') {
        // Direct CSS property (flexDirection, backgroundColor, etc.)
        cssStyles[key] = value;
      }
    });

    return cssStyles;
  }, [(component as any).stylesData]);

  // Process legacy styles object - handle both flat format and NEW StylesData format
  const processedLegacyStyles = React.useMemo(() => {
    if (!styles || typeof styles !== 'object') return {};

    const cssStyles: Record<string, any> = {};

    // Check for NEW StylesData format: { activeProperties: [...], values: {...} }
    if ('values' in styles && typeof (styles as any).values === 'object') {
      const values = (styles as any).values;
      Object.entries(values).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        // Handle horizontalAlign - convert to margin auto like SSR does
        if (key === 'horizontalAlign' && typeof value === 'string') {
          if (value === 'center') {
            cssStyles.marginLeft = 'auto';
            cssStyles.marginRight = 'auto';
          } else if (value === 'right') {
            cssStyles.marginLeft = 'auto';
            cssStyles.marginRight = '0';
          } else {
            cssStyles.marginLeft = '0';
            cssStyles.marginRight = 'auto';
          }
        } else if (key === 'padding' && typeof value === 'object') {
          cssStyles.paddingTop = `${(value as any).top}px`;
          cssStyles.paddingRight = `${(value as any).right}px`;
          cssStyles.paddingBottom = `${(value as any).bottom}px`;
          cssStyles.paddingLeft = `${(value as any).left}px`;
        } else if (key === 'margin' && typeof value === 'object') {
          cssStyles.marginTop = `${(value as any).top}px`;
          cssStyles.marginRight = `${(value as any).right}px`;
          cssStyles.marginBottom = `${(value as any).bottom}px`;
          cssStyles.marginLeft = `${(value as any).left}px`;
        } else if (key === 'size' && typeof value === 'object') {
          const sizeVal = value as any;
          if (sizeVal.width !== 'auto' && sizeVal.width !== undefined) {
            const widthUnit = sizeVal.widthUnit || 'px';
            cssStyles.width = `${sizeVal.width}${widthUnit}`;
          }
          if (sizeVal.height !== 'auto' && sizeVal.height !== undefined) {
            const heightUnit = sizeVal.heightUnit || 'px';
            cssStyles.height = `${sizeVal.height}${heightUnit}`;
          }
        } else if (typeof value === 'string' || typeof value === 'number') {
          cssStyles[key] = value;
        }
      });
    } else {
      // Legacy flat format - process horizontalAlign and other special properties
      Object.entries(styles).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        // Handle horizontalAlign - convert to margin auto like SSR does
        // Also set display: block and width: fit-content to match SSR behavior
        if (key === 'horizontalAlign' && typeof value === 'string') {
          cssStyles.display = 'block';
          cssStyles.width = 'fit-content';
          if (value === 'center') {
            cssStyles.marginLeft = 'auto';
            cssStyles.marginRight = 'auto';
          } else if (value === 'right') {
            cssStyles.marginLeft = 'auto';
            cssStyles.marginRight = '0';
          } else {
            cssStyles.marginLeft = '0';
            cssStyles.marginRight = 'auto';
          }
        } else {
          // Pass through other properties
          cssStyles[key] = value;
        }
      });
    }

    return cssStyles;
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
    inlineStyles,
    createEditableText,
    children,
    componentId: id,
    onConfigureBinding: effectiveProps.onConfigureBinding,
    onColumnOverrideChange: type === 'DataTable' ? handleColumnOverrideChange : undefined,
    styles // Passed for ContainerRenderer
  };

  // Render different component types
  switch (type) {
    // Basic
    case 'Button': return <ButtonRenderer {...rendererProps} />;
    case 'Text': return <TextRenderer {...rendererProps} />;
    case 'Heading': return <HeadingRenderer {...rendererProps} />;
    case 'Card': return <CardRenderer {...rendererProps} />;
    case 'Badge': return <BadgeRenderer {...rendererProps} />;
    case 'Image': return <ImageRenderer {...rendererProps} />;
    case 'Alert': return <AlertRenderer {...rendererProps} />;
    case 'Separator': return <SeparatorRenderer {...rendererProps} />;
    case 'Avatar': return <AvatarRenderer {...rendererProps} />;
    case 'Progress': return <ProgressRenderer {...rendererProps} />;
    case 'Link': return <LinkRenderer {...rendererProps} />;
    case 'Icon': return <IconRenderer {...rendererProps} />;

    // Form
    case 'Input': return <InputRenderer {...rendererProps} />;
    case 'Textarea': return <TextareaRenderer {...rendererProps} />;
    case 'Select': return <SelectRenderer {...rendererProps} />;
    case 'Checkbox': return <CheckboxRenderer {...rendererProps} />;
    case 'Switch': return <SwitchRenderer {...rendererProps} />;

    // Layout
    case 'Container': return <ContainerRenderer {...rendererProps} />;
    case 'Row': return <RowRenderer {...rendererProps} />;
    case 'Column': return <ColumnRenderer {...rendererProps} />;
    case 'Tabs': return <TabsRenderer {...rendererProps} />;
    case 'Accordion': return <AccordionRenderer {...rendererProps} />;
    case 'Breadcrumb': return <BreadcrumbRenderer {...rendererProps} />;

    // Data
    case 'DataTable': return <DataTableRenderer {...rendererProps} />;
    case 'KPICard': return <KPICardRenderer {...rendererProps} />;
    case 'Chart': return <ChartRenderer {...rendererProps} />;
    case 'Grid': return <GridRenderer {...rendererProps} />;

    // JSON Forms Smart Blocks
    case 'Form':
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
    case 'InfoList':
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

    default:
      return (
        <div className="p-4 border border-dashed border-muted-foreground rounded-lg text-center text-muted-foreground">
          Unknown component: {type}
        </div>
      );
  }
};