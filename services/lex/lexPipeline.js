import { LEX_INTRO_QA } from './introQa.js';
import { buildIntroTfidf } from './tfidf.js';
import { searchQuestionBank, formatReferenceContext, warmQuestionBank } from './questionBank.js';
import { isLawRelated } from './lawGuard.js';
import { geminiChatCompletion } from './geminiClient.js';
import { detectLanguage, pickLocalizedText } from './language.js';
import {
  INTRO_QA_THRESHOLD,
  OFF_TOPIC_MESSAGE_EN,
  OFF_TOPIC_MESSAGE_UR,
  OFF_TOPIC_MESSAGE_ROMAN,
  LLM_UNAVAILABLE_EN,
  LLM_UNAVAILABLE_UR,
  LLM_UNAVAILABLE_ROMAN,
  DEFAULT_SYSTEM_PROMPT,
  SHEET_GROUNDED_PROMPT,
} from './constants.js';

const introTfidf = buildIntroTfidf(LEX_INTRO_QA);

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/[!.?،؟]+$/g, '');
}

function searchIntroQa(userMessage) {
  const normalized = normalize(userMessage);
  for (const item of LEX_INTRO_QA) {
    for (const q of item.questions) {
      if (normalized === normalize(q)) {
        return { found: true, item };
      }
    }
  }
  const { answer, found } = introTfidf.search(userMessage, INTRO_QA_THRESHOLD);
  if (found && answer) {
    return { found: true, item: answer };
  }
  return { found: false, item: null };
}

function offTopicMessage(lang) {
  return pickLocalizedText({
    en: OFF_TOPIC_MESSAGE_EN,
    ur: OFF_TOPIC_MESSAGE_UR,
    roman: OFF_TOPIC_MESSAGE_ROMAN,
  }, lang);
}

function unavailableMessage(lang) {
  return pickLocalizedText({
    en: LLM_UNAVAILABLE_EN,
    ur: LLM_UNAVAILABLE_UR,
    roman: LLM_UNAVAILABLE_ROMAN,
  }, lang);
}

function buildResponse(text, lang, register = 'PLAIN', showLawyer = false) {
  return {
    response: text,
    language: lang === 'ROMAN' ? 'EN' : lang,
    register,
    show_lawyer: showLawyer,
  };
}

function urgencyFlag(message) {
  const keywords = ['sue', 'court', 'arrest', 'fir', 'dispute', 'fraud', 'police', 'عدالت', 'کیس', 'تھانہ', 'adalat', 'case'];
  const lower = message.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export async function runLexChat({ message }) {
  const userMessage = String(message || '').trim();
  if (!userMessage) throw new Error('Message is required');

  const lang = detectLanguage(userMessage);
  const register = /section|act|دفعہ|crpc|ppc/i.test(userMessage) ? 'LEGAL' : 'PLAIN';

  // STEP 1 — Intro (Hi, Hello, Who are you)
  const intro = searchIntroQa(userMessage);
  if (intro.found) {
    const text = pickLocalizedText({
      en: intro.item.answer_en || intro.item.en,
      ur: intro.item.answer_ur || intro.item.ur,
      roman: intro.item.answer_roman || intro.item.roman,
    }, lang);
    return buildResponse(text, lang);
  }

  // STEP 2 — Law-topic guard
  if (!isLawRelated(userMessage)) {
    return buildResponse(offTopicMessage(lang), lang);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  if (!apiKey) {
    return buildResponse(unavailableMessage(lang), lang);
  }

  const genConfig = {
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 500),
    model,
    apiKey,
    timeoutMs: Number(process.env.LLM_GENERATION_TIMEOUT || 60) * 1000,
  };

  try {
    // STEP 3 — Sheet search (TF-IDF, instant; embeddings optional in background)
    const bank = await searchQuestionBank(userMessage, apiKey);

    if (bank.found && bank.top) {
      const referenceBlock = formatReferenceContext(bank.matches);
      const system = (
        `${SHEET_GROUNDED_PROMPT}\n\n${referenceBlock}\n\n`
        + `Similarity score: ${bank.score.toFixed(3)}`
      );
      const aiResponse = await geminiChatCompletion(
        [{ role: 'user', content: userMessage }],
        { ...genConfig, system }
      );
      return buildResponse(aiResponse, lang, register, urgencyFlag(userMessage));
    }

    // STEP 4 — Law-related but not in sheet → Gemini directly
    const system = (
      `${process.env.LEX_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT}\n\n`
      + 'No close match was found in the verified question bank for this query. '
      + 'Answer from general Pakistani legal knowledge, note uncertainty where needed, '
      + 'and suggest consulting a verified lawyer for case-specific advice.'
    );
    const aiResponse = await geminiChatCompletion(
      [{ role: 'user', content: userMessage }],
      { ...genConfig, system }
    );
    return buildResponse(aiResponse, lang, register, urgencyFlag(userMessage));
  } catch (err) {
    console.error('[lex-inline] Pipeline error:', err.message);
    return buildResponse(unavailableMessage(lang), lang);
  }
}
