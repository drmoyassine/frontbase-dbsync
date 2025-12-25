#!/usr/bin/env node

/**
 * Comprehensive Environment Testing Script
 * Tests all three environments: Frontend, Express.js, and FastAPI
 */

import http from 'http';

class EnvironmentTester {
  constructor() {
    this.results = {
      frontend: { status: 'unknown', port: 5173, url: 'http://localhost:5173' },
      express: { status: 'unknown', port: 3001, url: 'http://localhost:3001' },
      fastapi: { status: 'unknown', port: 8000, url: 'http://localhost:8000' }
    };
  }

  async testEndpoint(name, port, path = '/') {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: port,
        path: path,
        method: 'GET',
        timeout: 5000
      };

      console.log(`🧪 Testing ${name} (${options.hostname}:${port}${path})...`);

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          this.results[name].status = '✅ Active';
          this.results[name].statusCode = res.statusCode;
          this.results[name].response = data.substring(0, 100);
          console.log(`✅ ${name}: Status ${res.statusCode}`);
          resolve();
        });
      });

      req.on('error', (error) => {
        this.results[name].status = '❌ Failed';
        this.results[name].error = error.message;
        console.log(`❌ ${name}: ${error.message}`);
        resolve();
      });

      req.on('timeout', () => {
        this.results[name].status = '⏰ Timeout';
        console.log(`⏰ ${name}: Request timeout`);
        req.destroy();
        resolve();
      });

      req.end();
    });
  }

  async runTests() {
    console.log('🚀 Starting Comprehensive Environment Testing...\n');

    // Test all environments
    await this.testEndpoint('express', 3001, '/health');
    await this.testEndpoint('fastapi', 8000, '/docs');
    await this.testEndpoint('frontend', 5173, '/');

    console.log('\n📊 Test Results Summary:');
    console.log('=' .repeat(50));

    Object.entries(this.results).forEach(([name, result]) => {
      console.log(`${name.padEnd(10)} | Port ${result.port} | ${result.status}`);
    });

    console.log('\n🔍 Detailed Results:');
    Object.entries(this.results).forEach(([name, result]) => {
      console.log(`\n${name.toUpperCase()}:`);
      console.log(`  Status: ${result.status}`);
      console.log(`  URL: ${result.url}`);
      if (result.statusCode) console.log(`  Status Code: ${result.statusCode}`);
      if (result.response) console.log(`  Response Preview: ${result.response}...`);
      if (result.error) console.log(`  Error: ${result.error}`);
    });

    // Generate recommendations
    console.log('\n💡 Recommendations:');
    const activeCount = Object.values(this.results).filter(r => r.status === '✅ Active').length;
    
    if (activeCount === 3) {
      console.log('🎉 All environments are running! Ready for full integration testing.');
      console.log('🌐 Frontend: http://localhost:5173');
      console.log('⚡ Express.js API: http://localhost:3001');
      console.log('🐍 FastAPI Docs: http://localhost:8000/docs');
    } else if (activeCount >= 2) {
      console.log('⚠️  Some environments are down. Check failed services above.');
    } else {
      console.log('🚨 Most environments are down. Please start the missing services.');
    }

    return this.results;
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new EnvironmentTester();
  tester.runTests().then(() => {
    console.log('\n✅ Environment testing completed!');
  }).catch(error => {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  });
}

export default EnvironmentTester;