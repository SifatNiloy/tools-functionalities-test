const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const port = 3000;

// Configure Multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = "uploads/";
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const filetypes = /mp3|mp4|wav|m4a|flac/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = file.mimetype.startsWith("audio"); // More general audio MIME check

    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error("Rejected file:", file.originalname, file.mimetype);
      cb(new Error("Only audio files are allowed!"));
    }
  },
});

// OpenAI API Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Your OpenAI API Key from .env
});

// Endpoint for file upload and transcription
app.post("/transcribe", upload.single("audioFile"), async (req, res) => {
  console.log("File uploaded:", req.file); // Add this line to log the file details

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  try {
    const audioPath = req.file.path;

    // Send the file to OpenAI Whisper API
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath), // Use file stream for Whisper API
      model: "whisper-1", // Whisper model
      language: "en", // Optional but helps the model
      response_format: "text", // Response format
    });
    console.log("this is extracted text from the audio:", response);
    // Check if response is empty or not
    if (!response || !response.trim()) {
      return res
        .status(500)
        .json({ error: "Transcription failed or empty response." });
    }

    // Clean up uploaded file after processing
    fs.unlinkSync(audioPath);

    // Send transcription as response
    res.json({ transcription: response });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Welcome to Whisper Transcription API!");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
