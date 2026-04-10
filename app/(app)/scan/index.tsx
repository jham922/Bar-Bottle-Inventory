import { View, Text, StyleSheet } from 'react-native';
export default function ScanScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Scan — coming in Plan 2</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 16 },
});
