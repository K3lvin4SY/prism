import { defineConfig } from 'vite';

// The guest page is its own page for people without an account, outside the panel's app: it
// bundles its own React and is published with the rest of dist/.
export default defineConfig({
    build: {
        outDir: 'dist/share',
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: 'src/share/main.tsx',
            output: { entryFileNames: 'share.js', assetFileNames: 'share[extname]', format: 'iife' },
        },
    },
});
