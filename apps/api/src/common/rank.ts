const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function rankBetween(prev: string | null, next: string | null): string {
  const a = prev ?? "";
  let b = next;
  let rank = "";
  let i = 0;
  for (;;) {
    const x = i < a.length ? ALPHABET.indexOf(a.charAt(i)) : 0;
    const y = b !== null && i < b.length ? ALPHABET.indexOf(b.charAt(i)) : ALPHABET.length;
    if (x === y) {
      rank += ALPHABET.charAt(x);
      i += 1;
      continue;
    }
    if (y - x > 1) {
      rank += ALPHABET.charAt(Math.floor((x + y) / 2));
      return rank;
    }
    rank += ALPHABET.charAt(x);
    b = null;
    i += 1;
  }
}

export function initialRank(): string {
  return rankBetween(null, null);
}
