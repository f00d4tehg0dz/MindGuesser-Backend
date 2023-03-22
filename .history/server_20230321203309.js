const express = require('express');
const { Configuration, OpenAIApi } = require("openai");
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(express.json());

// Initialize the SQLite database
const db = new sqlite3.Database(':memory:');

const openai = new OpenAIApi(configuration);

db.serialize(() => {
  db.run('CREATE TABLE conversations (id TEXT, role TEXT, content TEXT)');
});


function generatePrompt(conversationId, userMessage) {
  return new Promise(async (resolve) => {
    const conversationHistory = await getConversationHistory(conversationId);
    conversationHistory.push({ role: 'user', content: userMessage });

    let prompt = 'You are an AI-powered guessing game similar to Akinator. Your goal is to guess the character, object, or animal based on the user\'s answers to your questions.\n\n';

    conversationHistory.forEach((message) => {
      prompt += `${message.role === 'user' ? 'User' : 'AI'}: ${message.content}\n`;
    });

    resolve(prompt);
  });
}

function getConversationHistory(conversationId) {
  return new Promise((resolve) => {
    db.all('SELECT * FROM conversations WHERE id = ?', conversationId, (err, rows) => {
      if (err) {
        console.error(err);
        resolve([]);
      } else {
        resolve(rows.map(row => ({ role: row.role, content: row.content })));
      }
    });
  });
}

function saveMessage(conversationId, role, content) {
  db.run('INSERT INTO conversations (id, role, content) VALUES (?, ?, ?)', [conversationId, role, content], (err) => {
    if (err) console.error(err);
  });
}


app.post('/continue-conversation', async (req, res) => {
  try {
    const { conversationId, userInput } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    saveMessage(conversationId, 'user', userInput);

    const prompt = await generatePrompt(conversationId, userInput);

    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: "user", content: prompt}],
      max_tokens: 500,
      top_p: 1,
      n: 1,
      stream: true,
      temperature: 0.7,
      frequency_penalty:0.0,
      presence_penalty:0.0,
      stop: ["You:"]
    });
     // Concatenate the content from each chunk
     console.log(response.data)
     const aiMessage = response.data.choices.map(choice => choice.message || '').join('').trim();
    saveMessage(conversationId, 'ai', aiMessage);

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
