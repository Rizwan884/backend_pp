// server.js
import express from "express";
import mongoose from "mongoose";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "10mb" })); // to handle base64 image uploads

// ====== CONFIG ======
const SECRET_KEY = process.env.SECRET_KEY; // your app secret
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "username/my-app-images"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000;

// ====== DB MODEL ======
const promptSchema = new mongoose.Schema({
  title: String,
  prompt: String,
  imageUrl: String,
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});
const Prompt = mongoose.model("Prompt", promptSchema);

// ====== AUTH MIDDLEWARE ======
function checkAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== SECRET_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ====== HELPERS ======
async function uploadImageToGitHub(base64Image, filename) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`;
  const res = await axios.put(
    url,
    {
      message: `Upload ${filename}`,
      content: base64Image
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json"
      }
    }
  );
  return res.data.content.download_url; // public URL
}

// ====== ROUTES ======

// POST /api/prompts -> save prompt + upload image
app.post("/api/prompts", checkAuth, async (req, res) => {
  try {
    const { title, prompt, tags, imageBase64 } = req.body;
    if (!imageBase64 || !prompt || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const filename = `${Date.now()}-${title.replace(/\s+/g, "_")}.png`;
    const imageUrl = await uploadImageToGitHub(imageBase64, filename);

    const newPrompt = new Prompt({
      title,
      prompt,
      tags: tags || [],
      imageUrl
    });

    await newPrompt.save();
    res.json(newPrompt);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/prompts -> fetch all prompts (optional ?tag=xxx)
app.get("/api/prompts", checkAuth, async (req, res) => {
  try {
    const { tag } = req.query;
    const filter = tag ? { tags: tag } : {};
    const prompts = await Prompt.find(filter).sort({ createdAt: -1 });
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ====== START SERVER ======
mongoose.connect(MONGO_URI).then(() => {
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
});
