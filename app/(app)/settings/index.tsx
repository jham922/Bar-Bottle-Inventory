import { View, Text, StyleSheet } from 'react-native';
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Settings</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 16 },
});
