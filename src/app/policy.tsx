import React from 'react';
import { Text, View } from 'react-native';
import { assessPolicy } from '../../shared/contracts';
import { useFleet } from '../mobile/FleetProvider';
import { Icon, Note, Row, Screen, Section, Tag, color, styles } from '../components/ui';

export default function PolicyScreen() {
  const { cache, session } = useFleet(),
    snapshot = cache.snapshot;
  return (
    <Screen title="Policy" subtitle="A versioned, read-only device baseline">
      {!snapshot ? (
        <Note>No cached policy available.</Note>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <Tag label={`REVISION ${snapshot.policy.revision}`} tone="good" />
            <Text style={{ fontSize: 23, fontWeight: '700', color: color.ink }}>
              {snapshot.policy.name}
            </Text>
          </View>
          <Section title="Compliance checks" />
          {assessPolicy(snapshot.device.inventory, snapshot.policy).map((rule) => (
            <View key={rule.id} style={[styles.row, { alignItems: 'flex-start' }]}>
              <Icon
                name={
                  rule.status === 'pass'
                    ? 'checkmark-circle-outline'
                    : rule.status === 'fail'
                      ? 'close-circle-outline'
                      : 'help-circle-outline'
                }
                tint={
                  rule.status === 'fail'
                    ? color.coral
                    : rule.status === 'unknown'
                      ? color.muted
                      : color.teal
                }
              />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontWeight: '600', fontSize: 15, color: color.ink }}>
                  {rule.title}
                </Text>
                <Text style={styles.body}>{rule.detail}</Text>
              </View>
              <Tag
                label={
                  rule.status === 'pass' ? 'Pass' : rule.status === 'fail' ? 'Review' : 'Unknown'
                }
                tone={rule.status === 'pass' ? 'good' : rule.status === 'fail' ? 'warn' : 'neutral'}
              />
            </View>
          ))}
          <Section title="Policy parameters" />
          <Row label="Android minimum" value={String(snapshot.policy.minimumAndroidMajor)} />
          <Row label="iOS minimum" value={String(snapshot.policy.minimumIosMajor)} />
          <Row label="Foreground sync" value={`${snapshot.policy.syncIntervalSeconds} seconds`} />
          <View style={{ marginTop: 24 }}>
            <Note>
              This is an assessment of reported data, not OS-level enforcement or device
              attestation.
            </Note>
          </View>
          <Text style={styles.small}>
            {session
              ? 'Policy changes arrive at the next successful check-in.'
              : 'Demo policy and device details are synthetic.'}
          </Text>
        </>
      )}
    </Screen>
  );
}
