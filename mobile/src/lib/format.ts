const SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'Fr ',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  AED: 'AED ',
  SAR: 'SAR ',
  ZAR: 'R ',
  BRL: 'R$',
  MXN: 'Mex$',
  SGD: 'S$',
  HKD: 'HK$',
  NOK: 'kr ',
  SEK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
  TRY: '₺',
};

export function formatMoney(pence: number, currency = 'GBP'): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function monthLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
