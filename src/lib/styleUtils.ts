import { ComponentStyles } from '@/types/styles';

// Tailwind spacing values (using design tokens)
const TAILWIND_SPACING = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'];
const TAILWIND_COLORS = ['primary', 'secondary', 'muted', 'accent', 'destructive', 'background', 'foreground', 'card', 'popover', 'border'];
const TAILWIND_FONT_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
const TAILWIND_FONT_WEIGHTS = ['font-thin', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold'];

export function isTailwindValue(property: string, value: string): boolean {
  switch (property) {
    case 'fontSize':
      return TAILWIND_FONT_SIZES.some(size => value.includes(size.replace('text-', '')));
    case 'fontWeight':
      return TAILWIND_FONT_WEIGHTS.some(weight => value.includes(weight.replace('font-', '')));
    case 'textColor':
    case 'backgroundColor':
    case 'borderColor':
      return TAILWIND_COLORS.includes(value) || value.startsWith('hsl(var(--');
    case 'padding':
    case 'margin':
    case 'width':
    case 'height':
      return TAILWIND_SPACING.includes(value) || value.endsWith('rem') || value.endsWith('px');
    case 'borderRadius':
      return ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'].includes(value);
    default:
      return false;
  }
}

export function generateTailwindClass(property: string, value: string): string | null {
  if (!isTailwindValue(property, value)) return null;
  
  switch (property) {
    case 'fontSize':
      return `text-${value}`;
    case 'fontWeight':
      return `font-${value}`;
    case 'textColor':
      return value === 'primary' ? 'text-primary' : 
             value === 'secondary' ? 'text-secondary' :
             value === 'muted' ? 'text-muted-foreground' :
             value === 'accent' ? 'text-accent-foreground' :
             value === 'destructive' ? 'text-destructive' : null;
    case 'backgroundColor':
      return value === 'primary' ? 'bg-primary' :
             value === 'secondary' ? 'bg-secondary' :
             value === 'muted' ? 'bg-muted' :
             value === 'accent' ? 'bg-accent' :
             value === 'card' ? 'bg-card' : null;
    case 'padding':
      return `p-${value}`;
    case 'paddingTop':
      return `pt-${value}`;
    case 'paddingRight':
      return `pr-${value}`;
    case 'paddingBottom':
      return `pb-${value}`;
    case 'paddingLeft':
      return `pl-${value}`;
    case 'margin':
      return `m-${value}`;
    case 'marginTop':
      return `mt-${value}`;
    case 'marginRight':
      return `mr-${value}`;
    case 'marginBottom':
      return `mb-${value}`;
    case 'marginLeft':
      return `ml-${value}`;
    case 'width':
      return `w-${value}`;
    case 'height':
      return `h-${value}`;
    case 'borderRadius':
      return `rounded${value === 'none' ? '-none' : value === 'full' ? '-full' : `-${value}`}`;
    case 'borderWidth':
      return value === '1' ? 'border' : `border-${value}`;
    case 'textAlign':
      return `text-${value}`;
    case 'justifyContent':
      const justifyMap: Record<string, string> = {
        'flex-start': 'justify-start',
        'center': 'justify-center',
        'flex-end': 'justify-end',
        'space-between': 'justify-between',
        'space-around': 'justify-around',
        'space-evenly': 'justify-evenly'
      };
      return justifyMap[value] || null;
    case 'alignItems':
      const alignMap: Record<string, string> = {
        'flex-start': 'items-start',
        'center': 'items-center',
        'flex-end': 'items-end',
        'stretch': 'items-stretch'
      };
      return alignMap[value] || null;
    default:
      return null;
  }
}

export function generateStyles(styles: ComponentStyles): { classes: string; inlineStyles: React.CSSProperties } {
  const tailwindClasses: string[] = [];
  const inlineStyles: React.CSSProperties = {};
  
  Object.entries(styles).forEach(([property, value]) => {
    if (!value) return;
    
    const tailwindClass = generateTailwindClass(property, value);
    
    if (tailwindClass) {
      tailwindClasses.push(tailwindClass);
    } else {
      // Convert camelCase to kebab-case for CSS properties
      const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
      inlineStyles[cssProperty as keyof React.CSSProperties] = value as any;
    }
  });
  
  return {
    classes: tailwindClasses.join(' '),
    inlineStyles
  };
}

export function getStylePresets() {
  return [
    {
      id: 'card-shadow',
      name: 'Card with Shadow',
      description: 'Elevated card appearance',
      styles: {
        backgroundColor: 'card',
        borderRadius: 'lg',
        padding: '6',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
      }
    },
    {
      id: 'primary-button',
      name: 'Primary Button',
      description: 'Prominent call-to-action styling',
      styles: {
        backgroundColor: 'primary',
        textColor: 'primary-foreground',
        borderRadius: 'md',
        padding: '3',
        fontWeight: 'medium'
      },
      applicableTypes: ['Button']
    },
    {
      id: 'hero-text',
      name: 'Hero Text',
      description: 'Large, bold heading',
      styles: {
        fontSize: '4xl',
        fontWeight: 'bold',
        textColor: 'foreground',
        lineHeight: '1.2'
      },
      applicableTypes: ['Heading', 'Text']
    }
  ];
}

export function getTailwindSuggestions(property: string): string[] {
  switch (property) {
    case 'fontSize':
      return ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'];
    case 'fontWeight':
      return ['thin', 'light', 'normal', 'medium', 'semibold', 'bold'];
    case 'textColor':
    case 'backgroundColor':
    case 'borderColor':
      return TAILWIND_COLORS;
    case 'padding':
    case 'margin':
      return TAILWIND_SPACING;
    case 'borderRadius':
      return ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'];
    case 'textAlign':
      return ['left', 'center', 'right', 'justify'];
    default:
      return [];
  }
}