import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function ReportsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports</Text>

      <Pressable style={styles.card} onPress={() => router.push('/(app)/reports/consumption')}>
        <Text style={styles.cardTitle}>Consumption Report</Text>
        <Text style={styles.cardDesc}>How much of each spirit was actually used over a date range, based on scan data.</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => router.push('/(app)/reports/variance')}>
        <Text style={styles.cardTitle}>Variance Report</Text>
        <Text style={styles.cardDesc}>Compare theoretical usage (from Toast sales + recipes) against actual consumption to find discrepancies.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 16, marginBottom: 12 },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 6 },
  cardDesc: { color: '#888', fontSize: 13, lineHeight: 18 },
});
