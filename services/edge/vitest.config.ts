import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/**/*.test.ts'],
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Mirror the build-time aliases from vite.config.ts so the SSR
            // layer (which imports @frontbase/liquid-core) is testable.
            '@frontbase/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
            '@frontbase/datatable': path.resolve(__dirname, '../../packages/datatable/src/index.ts'),
            '@frontbase/infolist': path.resolve(__dirname, '../../packages/infolist/src/index.ts'),
            '@frontbase/form': path.resolve(__dirname, '../../packages/form/src/index.ts'),
            '@frontbase/chart': path.resolve(__dirname, '../../packages/chart/src/index.ts'),
            '@frontbase/kpicard': path.resolve(__dirname, '../../packages/kpicard/src/index.ts'),
            '@frontbase/grid': path.resolve(__dirname, '../../packages/grid/src/index.ts'),
            '@frontbase/liquid-core': path.resolve(__dirname, '../../packages/liquid-core/src/index.ts'),
        },
    },
});
