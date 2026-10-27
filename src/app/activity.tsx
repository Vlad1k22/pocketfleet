import React from 'react';
import { Text, View } from 'react-native';
import { useFleet } from '../mobile/FleetProvider';
import { Button, Icon, Note, Screen, Section, Tag, color, styles } from '../components/ui';

export default function ActivityScreen() {
  const fleet = useFleet(),
    commands = fleet.cache.snapshot?.commands ?? [];
  return (
    <Screen title="Activity" subtitle="Delivery is not the same as completion">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Tag label={`${commands.length} COMMANDS`} />
        <Tag
          label={`${fleet.cache.outbox.length} RESULTS TO RETRY`}
          tone={fleet.cache.outbox.length ? 'warn' : 'neutral'}
        />
      </View>
      {!fleet.session && (
        <>
          <Section title="Lab commands" />
          <View style={{ gap: 10 }}>
            <Button
              title="Request inventory"
              icon="hardware-chip-outline"
              secondary
              disabled={fleet.busy}
              onPress={() => fleet.queueDemo('refresh_inventory')}
            />
            <Button
              title="Send reminder"
              icon="chatbubble-outline"
              secondary
              disabled={fleet.busy}
              onPress={() => fleet.queueDemo('show_message')}
            />
          </View>
        </>
      )}
      <Section title="Command journal" />
      {!commands.length ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 36 }}>
          <Icon name="checkmark-done-outline" size={40} />
          <Text style={[styles.body, { color: color.muted }]}>No commands in this session</Text>
        </View>
      ) : (
        commands.map((command) => (
          <View key={command.id} style={[styles.row, { alignItems: 'flex-start' }]}>
            <Icon
              name={
                command.type === 'refresh_inventory'
                  ? 'hardware-chip-outline'
                  : 'chatbubble-outline'
              }
              size={22}
            />
            <View style={{ flex: 1, gap: 7 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <Text style={{ fontWeight: '600', fontSize: 15, color: color.ink }}>
                  {command.type === 'refresh_inventory' ? 'Refresh inventory' : 'App reminder'}
                </Text>
                <Tag
                  label={command.status}
                  tone={
                    command.status === 'acknowledged'
                      ? 'good'
                      : ['expired', 'failed'].includes(command.status)
                        ? 'warn'
                        : 'neutral'
                  }
                />
              </View>
              {command.message && <Text style={styles.body}>{command.message}</Text>}
              <Text selectable style={styles.small}>
                {command.id.slice(0, 8)} · {new Date(command.createdAt).toLocaleTimeString()}
              </Text>
              <Text style={styles.small}>
                {command.status === 'acknowledged'
                  ? 'App action completed; server confirmed the result.'
                  : command.status === 'delivered'
                    ? 'Delivered to the app; result not yet confirmed.'
                    : command.status === 'queued'
                      ? 'Accepted by the server; awaiting delivery.'
                      : command.status === 'expired'
                        ? 'Delivery window ended.'
                        : 'The app could not complete this action.'}
              </Text>
            </View>
          </View>
        ))
      )}
      <View style={{ marginTop: 22 }}>
        <Note>
          Commands are limited to refreshing inventory and showing an in-app reminder. No remote
          lock, wipe or screen control.
        </Note>
      </View>
    </Screen>
  );
}
