export async function geminiChatCompletion(messages, { system, maxTokens = 400, model, apiKey, timeoutMs = 60000 }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const modelId = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

  const contents = messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(msg.content || '') }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || JSON.stringify(data));
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
