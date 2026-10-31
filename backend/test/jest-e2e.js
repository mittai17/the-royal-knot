module.exports = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: __dirname + '/../tsconfig.json', diagnostics: false }] },
  testEnvironment: 'node',
  testTimeout: 60000,
};
