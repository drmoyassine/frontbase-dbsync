import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RendererProps } from './types';

export const ButtonRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => (
    <Button
        variant={effectiveProps.variant || 'default'}
        size={effectiveProps.size || 'default'}
        className={combinedClassName}
        style={inlineStyles}
    >
        {createEditableText(effectiveProps.text || 'Button', 'text', '')}
    </Button>
);

export const TextRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
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
};

export const HeadingRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
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
};

export const CardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
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

export const BadgeRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, createEditableText }) => (
    <Badge variant={effectiveProps.variant || 'default'}>
        {createEditableText(effectiveProps.text || 'Badge', 'text', '')}
    </Badge>
);

export const ImageRenderer: React.FC<RendererProps> = ({ effectiveProps }) => (
    <img
        src={effectiveProps.src || '/placeholder.svg'}
        alt={effectiveProps.alt || 'Image'}
        className="max-w-full h-auto rounded-lg"
    />
);

export const AlertRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Alert className={combinedClassName} style={inlineStyles}>
        <AlertDescription>
            {effectiveProps.message || 'This is an alert message.'}
        </AlertDescription>
    </Alert>
);

export const SeparatorRenderer: React.FC<RendererProps> = ({ combinedClassName, inlineStyles }) => (
    <Separator className={combinedClassName} style={inlineStyles} />
);

export const AvatarRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Avatar className={combinedClassName} style={inlineStyles}>
        <AvatarImage src={effectiveProps.src} alt={effectiveProps.alt || 'Avatar'} />
        <AvatarFallback>{effectiveProps.fallback || 'U'}</AvatarFallback>
    </Avatar>
);

export const ProgressRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Progress
        value={effectiveProps.value || 50}
        className={combinedClassName}
        style={inlineStyles}
    />
);

export const LinkRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => (
    <a
        href={effectiveProps.href || '#'}
        target={effectiveProps.target || '_self'}
        className={cn('text-primary hover:underline', combinedClassName)}
        style={inlineStyles}
    >
        {createEditableText(effectiveProps.text || 'Link', 'text', 'text-primary hover:underline', inlineStyles)}
    </a>
);
