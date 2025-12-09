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
  LinkRenderer
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
  const { currentViewport } = useBuilderStore();
  const { createEditableText } = useComponentTextEditor(id);

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

  // Generate styles from the styles object
  const { classes: generatedClasses, inlineStyles } = generateStyles(
    styles,
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

    console.log('[ComponentRenderer] Updating column override:', {
      columnName,
      updates,
      currentOverrides: currentOverrides[columnName],
      newOverride: { ...currentOverrides[columnName], ...updates }
    });

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
      props: {
        ...props,
        binding: {
          ...binding,
          columnOverrides: newOverrides
        }
      }
    });
  }, [id, binding, props]);

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

    // Form
    case 'Input': return <InputRenderer {...rendererProps} />;
    case 'Textarea': return <TextareaRenderer {...rendererProps} />;
    case 'Select': return <SelectRenderer {...rendererProps} />;
    case 'Checkbox': return <CheckboxRenderer {...rendererProps} />;
    case 'Switch': return <SwitchRenderer {...rendererProps} />;

    // Layout
    case 'Container': return <ContainerRenderer {...rendererProps} />;
    case 'Tabs': return <TabsRenderer {...rendererProps} />;
    case 'Accordion': return <AccordionRenderer {...rendererProps} />;
    case 'Breadcrumb': return <BreadcrumbRenderer {...rendererProps} />;

    // Data
    case 'DataTable': return <DataTableRenderer {...rendererProps} />;
    case 'KPICard': return <KPICardRenderer {...rendererProps} />;
    case 'Chart': return <ChartRenderer {...rendererProps} />;
    case 'Grid': return <GridRenderer {...rendererProps} />;

    default:
      return (
        <div className="p-4 border border-dashed border-muted-foreground rounded-lg text-center text-muted-foreground">
          Unknown component: {type}
        </div>
      );
  }
};