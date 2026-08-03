import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY missing');
  process.exit(1);
}

const models = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
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
