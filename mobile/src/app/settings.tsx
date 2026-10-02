import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/lib/api';
import { useSession } from '@/lib/auth';

// `nativeAppVersion` is the version baked into the installed build, which is the
// real answer under EAS remote versioning. `expoConfig.version` is only a
// fallback because it reflects app.json, which remote versioning ignores.
// No hardcoded fallback: a stale literal would show the wrong build forever.
const APP_VERSION =
  Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'dev';

export default function SettingsScreen() {
  const { session, signOut } = useSession();

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{session?.user.email ?? 'â€”'}</Text>
      </View>

      <Text style={styles.sectionTitle}>Server</Text>
      <View style={styles.card}>
        <Text style={styles.label}>API URL</Text>
        <Text style={styles.value}>{API_URL}</Text>
      </View>

      <Pressable style={styles.signOut} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.footer}>MicroCRM v{APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  label: {
    fontSize: 15,
    color: '#6b7280',
  },
  value: {
    fontSize: 17,
    color: '#111827',
    fontWeight: '600',
  },
  signOut: {
    marginTop: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 17,
  },
  footer: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 24,
  },
});
