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
  
  // Test database integrity after startup
  console.log('🔍 Testing database integrity...');
  const testQuery = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'');
  const tables = testQuery.all();
  console.log('📋 Database tables found:', tables.map(t => t.name).join(', '));
  
  // Check critical tables exist
  const requiredTables = ['users', 'user_sessions', 'project', 'pages'];
  const missingTables = requiredTables.filter(table => 
    !tables.some(t => t.name === table)
  );
  
  if (missingTables.length > 0) {
    console.error('❌ Missing required tables:', missingTables);
    process.exit(1);
  }
  
  console.log('✅ Database integrity check passed');
  
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
  
  // Add session monitoring for debugging
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_SESSIONS) {
    const { monitorSessions } = require('./debug/session-monitor');
    monitorSessions(dbManager);
    console.log('🔍 Session monitoring enabled');
  }
  
  // Run comprehensive startup health check
  const { checkStartupHealth } = require('./debug/startup-check');
  const healthResult = checkStartupHealth(dbManager);
  
  if (!healthResult.success) {
    console.error('❌ Startup health check failed');
    if (healthResult.error) {
      console.error('Error:', healthResult.error);
    }
    // Don't exit - allow server to start with warnings
  }
  
} catch (error) {
  console.error('❌ Failed to connect database manager:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

// Ensure admin user exists with correct password hash
(async () => {
  try {
    const createAdminUser = require('./scripts/create-admin');
    await createAdminUser();
  } catch (error) {
    console.error('Failed to create admin user:', error);
  }
})();

// Auto-configure Supabase if environment variables are present
(async () => {
  try {
    const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (supabaseUrl && supabaseAnonKey && supabaseServiceKey) {
      console.log('🔗 Auto-configuring Supabase from environment variables...');
      
      const { encryptData } = require('./utils/encryption');
      
      // Get admin user ID
      const adminUser = dbManager.db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
        .get(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_EMAIL || 'admin@frontbase.dev');
      
      if (adminUser) {
        // Encrypt the service key
        const encryptedServiceKey = encryptData(supabaseServiceKey);
        
        // Store Supabase connection for admin user
        const stmt = dbManager.db.prepare(`
          INSERT OR REPLACE INTO user_database_connections 
          (user_id, database_type, connection_data) 
          VALUES (?, 'supabase', ?)
        `);
        
        const connectionData = JSON.stringify({
          url: supabaseUrl,
          anon_key: supabaseAnonKey,
          service_key: encryptedServiceKey
        });
        
        stmt.run(adminUser.id, connectionData);
        console.log('✅ Supabase auto-configured successfully');
      } else {
        console.warn('⚠️ Could not find admin user for Supabase auto-configuration');
      }
    } else {
      console.log('ℹ️ No Supabase environment variables found, using manual configuration');
    }
  } catch (error) {
    console.error('❌ Failed to auto-configure Supabase:', error.message);
  }
})();

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

// Cookie parser for session handling
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Enhanced health check endpoint for debugging
app.get('/health', (req, res) => {
  try {
    // Test basic database connectivity
    const dbTest = dbManager.getProject();
    
    // Test session functionality
    const sessionTest = dbManager.db.prepare('SELECT COUNT(*) as count FROM user_sessions').get();
    
    // Test critical tables
    const tableTest = dbManager.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('users', 'user_sessions', 'project_config', 'pages')
    `).all();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      port: PORT,
      uptime: process.uptime(),
      session_count: sessionTest.count,
      tables: tableTest.map(t => t.name),
      database_path: process.env.DB_PATH,
      startup_time: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      database_path: process.env.DB_PATH
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

// Extensive debugging endpoint for /builder asset issues
app.get('/debug/builder', (req, res) => {
  try {
    const publicDir = path.join(__dirname, 'public');
    const assetsDir = path.join(publicDir, 'assets');
    const indexPath = path.join(publicDir, 'index.html');
    
    const debugInfo = {
      paths: {
        __dirname: __dirname,
        publicDir: publicDir,
        assetsDir: assetsDir,
        indexPath: indexPath
      },
      exists: {
        publicDir: fs.existsSync(publicDir),
        assetsDir: fs.existsSync(assetsDir),
        indexHtml: fs.existsSync(indexPath)
      },
      contents: {},
      staticMiddleware: {
        builderRoute: '/builder',
        staticPath: path.join(__dirname, 'public')
      }
    };
    
    // Get public directory contents
    if (fs.existsSync(publicDir)) {
      debugInfo.contents.public = fs.readdirSync(publicDir);
      
      // Get assets directory contents if it exists
      if (fs.existsSync(assetsDir)) {
        debugInfo.contents.assets = fs.readdirSync(assetsDir);
      }
      
      // Read first few lines of index.html if it exists
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        debugInfo.indexHtml = {
          size: indexContent.length,
          firstLines: indexContent.split('\n').slice(0, 10),
          hasAssetLinks: indexContent.includes('/assets/')
        };
      }
    }
    
    // Show all middleware in order
    debugInfo.middleware = app._router.stack.map((layer, index) => ({
      index,
      path: layer.regexp.source,
      method: layer.route?.methods || 'middleware',
      name: layer.name || 'anonymous'
    }));
    
    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// API Routes
console.log('🔧 Setting up API routes...');

// API root endpoint - shows available endpoints
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Frontbase API',
    version: '1.0.0',
    endpoints: {
      project: '/api/project',
      pages: '/api/pages', 
      variables: '/api/variables'
    },
    documentation: 'Visit /builder for the visual page builder interface'
  });
});

// Auth routes (must be loaded first)
try {
  const { router: authRouter } = require('./routes/api/auth');
  const sessionRecovery = require('./middleware/session-recovery');
  
  // Add session recovery middleware
  app.use('/api/auth', sessionRecovery(dbManager));
  app.use('/api/auth', authRouter);
  console.log('✅ Auth API routes loaded with session recovery');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error);
  process.exit(1);
}

try {
  app.use('/api/project', require('./routes/api/project')(dbManager));
  console.log('✅ Project API routes loaded');
} catch (error) {
  console.error('❌ Failed to load project routes:', error);
  process.exit(1);
}

try {
  const { authenticateToken } = require('./routes/api/auth');
  app.use('/api/pages', authenticateToken, require('./routes/api/pages')(dbManager));
  console.log('✅ Pages API routes loaded with authentication');
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

try {
  app.use('/api/database', require('./routes/api/database'));
  console.log('✅ Database API routes loaded');
} catch (error) {
  console.error('❌ Failed to load database routes:', error);
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

// Root-level assets route to fix current build compatibility
console.log('🔧 Setting up root /assets route...');
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  setHeaders: (res, path) => {
    console.log(`📦 Serving root asset: ${path}`);
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Builder SPA routes with extensive debugging
console.log('🔧 Setting up /builder static middleware...');
const builderStaticPath = path.join(__dirname, 'public');
console.log('📂 Builder static path:', builderStaticPath);
console.log('📂 Builder static exists:', fs.existsSync(builderStaticPath));

// Add request logging middleware for all /builder requests
app.use('/builder', (req, res, next) => {
  console.log(`🔍 Builder request: ${req.method} ${req.originalUrl}`);
  console.log(`🎯 Requested file: ${req.path}`);
  
  // Check if this is an asset request
  if (req.path.startsWith('/assets/')) {
    const assetPath = path.join(builderStaticPath, req.path);
    console.log(`📁 Asset path: ${assetPath}`);
    console.log(`📁 Asset exists: ${fs.existsSync(assetPath)}`);
    
    // If asset doesn't exist, log what's in the assets directory
    if (!fs.existsSync(assetPath)) {
      const assetsDir = path.join(builderStaticPath, 'assets');
      if (fs.existsSync(assetsDir)) {
        console.log(`📂 Assets directory contents:`, fs.readdirSync(assetsDir));
      } else {
        console.log(`❌ Assets directory doesn't exist: ${assetsDir}`);
      }
    }
  }
  
  next();
});

// Static file serving for builder assets
app.use('/builder', express.static(builderStaticPath, {
  setHeaders: (res, path) => {
    console.log(`📦 Serving static file: ${path}`);
    // Ensure proper MIME types for assets
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Fallback for builder SPA routing
app.get('/builder/*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const publicDir = path.join(__dirname, 'public');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Provide detailed error information for debugging
    const publicExists = fs.existsSync(publicDir);
    const publicContents = publicExists ? fs.readdirSync(publicDir) : [];
    
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Builder Not Available</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-2xl mx-auto text-center bg-white rounded-lg shadow-lg p-8">
          <div class="text-red-500 mb-4">
            <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <h1 class="text-3xl font-bold text-gray-800 mb-4">Builder Not Available</h1>
          <p class="text-gray-600 mb-6">The frontend build files are missing. This usually happens when the Docker build process hasn't completed properly.</p>
          
          <div class="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <h3 class="font-semibold text-gray-800 mb-2">Debug Information:</h3>
            <ul class="text-sm text-gray-600 space-y-1">
              <li><strong>Public directory:</strong> ${publicExists ? 'exists' : 'missing'}</li>
              <li><strong>Index.html:</strong> ${fs.existsSync(indexPath) ? 'found' : 'missing'}</li>
              <li><strong>Public contents:</strong> ${publicContents.length > 0 ? publicContents.join(', ') : 'empty'}</li>
              <li><strong>Expected path:</strong> ${indexPath}</li>
            </ul>
          </div>
          
          <div class="space-y-3">
            <a href="/api" class="inline-block bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors">
              Check API Status
            </a>
            <a href="/" class="inline-block bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors ml-2">
              View Public Site
            </a>
          </div>
          
          <p class="text-sm text-gray-500 mt-6">
            If you're seeing this repeatedly, the Docker build may need to be rebuilt to include the frontend assets.
          </p>
        </div>
      </body>
      </html>
    `);
  }
});

// SPA fallback for frontend app routes (auth, dashboard, etc.)
app.get('/auth/*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send('Frontend not available');
  }
});

app.get('/dashboard/*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send('Frontend not available');
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

// Prevent multiple server instances
let serverRunning = false;

// Start server
console.log('🚀 Starting HTTP server...');
const server = app.listen(PORT, () => {
  if (serverRunning) {
    console.log('⚠️ Server already running, ignoring duplicate start');
    return;
  }
  
  serverRunning = true;
  console.log('✅ Server setup complete!');
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Builder available at http://localhost:${PORT}/builder`);
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🎯 Public pages served with SSR for SEO`);
  console.log(`📍 Database: ${process.env.DB_PATH || path.join(__dirname, 'data/frontbase.db')}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug info: http://localhost:${PORT}/debug/filesystem`);
  
  // Test database connection and default page
  try {
    const testConnection = dbManager.getProject();
    console.log('✅ Database connection test passed');
    
    // Verify default homepage exists
    const pages = dbManager.getPublicPages();
    if (pages.length > 0) {
      console.log('✅ Default homepage found:', pages.find(p => p.isHomepage)?.name || pages[0].name);
    } else {
      console.warn('⚠️ No pages found in database');
    }
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