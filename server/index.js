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

// Enhanced startup logging with error handling
console.log('🚀 Starting Frontbase server...');
console.log('Environment:', process.env.NODE_ENV || 'production');
console.log('Database Path:', process.env.DB_PATH || '/app/data/frontbase.db');
console.log('Port:', process.env.PORT || 3000);
console.log('Working Directory:', process.cwd());

// Set default environment variables if not provided
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DB_PATH = process.env.DB_PATH || '/app/data/frontbase.db';
process.env.PORT = process.env.PORT || '3000';

// Ensure data directory exists with comprehensive error handling
console.log('📁 Ensuring data directory exists...');
const dataDir = path.dirname(process.env.DB_PATH);
const uploadsDir = path.join(dataDir, 'uploads');
const exportsDir = path.join(dataDir, 'exports');
console.log('📂 Data directory path:', dataDir);

try {
  if (!fs.existsSync(dataDir)) {
    console.log('📁 Creating data directory:', dataDir);
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
    console.log('✅ Data directory created');
  } else {
    console.log('✅ Data directory already exists');
  }
  
  // Create subdirectories
  
  [uploadsDir, exportsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      console.log('📁 Created directory:', dir);
    }
  });
  
  // Test write access
  const testFile = path.join(dataDir, '.write-test');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log('✅ Data directory is writable');
  
} catch (error) {
  console.error('❌ Data directory setup failed:', error.message);
  console.error('📂 Working directory:', process.cwd());
  console.error('📂 Attempted data directory:', dataDir);
  console.error('📋 Directory details:');
  try {
    const stats = fs.statSync(path.dirname(dataDir));
    console.error('  Parent exists:', fs.existsSync(path.dirname(dataDir)));
    console.error('  Parent writable:', !!(stats.mode & parseInt('0200', 8)));
  } catch (e) {
    console.error('  Cannot access parent directory:', e.message);
  }
  process.exit(1);
}

// Initialize database with comprehensive error handling
console.log('📦 Initializing database...');
let db;
try {
  db = initializeDatabase();
  console.log('✅ Database initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize database:', error.message);
  console.error('📋 Database error details:');
  console.error('  Error type:', error.constructor.name);
  console.error('  Error stack:', error.stack);
  console.error('  Database path:', process.env.DB_PATH);
  console.error('  Data directory exists:', fs.existsSync(dataDir));
  process.exit(1);
}

// Initialize database manager
console.log('🔗 Connecting to database manager...');
let dbManager;
try {
  dbManager = new DatabaseManager();
  console.log('✅ Database manager connected');
} catch (error) {
  console.error('❌ Failed to connect database manager:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

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

// Health check endpoint for debugging
app.get('/health', (req, res) => {
  try {
    const dbTest = dbManager.getProject();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint for container inspection
app.get('/debug/filesystem', (req, res) => {
  try {
    const debugInfo = {
      cwd: process.cwd(),
      dataDir: process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : 'not set',
      files: {
        '/app': fs.existsSync('/app') ? fs.readdirSync('/app') : 'not found',
        '/app/data': fs.existsSync('/app/data') ? fs.readdirSync('/app/data') : 'not found',
        'current': fs.readdirSync('.').slice(0, 20)
      },
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DB_PATH: process.env.DB_PATH,
        PORT: process.env.PORT,
        DEBUG: process.env.DEBUG
      }
    };
    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes
console.log('🔧 Setting up API routes...');
try {
  app.use('/api/project', require('./routes/api/project')(dbManager));
  console.log('✅ Project API routes loaded');
} catch (error) {
  console.error('❌ Failed to load project routes:', error);
  process.exit(1);
}

try {
  app.use('/api/pages', require('./routes/api/pages')(dbManager));
  console.log('✅ Pages API routes loaded');
} catch (error) {
  console.error('❌ Failed to load pages routes:', error);
  process.exit(1);
}

try {
  app.use('/api/variables', require('./routes/api/variables')(dbManager));
  console.log('✅ Variables API routes loaded');
} catch (error) {
  console.error('❌ Failed to load variables routes:', error);
  process.exit(1);
}

// Public SSR Routes (for SEO)
app.get('/sitemap.xml', async (req, res) => {
  try {
    const publicPages = dbManager.getPublicPages();
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
      const pages = dbManager.getPublicPages();
      page = pages.find(p => p.isHomepage) || pages[0];
    } else {
      page = dbManager.getPageBySlug(slug);
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
    const variables = dbManager.getAllVariables();
    
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
  dbManager.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  dbManager.close();
  process.exit(0);
});

// Start server
console.log('🚀 Starting HTTP server...');
const server = app.listen(PORT, () => {
  console.log('✅ Server setup complete!');
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Builder available at http://localhost:${PORT}/builder`);
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🎯 Public pages served with SSR for SEO`);
  console.log(`📍 Database: ${process.env.DB_PATH || path.join(__dirname, 'data/frontbase.db')}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug info: http://localhost:${PORT}/debug/filesystem`);
  
  // Test database connection
  try {
    const testConnection = dbManager.getProject();
    console.log('✅ Database connection test passed');
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
  }
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});