const ENGLISH_STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'for', 'from', 'had', 'has', 'have', 'he', 'her',
  'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'just', 'me', 'more', 'most',
  'my', 'no', 'not', 'of', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'same',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'why', 'with', 'would', 'you', 'your',
]);

const URDU_STOP_WORDS = new Set([
  'ہیں', 'ہے', 'تھا', 'تھی', 'کا', 'کی', 'کے', 'کو', 'نے', 'میں', 'پر', 'سے', 'اور', 'یا',
]);

function tokenize(text) {
  const raw = String(text || '').toLowerCase().trim();
  let tokens = raw.match(/\w+/gu) || [];
  if (tokens.length < 2 && /[\u0600-\u06FF]/.test(raw)) {
    tokens = raw.split(/[\s\u060c,\.?!\u061f]+/).filter(Boolean);
  }
  return tokens.filter((t) => !ENGLISH_STOP_WORDS.has(t) && !URDU_STOP_WORDS.has(t));
}

function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm <= 0) return vec;
  return vec.map((v) => v / norm);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

export class SimpleTfidf {
  constructor() {
    this.vocab = {};
    this.idf = [];
    this.docVectors = [];
    this.answers = [];
    this.vocabSize = 0;
  }

  fitTransform(questions, answers) {
    this.answers = answers;
    const tokenizedDocs = questions.map(tokenize);
    const vocabSet = new Set();
    tokenizedDocs.forEach((doc) => doc.forEach((t) => vocabSet.add(t)));

    this.vocab = Object.fromEntries([...vocabSet].sort().map((term, idx) => [term, idx]));
    this.vocabSize = Object.keys(this.vocab).length;
    if (this.vocabSize === 0) return;

    const df = {};
    tokenizedDocs.forEach((doc) => {
      new Set(doc).forEach((term) => {
        df[term] = (df[term] || 0) + 1;
      });
    });

    const numDocs = tokenizedDocs.length;
    this.idf = Array(this.vocabSize).fill(0);
    Object.entries(this.vocab).forEach(([term, idx]) => {
      this.idf[idx] = Math.log(numDocs / (df[term] || 1)) + 1;
    });

    this.docVectors = tokenizedDocs.map((doc) => {
      const vec = Array(this.vocabSize).fill(0);
      const counts = {};
      doc.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
      Object.entries(counts).forEach(([term, count]) => {
        if (term in this.vocab) vec[this.vocab[term]] = count * this.idf[this.vocab[term]];
      });
      return l2Normalize(vec);
    });
  }

  search(query, threshold = 0.4) {
    if (!this.vocabSize || !this.docVectors.length) return { answer: null, found: false, score: 0 };

    const queryTokens = tokenize(query);
    if (!queryTokens.length) return { answer: null, found: false, score: 0 };

    const queryVec = Array(this.vocabSize).fill(0);
    const counts = {};
    queryTokens.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    Object.entries(counts).forEach(([term, count]) => {
      if (term in this.vocab) queryVec[this.vocab[term]] = count * this.idf[this.vocab[term]];
    });
    const normalizedQuery = l2Normalize(queryVec);
    if (!normalizedQuery.some((v) => v !== 0)) return { answer: null, found: false, score: 0 };

    let bestIdx = 0;
    let bestScore = -1;
    this.docVectors.forEach((docVec, idx) => {
      const score = dot(docVec, normalizedQuery);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestScore >= threshold) {
      return { answer: this.answers[bestIdx], found: true, score: bestScore, index: bestIdx };
    }
    return { answer: null, found: false, score: bestScore };
  }
}

export function buildIntroTfidf(introItems) {
  const questions = [];
  const answers = [];
  introItems.forEach((item) => {
    item.questions.forEach((q) => {
      questions.push(q);
      answers.push({
        en: item.answer_en,
        ur: item.answer_ur,
        roman: item.answer_roman || item.answer_en,
      });
    });
  });
  const tfidf = new SimpleTfidf();
  tfidf.fitTransform(questions, answers);
  return tfidf;
}
