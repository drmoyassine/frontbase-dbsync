import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Progress } from '@/components/ui/progress';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { generateStyles } from '@/lib/styleUtils';
import { ComponentStyles, ResponsiveStyles } from '@/types/styles';
import { cn } from '@/lib/utils';
import { InlineTextEditor } from './InlineTextEditor';
import { useBuilderStore } from '@/stores/builder';
import { UniversalDataTable } from '@/components/data-binding/UniversalDataTable';
import { KPICard } from '@/components/data-binding/KPICard';
import { Chart } from '@/components/data-binding/Chart';
import { Grid } from '@/components/data-binding/Grid';
import { useSimpleData } from '@/hooks/useSimpleData';
import { ComponentDataBinding } from '@/lib/data-sources/types';

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
  const { editingComponentId, setEditingComponentId, updateComponentText, isPreviewMode, currentViewport } = useBuilderStore();

  // Data Binding Logic
  const binding = props.binding as ComponentDataBinding | undefined;
  const { data: boundData } = useSimpleData({
    componentId: id || '',
    binding: binding,
    autoFetch: !!binding?.tableName && !!binding?.fieldMapping
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

  // Helper function to handle text editing
  const handleTextEdit = (textProperty: string, text: string) => {
    if (id) {
      updateComponentText(id, textProperty, text);
    }
  };

  const handleTextEditEnd = () => {
    setEditingComponentId(null);
  };

  // Check if this component is being edited
  const isEditing = editingComponentId === id;

  // Helper to create editable text with hover effects
  const createEditableText = (text: string, textProperty: string, className: string, style: React.CSSProperties = {}) => {
    if (isEditing) {
      return (
        <InlineTextEditor
          value={text}
          onChange={(newText) => handleTextEdit(textProperty, newText)}
          onSave={handleTextEditEnd}
          onCancel={handleTextEditEnd}
          className={className}
          style={style}
        />
      );
    }

    return (
      <span
        className={cn(
          className,
          !isPreviewMode && 'cursor-text hover:bg-accent/20 rounded-sm transition-colors duration-200'
        )}
        style={style}
        onDoubleClick={(e) => {
          if (!isPreviewMode && onDoubleClick && id) {
            e.stopPropagation();
            setEditingComponentId(id);
          }
        }}
      >
        {text}
      </span>
    );
  };

  // Render different component types
  switch (type) {
    case 'Button':
      return (
        <Button
          variant={effectiveProps.variant || 'default'}
          size={effectiveProps.size || 'default'}
          className={combinedClassName}
          style={inlineStyles}
        >
          {createEditableText(effectiveProps.text || 'Button', 'text', '')}
        </Button>
      );

    case 'Text':
      const TextComponent = effectiveProps.size === 'sm' ? 'p' : effectiveProps.size === 'lg' ? 'p' : 'p';
      const textClasses = {
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg'
      };
      return (
        <TextComponent
          className={cn(textClasses[effectiveProps.size as keyof typeof textClasses] || 'text-base', combinedClassName)}
          style={inlineStyles}
        >
          {createEditableText(effectiveProps.text || 'Sample text', 'text', textClasses[effectiveProps.size as keyof typeof textClasses] || 'text-base', inlineStyles)}
        </TextComponent>
      );

    case 'Heading':
      const HeadingTag = `h${effectiveProps.level || '2'}` as keyof JSX.IntrinsicElements;
      const headingClasses = {
        '1': 'text-4xl font-bold',
        '2': 'text-3xl font-semibold',
        '3': 'text-2xl font-semibold',
        '4': 'text-xl font-semibold',
        '5': 'text-lg font-semibold',
        '6': 'text-base font-semibold'
      };
      return (
        <HeadingTag
          className={cn(headingClasses[effectiveProps.level as keyof typeof headingClasses] || 'text-2xl font-semibold', combinedClassName)}
          style={inlineStyles}
        >
          {createEditableText(effectiveProps.text || 'Heading', 'text', headingClasses[effectiveProps.level as keyof typeof headingClasses] || 'text-2xl font-semibold', inlineStyles)}
        </HeadingTag>
      );

    case 'Card':
      return (
        <Card className={combinedClassName} style={inlineStyles}>
          <CardHeader>
            <CardTitle>{effectiveProps.title || 'Card Title'}</CardTitle>
            {effectiveProps.description && <CardDescription>{effectiveProps.description}</CardDescription>}
          </CardHeader>
          {effectiveProps.content && (
            <CardContent>
              <p>{effectiveProps.content}</p>
            </CardContent>
          )}
        </Card>
      );

    case 'Input':
      return (
        <Input
          placeholder={effectiveProps.placeholder || 'Enter text...'}
          type={effectiveProps.type || 'text'}
          className={combinedClassName}
          style={inlineStyles}
          readOnly
        />
      );

    case 'Badge':
      return (
        <Badge variant={effectiveProps.variant || 'default'}>
          {createEditableText(effectiveProps.text || 'Badge', 'text', '')}
        </Badge>
      );

    case 'Container':
      // For containers, merge styling classes with default container styling
      const containerClassName = cn(
        combinedClassName,
        'min-h-[100px] transition-all duration-200',
        // Only add default styling if no custom styling is applied
        !combinedClassName.includes('p-') && !styles?.padding ? 'p-6' : '',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-border' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-lg' : ''
      );

      return (
        <div
          className={containerClassName}
          style={inlineStyles}
        >
          {children ? children : (
            <p className="text-muted-foreground text-center">Container - Drop components here</p>
          )}
        </div>
      );

    case 'Image':
      return (
        <img
          src={effectiveProps.src || '/placeholder.svg'}
          alt={effectiveProps.alt || 'Image'}
          className="max-w-full h-auto rounded-lg"
        />
      );

    case 'Textarea':
      return (
        <Textarea
          placeholder={effectiveProps.placeholder || 'Enter text...'}
          className={combinedClassName}
          style={inlineStyles}
          rows={effectiveProps.rows || 3}
          readOnly
        />
      );

    case 'Select':
      return (
        <Select>
          <SelectTrigger className={combinedClassName} style={inlineStyles}>
            <SelectValue placeholder={effectiveProps.placeholder || 'Select an option'} />
          </SelectTrigger>
          <SelectContent>
            {(effectiveProps.options || ['Option 1', 'Option 2', 'Option 3']).map((option: string, index: number) => (
              <SelectItem key={index} value={option.toLowerCase().replace(/\s+/g, '-')}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'Checkbox':
      return (
        <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
          <Checkbox id={`checkbox-${Math.random()}`} />
          <label htmlFor={`checkbox-${Math.random()}`} className="text-sm">
            {effectiveProps.label || 'Checkbox'}
          </label>
        </div>
      );

    case 'Switch':
      return (
        <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
          <Switch />
          <label className="text-sm">
            {effectiveProps.label || 'Toggle'}
          </label>
        </div>
      );

    case 'Alert':
      return (
        <Alert className={combinedClassName} style={inlineStyles}>
          <AlertDescription>
            {effectiveProps.message || 'This is an alert message.'}
          </AlertDescription>
        </Alert>
      );

    case 'Separator':
      return (
        <Separator className={combinedClassName} style={inlineStyles} />
      );

    case 'Tabs':
      const tabs = effectiveProps.tabs || [
        { label: 'Tab 1', content: 'Content for tab 1' },
        { label: 'Tab 2', content: 'Content for tab 2' }
      ];
      return (
        <Tabs defaultValue={tabs[0]?.label.toLowerCase().replace(/\s+/g, '-')} className={combinedClassName} style={inlineStyles}>
          <TabsList>
            {tabs.map((tab: any, index: number) => (
              <TabsTrigger key={index} value={tab.label.toLowerCase().replace(/\s+/g, '-')}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab: any, index: number) => (
            <TabsContent key={index} value={tab.label.toLowerCase().replace(/\s+/g, '-')}>
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      );

    case 'Accordion':
      const items = effectiveProps.items || [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
      ];
      return (
        <Accordion type="single" collapsible className={combinedClassName} style={inlineStyles}>
          {items.map((item: any, index: number) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger>{item.title}</AccordionTrigger>
              <AccordionContent>{item.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );

    case 'Avatar':
      return (
        <Avatar className={combinedClassName} style={inlineStyles}>
          <AvatarImage src={effectiveProps.src} alt={effectiveProps.alt || 'Avatar'} />
          <AvatarFallback>{effectiveProps.fallback || 'U'}</AvatarFallback>
        </Avatar>
      );

    case 'Breadcrumb':
      const crumbs = effectiveProps.items || [
        { label: 'Home', href: '/' },
        { label: 'Page', href: '/page' }
      ];
      return (
        <Breadcrumb className={combinedClassName} style={inlineStyles}>
          <BreadcrumbList>
            {crumbs.map((crumb: any, index: number) => (
              <React.Fragment key={index}>
                <BreadcrumbItem>
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                </BreadcrumbItem>
                {index < crumbs.length - 1 && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      );

    case 'Progress':
      return (
        <Progress
          value={effectiveProps.value || 50}
          className={combinedClassName}
          style={inlineStyles}
        />
      );

    case 'Link':
      return (
        <a
          href={effectiveProps.href || '#'}
          target={effectiveProps.target || '_self'}
          className={cn('text-primary hover:underline', combinedClassName)}
          style={inlineStyles}
        >
          {createEditableText(effectiveProps.text || 'Link', 'text', 'text-primary hover:underline', inlineStyles)}
        </a>
      );

    case 'DataTable':
      return (
        <UniversalDataTable
          componentId={id || 'datatable'}
          binding={effectiveProps.binding}
          className={combinedClassName}
          onConfigureBinding={effectiveProps.onConfigureBinding}
        />
      );

    case 'KPICard':
      return (
        <KPICard
          componentId={id || 'kpicard'}
          binding={effectiveProps.binding}
          className={combinedClassName}
          onConfigureBinding={effectiveProps.onConfigureBinding}
        />
      );

    case 'Chart':
      return (
        <Chart
          componentId={id || 'chart'}
          binding={effectiveProps.binding}
          className={combinedClassName}
          chartType={effectiveProps.chartType || 'bar'}
          onConfigureBinding={effectiveProps.onConfigureBinding}
        />
      );

    case 'Grid':
      return (
        <Grid
          componentId={id || 'grid'}
          binding={effectiveProps.binding}
          className={combinedClassName}
          columns={effectiveProps.columns || 3}
          onConfigureBinding={effectiveProps.onConfigureBinding}
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