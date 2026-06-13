/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  // Run jest.setup.js BEFORE any test module is imported — locks env vars
  setupFiles: ["./jest.setup.js"],
  // Suppress noUnusedLocals/noUnusedParameters from main tsconfig in test files
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        diagnostics: {
          ignoreDiagnostics: [6133, 6196],
        },
      },
    ],
  },
};