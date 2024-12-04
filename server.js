const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { OpenAI } = require("openai");
require("dotenv").config();
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);

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
    const filetypes = /mp4|avi|mov|mkv|flv|mp3|wav|m4a|flac/; // Support both audio and video formats
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype =
      file.mimetype.startsWith("audio") || file.mimetype.startsWith("video"); // Check for both audio and video MIME types

    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error("Rejected file:", file.originalname, file.mimetype);
      cb(new Error("Only audio and video files are allowed!"));
    }
  },
});

// OpenAI API Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Your OpenAI API Key from .env
});

// Endpoint for file upload and transcription
app.post("/transcribe", upload.single("audioFile"), async (req, res) => {
  console.log("File uploaded:", req.file);

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const audioPath = req.file.path;

  // If the file is a video, extract audio from it
  const isVideo = req.file.mimetype.startsWith("video");

  if (isVideo) {
    try {
      // Create a path for the extracted audio file
      const audioFilePath = `uploads/${Date.now()}-audio.mp3`;

      // Extract audio from the video using FFmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .output(audioFilePath)
          .audioCodec("libmp3lame")
          .audioBitrate(128)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      console.log("Audio extracted:", audioFilePath);

      // Delete the original video file after extracting audio
      fs.unlinkSync(audioPath);

      // Now send the extracted audio file to OpenAI Whisper API
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1", // Whisper model
        language: "en",
        response_format: "text",
      });

      // Delete the extracted audio file after transcription
      fs.unlinkSync(audioFilePath);

      // Send transcription as response
      res.json({ transcription: response });
    } catch (error) {
      console.error("Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  } else {
    // If the file is already audio, just transcribe it
    try {
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
        language: "en",
        response_format: "text",
      });

      // Clean up uploaded audio file after processing
      fs.unlinkSync(audioPath);

      // Send transcription as response
      res.json({ transcription: response });
    } catch (error) {
      console.error("Error:", error.message);
      res.status(500).json({ error: error.message });
    }
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
