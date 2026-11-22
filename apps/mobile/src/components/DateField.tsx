import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { t } from '../i18n';
import { isoDate, shortDate } from '../lib/dates';
import { Chip, ChipRow } from './ui';

const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** Fecha del gasto: "Hoy", "Ayer" u otra elegida en el calendario. */
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const today = isoDate();
  const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const other = value !== today && value !== yesterday;

  const openCalendar = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromIso(value),
        mode: 'date',
        maximumDate: new Date(),
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(isoDate(date));
        },
      });
    }
  };

  return (
    <ChipRow>
      <Chip label={t.expense.today} selected={value === today} onPress={() => onChange(today)} />
      <Chip label={t.expense.yesterday} selected={value === yesterday} onPress={() => onChange(yesterday)} />
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={fromIso(value)}
          mode="date"
          display="compact"
          maximumDate={new Date()}
          onChange={(_e, date) => date && onChange(isoDate(date))}
        />
      ) : (
        <Chip label={other ? `📅 ${shortDate(value)}` : `📅 ${t.expense.otherDate}`} selected={other} onPress={openCalendar} />
      )}
    </ChipRow>
  );
}
