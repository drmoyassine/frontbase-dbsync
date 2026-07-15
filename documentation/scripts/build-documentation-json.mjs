import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '../src/content/docs');
const OUTPUT_DIR = path.join(__dirname, '../dist');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'documentation.json');

// Helper to recursively get files
function getFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFiles(filePath, fileList);
    } else if (file.endsWith('.md') || file.endsWith('.mdx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// Simple slugify
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
}

// Tokenize for keywords
function getKeywords(texts) {
  const words = texts
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2); // only words > 2 chars
  return Array.from(new Set(words));
}

// Clean MDX and Starlight imports/tags
function cleanContent(content) {
  return content
    // Remove MDX imports
    .replace(/^import\s+.*$/gm, '')
    // Clean up multiple newlines
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function parseMarkdown(filePath) {
  const relativePath = path.relative(DOCS_DIR, filePath)
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/, '');
  
  // Starlight homepage handles slug differently if it's index
  const pagePath = relativePath === 'index' ? '' : relativePath;

  const raw = fs.readFileSync(filePath, 'utf-8');
  
  // Parse Frontmatter
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = raw.match(fmRegex);
  
  let frontmatter = {};
  let body = raw;
  
  if (match) {
    body = raw.slice(match[0].length);
    const fmText = match[1];
    fmText.split('\n').forEach(line => {
      const index = line.indexOf(':');
      if (index !== -1) {
        const key = line.slice(0, index).trim();
        const val = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        frontmatter[key] = val;
      }
    });
  }

  const pageTitle = frontmatter.title || relativePath;
  const pageDesc = frontmatter.description || '';

  // Clean body first
  const cleanedBody = cleanContent(body);

  // Split by H2 headings: "\n## " or beginning of file if it starts with "## "
  // Updated regex to handle EOF gracefully
  const h2Regex = /(?:^|\n)##\s+(.+?)(?:\r?\n|$)/g;
  
  const chunks = [];
  let lastIndex = 0;
  let currentHeader = '';
  
  let h2Match;
  while ((h2Match = h2Regex.exec(cleanedBody)) !== null) {
    const matchIndex = h2Match.index;
    
    // Grab text before this header
    const sectionContent = cleanedBody.slice(lastIndex, matchIndex).trim();
    if (sectionContent || !currentHeader) {
      const sectionTitle = currentHeader ? `${pageTitle} - ${currentHeader}` : pageTitle;
      const sectionPath = currentHeader ? `${pagePath}#${slugify(currentHeader)}` : pagePath;
      chunks.push({
        id: sectionPath,
        title: sectionTitle,
        path: pagePath,
        section: pagePath.startsWith('guides') ? 'Guides' : (pagePath.startsWith('reference') ? 'Reference' : 'Documentation'),
        content: sectionContent,
        headings: currentHeader ? [currentHeader] : [],
        keywords: getKeywords([sectionTitle, pageDesc, sectionContent])
      });
    }
    
    currentHeader = h2Match[1].trim();
    lastIndex = h2Regex.lastIndex;
  }
  
  // Add remaining part
  const remainingContent = cleanedBody.slice(lastIndex).trim();
  if (remainingContent || !currentHeader) {
    const sectionTitle = currentHeader ? `${pageTitle} - ${currentHeader}` : pageTitle;
    const sectionPath = currentHeader ? `${pagePath}#${slugify(currentHeader)}` : pagePath;
    chunks.push({
      id: sectionPath,
      title: sectionTitle,
      path: pagePath,
      section: pagePath.startsWith('guides') ? 'Guides' : (pagePath.startsWith('reference') ? 'Reference' : 'Documentation'),
      content: remainingContent,
      headings: currentHeader ? [currentHeader] : [],
      keywords: getKeywords([sectionTitle, pageDesc, remainingContent])
    });
  }

  return chunks;
}

function main() {
  console.log('Generating documentation.json...');
  
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Docs directory not found: ${DOCS_DIR}`);
    process.exit(1);
  }
  
  const files = getFiles(DOCS_DIR);
  let allChunks = [];
  
  for (const file of files) {
    try {
      const chunks = parseMarkdown(file);
      allChunks = allChunks.concat(chunks);
    } catch (e) {
      console.error(`Failed to parse ${file}:`, e);
    }
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    total_chunks: allChunks.length,
    chunks: allChunks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Generated manifest with ${allChunks.length} chunks at ${OUTPUT_FILE}`);
}

main();
