const LAW_KEYWORDS = [
  'law', 'legal', 'court', 'judge', 'lawyer', 'advocate', 'attorney', 'sue', 'lawsuit',
  'contract', 'agreement', 'deed', 'lease', 'property', 'inheritance', 'will', 'tenant',
  'company', 'secp', 'fbr', 'tax', 'gst', 'ntn', 'corporate', 'registration', 'compliance',
  'license', 'permit', 'trademark', 'patent', 'fir', 'police', 'bail', 'criminal', 'civil',
  'family', 'divorce', 'custody', 'tenancy', 'rent', 'eviction', 'labour', 'employment',
  'termination', 'partnership', 'llp', 'limited', 'proprietorship', 'affidavit', 'notary',
  'section', 'act', 'ordinance', 'statute', 'petition', 'appeal', 'plaint', 'suit', 'case',
  'rights', 'offence', 'offense', 'guilty', 'innocent', 'witness', 'evidence', 'trial',
  'قانون', 'عدالت', 'وکیل', 'کیس', 'تھانہ', 'ایف', 'آئی', 'آر', 'ٹیکس', 'کمپنی',
  'رجسٹریشن', 'معاہدہ', 'جائیداد', 'وراثت', 'طلاق', 'کرایہ', 'دعوی', 'دفعہ', 'مقدمہ',
  'qanoon', 'wakil', 'vakil', 'adalat', 'case', 'fir', 'talaq', 'shadi', 'zamin', 'plot',
  'registry', 'stamp', 'court', 'judge', 'lawyer', 'contract', 'agreement', 'company',
  'register', 'secp', 'fbr', 'tax', 'crpc', 'ppc', 'constitutional', 'bail', 'zamanat',
];

const OFF_TOPIC_KEYWORDS = [
  'weather', 'football', 'cricket score', 'recipe', 'cook', 'movie', 'song lyrics', 'bitcoin price',
  'stock tip', 'medical diagnosis', 'write me code', 'python code', 'joke', 'poem',
  'موسم', 'کھانا', 'فلم', 'گانا', 'کرکٹ اسکور',
];

const INTRO_PATTERNS = /^(hi|hello|hey|salam|aoa|thanks|thank you|who are you|what is lex)\b/i;

export function isIntroMessage(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  return INTRO_PATTERNS.test(text.toLowerCase());
}

/** Returns true only when the message is clearly law-related. */
export function isLawRelated(message) {
  const text = String(message || '').toLowerCase().trim();
  if (!text) return false;

  if (OFF_TOPIC_KEYWORDS.some((kw) => text.includes(kw))) return false;

  if (/[\u0600-\u06FF]/.test(message)) {
    if (LAW_KEYWORDS.some((kw) => text.includes(kw))) return true;
    if (/[?؟]/.test(message)) return true;
    if (['کیا', 'کیسے', 'کیوں', 'کون', 'کب', 'کہاں'].some((w) => text.includes(w))) return true;
    return false;
  }

  if (LAW_KEYWORDS.some((kw) => text.includes(kw))) return true;

  if (/[?]/.test(text) && text.split(/\s+/).length >= 4) return true;

  return false;
}
