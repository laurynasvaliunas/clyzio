module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx)"],
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "store/**/*.{ts,tsx}",
    "contexts/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/__tests__/**",
  ],
};
