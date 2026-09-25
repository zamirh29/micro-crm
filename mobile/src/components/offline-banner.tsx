import { StyleSheet, Text, View } from 'react-native';

import { useOnline } from '@/lib/use-online';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You&rsquo;re offline — showing saved data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#b91c1c',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
