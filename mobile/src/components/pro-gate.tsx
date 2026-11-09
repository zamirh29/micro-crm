import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  description: string;
  features: string[];
}

export function ProGate({ title, description, features }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.badge}>
        <Ionicons name="sparkles" size={22} color="#4f46e5" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.features}>
        {features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/billing')}
        accessibilityRole="button"
        accessibilityLabel="Upgrade to Pro">
        <Text style={styles.buttonText}>Upgrade to Pro</Text>
      </Pressable>
      <Text style={styles.footnote}>First 3 months free on Pro. Cancel anytime.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  features: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 22,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 26,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'center',
  },
});
