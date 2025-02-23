import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';
import bodyParser from 'body-parser';


dotenv.config();

const app = express();
app.use(express.json());
app.use(bodyParser.json());


type ChatCompletionMessageParam =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'function'; content: string; name: string };

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// Generates an algebra problem based on the given difficulty. 
function generateAlgebraProblem(difficulty: string): string {
  if (difficulty === 'easy') {
    return 'Solve for x: x + 2 = 5';
  } else if (difficulty === 'medium') {
    return 'Solve for x: 3x + 4 = 19';
  } else if (difficulty === 'hard') {
    return 'Solve for x: 2(x - 3) + 4 = 10';
  }
  return 'Difficulty not recognized. Please choose easy, medium, or hard.';
}
/** Generates a simple English lesson based on the provided topic. */
function generateEnglishLesson(topic: string): string {
    if (topic.toLowerCase() === 'grammar') {
      return 'Today, we will learn about English grammar basics, including sentence structure, parts of speech, and punctuation.';
    } else if (topic.toLowerCase() === 'vocabulary') {
      return "Let's expand your vocabulary. Here's a list of words along with their meanings and usage examples.";
    } else if (topic.toLowerCase() === 'writing') {
      return "In today's writing lesson, we will explore techniques for crafting clear, concise sentences and structuring paragraphs.";
    }
    return 'Topic not recognized. Please choose grammar, vocabulary, or writing.';
  }

  /** Calculates the tip and total bill amount based on the provided bill and tip percentage. */
function calculateTip(bill: number, tipPercentage: number): string {
  const tip = bill * (tipPercentage / 100);
  const total = bill + tip;
  return `Tip: $${tip.toFixed(2)}. Total bill: $${total.toFixed(2)}.`;
}
// =================================================

// Function to generate an assignment
function generateAssignment(topic: string): string {
  return `Assignment: Write a 500-word essay on "${topic}". Include real-world examples and references.`;
}

// Function to generate a learning roadmap
function generateLearningRoadmap(topic: string, duration: string): string {
  let roadmap = `Here is your ${duration} roadmap for learning ${topic}:\n\n`;

  for (let day = 1; day <= parseInt(duration.split(" ")[0]) ; day++) {
    roadmap += `**Day ${day}:** Learn about an important topic related to ${topic}.\n`;
  }
  console.log("skill and duration: ", topic, duration );
  return roadmap;
}


// Function to generate quiz questions
function generateQuizQuestions(topic: string, numQuestions: number): string {

  let quiz = `Quiz on ${topic}:\n\n`;
  for (let i = 1; i <= numQuestions; i++) {
    quiz += `Q${i}: What is an important concept related to ${topic}?\n`;
  }
  console.log(`Generated ${numQuestions} questions for ${topic}`);  // Debugging log
  return quiz;
}

//  /api/chat endpoint with function calling
app.post(
  '/api/chat',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validating incoming request using Zod.
      const chatSchema = z.object({
        message: z.string(),
        conversation: z
          .array(
            z.object({
              role: z.enum(['system', 'user', 'assistant', 'function']),
              content: z.string(),
              name: z.string().optional(),
            })
          )
          .optional(),
      });
      const { message, conversation } = chatSchema.parse(req.body);

      // Building the conversation messages for OpenAI.
      const messages: ChatCompletionMessageParam[] = conversation
        ? [
            ...conversation.map((msg) => {
              if (msg.role === 'function') {
                return {
                  role: 'function',
                  content: msg.content,
                  name: msg.name ?? 'unknown', // Ensuring that a name is provided.
                } as ChatCompletionMessageParam;
              } else {
                return {
                  role: msg.role,
                  content: msg.content,
                } as ChatCompletionMessageParam;
              }
            }),
            { role: 'user', content: message },
          ]
        : [{ role: 'user', content: message }];

      // Registering the function (tool) for OpenAI.
      const functions = [
        {
          name: 'generate_algebra_problem',
          description: 'Generates a new algebra problem for practice.',
          parameters: {
            type: 'object',
            properties: {
              difficulty: {
                type: 'string',
                description: "The difficulty level: 'easy', 'medium', or 'hard'.",
              },
            },
            required: ['difficulty'],
          },
        },
        {
          name: 'generate_english_lesson',
          description: 'Generates an English lesson based on a given topic.',
          parameters: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: "The lesson topic (e.g., 'grammar', 'vocabulary', or 'writing').",
              },
            },
            required: ['topic'],
          },
        },
        {
          name: 'calculate_tip',
          description: 'Calculates the tip and total bill amount based on the bill and tip percentage.',
          parameters: {
            type: 'object',
            properties: {
              bill: {
                type: 'number',
                description: 'The total bill amount in dollars.',
              },
              tipPercentage: {
                type: 'number',
                description: 'The tip percentage to apply.',
              },
            },
            required: ['bill', 'tipPercentage'],
          },
        },
      ];

      // Make the initial chat completion request with function calling enabled.
      const initialResponse = await openai.chat.completions.create({
        model: 'gpt-4o', 
        messages,
        functions,
        function_call: 'auto',
      });

      // Accessing the first message from the response.
      const responseMessage = initialResponse.choices[0].message;

      // Checking if OpenAI wants to call one of our functions.
      if (responseMessage?.function_call) {
        const functionName = responseMessage.function_call.name;
        const functionArgs = JSON.parse(responseMessage.function_call.arguments);

        if (functionName === 'generate_algebra_problem') {
          // Call our local function with the provided arguments.
          const problem = generateAlgebraProblem(functionArgs.difficulty);

          // Create a message representing the function's response.
          const functionResponseMessage: ChatCompletionMessageParam = {
            role: 'function',
            name: functionName,
            content: problem,
          };

          // Continue the conversation by sending the function response back to OpenAI.
          const finalResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [...messages, responseMessage, functionResponseMessage],
          });

          res.json({ answer: finalResponse.choices[0].message });
          return;
        }
        else if (functionName === 'generate_english_lesson') {
          // Call the English lesson function.
          const lesson = generateEnglishLesson(functionArgs.topic);
          const functionResponseMessage: ChatCompletionMessageParam = {
            role: 'function',
            name: functionName,
            content: lesson,
          };

          // Continue the conversation by sending the function response back to OpenAI.
          const finalResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [...messages, responseMessage, functionResponseMessage],
          });

          res.json({ answer: finalResponse.choices[0].message });
          return;
        }
        else if (functionName === 'calculate_tip') {
          // Call the tip calculator function.
          const tipResult = calculateTip(functionArgs.bill, functionArgs.tipPercentage);
          const functionResponseMessage: ChatCompletionMessageParam = {
            role: 'function',
            name: functionName,
            content: tipResult,
          };
        
          // Continue the conversation by sending the function response back to OpenAI.
          const finalResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [...messages, responseMessage, functionResponseMessage],
          });
        
          res.json({ answer: finalResponse.choices[0].message });
          return;
        }
        
      } else {
        res.json({ answer: responseMessage });
        return;
      }
    } catch (error: any) {
      console.error('Error in /api/chat:', error);
      res.status(500).json({ error: 'Something went wrong.' });
      return;
    }
  }
);

// AI Tutor API Endpoint
app.post('/api/tutor', async (req: Request, res: Response) => {
  try {
    console.log('Received request body:', req.body);  // ✅ Log full request

    // Validate incoming request using Zod
    const tutorSchema = z.object({
      task: z.enum(['assignment', 'roadmap', 'quiz']),
      topic: z.string(),
      duration: z.string().optional(), // Only for roadmap
      numQuestions: z.number().optional(), // Only for quiz
    });

    const { task, topic, duration, numQuestions } = tutorSchema.parse(req.body);

    // Register AI Tutor functions
    const functions = [
      {
        name: 'generate_assignment',
        description: 'Creates an assignment on a given topic.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The topic for the assignment.' },
          },
          required: ['topic'],
        },
      },
      {
        name: 'generate_learning_roadmap',
        description: 'Creates a 5 day roadmap for learning the topic.',
        parameters: {
          type: 'object',
          properties: {
            skill: { type: 'string', description: 'The topic/skill to learn.' },
            duration: { type: 'string', description: 'duration for the roadmap.' },
          },
          required: ['skill', 'duration'],
        },
      },
      {
        name: 'generate_quiz_questions',
        description: 'Generates a set of quiz questions on a given topic.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The topic of the quiz.' },
            numQuestions: { type: 'number', description: 'Number of questions in the quiz.' },
          },
          required: ['topic', 'numQuestions'],
        },
      },
    ];

    // Send the request to OpenAI with function calling enabled
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `I need a ${task} on ${topic}` }],
      functions,
      function_call: 'auto',
    });

    // Extract the response message
    const responseMessage = initialResponse.choices[0].message;

    if (responseMessage?.function_call) {
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);

      let result = '';

      if (functionName === 'generate_assignment') {
        result = generateAssignment(functionArgs.topic);
      } else if (functionName === 'generate_learning_roadmap') {
        console.log(functionArgs?.topic, functionArgs?.duration);
        result = generateLearningRoadmap(functionArgs.topic, functionArgs.duration);
      } else if (functionName === 'generate_quiz_questions') {
        result = generateQuizQuestions(functionArgs.topic, functionArgs.numQuestions);
      }

      // Format the function response
      const functionResponseMessage: ChatCompletionMessageParam = {
        role: 'function',
        name: functionName,
        content: result,
      };

      // Send the function response back to OpenAI for processing
      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [...[{ role: 'user' as const, content: `I need a ${task} on ${topic}` }], responseMessage, functionResponseMessage],
      });

      res.json({ answer: finalResponse.choices[0].message });
      return;
    } else {
      res.json({ answer: responseMessage });
      return;
    }
  } catch (error: any) {
    console.error('Error in /api/tutor:', error);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});


// -------------------------------------------
// Connect to MongoDB (optional for logging or persistence)
// -------------------------------------------
// mongoose
//   .connect(process.env.MONGO_URI || '')
//   .then(() => console.log('MongoDB connected'))
//   .catch((err: any) => console.error('MongoDB connection error:', err));

// Start the Express server.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
