import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { assessPolicy } from '../../shared/contracts';
import { useFleet } from '../mobile/FleetProvider';
import {
  Button,
  Icon,
  Note,
  Row,
  Screen,
  Section,
  Tag,
  color,
  styles as ui,
} from '../components/ui';

export default function DeviceScreen() {
  const fleet = useFleet(),
    snapshot = fleet.cache.snapshot;
  if (!snapshot)
    return (
      <Screen title="Device" subtitle="Your lab companion">
        <Note>No cached inventory yet. Connect to the server and sync.</Note>
      </Screen>
    );
  const { device, policy } = snapshot;
  const rules = assessPolicy(device.inventory, policy),
    failures = rules.filter((rule) => rule.status === 'fail').length;
  const pending = snapshot.commands.filter((command) =>
    ['queued', 'delivered'].includes(command.status),
  ).length;
  return (
    <Screen title="Your device" subtitle="Inventory, baseline and connection status">
      <View style={local.device}>
        <View style={local.deviceIcon}>
          <Icon
            name={
              device.inventory.platform === 'ios'
                ? 'logo-apple'
                : device.inventory.platform === 'android'
                  ? 'logo-android'
                  : 'desktop-outline'
            }
            size={44}
            tint={color.paper}
          />
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <Text style={local.name}>{device.name}</Text>
          <Text style={ui.body}>{device.inventory.model}</Text>
          <Tag label={fleet.session ? 'Enrolled' : 'Sample device'} tone="good" />
        </View>
      </View>
      <View style={local.metrics}>
        <View style={{ flex: 1 }}>
          <Text style={local.metric}>
            {failures
              ? `${failures} issue${failures > 1 ? 's' : ''}`
              : rules.some((rule) => rule.status === 'unknown')
                ? 'Not assessed'
                : 'Meets baseline'}
          </Text>
          <Text style={ui.small}>Reported compliance</Text>
        </View>
        <View style={local.separator} />
        <View style={{ flex: 1 }}>
          <Text style={local.metric}>{pending}</Text>
          <Text style={ui.small}>Pending commands</Text>
        </View>
      </View>
      {fleet.cache.lastMessage && <Note>{fleet.cache.lastMessage}</Note>}
      <Section
        title="Device inventory"
        trailing={<Icon name="hardware-chip-outline" size={20} />}
      />
      <Row
        label="Platform"
        value={
          device.inventory.platform === 'ios'
            ? 'iOS'
            : device.inventory.platform === 'android'
              ? 'Android'
              : 'Web preview'
        }
      />
      <Row label="OS version" value={device.inventory.osVersion} />
      <Row label="App version" value={device.inventory.appVersion} />
      <Row
        label="Device type"
        value={
          device.inventory.isPhysicalDevice
            ? 'Physical'
            : device.inventory.platform === 'web'
              ? 'Browser'
              : 'Simulator'
        }
      />
      <Row
        label="Last successful sync"
        value={
          fleet.cache.syncedAt
            ? new Date(fleet.cache.syncedAt).toLocaleTimeString()
            : 'Not yet synced'
        }
      />
      <View style={{ marginTop: 22 }}>
        <Button
          title={fleet.busy ? 'Syncing' : 'Sync device'}
          icon="sync-outline"
          disabled={fleet.busy}
          onPress={() => void fleet.sync()}
        />
      </View>
      {!fleet.session && (
        <Link href="/connection" style={local.link}>
          Connect a real device <Icon name="arrow-forward" size={15} />
        </Link>
      )}
      <Section title="Privacy" />
      <Text style={ui.body}>
        Model and software versions only. No location, contacts, hardware identifiers or
        installed-app list.
      </Text>
    </Screen>
  );
}
const local = StyleSheet.create({
  device: { flexDirection: 'row', gap: 18, alignItems: 'center', paddingVertical: 6 },
  deviceIcon: {
    width: 88,
    height: 108,
    borderRadius: 8,
    backgroundColor: color.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 21, fontWeight: '700', color: color.ink },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 23,
    marginVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.line,
  },
  metric: { fontSize: 17, fontWeight: '700', color: color.ink, marginBottom: 6 },
  separator: { width: 1, height: 36, backgroundColor: color.line },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: color.teal,
    paddingVertical: 18,
    textAlign: 'center',
  },
});
