// Node.js compatible version of styleUtils for SSR
// Adapted from src/lib/styleUtils.ts

const TAILWIND_SPACING = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32', '40', '48', '56', '64'];
const TAILWIND_COLORS = ['primary', 'secondary', 'muted', 'accent', 'destructive', 'background', 'foreground', 'card', 'popover', 'border'];
const TAILWIND_FONT_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
const TAILWIND_FONT_WEIGHTS = ['font-thin', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold'];

function isTailwindValue(property, value) {
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
    case 'display':
      return ['block', 'flex', 'grid', 'none'].includes(value);
    case 'flexDirection':
      return ['row', 'column', 'row-reverse', 'column-reverse'].includes(value);
    case 'justifyContent':
      return ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].includes(value);
    case 'alignItems':
      return ['flex-start', 'center', 'flex-end', 'stretch'].includes(value);
    case 'gap':
      return TAILWIND_SPACING.includes(value);
    default:
      return false;
  }
}

function generateTailwindClass(property, value) {
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
      const justifyMap = {
        'flex-start': 'justify-start',
        'center': 'justify-center',
        'flex-end': 'justify-end',
        'space-between': 'justify-between',
        'space-around': 'justify-around',
        'space-evenly': 'justify-evenly'
      };
      return justifyMap[value] || null;
    case 'alignItems':
      const alignMap = {
        'flex-start': 'items-start',
        'center': 'items-center',
        'flex-end': 'items-end',
        'stretch': 'items-stretch'
      };
      return alignMap[value] || null;
    case 'display':
      return value === 'flex' ? 'flex' : 
             value === 'block' ? 'block' :
             value === 'grid' ? 'grid' :
             value === 'none' ? 'hidden' : null;
    case 'flexDirection':
      return value === 'row' ? 'flex-row' :
             value === 'column' ? 'flex-col' :
             value === 'row-reverse' ? 'flex-row-reverse' :
             value === 'column-reverse' ? 'flex-col-reverse' : null;
    case 'gap':
      return `gap-${value}`;
    default:
      return null;
  }
}

function generateStyles(styles = {}) {
  const tailwindClasses = [];
  const inlineStyles = {};
  
  Object.entries(styles).forEach(([property, value]) => {
    if (!value) return;
    
    const tailwindClass = generateTailwindClass(property, value);
    
    if (tailwindClass) {
      tailwindClasses.push(tailwindClass);
    } else {
      // Convert camelCase to kebab-case for CSS properties
      const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
      inlineStyles[cssProperty] = value;
    }
  });
  
  return {
    classes: tailwindClasses.join(' '),
    inlineStyles
  };
}

module.exports = {
  generateStyles,
  isTailwindValue,
  generateTailwindClass
};