import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
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
