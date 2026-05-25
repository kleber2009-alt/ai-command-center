import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'broll',
          root: './packages/broll',
          environment: 'node',
        },
      },
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
        },
      },
    ],
  },
});
