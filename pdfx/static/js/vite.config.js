import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        'pdfx-xblock': resolve(__dirname, 'src/PdfxXBlock.js'),
      },
      external: ['pdfjs-dist', 'fabric'],
      output: {
        format: 'iife',  // Use IIFE format for better compatibility
        name: 'PdfxXBlock',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
        inlineDynamicImports: true,  // Enable to prevent code splitting which is incompatible with IIFE
        globals: {
          'pdfjs-dist': 'pdfjsLib',
          'fabric': 'fabric'
        }
      }
    },
    sourcemap: true,
    minify: false,
    outDir: './build/',
    emptyOutDir: false,
    preserveEntrySignatures: 'strict',
    write: true,
    copyPublicDir: false,
    manifest: false
  },
  server: {
    port: 3000,
    open: true
  }
});