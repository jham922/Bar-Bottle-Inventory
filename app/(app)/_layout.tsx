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
      <Tabs.Screen name="settings/index" options={{ title: 'Settings', href: isAdmin ? undefined : null }} />

      <Tabs.Screen name="scan/single" options={{ href: null }} />
      <Tabs.Screen name="scan/shelf" options={{ href: null }} />
      <Tabs.Screen name="inventory/[id]" options={{ href: null }} />
      <Tabs.Screen name="recipes/index" options={{ href: null }} />
      <Tabs.Screen name="recipes/new" options={{ href: null }} />
      <Tabs.Screen name="recipes/[id]" options={{ href: null }} />
      <Tabs.Screen name="reports/index" options={{ href: null }} />
      <Tabs.Screen name="reports/consumption" options={{ href: null }} />
      <Tabs.Screen name="reports/variance" options={{ href: null }} />
      <Tabs.Screen name="alerts/index" options={{ href: null }} />
      <Tabs.Screen name="settings/team" options={{ href: null }} />
      <Tabs.Screen name="settings/invite" options={{ href: null }} />
      <Tabs.Screen name="settings/toast-upload" options={{ href: null }} />
    </Tabs>
  );
}
