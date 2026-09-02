import type { Config } from 'jest';

const config: Config = {
  displayName: 'unit',
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.spec\\.ts$',
  roots: ['<rootDir>/src', '<rootDir>/test/unit'],
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage/unit',
};

export default config;
