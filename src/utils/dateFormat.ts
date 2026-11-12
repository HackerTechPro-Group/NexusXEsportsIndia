const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Formats ISO YYYY-MM-DD dates as "28 November 2026" without timezone drift.
 */
export function formatDisplayDate(raw: string | undefined, fallback = 'TBA'): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;

  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) {
    return trimmed;
  }

  return `${day} ${MONTHS[monthIdx]} ${year}`;
}
