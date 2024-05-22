const express = require("express");
const { Configuration, OpenAIApi } = require("openai");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

dotenv.config();
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.set("trust proxy", 1); // Trust the first proxy

app.use(
  cors({
    origin: ["https://mindguesser.com", "https://www.mindguesser.com"],
  }),
);
app.use(express.json());

// Initialize the MongoDB database
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useUnifiedTopology: true });

const openai = new OpenAIApi(configuration);

async function getDatabase() {
  await client.connect();
  return client.db("mindguesser");
}

async function getConversationCollection() {
  const db = await getDatabase();
  return db.collection("conversations");
}

async function getConversationHistory(conversationId) {
  const collection = await getConversationCollection();
  return collection.find({ id: conversationId }).toArray();
}

async function saveMessage(conversationId, role, content) {
  const collection = await getConversationCollection();
  await collection.insertOne({ id: conversationId, role, content });
}

async function generatePrompt(conversationId, userMessage) {
  const conversationHistory = await getConversationHistory(conversationId);
  conversationHistory.push({ role: "user", content: userMessage });

  let prompt =
    "You are an AI-powered guessing game similar to Akinator. Your goal is to guess the character, object, or animal based on the user's answers to your questions.\n\n";

  conversationHistory.forEach((message) => {
    prompt += `${message.role === "user" ? "User" : "AI"}: ${message.content}\n`;
  });

  return prompt;
}

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use(limiter);

app.post("/continue-conversation", async (req, res) => {
  try {
    const { conversationId, userInput } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }

    await saveMessage(conversationId, "user", userInput);

    const prompt = await generatePrompt(conversationId, userInput);

    const conversationHistory = await getConversationHistory(conversationId);
    if (conversationHistory.length >= 20) {
      const aiMessage = "You've stumped me, let's try again!";
      await saveMessage(conversationId, "ai", aiMessage);
      return res.status(200).json({ message: aiMessage });
    }

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      stop: ["You are"],
    });

    const aiMessage = response.data.choices[0].message.content.trim();

    // Save AI response
    await saveMessage(conversationId, "ai", aiMessage);

    res.status(200).json({ message: aiMessage });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request" });
  }
});

const PORT = process.env.PORT || 5890;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
