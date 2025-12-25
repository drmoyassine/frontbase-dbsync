const express = require('express');
const { z } = require('zod');
const DatabaseManager = require('../../../utils/db');
const { getProjectContext, handleRouteError } = require('./utils');
const {
    validateParams,
    validateBody,
    validateQuery,
    validateAll
} = require('../../../validation/middleware');
const {
    CreateRLSPolicySchema,
    UpdateRLSPolicySchema,
    ToggleRLSSchema,
    RLSMetadataSchema,
    VerifyRLSSchema
} = require('../../../validation/schemas');

const router = express.Router();
const db = new DatabaseManager();

// No-op middleware for authenticateToken since auth is removed
const authenticateToken = (req, res, next) => next();

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
router.get('/rls/policies', authenticateToken, validateQuery(z.object({
    schema: z.string().optional().default('public')
})), async (req, res) => {
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
router.get('/rls/tables', authenticateToken, validateQuery(z.object({
    schema: z.string().optional().default('public')
})), async (req, res) => {
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
router.get('/rls/policies/:tableName', authenticateToken, validateAll({
    params: z.object({
        tableName: z.string().min(1, 'Table name is required')
    }),
    query: z.object({
        schema: z.string().optional().default('public')
    })
}), async (req, res) => {
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
router.post('/rls/policies', authenticateToken, validateBody(CreateRLSPolicySchema), async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const {
            tableName,
            policyName,
            operation,
            usingExpression,
            checkExpression,
            roles = ['authenticated'],
            permissive = true,
            propagateTo = []
        } = req.body;

        // 1. Create Base Policy
        const result = await callRLSFunction('frontbase_create_rls_policy', {
            p_table_name: tableName,
            p_policy_name: policyName,
            p_operation: operation.toUpperCase(),
            p_using_expr: usingExpression || null,
            p_check_expr: checkExpression || null,
            p_roles: Array.isArray(roles) ? roles : [roles],
            p_permissive: permissive
        }, context);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error,
                sql: result.sql
            });
        }

        // 2. Handle Propagation (Create Derived Policies)
        const propagatedPolicies = [];
        if (Array.isArray(propagateTo) && propagateTo.length > 0) {
            console.log(`[RLS] Propagating policy ${policyName} to ${propagateTo.length} tables`);

            for (const target of propagateTo) {
                try {
                    const derivedPolicyName = `${policyName}_on_${target.tableName}`;

                    const derivedUsing = usingExpression
                        ? `${target.fkColumn} IN (SELECT ${target.fkReferencedColumn} FROM ${tableName} WHERE ${usingExpression})`
                        : null;

                    const derivedCheck = checkExpression
                        ? `${target.fkColumn} IN (SELECT ${target.fkReferencedColumn} FROM ${tableName} WHERE ${checkExpression})`
                        : null;

                    await callRLSFunction('frontbase_create_rls_policy', {
                        p_table_name: target.tableName,
                        p_policy_name: derivedPolicyName,
                        p_operation: operation.toUpperCase(),
                        p_using_expr: derivedUsing,
                        p_check_expr: derivedCheck,
                        p_roles: Array.isArray(roles) ? roles : [roles],
                        p_permissive: permissive
                    }, context);

                    propagatedPolicies.push(target.tableName);

                } catch (err) {
                    console.error(`[RLS] Failed to propagate to ${target.tableName}:`, err);
                }
            }
        }

        res.json({
            success: true,
            message: propagatedPolicies.length > 0
                ? `${result.message} (Propagated to ${propagatedPolicies.join(', ')})`
                : result.message,
            sql: result.sql,
            propagatedTo: propagatedPolicies
        });

    } catch (error) {
        handleRouteError(res, error, 'Create RLS policy');
    }
});

/**
 * PUT /api/database/rls/policies/:tableName/:policyName
 * Update an existing RLS policy (drop + create)
 */
router.put('/rls/policies/:tableName/:policyName', authenticateToken, validateAll({
    params: z.object({
        tableName: z.string().min(1, 'Table name is required'),
        policyName: z.string().min(1, 'Policy name is required')
    }),
    body: UpdateRLSPolicySchema
}), async (req, res) => {
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
router.delete('/rls/policies/:tableName/:policyName', authenticateToken, validateParams(z.object({
    tableName: z.string().min(1, 'Table name is required'),
    policyName: z.string().min(1, 'Policy name is required')
})), async (req, res) => {
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
router.post('/rls/tables/:tableName/toggle', authenticateToken, validateAll({
    params: z.object({
        tableName: z.string().min(1, 'Table name is required')
    }),
    body: ToggleRLSSchema
}), async (req, res) => {
    try {
        const context = getProjectContext(db, 'builder', req);
        const { tableName } = req.params;
        const { enable } = req.body;

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

// ============================================================
// RLS POLICY METADATA ROUTES (Local SQLite storage)
// ============================================================

/**
 * Generate a simple hash of an SQL expression for comparison
 */
function generateSQLHash(sql) {
    if (!sql) return '';
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

/**
 * GET /api/database/rls/metadata/:tableName/:policyName
 * Get stored metadata for a policy 
 */
router.get('/rls/metadata/:tableName/:policyName', authenticateToken, validateParams(z.object({
    tableName: z.string().min(1, 'Table name is required'),
    policyName: z.string().min(1, 'Policy name is required')
})), (req, res) => {
    try {
        const { tableName, policyName } = req.params;
        const metadata = db.getRLSMetadata(tableName, policyName);

        res.json({
            success: true,
            data: metadata
        });
    } catch (error) {
        handleRouteError(res, error, 'Get RLS metadata');
    }
});

/**
 * POST /api/database/rls/metadata
 * Save metadata when creating a policy via Frontbase
 */
router.post('/rls/metadata', authenticateToken, validateBody(RLSMetadataSchema), (req, res) => {
    try {
        const { tableName, policyName, formData, generatedUsing, generatedCheck } = req.body;

        const sqlHash = generateSQLHash(generatedUsing);
        const metadata = db.createRLSMetadata(
            tableName,
            policyName,
            formData,
            generatedUsing,
            generatedCheck || null,
            sqlHash
        );

        res.json({
            success: true,
            data: metadata
        });
    } catch (error) {
        handleRouteError(res, error, 'Save RLS metadata');
    }
});

/**
 * PUT /api/database/rls/metadata/:tableName/:policyName
 * Update metadata 
 */
router.put('/rls/metadata/:tableName/:policyName', authenticateToken, validateAll({
    params: z.object({
        tableName: z.string().min(1, 'Table name is required'),
        policyName: z.string().min(1, 'Policy name is required')
    }),
    body: RLSMetadataSchema.partial().extend({
        newPolicyName: z.string().optional(),
        formData: z.record(z.any(), 'Form data is required')
    })
}), (req, res) => {
    try {
        const { tableName, policyName } = req.params;
        const { newPolicyName, formData, generatedUsing, generatedCheck } = req.body;

        const sqlHash = generateSQLHash(generatedUsing);
        const metadata = db.updateRLSMetadata(
            tableName,
            policyName,
            newPolicyName || policyName,
            formData,
            generatedUsing,
            generatedCheck || null,
            sqlHash
        );

        res.json({
            success: true,
            data: metadata
        });
    } catch (error) {
        handleRouteError(res, error, 'Update RLS metadata');
    }
});

/**
 * DELETE /api/database/rls/metadata/:tableName/:policyName
 * Delete metadata 
 */
router.delete('/rls/metadata/:tableName/:policyName', authenticateToken, validateParams(z.object({
    tableName: z.string().min(1, 'Table name is required'),
    policyName: z.string().min(1, 'Policy name is required')
})), (req, res) => {
    try {
        const { tableName, policyName } = req.params;
        db.deleteRLSMetadata(tableName, policyName);

        res.json({
            success: true,
            message: 'Metadata deleted'
        });
    } catch (error) {
        handleRouteError(res, error, 'Delete RLS metadata');
    }
});

/**
 * POST /api/database/rls/metadata/verify
 * Verify if a policy's current USING expression matches the stored hash
 */
router.post('/rls/metadata/verify', authenticateToken, validateBody(VerifyRLSSchema), (req, res) => {
    try {
        const { tableName, policyName, currentUsing } = req.body;

        const metadata = db.getRLSMetadata(tableName, policyName);

        if (!metadata) {
            return res.json({
                success: true,
                data: {
                    hasMetadata: false,
                    isVerified: false,
                    reason: 'no_metadata'
                }
            });
        }

        const currentHash = generateSQLHash(currentUsing);
        const isVerified = currentHash === metadata.sql_hash;

        res.json({
            success: true,
            data: {
                hasMetadata: true,
                isVerified,
                reason: isVerified ? 'match' : 'modified_externally',
                formData: isVerified ? metadata.formData : null
            }
        });
    } catch (error) {
        handleRouteError(res, error, 'Verify RLS metadata');
    }
});

module.exports = router;
