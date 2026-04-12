import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function ScanModeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Bottles</Text>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/scan/single')}>
        <Text style={styles.cardTitle}>Single Bottle</Text>
        <Text style={styles.cardSubtitle}>Precision mode — center one bottle in the frame</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/scan/shelf')}>
        <Text style={styles.cardTitle}>Shelf Scan</Text>
        <Text style={styles.cardSubtitle}>Quick count — detect all bottles on a shelf at once</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardSubtitle: {
    color: '#999',
    fontSize: 14,
  },
});
