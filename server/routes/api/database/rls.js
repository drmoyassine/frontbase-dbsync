const express = require('express');
const { authenticateToken } = require('../auth');
const DatabaseManager = require('../../../utils/db');
const { getProjectContext, handleRouteError } = require('./utils');

const router = express.Router();
const db = new DatabaseManager();

/**
 * Helper to call Supabase RPC functions for RLS management
 */
async function callRLSFunction(functionName, params, context) {
    const url = `${context.supabaseUrl}/rest/v1/rpc/${functionName}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': context.authKey,
            'Authorization': `Bearer ${context.authKey}`
        },
        body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
        throw {
            status: response.status,
            message: data.message || data.error || 'RPC call failed'
        };
    }

    return data;
}

// ============================================================
// RLS POLICY ROUTES
// ============================================================

/**
 * GET /api/database/rls/policies
 * List all RLS policies in the public schema
 */
router.get('/rls/policies', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const schemaName = req.query.schema || 'public';

        const policies = await callRLSFunction('frontbase_list_rls_policies', {
            p_schema_name: schemaName
        }, context);

        res.json({
            success: true,
            data: policies || []
        });
    } catch (error) {
        handleRouteError(res, error, 'List RLS policies');
    }
});

/**
 * GET /api/database/rls/tables
 * Get RLS status for all tables
 */
router.get('/rls/tables', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const schemaName = req.query.schema || 'public';

        const tables = await callRLSFunction('frontbase_get_rls_status', {
            p_schema_name: schemaName
        }, context);

        res.json({
            success: true,
            data: tables || []
        });
    } catch (error) {
        handleRouteError(res, error, 'Get RLS table status');
    }
});

/**
 * GET /api/database/rls/policies/:tableName
 * Get policies for a specific table
 */
router.get('/rls/policies/:tableName', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const { tableName } = req.params;
        const schemaName = req.query.schema || 'public';

        // Get all policies and filter by table name
        const allPolicies = await callRLSFunction('frontbase_list_rls_policies', {
            p_schema_name: schemaName
        }, context);

        const tablePolicies = (allPolicies || []).filter(
            p => p.table_name === tableName
        );

        res.json({
            success: true,
            data: tablePolicies
        });
    } catch (error) {
        handleRouteError(res, error, 'Get table RLS policies');
    }
});

/**
 * POST /api/database/rls/policies
 * Create a new RLS policy
 */
router.post('/rls/policies', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const {
            tableName,
            policyName,
            operation,
            usingExpression,
            checkExpression,
            roles = ['authenticated'],
            permissive = true
        } = req.body;

        if (!tableName || !policyName || !operation) {
            return res.status(400).json({
                success: false,
                message: 'tableName, policyName, and operation are required'
            });
        }

        const result = await callRLSFunction('frontbase_create_rls_policy', {
            p_table_name: tableName,
            p_policy_name: policyName,
            p_operation: operation.toUpperCase(),
            p_using_expr: usingExpression || null,
            p_check_expr: checkExpression || null,
            p_roles: Array.isArray(roles) ? roles : [roles],
            p_permissive: permissive
        }, context);

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                sql: result.sql
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error,
                sql: result.sql
            });
        }
    } catch (error) {
        handleRouteError(res, error, 'Create RLS policy');
    }
});

/**
 * PUT /api/database/rls/policies/:tableName/:policyName
 * Update an existing RLS policy (drop + create)
 */
router.put('/rls/policies/:tableName/:policyName', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const { tableName, policyName } = req.params;
        const {
            newPolicyName,
            operation,
            usingExpression,
            checkExpression,
            roles = ['authenticated'],
            permissive = true
        } = req.body;

        if (!operation) {
            return res.status(400).json({
                success: false,
                message: 'operation is required'
            });
        }

        const result = await callRLSFunction('frontbase_update_rls_policy', {
            p_table_name: tableName,
            p_old_policy_name: policyName,
            p_new_policy_name: newPolicyName || policyName,
            p_operation: operation.toUpperCase(),
            p_using_expr: usingExpression || null,
            p_check_expr: checkExpression || null,
            p_roles: Array.isArray(roles) ? roles : [roles],
            p_permissive: permissive
        }, context);

        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error,
                step: result.step
            });
        }
    } catch (error) {
        handleRouteError(res, error, 'Update RLS policy');
    }
});

/**
 * DELETE /api/database/rls/policies/:tableName/:policyName
 * Delete an RLS policy
 */
router.delete('/rls/policies/:tableName/:policyName', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const { tableName, policyName } = req.params;

        const result = await callRLSFunction('frontbase_drop_rls_policy', {
            p_table_name: tableName,
            p_policy_name: policyName
        }, context);

        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        handleRouteError(res, error, 'Delete RLS policy');
    }
});

/**
 * POST /api/database/rls/tables/:tableName/toggle
 * Enable or disable RLS on a table
 */
router.post('/rls/tables/:tableName/toggle', authenticateToken, async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const { tableName } = req.params;
        const { enable } = req.body;

        if (typeof enable !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'enable (boolean) is required'
            });
        }

        const result = await callRLSFunction('frontbase_toggle_table_rls', {
            p_table_name: tableName,
            p_enable: enable
        }, context);

        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        handleRouteError(res, error, 'Toggle table RLS');
    }
});

module.exports = router;
