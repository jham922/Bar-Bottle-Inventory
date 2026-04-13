import { Tabs } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';

export default function AppLayout() {
  const user = useAppUser();
  const isAdmin = user?.role === 'admin';

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' }, tabBarActiveTintColor: '#fff', tabBarInactiveTintColor: '#666' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="scan/index" options={{ title: 'Scan' }} />
      <Tabs.Screen name="inventory/index" options={{ title: 'Inventory' }} />
      <Tabs.Screen
        name="recipes/index"
        options={{ title: 'Recipes', href: isAdmin ? undefined : null }}
      />
      <Tabs.Screen
        name="reports/index"
        options={{ title: 'Reports', href: isAdmin ? undefined : null }}
      />
      <Tabs.Screen
        name="alerts/index"
        options={{ title: 'Alerts', href: isAdmin ? undefined : null }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{ title: 'Settings', href: isAdmin ? undefined : null }}
      />
    </Tabs>
  );
}
