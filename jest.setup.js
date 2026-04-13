// Provide react-native Platform.OS so modules that reference it at load time don't crash
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  select: (obj) => obj.ios ?? obj.default,
  isTesting: true,
}));
