/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/tests/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'packages/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', 'dist'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@frontbase/types': path.resolve(__dirname, './packages/types/src/index.ts'),
            '@frontbase/datatable': path.resolve(__dirname, './packages/datatable/src/index.ts'),
            '@frontbase/liquid-core': path.resolve(__dirname, './packages/liquid-core/src/index.ts'),
        },
    },
});
