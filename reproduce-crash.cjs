
const fs = require('fs');
const path = require('path');
const DatabaseManager = require('./server/utils/db');

// Setup temp DB
const dbPath = path.join(__dirname, `temp_crash_test_${Date.now()}.db`);
process.env.DB_PATH = dbPath;

// Initialize
const { initializeDatabase } = require('./server/database/init');
const initDb = initializeDatabase();
initDb.close();

const db = new DatabaseManager();

try {
    console.log('Creating test page...');
    const page = db.createPage({
        id: 'test-page-1',
        name: 'Test Page',
        slug: 'test-page',
        layoutData: { content: [] }
    });
    console.log('Page created:', page.id);

    // Test Case 1: Standard update (simulating sanitized frontend)
    console.log('\n--- Test Case 1: Standard Update ---');
    const updates1 = {
        name: 'Updated Name 1',
        layoutData: { content: [1, 2, 3] }
        // No deletedAt
    };
    const res1 = db.updatePage('test-page-1', updates1);
    console.log('Result 1:', res1 ? 'Success' : 'Failed');

    // Test Case 2: Update with null deletedAt (simulating old frontend)
    console.log('\n--- Test Case 2: Update with deletedAt: null ---');
    const updates2 = {
        name: 'Updated Name 2',
        layoutData: { content: [1, 2, 3, 4] },
        deletedAt: null
    };
    const res2 = db.updatePage('test-page-1', updates2);
    console.log('Result 2:', res2 ? 'Success' : 'Failed');

    // Test Case 3: Snake case layout_data
    console.log('\n--- Test Case 3: Snake case layout_data ---');
    const updates3 = {
        name: 'Updated Name 3',
        layout_data: { content: [1, 2] }
    };
    const res3 = db.updatePage('test-page-1', updates3);
    console.log('Result 3:', res3 ? 'Success' : 'Failed');

    console.log('\n✅ All tests completed without crash');

} catch (error) {
    console.error('\n❌ CRASH DETECTED:', error);
    process.exit(1);
} finally {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}
