import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // `@/` resuelve igual que en `tsconfig.json`. Vitest no lee los `paths` de
  // TypeScript por su cuenta.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // `node`, no `jsdom`: lo que se prueba aquí son funciones PURAS —la lógica
    // de dinero y de fechas—, no componentes. El día que haya pruebas de
    // componentes irán en su propio proyecto con `environment: 'jsdom'`.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vercel corre en UTC. Fijar la zona del proceso a otra cosa es la forma de
    // asegurar que `lib/data/tz.ts` de verdad calcula en calendario de México y
    // no se está apoyando por casualidad en la zona de quien corre las pruebas.
    // Con UTC, media docena de estas pruebas pasarían aunque el módulo
    // estuviera mal.
    env: { TZ: 'Europe/Madrid' },
  },
});
