const express = require('express');
const path = require('path');
const { createIndex, extractiveAnswer } = require('./retriever');
const llm = require('./llm');
const knowledge = require('./knowledge.json');

function createApp({ generate = llm.generate, rateLimit = 30 } = {}) {
  const app = express();
  const index = createIndex(knowledge);
  const hits = new Map(); // ip -> { count, reset }

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Simple fixed-window rate limit per IP (per minute)
  const limiter = (req, res, next) => {
    const now = Date.now(), key = req.ip, h = hits.get(key);
    if (!h || now > h.reset) hits.set(key, { count: 1, reset: now + 60_000 });
    else if (++h.count > rateLimit) return res.status(429).json({ error: 'Too many requests, try again in a minute.' });
    next();
  };

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  app.get('/retriever.js', (req, res) => res.sendFile(path.join(__dirname, 'retriever.js')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', docs: knowledge.length, uptime: process.uptime() }));

  app.post('/api/ask', limiter, async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: '"question" is required.' });
    if (question.length > 500) return res.status(400).json({ error: 'Question is too long (max 500 chars).' });

    const results = index.search(question, 3);
    const sources = results.map(r => ({ id: r.doc.id, title: r.doc.title, score: +r.score.toFixed(3) }));
    try {
      const out = results.length ? await generate(question, results) : null;
      if (out) return res.json({ answer: out.text, sources, mode: `rag:${out.provider}` });
    } catch (err) {
      console.error(err.message); // fall through to extractive answer
    }
    res.json({ answer: extractiveAnswer(results), sources, mode: 'retrieval-only' });
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

module.exports = { createApp };
