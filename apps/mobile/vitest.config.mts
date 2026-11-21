import { defineConfig } from 'vitest/config';

// Solo lógica pura (src/lib). Las pantallas se prueban en el dispositivo / E2E.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
