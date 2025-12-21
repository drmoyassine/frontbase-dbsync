const http = require('http');

function request(method, path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function verify() {
    try {
        console.log('1. Getting current project...');
        const getRes = await request('GET', '/api/project');
        if (!getRes.success) throw new Error('Failed to get project');
        console.log('Current usersConfig:', getRes.data.usersConfig ? 'Present' : 'Missing');

        const testConfig = {
            contactsTable: 'test_table',
            columnMapping: {
                authUserIdColumn: 'user_id',
                contactIdColumn: 'id',
                contactTypeColumn: 'type',
                permissionLevelColumn: 'role'
            },
            enabled: true
        };

        console.log('\n2. Updating usersConfig...');
        const updateRes = await request('PUT', '/api/project', {
            usersConfig: testConfig
        });

        if (!updateRes.success) {
            console.error('Update failed:', updateRes);
            return;
        }
        console.log('Update response usersConfig:', JSON.stringify(updateRes.data.usersConfig, null, 2));

        console.log('\n3. Verifying persistence (GET request)...');
        const verifyRes = await request('GET', '/api/project');

        const persistedConfig = verifyRes.data.usersConfig;
        console.log('Persisted usersConfig:', JSON.stringify(persistedConfig, null, 2));

        if (JSON.stringify(persistedConfig) === JSON.stringify(testConfig)) {
            console.log('\n✅ SUCCESS: Configuration persisted correctly!');
        } else {
            console.error('\n❌ FAILURE: Configuration did not persist correctly.');
            console.error('Expected:', testConfig);
            console.error('Received:', persistedConfig);
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

verify();
