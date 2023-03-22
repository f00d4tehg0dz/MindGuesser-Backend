const express = require('express');
const openai = require('openai');
const dotenv = require('dotenv');

dotenv.config();
openai.apiKey = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.json());

// Store conversation histories using a simple in-memory storage
const conversations = {};


function generatePrompt(conversationId, userMessage) {
  const conversationHistory = conversations[conversationId] || [];
  conversationHistory.push({ role: 'user', content: userMessage });

  let prompt = 'You are an AI-powered guessing game similar to Akinator. Your goal is to guess the character, object, or animal based on the user\'s answers to your questions.\n\n';

  conversationHistory.forEach((message) => {
    prompt += `${message.role === 'user' ? 'User' : 'AI'}: ${message.content}\n`;
  });

  return prompt;
}

app.post('/continue-conversation', async (req, res) => {
  try {
    const { conversationId, userInput } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    const prompt = generatePrompt(conversationId, userInput);


    const response = await openai.Completion.create({
      engine: 'gpt-3.5-turbo',
      prompt,
      max_tokens: 50,
      n: 1,
      stop: null,
      temperature: 0.8,
    });

    const aiMessage = response.choices[0].text.trim();
    conversations[conversationId] = conversations[conversationId] || [];
    conversations[conversationId].push({ role: 'ai', content: aiMessage });

    res.status(200).json({ message: aiMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
