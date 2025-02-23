import express, { Request, Response, NextFunction } from 'express';
// import mongoose from 'mongoose';
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
  | { role: 'function'; content: string; name: string ; tool_call_id?: string};


type FunctionParameters = {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required: string[];
};


type Tool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: FunctionParameters;
  };
};
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
  async (req: Request, res: Response) => {
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
      const  tools: Tool[] = [
        {
          type: 'function',
          function: {
            name: 'generate_algebra_problem',
            description: 'Creates a algebra math problem on algebra depending on the difficulty level.',
            parameters: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'The algebra math problem depending on difficulty level.' },
              },
              required: ['difficulty'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'generate_english_lesson(',
            description: 'Creates a 5-day roadmap for learning the topic.',
            parameters: {
              type: 'object',
              properties: {
                skill: { type: 'string', description: 'The topic/skill to learn.' },
                duration: { type: 'string', description: 'Duration for the roadmap.' },
              },
              required: ['topic'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'calculate_tip',
            description: 'calculate tips.',
            parameters: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'calculate the tips.' },
                numQuestions: { type: 'number', description: 'calculate the tips depending on the bill and tip percentage.' },
              },
              required: ['bill', 'tipPercentage'],
            },
          },
        },
      ];

      // Make the initial chat completion request with function calling enabled.
      const initialResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', 
        messages,
        tools,
        tool_choice: 'auto',
      });

      // Accessing the first message from the response.
      const responseMessage = initialResponse.choices[0].message;

      // Checking if OpenAI wants to call one of our functions.
      if (responseMessage?.tool_calls) {
        let result = '';
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
  
          if (functionName === 'generate_algebra_problem') {
            result = generateAlgebraProblem(functionArgs.difficulty);
          } else if (functionName === 'generate_english_lesson') {
            result = generateEnglishLesson((functionArgs.skill, functionArgs.duration));
          } else if (functionName === 'calculate_tip') {
            result = calculateTip(functionArgs.bill, functionArgs.tipPercentage);
          }
        }
  
        res.json({ answer: result });
        return;
      } else {
        res.json({ answer: responseMessage });
        return;
      }
    } catch (error: any) {
      console.error('Error in /api/tutor:', error);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  }
);

// AI Tutor API Endpoint
app.post('/api/tutor', async (req: Request, res: Response) => {
  try {
    console.log('Received request body:', req.body);  

    // Validate incoming request using Zod
    const tutorSchema = z.object({
      task: z.enum(['assignment', 'roadmap', 'quiz']),
      topic: z.string(),
      duration: z.string().optional(), // Only for roadmap
      numQuestions: z.number().optional(), // Only for quiz
    });

    const { task, topic, duration, numQuestions } = tutorSchema.parse(req.body);

    // Register AI Tutor functions
    const tools: Tool[] = [
      {
        type: 'function',
        function: {
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
      },
      {
        type: 'function',
        function: {
          name: 'generate_learning_roadmap',
          description: 'Creates a 5-day roadmap for learning the topic.',
          parameters: {
            type: 'object',
            properties: {
              skill: { type: 'string', description: 'The topic/skill to learn.' },
              duration: { type: 'string', description: 'Duration for the roadmap.' },
            },
            required: ['skill', 'duration'],
          },
        },
      },
      {
        type: 'function',
        function: {
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
      },
    ];

    // Send the request to OpenAI with function calling enabled
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `I need a ${task} on ${topic} in ${duration} of ${numQuestions} questions` }],
      tools,
      tool_choice: 'auto',
    });

    // Extract the response message
    const responseMessage = initialResponse.choices[0].message;
    if (responseMessage?.tool_calls) {
      try {
        let result = '';
        // Process each tool call sequentially
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          if (functionName === 'generate_assignment') {
            result = await generateAssignment(functionArgs.difficulty); 
          } else if (functionName === 'generate_learning_roadmap') {
            console.log(functionArgs?.topic, functionArgs?.duration);
            result = await generateLearningRoadmap(functionArgs.topic, functionArgs.duration); 
          } else if (functionName === 'generate_quiz_questions') {
            result = await generateQuizQuestions(functionArgs.topic, functionArgs.numQuestions); 
          }

          // Format the function response
          const functionResponseMessage: ChatCompletionMessageParam = {
            role: 'function',
            name: functionName,
            content: result,
            tool_call_id: toolCall.id, 
          };

          // Send the function response back to OpenAI for processing
          const finalResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'user', content: `I need a ${task} on ${topic}` },
              responseMessage,
              functionResponseMessage,
            ],
          });

          res.json({ answer: finalResponse.choices[0].message });
          return;  
        }
      } catch (error: any) {
        console.error('Error in /api/tutor:', error);
        res.status(500).json({ error: 'Something went wrong.' });
        return; 
      }
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
