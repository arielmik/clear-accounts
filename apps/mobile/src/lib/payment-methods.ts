import type { PaymentMethod } from './types';

const ICONS: Record<string, string> = { cash: '💵', debit: '💳', credit: '💳', transfer: '🏦', wallet: '📱' };

/** Emoji del medio de pago: el elegido (propios) o el del sistema. */
export function paymentMethodEmoji(m: PaymentMethod | undefined): string {
  return m?.icon || (m?.system_key && ICONS[m.system_key]) || '💸';
}

/** Medios elegibles al cargar un gasto: los activos, más el ya elegido aunque esté archivado. */
export function selectablePaymentMethods(all: readonly PaymentMethod[], currentId: string | null): PaymentMethod[] {
  return all.filter((m) => !m.archived_at || m.id === currentId);
}
