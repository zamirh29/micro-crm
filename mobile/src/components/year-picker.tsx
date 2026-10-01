import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  value: string;
  onChange: (year: string) => void;
}

export function YearPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  const years = [
    currentYear - 3,
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
  ];

  function pick(year: number) {
    onChange(String(year));
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Change year"
        style={styles.trigger}>
        <Text style={styles.triggerLabel}>{value}</Text>
        <Ionicons name="chevron-down" size={18} color="#4f46e5" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Select year</Text>

            <View style={styles.grid}>
              {years.map((year) => {
                const selected = value === String(year);
                return (
                  <Pressable
                    key={year}
                    onPress={() => pick(year)}
                    style={[styles.yearCell, selected && styles.yearCellSelected]}>
                    <Text style={[styles.yearText, selected && styles.yearTextSelected]}>
                      {year}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={() => setOpen(false)} style={styles.doneButton}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  triggerLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: 340,
    maxWidth: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearCell: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  yearCellSelected: {
    backgroundColor: '#4f46e5',
  },
  yearText: {
    fontSize: 15,
    color: '#374151',
  },
  yearTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});