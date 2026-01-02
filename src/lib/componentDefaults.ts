// Shared default props for different component types
export function getDefaultProps(componentType: string): Record<string, any> {
  const defaults: Record<string, any> = {
    Button: { text: 'Button', variant: 'default', size: 'default' },
    Text: { text: 'Sample text content', size: 'base' },
    Heading: { text: 'Heading', level: '2' },
    Card: { title: 'Card Title', description: 'Card description', content: 'Card content' },
    Input: { placeholder: 'Enter text...', type: 'text' },
    Textarea: { placeholder: 'Enter text...', rows: 3 },
    Select: { placeholder: 'Select an option', options: ['Option 1', 'Option 2', 'Option 3'] },
    Checkbox: { label: 'Checkbox' },
    Switch: { label: 'Toggle' },
    Badge: { text: 'Badge', variant: 'default' },
    Alert: { message: 'This is an alert message.' },
    Separator: {},
    Tabs: {
      tabs: [
        { label: 'Tab 1', content: 'Content for tab 1' },
        { label: 'Tab 2', content: 'Content for tab 2' }
      ]
    },
    Accordion: {
      items: [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
      ]
    },
    Avatar: { src: '/placeholder.svg', alt: 'Avatar', fallback: 'U' },
    Breadcrumb: {
      items: [
        { label: 'Home', href: '/' },
        { label: 'Page', href: '/page' }
      ]
    },
    Progress: { value: 50 },
    Container: { className: 'p-6' },
    Image: { src: '/placeholder.svg', alt: 'Placeholder image', width: '200px', height: '200px' },
    Link: { text: 'Link', href: '#', target: '_self' },
    DataTable: { binding: null },
    KPICard: { binding: null },
    Chart: { binding: null, chartType: 'bar' },
    Grid: { binding: null, columns: 3 }
  };

  return defaults[componentType] || {};
}