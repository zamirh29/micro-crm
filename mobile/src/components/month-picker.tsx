import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { monthLabel } from '@/lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  value: string;
  onChange: (month: string) => void;
}

export function MonthPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));

  const minYear = currentYear - 3;
  const maxYear = currentYear + 1;

  function openModal() {
    setYear(Number(value.slice(0, 4)));
    setOpen(true);
  }

  function pick(index: number) {
    onChange(`${year}-${String(index + 1).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={openModal}
        hitSlop={8}
        accessibilityLabel="Change month"
        style={styles.trigger}>
        <Text style={styles.triggerLabel}>{monthLabel(value)}</Text>
        <Ionicons name="chevron-down" size={18} color="#4f46e5" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.yearRow}>
              <Pressable
                hitSlop={8}
                accessibilityLabel="Previous year"
                disabled={year <= minYear}
                onPress={() => setYear((current) => Math.max(current - 1, minYear))}
                style={[styles.yearButton, year <= minYear && styles.disabled]}>
                <Ionicons name="chevron-back" size={20} color="#4f46e5" />
              </Pressable>
              <Text style={styles.yearLabel}>{year}</Text>
              <Pressable
                hitSlop={8}
                accessibilityLabel="Next year"
                disabled={year >= maxYear}
                onPress={() => setYear((current) => Math.min(current + 1, maxYear))}
                style={[styles.yearButton, year >= maxYear && styles.disabled]}>
                <Ionicons name="chevron-forward" size={20} color="#4f46e5" />
              </Pressable>
            </View>

            <View style={styles.grid}>
              {MONTHS.map((name, index) => {
                const selected = value === `${year}-${String(index + 1).padStart(2, '0')}`;
                return (
                  <Pressable
                    key={name}
                    onPress={() => pick(index)}
                    style={[styles.monthCell, selected && styles.monthCellSelected]}>
                    <Text style={[styles.monthText, selected && styles.monthTextSelected]}>
                      {name}
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
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yearButton: {
    padding: 6,
  },
  disabled: {
    opacity: 0.35,
  },
  yearLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthCell: {
    flexBasis: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  monthCellSelected: {
    backgroundColor: '#4f46e5',
  },
  monthText: {
    fontSize: 15,
    color: '#374151',
  },
  monthTextSelected: {
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
