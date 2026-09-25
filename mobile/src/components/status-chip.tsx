import { StyleSheet, Text, View } from 'react-native';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  sent: '#2563eb',
  accepted: '#16a34a',
  paid: '#16a34a',
  rejected: '#dc2626',
  expired: '#dc2626',
  overdue: '#dc2626',
  lead: '#7c3aed',
  prospect: '#d97706',
  client: '#16a34a',
  inactive: '#6b7280',
};

export function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return (
    <View style={[styles.chip, { backgroundColor: `${color}1a` }]}>
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
