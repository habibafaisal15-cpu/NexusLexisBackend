/** Detect response language: English, Urdu script, or Roman Urdu. */
export function detectLanguage(text) {
  const raw = String(text || '');
  if (/[\u0600-\u06FF]/.test(raw)) return 'UR';
  if (/\b(kya|kaise|kyun|ka|ki|ke|ko|mein|main|hai|hain|ho|salam|aoa|theek|batao|bata|karo|chahiye|hota|hoti|walay|wala|nahi|nahin|admi|aurat|shadi|talaq|qanoon|wakil|adalat)\b/i.test(raw)) {
    return 'ROMAN';
  }
  return 'EN';
}

export function pickLocalizedText({ en, ur, roman }, lang) {
  if (lang === 'UR') return ur || en;
  if (lang === 'ROMAN') return roman || en;
  return en;
}
