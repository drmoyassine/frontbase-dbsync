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
import { generateStyles } from '@/lib/styleUtils';
import { ComponentStyles } from '@/types/styles';
import { cn } from '@/lib/utils';

interface ComponentRendererProps {
  component: {
    type: string;
    props: Record<string, any>;
    styles?: ComponentStyles;
    className?: string;
  };
  isSelected?: boolean;
}

export const ComponentRenderer: React.FC<ComponentRendererProps> = ({ component, isSelected }) => {
  const { type, props, styles = {}, className = '' } = component;
  
  // Generate styles from the styles object
  const { classes: generatedClasses, inlineStyles } = generateStyles(styles);
  const combinedClassName = cn(
    generatedClasses,
    className
  );

  // Render different component types
  switch (type) {
    case 'Button':
      return (
        <Button 
          variant={props.variant || 'default'} 
          size={props.size || 'default'}
          className={combinedClassName}
          style={inlineStyles}
        >
          {props.text || 'Button'}
        </Button>
      );

    case 'Text':
      const TextComponent = props.size === 'sm' ? 'p' : props.size === 'lg' ? 'p' : 'p';
      const textClasses = {
        sm: 'text-sm',
        base: 'text-base',
        lg: 'text-lg'
      };
      return (
        <TextComponent 
          className={cn(textClasses[props.size as keyof typeof textClasses] || 'text-base', combinedClassName)}
          style={inlineStyles}
        >
          {props.text || 'Sample text'}
        </TextComponent>
      );

    case 'Heading':
      const HeadingTag = `h${props.level || '2'}` as keyof JSX.IntrinsicElements;
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
          className={cn(headingClasses[props.level as keyof typeof headingClasses] || 'text-2xl font-semibold', combinedClassName)}
          style={inlineStyles}
        >
          {props.text || 'Heading'}
        </HeadingTag>
      );

    case 'Card':
      return (
        <Card className={combinedClassName} style={inlineStyles}>
          <CardHeader>
            <CardTitle>{props.title || 'Card Title'}</CardTitle>
            {props.description && <CardDescription>{props.description}</CardDescription>}
          </CardHeader>
          {props.content && (
            <CardContent>
              <p>{props.content}</p>
            </CardContent>
          )}
        </Card>
      );

    case 'Input':
      return (
        <Input 
          placeholder={props.placeholder || 'Enter text...'} 
          type={props.type || 'text'}
          className={combinedClassName}
          style={inlineStyles}
          readOnly
        />
      );

    case 'Badge':
      return (
        <Badge variant={props.variant || 'default'}>
          {props.text || 'Badge'}
        </Badge>
      );

    case 'Container':
      return (
        <div className={props.className || 'p-6 border border-border rounded-lg'}>
          <p className="text-muted-foreground text-center">Container - Drop components here</p>
        </div>
      );

    case 'Image':
      return (
        <img 
          src={props.src || '/placeholder.svg'} 
          alt={props.alt || 'Image'} 
          className="max-w-full h-auto rounded-lg"
        />
      );

    case 'Textarea':
      return (
        <Textarea 
          placeholder={props.placeholder || 'Enter text...'}
          className={combinedClassName}
          style={inlineStyles}
          rows={props.rows || 3}
          readOnly
        />
      );

    case 'Select':
      return (
        <Select>
          <SelectTrigger className={combinedClassName} style={inlineStyles}>
            <SelectValue placeholder={props.placeholder || 'Select an option'} />
          </SelectTrigger>
          <SelectContent>
            {(props.options || ['Option 1', 'Option 2', 'Option 3']).map((option: string, index: number) => (
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
            {props.label || 'Checkbox'}
          </label>
        </div>
      );

    case 'Switch':
      return (
        <div className={cn('flex items-center space-x-2', combinedClassName)} style={inlineStyles}>
          <Switch />
          <label className="text-sm">
            {props.label || 'Toggle'}
          </label>
        </div>
      );

    case 'Alert':
      return (
        <Alert className={combinedClassName} style={inlineStyles}>
          <AlertDescription>
            {props.message || 'This is an alert message.'}
          </AlertDescription>
        </Alert>
      );

    case 'Separator':
      return (
        <Separator className={combinedClassName} style={inlineStyles} />
      );

    case 'Tabs':
      const tabs = props.tabs || [
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
      const items = props.items || [
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
          <AvatarImage src={props.src} alt={props.alt || 'Avatar'} />
          <AvatarFallback>{props.fallback || 'U'}</AvatarFallback>
        </Avatar>
      );

    case 'Breadcrumb':
      const crumbs = props.items || [
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
          value={props.value || 50} 
          className={combinedClassName}
          style={inlineStyles}
        />
      );

    case 'Link':
      return (
        <a 
          href={props.href || '#'} 
          target={props.target || '_self'}
          className={cn('text-primary hover:underline', combinedClassName)}
          style={inlineStyles}
        >
          {props.text || 'Link'}
        </a>
      );

    default:
      return (
        <div className="p-4 border border-dashed border-muted-foreground rounded-lg text-center text-muted-foreground">
          Unknown component: {type}
        </div>
      );
  }
};