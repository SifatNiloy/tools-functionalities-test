import express, { Request, Response } from "express";
import multer, { MulterError } from "multer";
import path from "path";
import fs from "fs";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

dotenv.config();
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
    const filetypes = /mp4|avi|mov|mkv|flv|mp3|wav|m4a|flac/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype =
      file.mimetype.startsWith("audio") || file.mimetype.startsWith("video");

    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error("Rejected file:", file.originalname, file.mimetype);
      cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

// OpenAI API Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Endpoint for file upload and transcription
app.post(
  "/create-with-media",
  upload.single("mediaFile"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded." });
        return;
      }

      const audioPath = req.file.path;
      const isVideo = req.file.mimetype.startsWith("video");
      const processedAudioPath = `uploads/${Date.now()}-audio-compressed.mp3`;

      // Process the file: extract or compress audio
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(audioPath).output(processedAudioPath);

        if (isVideo) {
          command.noVideo();
        }

        command
          .audioCodec("libmp3lame")
          .audioBitrate(64)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Delete the original file
      fs.unlinkSync(audioPath);

      // Send to OpenAI for transcription
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(processedAudioPath) as any,
        model: "whisper-1",
        language: "en",
        response_format: "text",
      });

      // Clean up the processed audio file
      fs.unlinkSync(processedAudioPath);

      // Send the transcription as the response
      res.json({ transcription: response });
    } catch (error: any) {
      console.error("Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);


// Health check endpoint
app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to Whisper Transcription API!");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
