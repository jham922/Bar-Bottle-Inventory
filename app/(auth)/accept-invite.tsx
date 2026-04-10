import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { acceptInvite } from '@/lib/invites';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAccept() {
    if (!token || !displayName.trim() || !password) return;
    setLoading(true);
    try {
      await acceptInvite(token, displayName.trim(), password);
      Alert.alert('Welcome!', 'Your account has been created. You are now signed in.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Account</Text>
      <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#666" value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Choose a password" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable style={styles.button} onPress={handleAccept} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
