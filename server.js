// server.js - Minimal Express server to proxy OpenAI requests
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY is not set in environment variables. See .env.example.');
}

app.use(cors());
app.use(express.json());

// Serve static files (the web client) from current folder
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

// Simple health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// POST /api/chat - proxy to OpenAI Chat Completions
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Missing message' });

    const payload = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: message }],
      max_tokens: 1024,
      temperature: 0.2
    };

    // Call OpenAI API directly using fetch
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI API error', data);
      return res.status(500).json({ error: 'OpenAI API error', detail: data });
    }

    const reply = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    return res.json({ reply });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
