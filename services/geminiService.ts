
import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64,
      mimeType,
    },
  };
};

export const extractTopicsFromGuide = async (fileBase64: string, mimeType: string): Promise<string[]> => {
  const model = "gemini-2.5-flash";
  const parts = [fileToGenerativePart(fileBase64, mimeType)];

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topics: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of high-level objectives and their first-level subsections.'
          },
          isGuide: {
            type: Type.BOOLEAN,
            description: 'True if the document appears to be an exam guide or technical outline.'
          }
        }
      }
    }
  });

  const jsonResponse = JSON.parse(response.text);
  if (!jsonResponse.isGuide) {
    throw new Error("The uploaded document does not appear to be a valid exam guide. Please upload a relevant file.");
  }
  return jsonResponse.topics || [];
};

export const generateQuizQuestions = async (
  fileBase64: string,
  mimeType: string,
  topics: string[],
  questionCount: number
): Promise<QuizQuestion[]> => {
  const model = "gemini-2.5-pro";
  
  // Step 1: Gather Information from Official Sources
  const searchPrompt = `Based on the provided exam guide, find the most recent and relevant official documentation, whitepapers, or technical guides that contain content aligning with these user-selected objectives: ${topics.join(", ")}.`;
  
  const searchResponse = await ai.models.generateContent({
    model,
    contents: [{
      parts: [
        fileToGenerativePart(fileBase64, mimeType),
        { text: searchPrompt }
      ]
    }],
    config: {
      tools: [{googleSearch: {}}],
    },
  });

  const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
  const groundingChunks = groundingMetadata?.groundingChunks || [];

  let sourcesText = "No external sources found. Please rely solely on the provided exam guide.";
  if (groundingChunks.length > 0) {
    sourcesText = "Use the following official sources as the primary reference for generating questions:\n" +
      groundingChunks.map(chunk => `- Title: ${chunk.web.title}, URL: ${chunk.web.uri}`).join('\n');
  } else {
     // Optional: notify user or proceed based on user preference. Here we proceed.
  }

  // Step 2: Generate Quiz Questions
  const generationPrompt = `
    You are a world-class exam item writer specializing in advanced technical certifications. Your task is to create a challenging, scenario-based multiple-choice quiz.
    
    **Source Material:**
    1.  The primary source is the user-provided exam guide.
    2.  Ground your questions and feedback in the following official sources discovered online:
        ${sourcesText}

    **Task Details:**
    -   Generate exactly ${questionCount} multiple-choice quiz questions.
    -   The questions must test the user's ability to apply and analyze concepts related to these topics: ${topics.join(", ")}.
    -   Each question must strictly adhere to the ITEM WRITING GUIDELINES below.
    -   For each question, provide detailed feedback for **every** answer choice, explaining why it is correct or incorrect.
    -   The feedback must be grounded in the provided sources.
    -   Include one relevant source URL for each question from the list of official sources.

    **ITEM WRITING GUIDELINES:**

    **Question Design:**
    - The intent of the exam item must be to discriminate between those who understand the concept and those who don't.
    - Use the highest possible cognitive levels of Bloom's Taxonomy when constructing the question and answers (Apply, Analyze, Evaluate, Create).
    - Use active voice, present tense, 6th-grade reading level, and clear focus.
    - Avoid absolute modifiers, opinion-based words, content repetition, slang, idioms, and humor.
    - Make items independent, factual, and avoid tricks, trivia, UI focus, or default behavior.
    - Do not use the word "not" in the stem or question of any exam item.

    **Answer Format:**
    - Use multiple choice format with a single absolutely correct answer.
    - Write answer choices with parallel structure.
    - There must be 3 plausible distractors in addition to the correct answer choice.
    - You may never use "all of the above" or "none of the above".
    - You cannot use true/false, matching, or ordering questions.

    **Verification:**
    - You must verify the correct answer is truly accurate.
    - You must verify the distractors, while plausible, are absolutely incorrect.
  `;

  const questionGenResponse = await ai.models.generateContent({
    model,
    contents: [{
      parts: [
        fileToGenerativePart(fileBase64, mimeType),
        { text: generationPrompt }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING, description: "The scenario-based question stem." },
            answers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING, description: "The answer choice text." },
                  isCorrect: { type: Type.BOOLEAN, description: "Indicates if this is the correct answer." },
                  feedback: { type: Type.STRING, description: "Detailed explanation for why this choice is correct or incorrect." }
                },
                required: ["text", "isCorrect", "feedback"]
              },
              minItems: 4,
              maxItems: 4
            },
            source: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Title of the source document." },
                url: { type: Type.STRING, description: "URL of the source document." }
              },
              required: ["title", "url"]
            }
          },
          required: ["question", "answers", "source"]
        }
      }
    }
  });

  const quizData: QuizQuestion[] = JSON.parse(questionGenResponse.text);

  // Final validation to ensure we have exactly one correct answer per question.
  return quizData.filter(q => q.answers.filter(a => a.isCorrect).length === 1);
};
