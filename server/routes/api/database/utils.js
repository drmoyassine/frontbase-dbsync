const { decrypt } = require('../../../utils/encryption');

/**
 * Retrieves Supabase credentials and determines the appropriate auth key and method
 * based on the request mode (builder vs published) and user authentication.
 * 
 * @param {Object} db - DatabaseManager instance
 * @param {string} mode - 'builder' or 'published'
 * @param {Object} req - Express request object
 * @returns {Object} Context object containing project credentials and auth info, or throws an error.
 */
function getProjectContext(db, mode, req) {
    // Get PROJECT level Supabase connection including service key and anon key
    const project = db.db.prepare(
        'SELECT supabase_url, supabase_anon_key, supabase_service_key_encrypted FROM project WHERE id = ?'
    ).get('default');

    if (!project || !project.supabase_url) {
        throw { status: 400, message: 'Supabase credentials not found at PROJECT level' };
    }

    const anonKey = project.supabase_anon_key;
    const encryptedServiceKey = project.supabase_service_key_encrypted;

    let authKey;
    let authMethod;

    if (mode === 'builder') {
        // Builder mode: Use service key (admin access, bypasses RLS)
        if (!encryptedServiceKey) {
            throw { status: 400, message: 'Service key required for builder mode. Please reconnect to Supabase.' };
        }

        try {
            authKey = decrypt(JSON.parse(encryptedServiceKey));
            if (!authKey) {
                throw new Error('Failed to decrypt service key');
            }
            authMethod = 'service';
        } catch (decryptError) {
            console.error('Service key decryption failed:', decryptError);
            throw { status: 500, message: 'Failed to decrypt service key. Please reconnect to Supabase.' };
        }
    } else if (mode === 'published') {
        // Published mode: Use anon key or user JWT
        const userJWT = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;

        if (userJWT && userJWT !== anonKey) {
            // User is authenticated: Forward JWT for RLS
            authKey = userJWT;
            authMethod = 'user-jwt';
        } else {
            // Anonymous access: Use anon key
            authKey = anonKey;
            authMethod = 'anon';
        }
    } else {
        throw { status: 400, message: `Invalid mode: ${mode}. Expected 'builder' or 'published'.` };
    }

    return {
        supabaseUrl: project.supabase_url,
        anonKey,
        authKey,
        authMethod
    };
}

/**
 * Standard error handler for database routes
 */
function handleRouteError(res, error, context = '') {
    console.error(`${context} error:`, error);

    if (error.status && error.message) {
        return res.status(error.status).json({
            success: false,
            message: error.message
        });
    }

    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message || String(error)
    });
}

module.exports = {
    getProjectContext,
    handleRouteError
};
