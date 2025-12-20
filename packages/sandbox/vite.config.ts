import { defineConfig } from 'vite';

export default defineConfig({
  // TODO: Configure for Node.js environment
  // This will simulate agent orchestration, not a browser app
  build: {
    target: 'node18',
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
  },
});

