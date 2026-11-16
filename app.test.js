const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');
const { createIndex, tokenize } = require('./retriever');
const knowledge = require('./knowledge.json');

function start(opts) {
  return new Promise(resolve => {
    const server = createApp(opts).listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
const ask = (url, body) => fetch(`${url}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('tokenizer normalises synonyms', () => {
  assert.deepStrictEqual(tokenize('Node.js and LLMs'), ['node', 'ai']);
});

test('retriever finds the right facts', () => {
  const idx = createIndex(knowledge);
  assert.strictEqual(idx.search('What is his notice period?')[0].doc.id, 'availability');
  assert.strictEqual(idx.search('Node.js experience')[0].doc.id, 'skills-node');
  assert.strictEqual(idx.search('RAG and LLM work')[0].doc.id, 'skills-ai');
  assert.strictEqual(idx.search('how can I contact him by email')[0].doc.id, 'contact');
});

test('GET /api/health', async () => {
  const { server, url } = await start();
  const res = await fetch(`${url}/api/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'ok');
  server.close();
});

test('POST /api/ask falls back to retrieval-only without an LLM', async () => {
  const { server, url } = await start({ generate: async () => null });
  const data = await (await ask(url, { question: 'notice period?' })).json();
  assert.strictEqual(data.mode, 'retrieval-only');
  assert.match(data.answer, /1 month/);
  assert.strictEqual(data.sources[0].id, 'availability');
  server.close();
});

test('POST /api/ask uses the LLM with retrieved context', async () => {
  let seen;
  const { server, url } = await start({ generate: async (q, results) => { seen = results; return { text: 'He knows Node.js.', provider: 'mock' }; } });
  const data = await (await ask(url, { question: 'Does he know Node.js?' })).json();
  assert.strictEqual(data.mode, 'rag:mock');
  assert.strictEqual(seen[0].doc.id, 'skills-node');
  server.close();
});

test('POST /api/ask validates input and rate-limits', async () => {
  const { server, url } = await start({ generate: async () => null, rateLimit: 2 });
  assert.strictEqual((await ask(url, {})).status, 400);
  assert.strictEqual((await ask(url, { question: 'x'.repeat(501) })).status, 400);
  await ask(url, { question: 'skills' });
  assert.strictEqual((await ask(url, { question: 'skills' })).status, 429);
  server.close();
});
