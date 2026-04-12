module.exports = {
  setupFiles: [],
  testEnvironment: 'node',
  transform: {
    '^.+\.(js|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  globals: {
    __DEV__: true,
  },
  setupFilesAfterEnv: ['@testing-library/react-native/build/matchers/extend-expect'],
};
