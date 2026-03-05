/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/tests/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', 'dist'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@frontbase/datatable': path.resolve(__dirname, './packages/datatable/src/index.ts'),
        },
    },
});
