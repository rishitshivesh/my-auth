const path = require('path');

const ui = path.resolve(__dirname, '../../packages/ui/src');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  passWithNoTests: true,
  transform: { '^.+\\.(t|j)sx?$': '<rootDir>/jest.transform.cjs' },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@repo/ui$': '<rootDir>/test-utils/ui-barrel.ts',
    '^@repo/ui/(.*)$': `${ui}/$1`,
    '^next/navigation$': '<rootDir>/test-utils/next-navigation.ts',
    '^next/link$': '<rootDir>/test-utils/next-link.tsx',
  },
};
