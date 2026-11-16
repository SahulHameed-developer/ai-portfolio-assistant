/**
 * Optional LLM step of the RAG pipeline. Uses whichever key is set:
 * ANTHROPIC_API_KEY (Claude) or OPENAI_API_KEY. With neither, returns null
 * and the API falls back to an extractive answer.
 */
const SYSTEM = 'You answer recruiters\' questions about the developer A Mohamed Sahul Hameed. ' +
  'Use ONLY the facts in the context. If the answer is not in the context, say you do not know ' +
  'and suggest contacting him. Be concise (max 4 sentences).';

function buildPrompt(question, results) {
  const context = results.map((r, i) => `[${i + 1}] ${r.doc.title}: ${r.doc.text}`).join('\n');
  return `Context:\n${context}\n\nQuestion: ${question}`;
}

async function generate(question, results, { fetchImpl = fetch, env = process.env } = {}) {
  const prompt = buildPrompt(question, results);
  if (env.ANTHROPIC_API_KEY) {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.LLM_MODEL || 'claude-haiku-4-5', max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
    const data = await res.json();
    return { text: data.content.map(c => c.text || '').join('').trim(), provider: 'anthropic' };
  }
  if (env.OPENAI_API_KEY) {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL || 'gpt-4o-mini', max_tokens: 300, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
    const data = await res.json();
    return { text: data.choices[0].message.content.trim(), provider: 'openai' };
  }
  return null;
}

module.exports = { generate, buildPrompt, SYSTEM };
