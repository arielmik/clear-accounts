import { t } from '../i18n';
import { isoDate } from '../lib/dates';
import { useTheme } from './theme';
import { Chip, ChipRow } from './ui';

/** Versión web: el calendario nativo del navegador. */
export function DateField({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const theme = useTheme();
  const today = isoDate();
  const yesterday = isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return (
    <ChipRow>
      <Chip label={t.expense.today} selected={value === today} onPress={() => onChange(today)} />
      <Chip label={t.expense.yesterday} selected={value === yesterday} onPress={() => onChange(yesterday)} />
      <input
        type="date"
        aria-label={t.expense.otherDate}
        value={value}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '8px 14px',
          fontSize: 14,
          fontWeight: 600,
          background: value !== today && value !== yesterday ? theme.primary : theme.chip,
          color: value !== today && value !== yesterday ? theme.primaryText : theme.text,
          fontFamily: 'system-ui, -apple-system, Roboto, sans-serif',
          outline: 'none',
        }}
      />
    </ChipRow>
  );
}
