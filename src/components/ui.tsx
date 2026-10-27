import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type ColorValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFleet } from '../mobile/FleetProvider';

export const color = {
  ink: '#202A28',
  muted: '#68736E',
  teal: '#087E71',
  pale: '#E6F4EE',
  line: '#DCE3DF',
  paper: '#FFFFFF',
  background: '#F4F7F5',
  coral: '#C45140',
  amber: '#8A621C',
};
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 22,
  tint = color.teal,
}: {
  name: IconName;
  size?: number;
  tint?: ColorValue;
}) {
  return <Ionicons name={name} size={size} color={tint} />;
}
export function Button({
  title,
  icon,
  onPress,
  disabled,
  secondary = false,
  danger = false,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && { backgroundColor: color.coral },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
      ]}
    >
      <Icon name={icon} size={19} tint={secondary ? color.teal : color.paper} />
      <Text style={[styles.buttonText, secondary && { color: color.teal }]}>{title}</Text>
    </Pressable>
  );
}
export function Tag({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  return (
    <View
      style={[
        styles.tag,
        tone === 'good' && { backgroundColor: color.pale },
        tone === 'warn' && { backgroundColor: '#FFF0E8' },
      ]}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: tone === 'good' ? color.teal : tone === 'warn' ? color.coral : color.muted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
export function Section({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {trailing}
    </View>
  );
}
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>
        {value}
      </Text>
    </View>
  );
}
export function Note({
  children,
  warning = false,
}: React.PropsWithChildren<{ warning?: boolean }>) {
  return (
    <View style={[styles.note, warning && { backgroundColor: '#FFF0E8' }]}>
      <Icon
        name={warning ? 'alert-circle-outline' : 'information-circle-outline'}
        size={19}
        tint={warning ? color.coral : color.teal}
      />
      <Text style={[styles.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}
export function Screen({
  title,
  subtitle,
  children,
  style,
}: React.PropsWithChildren<{ title: string; subtitle: string; style?: StyleProp<ViewStyle> }>) {
  const fleet = useFleet();
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, style]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.brandName}>
            <Icon name="layers-outline" size={23} />
            <Text style={styles.wordmark}>PocketFleet</Text>
          </View>
          <Tag
            label={fleet.session ? 'CONNECTED LAB' : 'DEMO'}
            tone={fleet.session ? 'good' : 'neutral'}
          />
        </View>
        <View style={styles.heading}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sync now"
            accessibilityState={{ disabled: fleet.busy || !fleet.ready }}
            disabled={fleet.busy || !fleet.ready}
            onPress={() => void fleet.sync()}
            style={styles.iconButton}
          >
            {fleet.busy ? <ActivityIndicator color={color.teal} /> : <Icon name="sync-outline" />}
          </Pressable>
        </View>
        {fleet.error && <Note warning>{fleet.error}</Note>}
        {fleet.paused && <Note>Sync paused while the app is in the background.</Note>}
        {!fleet.ready ? <ActivityIndicator style={{ padding: 40 }} color={color.teal} /> : children}
        <View style={styles.footer}>
          <View style={[styles.dot, fleet.offline && { backgroundColor: color.coral }]} />
          <Text style={styles.small}>
            {fleet.offline ? 'Offline' : fleet.busy ? 'Syncing' : 'Ready'}
            {!fleet.session ? ' · Synthetic sample data' : ''}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.background },
  content: {
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 30,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 28,
  },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontSize: 19, fontWeight: '700', color: color.ink },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  title: { fontSize: 29, fontWeight: '700', color: color.ink },
  subtitle: { fontSize: 14, lineHeight: 21, color: color.muted, marginTop: 5 },
  iconButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.paper,
  },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: '#E9EDEB',
    alignSelf: 'flex-start',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: color.ink },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    alignItems: 'center',
  },
  label: { color: color.muted, fontSize: 14, flex: 1 },
  value: { color: color.ink, fontSize: 14, fontWeight: '500', flex: 1.5, textAlign: 'right' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 13,
    backgroundColor: color.pale,
    borderRadius: 6,
    marginBottom: 12,
  },
  body: { fontSize: 14, lineHeight: 21, color: color.ink },
  small: { fontSize: 12, lineHeight: 18, color: color.muted },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: color.teal,
  },
  secondary: { backgroundColor: color.paper, borderWidth: 1, borderColor: color.line },
  buttonText: { fontSize: 14, fontWeight: '600', color: color.paper, flexShrink: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.teal },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.paper,
    borderRadius: 6,
    paddingHorizontal: 13,
    fontSize: 16,
    color: color.ink,
  },
  fieldLabel: {
    fontSize: 13,
    color: color.muted,
    marginTop: 18,
    marginBottom: 7,
    fontWeight: '600',
  },
});
