/**
 * Variable Store Test Script
 * 
 * Tests the 3-scope variable system:
 * - Page Variables (in-memory)
 * - Session Variables (localStorage sync)
 * - Cookies (persistent, server-readable)
 */

import { createVariableStore, createClientStore, VariableStore } from '../src/ssr/store.js';

function runTests() {
    console.log('='.repeat(60));
    console.log('Variable Store Tests - Sprint 3 Verification');
    console.log('='.repeat(60));

    let passed = 0;
    let failed = 0;

    function test(name: string, fn: () => boolean) {
        try {
            const result = fn();
            if (result) {
                console.log(`✅ PASS: ${name}`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${name}`);
                failed++;
            }
        } catch (e) {
            console.log(`❌ ERROR: ${name} - ${e}`);
            failed++;
        }
    }

    // =========================================================================
    // Test 1: Page Variables (in-memory)
    // =========================================================================
    console.log('\n--- Page Variables ---');

    const store1 = createVariableStore();

    test('Set and get page variable', () => {
        store1.setPageVariable('modalOpen', true);
        return store1.getPageVariable('modalOpen') === true;
    });

    test('Page variable isolation', () => {
        store1.setPageVariable('count', 42);
        const store2 = createVariableStore();
        return store2.getPageVariable('count') === undefined;
    });

    test('Get all page variables', () => {
        const all = store1.getPageVariables();
        return all.modalOpen === true && all.count === 42;
    });

    // =========================================================================
    // Test 2: Session Variables
    // =========================================================================
    console.log('\n--- Session Variables ---');

    test('Set and get session variable', () => {
        store1.setSessionVariable('userId', 'user-123');
        return store1.getSessionVariable('userId') === 'user-123';
    });

    test('Get all session variables', () => {
        store1.setSessionVariable('theme', 'dark');
        const all = store1.getSessionVariables();
        return all.userId === 'user-123' && all.theme === 'dark';
    });

    test('Clear session variables', () => {
        store1.clearSessionVariables();
        return store1.getSessionVariable('userId') === undefined;
    });

    // =========================================================================
    // Test 3: Cookies
    // =========================================================================
    console.log('\n--- Cookies ---');

    test('Set and get cookie', () => {
        store1.setCookie('auth_token', 'jwt-abc-123');
        return store1.getCookie('auth_token') === 'jwt-abc-123';
    });

    test('Get all cookies', () => {
        store1.setCookie('consent', 'accepted');
        const all = store1.getCookies();
        return all.auth_token === 'jwt-abc-123' && all.consent === 'accepted';
    });

    // =========================================================================
    // Test 4: Variable Resolution (prefix notation)
    // =========================================================================
    console.log('\n--- Variable Resolution ---');

    const resolveStore = createVariableStore({
        pageVariables: { loading: true, searchTerm: 'test' },
        sessionVariables: { username: 'john', role: 'admin' },
        cookies: { theme: 'dark', lang: 'en' }
    });

    test('Resolve page.* prefix', () => {
        return resolveStore.resolveVariable('page.loading') === true;
    });

    test('Resolve session.* prefix', () => {
        return resolveStore.resolveVariable('session.username') === 'john';
    });

    test('Resolve cookie.* prefix', () => {
        return resolveStore.resolveVariable('cookie.theme') === 'dark';
    });

    test('Auto-resolve (no prefix) - finds page var', () => {
        return resolveStore.resolveVariable('searchTerm') === 'test';
    });

    test('Auto-resolve (no prefix) - finds session var', () => {
        return resolveStore.resolveVariable('role') === 'admin';
    });

    test('Auto-resolve (no prefix) - finds cookie', () => {
        return resolveStore.resolveVariable('lang') === 'en';
    });

    test('Resolve undefined for unknown variable', () => {
        return resolveStore.resolveVariable('nonexistent') === undefined;
    });

    // =========================================================================
    // Test 5: Initial State Seeding
    // =========================================================================
    console.log('\n--- Initial State Seeding ---');

    const seededStore = createVariableStore({
        pageVariables: { step: 1 },
        sessionVariables: { cartItems: 5 },
        cookies: { session_id: 'sess-xyz' }
    });

    test('Initial page variables are seeded', () => {
        return seededStore.getPageVariable('step') === 1;
    });

    test('Initial session variables are seeded', () => {
        return seededStore.getSessionVariable('cartItems') === 5;
    });

    test('Initial cookies are seeded', () => {
        return seededStore.getCookie('session_id') === 'sess-xyz';
    });

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60));

    return failed === 0;
}

// Run the tests
const success = runTests();
process.exit(success ? 0 : 1);
