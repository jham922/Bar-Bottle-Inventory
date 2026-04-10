import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { createInvite } from '@/lib/invites';
import { useAppUser } from '@/lib/useAppUser';
import { logActivity } from '@/lib/auth';

export default function InviteScreen() {
  const currentUser = useAppUser();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    if (!email.trim() || !currentUser) return;
    setLoading(true);
    try {
      const invite = await createInvite(currentUser.bar_id, currentUser.id, email.trim(), 'staff');
      await logActivity(currentUser.bar_id, currentUser.id, `Invited ${email.trim()}`, 'invite', invite.id);
      Alert.alert('Invite sent', `An invite link has been sent to ${email.trim()}. It expires in 48 hours.`);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite Staff</Text>
      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="staff@yourbar.com"
        placeholderTextColor="#666"
      />
      <Text style={styles.note}>They'll receive an invite link valid for 48 hours. They'll be added as Staff.</Text>
      <Pressable style={styles.button} onPress={handleInvite} disabled={loading || !email.trim()}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Send Invite</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 24, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { color: '#888', fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 12 },
  note: { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 24 },
  button: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
