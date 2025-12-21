const { generateStyles } = require('../styleUtils');

function replaceVariables(text, variables) {
  if (typeof text !== 'string') return text;
  
  return text.replace(/\{\{\s*localstate\.(\w+)\s*\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

function replaceVariablesInProps(props, variables) {
  const result = {};
  for (const [key, value] of Object.entries(props || {})) {
    if (typeof value === 'string') {
      result[key] = replaceVariables(value, variables);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function generateStylesSSR(styles = {}) {
  // Convert styles object to CSS string for SSR
  const cssProperties = [];
  
  // Basic style mappings for SSR
  const styleMap = {
    backgroundColor: 'background-color',
    textColor: 'color',
    fontSize: 'font-size',
    fontWeight: 'font-weight',
    fontFamily: 'font-family',
    lineHeight: 'line-height',
    letterSpacing: 'letter-spacing',
    textAlign: 'text-align',
    width: 'width',
    height: 'height',
    padding: 'padding',
    paddingTop: 'padding-top',
    paddingRight: 'padding-right',
    paddingBottom: 'padding-bottom',
    paddingLeft: 'padding-left',
    margin: 'margin',
    marginTop: 'margin-top',
    marginRight: 'margin-right',
    marginBottom: 'margin-bottom',
    marginLeft: 'margin-left',
    borderWidth: 'border-width',
    borderColor: 'border-color',
    borderRadius: 'border-radius',
    borderStyle: 'border-style',
    boxShadow: 'box-shadow',
    opacity: 'opacity',
    transform: 'transform',
    transition: 'transition'
  };
  
  for (const [key, value] of Object.entries(styles)) {
    const cssProperty = styleMap[key];
    if (cssProperty && value) {
      cssProperties.push(`${cssProperty}: ${value}`);
    }
  }
  
  // Basic Tailwind classes for layout
  const classes = [];
  if (styles.display === 'flex') classes.push('flex');
  if (styles.flexDirection === 'column') classes.push('flex-col');
  if (styles.justifyContent === 'center') classes.push('justify-center');
  if (styles.alignItems === 'center') classes.push('items-center');
  if (styles.gap) classes.push(`gap-${styles.gap}`);
  
  return {
    classes: classes.join(' '),
    inlineStyles: cssProperties.join('; ')
  };
}

function renderComponentSSR(component, variables = {}) {
  const { type, props = {}, styles = {}, children = [] } = component;
  
  // Process styles
  const { classes, inlineStyles } = generateStylesSSR(styles);
  
  // Replace variables in props
  const processedProps = replaceVariablesInProps(props, variables);
  
  // Style attribute
  const styleAttr = inlineStyles ? ` style="${inlineStyles}"` : '';
  const classAttr = classes ? ` class="${classes}"` : '';
  
  // Render children
  const childrenHTML = children.map(child => renderComponentSSR(child, variables)).join('');
  
  // Generate HTML based on component type
  switch (type) {
    case 'Heading':
      const level = processedProps.level || 1;
      return `<h${level}${classAttr}${styleAttr}>${processedProps.text || ''}</h${level}>`;
      
    case 'Text':
      return `<p${classAttr}${styleAttr}>${processedProps.text || ''}</p>`;
      
    case 'Button':
      return `<button${classAttr}${styleAttr}>${processedProps.text || 'Button'}</button>`;
      
    case 'Container':
      return `<div${classAttr}${styleAttr}>${childrenHTML}</div>`;
      
    case 'Image':
      const src = processedProps.src || '';
      const alt = processedProps.alt || '';
      return `<img src="${src}" alt="${alt}"${classAttr}${styleAttr}>`;
      
    case 'Link':
      const href = processedProps.href || '#';
      return `<a href="${href}"${classAttr}${styleAttr}>${processedProps.text || 'Link'}</a>`;
      
    case 'Input':
      const inputType = processedProps.type || 'text';
      const placeholder = processedProps.placeholder || '';
      return `<input type="${inputType}" placeholder="${placeholder}"${classAttr}${styleAttr}>`;
      
    case 'Textarea':
      const textareaPlaceholder = processedProps.placeholder || '';
      return `<textarea placeholder="${textareaPlaceholder}"${classAttr}${styleAttr}></textarea>`;
      
    case 'Card':
      return `<div${classAttr}${styleAttr}>${childrenHTML}</div>`;
      
    case 'Section':
      return `<section${classAttr}${styleAttr}>${childrenHTML}</section>`;
      
    case 'Header':
      return `<header${classAttr}${styleAttr}>${childrenHTML}</header>`;
      
    case 'Footer':
      return `<footer${classAttr}${styleAttr}>${childrenHTML}</footer>`;
      
    case 'Navigation':
      return `<nav${classAttr}${styleAttr}>${childrenHTML}</nav>`;
      
    case 'List':
      const listType = processedProps.type === 'ordered' ? 'ol' : 'ul';
      return `<${listType}${classAttr}${styleAttr}>${childrenHTML}</${listType}>`;
      
    case 'ListItem':
      return `<li${classAttr}${styleAttr}>${processedProps.text || childrenHTML}</li>`;
      
    default:
      console.warn(`Unknown component type for SSR: ${type}`);
      return `<div${classAttr}${styleAttr}><!-- Unknown component: ${type} -->${childrenHTML}</div>`;
  }
}

function renderPageSSR(page, variables = {}) {
  const { layoutData = { content: [] } } = page;
  const componentsHTML = layoutData.content.map(component => 
    renderComponentSSR(component, variables)
  ).join('');
  
  return generateHTMLDocument(page, componentsHTML, variables);
}

function generateHTMLDocument(page, componentsHTML, variables) {
  const seoData = page.seoData || {};
  
  // Convert variables to object for client-side access
  const variablesObject = {};
  if (Array.isArray(variables)) {
    variables.forEach(variable => {
      variablesObject[variable.name] = variable.value;
    });
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title || page.name}</title>
  <meta name="description" content="${page.description || ''}">
  <meta name="keywords" content="${page.keywords || ''}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${page.title || page.name}">
  <meta property="og:description" content="${page.description || ''}">
  <meta property="og:type" content="website">
  ${seoData.ogImage ? `<meta property="og:image" content="${seoData.ogImage}">` : ''}
  
  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${page.title || page.name}">
  <meta name="twitter:description" content="${page.description || ''}">
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Local State Management -->
  <script>
    window.localState = ${JSON.stringify(variablesObject)};
  </script>
  
  <style>
    /* Basic responsive utilities */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-center { justify-content: center; }
    .text-center { text-align: center; }
    .w-full { width: 100%; }
    .h-full { height: 100%; }
  </style>
</head>
<body>
  ${componentsHTML}
  
  <!-- Local State Runtime (placeholder for future interactive features) -->
  <script>
    // Future: Add interactive functionality here
    console.log('Local state loaded:', window.localState);
  </script>
</body>
</html>`;
}

module.exports = {
  renderComponentSSR,
  renderPageSSR,
  generateHTMLDocument,
  replaceVariables
};