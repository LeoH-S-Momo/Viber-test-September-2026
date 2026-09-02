import type { Config } from 'jest';

const config: Config = {
  displayName: 'integration',
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.e2e-spec\\.ts$',
  roots: ['<rootDir>/test/integration'],
  coverageDirectory: './coverage/integration',
};

export default config;
