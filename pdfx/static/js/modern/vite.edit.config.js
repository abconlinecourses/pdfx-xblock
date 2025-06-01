import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'pdfx-edit': resolve(__dirname, 'src/studio/StudioEditor.js')
      },
      output: {
        format: 'iife',  // Use IIFE format for better compatibility
        name: 'PdfxXBlockEdit',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
        inlineDynamicImports: true  // Bundle everything into a single file
      }
    },
    sourcemap: true,
    minify: 'terser',
    outDir: '../pdfx-js/'
  }
});