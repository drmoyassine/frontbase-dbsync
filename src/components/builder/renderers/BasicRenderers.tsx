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

export const CardRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children }) => {
    // Check if we have children components - if so, they ARE the content
    const hasChildren = React.Children.count(children) > 0;

    return (
        <Card className={combinedClassName} style={inlineStyles}>
            {/* Only show header if we have title/description AND no children */}
            {(!hasChildren && (effectiveProps.title || effectiveProps.description)) && (
                <CardHeader>
                    {effectiveProps.title && <CardTitle>{effectiveProps.title}</CardTitle>}
                    {effectiveProps.description && <CardDescription>{effectiveProps.description}</CardDescription>}
                </CardHeader>
            )}
            <CardContent className={hasChildren ? 'p-4' : ''}>
                {hasChildren ? children : (effectiveProps.content && <p>{effectiveProps.content}</p>)}
            </CardContent>
        </Card>
    );
};

export const BadgeRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, createEditableText }) => (
    <Badge variant={effectiveProps.variant || 'default'}>
        {createEditableText(effectiveProps.text || 'Badge', 'text', '')}
    </Badge>
);

export const ImageRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <img
        src={effectiveProps.src || '/placeholder.svg'}
        alt={effectiveProps.alt || 'Image'}
        className={cn('rounded-lg object-cover', combinedClassName)}
        style={{
            width: effectiveProps.width || '200px',
            height: effectiveProps.height || '200px',
            ...inlineStyles
        }}
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

export const IconRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => {
    const icon = effectiveProps.icon || effectiveProps.name || '⭐';
    const size = effectiveProps.size || 'md';
    const color = effectiveProps.color || 'currentColor';

    // Size classes
    const sizeClasses = {
        xs: 'w-4 h-4 text-base',
        sm: 'w-6 h-6 text-xl',
        md: 'w-8 h-8 text-2xl',
        lg: 'w-10 h-10 text-3xl',
        xl: 'w-12 h-12 text-4xl',
    };

    const sizeClass = sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.md;

    // Check if it's an emoji (short string with no URL characters)
    const isEmoji = icon.length <= 4 && !/^[a-zA-Z0-9\/]/.test(icon);
    // Check if it's an image URL
    const isUrl = icon.startsWith('http') || icon.startsWith('/');

    if (isUrl) {
        return (
            <img
                src={icon}
                alt=""
                className={cn('object-contain', sizeClass, combinedClassName)}
                style={{ color, ...inlineStyles }}
            />
        );
    }

    // Render as emoji or text icon
    return (
        <span
            className={cn('inline-flex items-center justify-center', sizeClass, combinedClassName)}
            style={{ color: isEmoji ? undefined : color, ...inlineStyles }}
        >
            {icon}
        </span>
    );
};
