/**
 * Vitest Configuration for PPP Tracking Tests
 * Configures test environment for integration and unit tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        '*.config.js',
        'coverage/',
        'src/tests/',
        'src/static/pixel.js' // Large legacy file, will be tested via modules
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
}); 