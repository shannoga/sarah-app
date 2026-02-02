import express from 'express';
import { setSystemPrompt, getSystemPrompt } from '../services/claude.js';

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    setSystemPrompt(prompt);
    res.json({ success: true, prompt: getSystemPrompt() });
  } catch (error) {
    console.error('Agent config error:', error);
    res.status(500).json({ error: 'Failed to set system prompt' });
  }
});

router.get('/', (req, res) => {
  res.json({ prompt: getSystemPrompt() });
});

router.delete('/', (req, res) => {
  setSystemPrompt(null);
  res.json({ success: true });
});

export default router;
