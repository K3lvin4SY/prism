import { defineConfig } from 'vite';

// The status page is its own page for anyone, outside the panel's app: it bundles its own React
// and is published with the rest of dist/.
export default defineConfig({
    build: {
        outDir: 'dist/status',
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: 'src/status/main.tsx',
            output: { entryFileNames: 'status.js', assetFileNames: 'status[extname]', format: 'iife' },
        },
    },
});
