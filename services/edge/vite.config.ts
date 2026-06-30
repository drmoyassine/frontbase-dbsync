import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@frontbase/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
            '@frontbase/datatable': path.resolve(__dirname, '../../packages/datatable/src/index.ts'),
            '@frontbase/infolist': path.resolve(__dirname, '../../packages/infolist/src/index.ts'),
            '@frontbase/form': path.resolve(__dirname, '../../packages/form/src/index.ts'),
            '@frontbase/chart': path.resolve(__dirname, '../../packages/chart/src/index.ts'),
            '@frontbase/kpicard': path.resolve(__dirname, '../../packages/kpicard/src/index.ts'),
            '@frontbase/grid': path.resolve(__dirname, '../../packages/grid/src/index.ts'),
            '@frontbase/liquid-core': path.resolve(__dirname, '../../packages/liquid-core/src/index.ts'),
        },
        dedupe: [
            'react',
            'react-dom',
            '@tanstack/react-query',
            'clsx',
            'tailwind-merge',
            'lucide-react',
            'recharts',
            '@tanstack/react-table',
            '@radix-ui/react-icons',
            'liquidjs'
        ],
    },
    build: {
        outDir: 'public/react',
        emptyOutDir: true,
        rollupOptions: {
            input: 'src/client/entry.tsx',
            output: {
                entryFileNames: 'hydrate.js',
                chunkFileNames: '[name]-[hash].js',
                assetFileNames: '[name]-[hash][extname]',
            },
        },
    },
});
