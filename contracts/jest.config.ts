import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testMatch: ['**/tests/**/*.spec.ts'],
  testTimeout: 60_000,
  verbose: true,
};

export default config;
