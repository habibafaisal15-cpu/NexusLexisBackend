import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY missing');
  process.exit(1);
}

const models = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.0-flash-001',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

for (const model of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] }),
    });
    const data = await res.json().catch(() => ({}));
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || data.error?.message || res.status;
    console.log(`${model}: ${res.ok ? 'OK' : 'FAIL'} — ${String(text).slice(0, 120)}`);
  } catch (err) {
    console.log(`${model}: ERROR — ${err.message}`);
  }
}
