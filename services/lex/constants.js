export const INTRO_QA_THRESHOLD = 0.45;
export const TFIDF_MATCH_THRESHOLD = 0.38;
export const EMBEDDING_MATCH_THRESHOLD = 0.72;
export const CACHE_TTL_MS = 5 * 60 * 1000;

export const OFF_TOPIC_MESSAGE_EN =
  'Hello! I am LEX, your Pakistani legal assistant. I can only answer questions related to '
  + 'law, regulatory compliance, and corporate matters. Please ask a law-related question.';

export const OFF_TOPIC_MESSAGE_UR =
  'السلام! میں LEX ہوں، آپ کا پاکستانی قانونی معاون۔ میں صرف قانون، ریگulatory compliance '
  + 'اور کاروباری معاملات سے متعلق سوالات کا جواب دے سکتا ہوں۔ براہ کرم قانونی سوال پوچھیں۔';

export const OFF_TOPIC_MESSAGE_ROMAN =
  'Main LEX hoon — Pakistani legal assistant. Main sirf qanoon, regulations aur corporate '
  + 'matters se related sawaalon ka jawab de sakta hoon. Barah-e-karam law-related sawal poochiye.';

export const LLM_UNAVAILABLE_EN =
  "I couldn't reach the AI service right now. Please try again shortly, browse our document "
  + 'library, or connect with a lawyer for personalised advice.';

export const LLM_UNAVAILABLE_UR =
  'AI سروس فی الوقت دستیاب نہیں ہے۔ براہ کرم دوبارہ کوشش کریں یا وکیل سے رابطہ کریں۔';

export const LLM_UNAVAILABLE_ROMAN =
  'AI service abhi available nahi hai. Thori der baad dobara try karein ya lawyer se rabta karein.';

export const DEFAULT_SYSTEM_PROMPT =
  'You are LEX, a Pakistani legal information assistant on Nexus Lexis. '
  + 'Provide accurate procedural guidance under Pakistani law. '
  + 'Do not quote exact government fee figures — direct users to the Fee Calculator on the platform. '
  + 'You are not a licensed lawyer. Match the user language exactly: English, Urdu script, or Roman Urdu.';

export const SHEET_GROUNDED_PROMPT =
  'You are LEX, a Pakistani legal assistant. Use the VERIFIED REFERENCE below as your primary source. '
  + 'Form a clear, accurate answer in the same language the user used (English, Urdu, or Roman Urdu). '
  + 'Do not invent statutes, sections, or facts not supported by the reference. '
  + 'If the reference is partial, answer what you can and note limits. '
  + 'Do not quote exact government fee figures — direct users to the Nexus Lexis Fee Calculator.';

export const DEFAULT_QUESTION_BANK_URL =
  'https://docs.google.com/spreadsheets/d/1I7F5GlelYco_LNzRHRrvjOjDEaJNnNhC/export?format=xlsx';
