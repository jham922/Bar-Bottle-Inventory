import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getTeamMembers, updateUserRole, removeUser } from '@/lib/team';
import { useAppUser } from '@/lib/useAppUser';
import { AppUser, Role } from '@/types/database';

export default function TeamScreen() {
  const currentUser = useAppUser();
  const router = useRouter();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.bar_id) return;
    getTeamMembers(currentUser.bar_id)
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [currentUser]);

  function toggleRole(member: AppUser) {
    if (member.id === currentUser?.id) return;
    const newRole: Role = member.role === 'admin' ? 'staff' : 'admin';
    Alert.alert('Change role', `Set ${member.display_name} to ${newRole}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await updateUserRole(member.id, newRole);
          setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
        },
      },
    ]);
  }

  function handleRemove(member: AppUser) {
    if (member.id === currentUser?.id) return;
    Alert.alert('Remove member', `Remove ${member.display_name} from the team?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeUser(member.id);
          setMembers(prev => prev.filter(m => m.id !== member.id));
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fff" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <Pressable onPress={() => router.push('/(app)/settings/invite')} style={styles.inviteBtn}>
          <Text style={styles.inviteBtnText}>+ Invite</Text>
        </Pressable>
      </View>
      <FlatList
        data={members}
        keyExtractor={m => m.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>{item.display_name}</Text>
              <Pressable onPress={() => toggleRole(item)}>
                <Text style={styles.role}>{item.role === 'admin' ? 'Admin' : 'Staff'} — tap to toggle</Text>
              </Pressable>
            </View>
            {item.id !== currentUser?.id && (
              <Pressable onPress={() => handleRemove(item)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inviteBtn: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  inviteBtnText: { color: '#000', fontWeight: 'bold', fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  name: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  role: { color: '#888', fontSize: 12, marginTop: 2 },
  remove: { color: '#cc6666', fontSize: 13 },
});
