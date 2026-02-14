const config = {
  rootDir: '.',
  testMatch: ['<rootDir>/test/v2/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
};

export default config;
