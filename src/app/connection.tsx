import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Switch, Text, TextInput, View } from 'react-native';
import { useFleet } from '../mobile/FleetProvider';
import { Button, Note, Row, Screen, Section, styles, color } from '../components/ui';

export default function ConnectionScreen() {
  const fleet = useFleet();
  const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4347');
  const [name, setName] = useState('My lab phone'),
    [code, setCode] = useState('');
  const [consent, setConsent] = useState(false),
    [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false);
  const perform = async (action: () => Promise<void>) => {
    setError(null);
    setWorking(true);
    try {
      await action();
      setCode('');
      setConsent(false);
      setConfirm(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Connection failed.');
    } finally {
      setWorking(false);
    }
  };
  return (
    <Screen
      title="Connection"
      subtitle={fleet.session ? 'Your enrolled lab session' : 'Enroll with your own local server'}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {error && <Note warning>{error}</Note>}
        {fleet.session ? (
          <>
            <Row label="Server" value={fleet.session.url} />
            <Row label="Device" value={fleet.cache.snapshot?.device.name ?? 'Enrolled device'} />
            <Row
              label="Token storage"
              value={
                Platform.OS === 'web'
                  ? 'Memory only'
                  : Platform.OS === 'ios'
                    ? 'iOS Keychain'
                    : 'Android Keystore-backed'
              }
            />
            <Section title="Enrollment" />
            {!confirm ? (
              <Button
                title="Disconnect device"
                icon="unlink-outline"
                secondary
                disabled={fleet.busy}
                onPress={() => setConfirm(true)}
              />
            ) : (
              <View style={{ gap: 10 }}>
                <Note warning>
                  Revoke this session on the server and delete its local credentials and cache?
                </Note>
                <Button
                  title="Revoke and disconnect"
                  icon="unlink-outline"
                  danger
                  disabled={working || fleet.busy}
                  onPress={() => void perform(fleet.disconnect)}
                />
                <Button
                  title="Cancel"
                  icon="close-outline"
                  secondary
                  onPress={() => setConfirm(false)}
                />
              </View>
            )}
          </>
        ) : (
          <>
            <Note>
              Enrollment shares the device model, OS and app versions with the server you choose.
              Use only your own lab server.
            </Note>
            <Text style={styles.fieldLabel}>Server URL</Text>
            <TextInput
              accessibilityLabel="Server URL"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Device nickname</Text>
            <TextInput
              accessibilityLabel="Device nickname"
              value={name}
              onChangeText={setName}
              maxLength={60}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>One-time enrollment code</Text>
            <TextInput
              accessibilityLabel="Enrollment code"
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              placeholder="8-character code"
              style={styles.input}
            />
            <View style={[styles.row, { marginVertical: 15 }]}>
              <Text style={[styles.body, { flex: 1 }]}>
                I agree to share this limited inventory with my lab server.
              </Text>
              <Switch
                accessibilityLabel="Consent to share device inventory"
                value={consent}
                onValueChange={setConsent}
                trackColor={{ true: color.teal }}
              />
            </View>
            <Button
              title={working ? 'Connecting' : 'Enroll device'}
              icon="link-outline"
              disabled={
                working || fleet.busy || !consent || !/^[a-f0-9]{8}$/i.test(code) || !name.trim()
              }
              onPress={() => void perform(() => fleet.connect(url, name, code))}
            />
            <Section title="Demo network" />
            <View style={styles.row}>
              <Text style={[styles.body, { flex: 1 }]}>Simulate offline</Text>
              <Switch
                accessibilityLabel="Simulate offline"
                value={fleet.offline}
                onValueChange={fleet.setOffline}
                trackColor={{ true: color.coral }}
              />
            </View>
          </>
        )}
        <Section title="Scope & privacy" />
        <Text style={styles.body}>
          No device-administrator privileges, MDM enrollment profile, location access or background
          tracking. Only the app&apos;s own session is managed.
        </Text>
        {Platform.OS === 'web' && (
          <View style={{ marginTop: 15 }}>
            <Note>
              Browser preview: credentials stay in memory and disappear after a reload. Native
              storage must be tested on a phone.
            </Note>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
