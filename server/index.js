const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { initializeDatabase } = require('./database/init');
const DatabaseManager = require('./utils/db');
const { renderPageSSR } = require('./ssr/renderer');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
console.log('🚀 Starting Frontbase server...');
console.log('📦 Initializing database...');

try {
  initializeDatabase();
  console.log('✅ Database initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize database:', error);
  process.exit(1);
}

// Initialize database manager
const db = new DatabaseManager();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create necessary directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const exportsDir = path.join(dataDir, 'exports');

[dataDir, uploadsDir, exportsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// API Routes
console.log('🔧 Setting up API routes...');
app.use('/api/project', require('./routes/api/project')(db));
app.use('/api/pages', require('./routes/api/pages')(db));
app.use('/api/variables', require('./routes/api/variables')(db));

// Public SSR Routes (for SEO)
app.get('/sitemap.xml', async (req, res) => {
  try {
    const publicPages = db.getPublicPages();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.map(page => `  <url>
    <loc>${baseUrl}${page.slug === 'home' ? '/' : '/' + page.slug}</loc>
    <lastmod>${new Date(page.updated_at).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.isHomepage ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`;
  
  res.set('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

// Static file serving for uploads
app.use('/uploads', express.static(uploadsDir));

// Builder SPA routes
app.use('/builder', express.static(path.join(__dirname, 'public')));
app.get('/builder/*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Builder not found. Please build the frontend first.');
  }
});

// Public page SSR handler
app.get('/:slug?', async (req, res) => {
  try {
    const slug = req.params.slug || 'home';
    
    // Skip API routes and builder routes
    if (slug.startsWith('api') || slug === 'builder' || slug.includes('.')) {
      return res.status(404).send('Not found');
    }
    
    // Find public page by slug or homepage
    let page;
    if (slug === 'home' || slug === '') {
      // Try to find homepage first
      const pages = db.getPublicPages();
      page = pages.find(p => p.isHomepage) || pages[0];
    } else {
      page = db.getPageBySlug(slug);
    }
    
    if (!page || !page.isPublic) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 flex items-center justify-center min-h-screen">
          <div class="text-center">
            <h1 class="text-4xl font-bold text-gray-800 mb-4">404 - Page Not Found</h1>
            <p class="text-gray-600 mb-4">The page you're looking for doesn't exist.</p>
            <a href="/" class="text-blue-600 hover:text-blue-800 underline">Go back home</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // Get variables for template replacement
    const variables = db.getAllVariables();
    
    // Render page with SSR
    const html = renderPageSSR(page, variables);
    
    res.send(html);
  } catch (error) {
    console.error('SSR Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="text-center">
          <h1 class="text-4xl font-bold text-red-600 mb-4">500 - Server Error</h1>
          <p class="text-gray-600 mb-4">Something went wrong while rendering this page.</p>
          <a href="/" class="text-blue-600 hover:text-blue-800 underline">Go back home</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('✅ Server setup complete!');
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Builder available at http://localhost:${PORT}/builder`);
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🎯 Public pages served with SSR for SEO`);
  console.log(`📍 Database: ${process.env.DB_PATH || path.join(__dirname, 'data/frontbase.db')}`);
});