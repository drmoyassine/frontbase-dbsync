
const express = require('express');
const router = express.Router();

function setupRoutes(app, dbManager) {
    console.log('🔧 Setting up API routes...');

    // Add API request debugging middleware
    router.use((req, res, next) => {
        console.log(`🔍 API Request: ${req.method} ${req.originalUrl}`);
        console.log(`🎯 Headers: ${JSON.stringify(req.headers, null, 2)}`);
        next();
    });

    // API root endpoint
    router.get('/', (req, res) => {
        console.log('🔍 API root endpoint hit');
        res.json({
            success: true,
            message: 'Frontbase API',
            version: '1.0.0',
            endpoints: {
                project: '/api/project',
                pages: '/api/pages',
                variables: '/api/variables',
                database: '/api/database'
            },
            documentation: 'Visit /builder for the visual page builder interface'
        });
    });

    // Auth routes
    try {
        const { router: authRouter } = require('./api/auth');
        router.use('/auth', authRouter);
        console.log('✅ Auth API routes loaded with universal session recovery');
    } catch (error) {
        console.error('❌ Failed to load auth routes:', error);
        process.exit(1);
    }

    // Project routes
    try {
        router.use('/project', require('./api/project')(dbManager));
        console.log('✅ Project API routes loaded');
    } catch (error) {
        console.error('❌ Failed to load project routes:', error);
        process.exit(1);
    }

    // Pages routes
    try {
        const { authenticateToken } = require('./api/auth');
        router.use('/pages', authenticateToken, require('./api/pages')(dbManager));
        console.log('✅ Pages API routes loaded with authentication');
    } catch (error) {
        console.error('❌ Failed to load pages routes:', error);
        process.exit(1);
    }

    // Variables routes
    try {
        router.use('/variables', require('./api/variables')(dbManager));
        console.log('✅ Variables API routes loaded');
    } catch (error) {
        console.error('❌ Failed to load variables routes:', error);
        process.exit(1);
    }

    // Database routes
    try {
        const databaseRouter = require('./api/database');
        router.use('/database', databaseRouter);
        console.log('✅ Database API routes loaded');
    } catch (error) {
        console.error('❌ Failed to load database routes:', error);
        process.exit(1);
    }

    // Auth Forms routes
    try {
        router.use('/auth-forms', require('./api/auth-forms')(dbManager));
        console.log('✅ Auth Forms API routes loaded');
    } catch (error) {
        console.error('❌ Failed to load auth-forms routes:', error);
        process.exit(1);
    }

    // Mount the router
    app.use('/api', router);

    // Embed routes (mounted at root level /embed, not /api/embed)
    try {
        app.use('/embed', require('../routes/embed')(dbManager));
        console.log('✅ Embed routes loaded');
    } catch (error) {
        console.error('❌ Failed to load embed routes:', error);
        process.exit(1);
    }
}

module.exports = setupRoutes;
