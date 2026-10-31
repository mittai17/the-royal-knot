module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: __dirname + '/tsconfig.json', diagnostics: false }] },
  testEnvironment: 'node',
};
