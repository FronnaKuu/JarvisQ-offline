// ---- Time formatting ------------------------------------------------------
// Pure, platform-agnostic helpers. Intl is available in Hermes and Node 18+.

export function formatMessageTimestamp(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  const diffMs = Math.max(0, nowMs - timestampMs);
  const oneMinute = 60_000;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;

  if (diffMs < oneMinute) return 'now';
  if (diffMs < oneHour) return `${Math.floor(diffMs / oneMinute)}m`;
  if (diffMs < oneDay) {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return formatter.format(new Date(timestampMs));
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(new Date(timestampMs));
}
