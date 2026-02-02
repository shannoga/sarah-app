import express from 'express';
import { sendMessage } from '../services/claude.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await sendMessage(message);
    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to get response from Claude' });
  }
});

export default router;
