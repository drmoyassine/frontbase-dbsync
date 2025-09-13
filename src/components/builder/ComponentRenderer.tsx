import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ComponentRendererProps {
  component: {
    type: string;
    props: Record<string, any>;
  };
  isSelected?: boolean;
}

export const ComponentRenderer: React.FC<ComponentRendererProps> = ({ component, isSelected }) => {
  const { type, props } = component;

  // Render different component types
  switch (type) {
    case 'Button':
      return (
        <Button 
          variant={props.variant || 'default'} 
          size={props.size || 'default'}
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
        <TextComponent className={textClasses[props.size as keyof typeof textClasses] || 'text-base'}>
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
        <HeadingTag className={headingClasses[props.level as keyof typeof headingClasses] || 'text-2xl font-semibold'}>
          {props.text || 'Heading'}
        </HeadingTag>
      );

    case 'Card':
      return (
        <Card>
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

    case 'Link':
      return (
        <a 
          href={props.href || '#'} 
          target={props.target || '_self'}
          className="text-primary hover:underline"
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