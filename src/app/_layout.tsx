import React from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FleetProvider } from '../mobile/FleetProvider';
import { Icon, color, type IconName } from '../components/ui';

const icons: Record<string, IconName> = {
  index: 'phone-portrait-outline',
  policy: 'shield-checkmark-outline',
  activity: 'pulse-outline',
  connection: 'link-outline',
};
export default function Layout() {
  const insets = useSafeAreaInsets();
  return (
    <FleetProvider>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: color.teal,
          tabBarInactiveTintColor: color.muted,
          tabBarStyle: {
            backgroundColor: color.paper,
            borderTopColor: color.line,
            paddingTop: 7,
            paddingBottom: Math.max(8, insets.bottom),
            height: 62 + Math.max(8, insets.bottom),
          },
          tabBarLabelStyle: { fontSize: 11, marginTop: 3 },
          tabBarIcon: ({ color: tint }) => (
            <Icon name={icons[route.name] ?? 'ellipse-outline'} tint={tint} size={22} />
          ),
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Device' }} />
        <Tabs.Screen name="policy" options={{ title: 'Policy' }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen name="connection" options={{ title: 'Connection' }} />
      </Tabs>
    </FleetProvider>
  );
}
