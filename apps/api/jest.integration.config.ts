import type { Config } from 'jest';

const config: Config = {
  displayName: 'integration',
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.e2e-spec\\.ts$',
  roots: ['<rootDir>/test/integration'],
  coverageDirectory: './coverage/integration',
  // @nestjs/bullmq e @nestjs/bull-shared publicam so ESM ("type": "module")
  // — Jest, por padrao, nunca transforma node_modules, entao o `require()`
  // gerado pelo ts-jest (CommonJS) quebra ao carregar o `export` deles.
  // Aqui sao a excecao: passam pelo ts-jest tambem, que consegue reescrever
  // o `export`/`import` deles pra CommonJS.
  transformIgnorePatterns: ['node_modules/(?!(@nestjs/bullmq|@nestjs/bull-shared)/)'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { isolatedModules: true }],
  },
};

export default config;
