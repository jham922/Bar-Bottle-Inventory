import { Tabs } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';

export default function AppLayout() {
  const user = useAppUser();
  const isAdmin = user?.role === 'admin';

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333', height: 72 },
      tabBarActiveTintColor: '#fff',
      tabBarInactiveTintColor: '#666',
      tabBarLabelStyle: { marginBottom: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="scan/index" options={{ title: 'Scan' }} />
      <Tabs.Screen name="inventory/index" options={{ title: 'Inventory' }} />
      <Tabs.Screen
        name="settings/index"
        options={{ title: 'Settings', href: isAdmin ? undefined : null }}
      />
    </Tabs>
  );
}
