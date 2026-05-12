// Mock react-native Platform before any modules are imported
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj) => obj.web ?? obj.default,
  },
  AsyncStorage: {},
}));
