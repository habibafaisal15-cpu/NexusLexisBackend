const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const BATCH_SIZE = Number(process.env.LEX_EMBED_BATCH_SIZE || 100);

export async function embedText(text, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'Embedding request failed');
  }

  const values = data.embedding?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Empty embedding returned');
  }
  return values;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedBatch(texts, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`;
  const requests = texts.map((text) => ({
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text: String(text || '').slice(0, 8000) }] },
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ requests }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'Batch embedding request failed');
  }

  const embeddings = data.embeddings || [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Batch embedding size mismatch (${embeddings.length}/${texts.length})`);
  }

  return embeddings.map((item) => {
    const values = item.values || item.embedding?.values;
    if (!Array.isArray(values) || !values.length) {
      throw new Error('Empty embedding in batch response');
    }
    return values;
  });
}

/** Batch embed in chunks — used for background index build only. */
export async function embedMany(texts, apiKey) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    vectors.push(...await embedBatch(chunk, apiKey));
  }
  return vectors;
}
