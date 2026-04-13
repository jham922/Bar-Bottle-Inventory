import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from '@/lib/auth';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Pressable style={styles.row} onPress={() => router.push('/(app)/settings/team')}>
        <Text style={styles.rowText}>Team Management</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/(app)/settings/toast-upload')}>
        <Text style={styles.rowText}>Toast Product Mix Upload</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={signOut}>
        <Text style={[styles.rowText, { color: '#cc6666' }]}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', padding: 20 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  rowText: { color: '#fff', fontSize: 16 },
});
