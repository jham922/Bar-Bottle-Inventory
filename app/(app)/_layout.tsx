import { Tabs } from 'expo-router';
import { useAppUser } from '@/lib/useAppUser';

const hide = { tabBarButton: () => null, href: null } as const;

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

      {/* Hidden routes — accessible via navigation but not shown as tabs */}
      <Tabs.Screen name="scan/single" options={hide} />
      <Tabs.Screen name="scan/shelf" options={hide} />
      <Tabs.Screen name="inventory/[id]" options={hide} />
      <Tabs.Screen name="recipes/index" options={hide} />
      <Tabs.Screen name="recipes/new" options={hide} />
      <Tabs.Screen name="recipes/[id]" options={hide} />
      <Tabs.Screen name="reports/index" options={hide} />
      <Tabs.Screen name="reports/consumption" options={hide} />
      <Tabs.Screen name="reports/variance" options={hide} />
      <Tabs.Screen name="alerts/index" options={hide} />
      <Tabs.Screen name="settings/team" options={hide} />
      <Tabs.Screen name="settings/invite" options={hide} />
      <Tabs.Screen name="settings/toast-upload" options={hide} />
    </Tabs>
  );
}
