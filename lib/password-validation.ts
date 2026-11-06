import { trNow } from '@/store/language-store';

/** Minimální délka hesla pro nové účty a změnu hesla. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Validace nového hesla (registrace, změna, obnova): min. 8 znaků, aspoň 1 písmeno a 1 číslice.
 * @returns null = OK, jinak chybová hláška v aktuálním jazyce
 */
export function validateRegistrationPassword(password: string): string | null {
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN_LENGTH) {
    return trNow(
      `Heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.`,
      `Your password must have at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  if (!/[A-Za-zÀ-ž]/.test(p)) {
    return trNow('Heslo musí obsahovat alespoň jedno písmeno.', 'Your password must contain at least one letter.');
  }
  if (!/\d/.test(p)) {
    return trNow('Heslo musí obsahovat alespoň jednu číslici.', 'Your password must contain at least one digit.');
  }
  return null;
}
