import { GoogleGenAI } from "@google/genai";

/**
 * Detects whether the input notes are about Computer Science/Algorithms, Math, or General Science/Academic topics.
 * @param {string} text The user's study notes content.
 * @returns {string} 'cs' | 'math' | 'general'
 */
function detectSubjectCategory(text) {
  if (!text) return "general";
  const lower = text.toLowerCase();

  const csKeywords = [
    "algorithm", "function", "array", "tree", "graph", "database", "sql",
    "pointer", "complexity", "o(n)", "binary", "class", "recursion", "os",
    "dbms", "dijkstra", "banker", "system", "network", "cpu", "thread",
    "hash", "stack", "queue", "variable", "code", "programming", "node", "sorting"
  ];

  const mathKeywords = [
    "matrix", "equation", "calculus", "integral", "derivative", "vector",
    "proof", "theorem", "algebra", "geometry", "probability", "statistics"
  ];

  let csCount = 0;
  for (const kw of csKeywords) {
    if (lower.includes(kw)) csCount++;
  }

  let mathCount = 0;
  for (const kw of mathKeywords) {
    if (lower.includes(kw)) mathCount++;
  }

  if (csCount >= 2) return "cs";
  if (mathCount >= 2) return "math";
  return "general";
}

/**
 * Calls Gemini API with real-time response streaming for study notes.
 * Dynamic subject handling (Biology, History, Science, Math, CS) without forcing CS constraints on general topics.
 * High maxOutputTokens (2048) to prevent response truncation.
 * 
 * @param {string} apiKey User-provided API key or fallback env variable.
 * @param {string} actionType 'summarize' | 'explain' | 'questions' | 'flashcards' | 'diagram'
 * @param {string} notesText The student's study notes content.
 * @param {function(string, string): void} onChunk Callback invoked as each streaming chunk arrives.
 * @returns {Promise<string>} Full accumulated markdown text response.
 */
export async function generateStudyAIStream(apiKey, actionType, notesText, onChunk) {
  const activeKey = apiKey?.trim() || import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!activeKey) {
    throw new Error("API_KEY_REQUIRED");
  }

  const ai = new GoogleGenAI({ apiKey: activeKey });
  const modelName = "gemini-3.6-flash";
  const subjectCategory = detectSubjectCategory(notesText);

  // System Instruction: Adaptable tutor persona across Science, History, Math, CS, and General subjects
  const systemInstruction = `You are an expert AI Study Assistant and Master Tutor across all academic disciplines (Biology, Science, History, Math, Computer Science, Literature, etc.).
Your goal is to make complex study concepts effortless to learn.

Core Directives:
1. Dynamic Subject Tone: Adapt explanations naturally to the domain of the notes (e.g. biological mechanisms for Biology, historical context for History, equations for Math, algorithms for CS).
2. No Forced CS Constraints: Do NOT hardcode or force "Time Complexity", "Space Complexity", or "Edge Cases" UNLESS the user's input is explicitly about computer science, algorithms, or programming code.
3. High Clarity & Structure: Use clean Markdown formatting with clear headings, bold key terms, bullet points, and code backticks for formulas/variables (do NOT output raw LaTeX dollar signs \$\$).
4. Conciseness: Avoid fluff or pleasantries; jump straight into high-value study content.`;

  let prompt = "";

  switch (actionType) {
    case "explain":
      if (subjectCategory === "cs") {
        prompt = `Explain these Computer Science notes simply and intuitively:

1. 💡 **Core Intuition & Real-World Analogy**: High-level overview with 1 clear analogy (e.g. bank teller, postal system).
2. ⚙️ **Step-by-Step Mechanism**: How the system or algorithm works sequentially.
3. ⏱️ **Complexity & Considerations**: Time/space complexity bounds and edge cases to remember for exams.

Notes:
"""
${notesText}
"""`;
      } else {
        prompt = `Explain these study notes simply and intuitively:

1. 💡 **Core Intuition & Real-World Analogy**: Start with an intuitive, real-world analogy (ELI5) that makes the concept instantly clear.
2. 🔬 **Step-by-Step Explanation**: Break down how it works step-by-step using clear, simple language.
3. 📌 **Key Concepts & Takeaways**: Highlight essential rules, key vocabulary, or common misconceptions to watch out for.

Notes:
"""
${notesText}
"""`;
      }
      break;

    case "summarize":
      prompt = `Provide a clean, well-structured summary of these study notes:

📌 **EXECUTIVE SUMMARY**
(2 concise sentences capturing the core essence of the topic)

🎯 **KEY TAKEAWAYS & CORE FACTS**
(Bulleted list of essential principles, facts, and key ideas)

🧠 **ESSENTIAL CONCEPTS & DEFINITIONS**
(Bold key terms with 1-line clear definitions)

Notes:
"""
${notesText}
"""`;
      break;

    case "questions":
      prompt = `Generate 4 to 5 multiple-choice practice quiz questions based on the notes. Format EACH question strictly as follows so it can be rendered interactively:

---QUESTION---
Q: [Clear multiple choice question testing key concepts]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [A, B, C, or D]
EXPLANATION: [Clear explanation of why this answer is correct based on the notes]

Notes:
"""
${notesText}
"""`;
      break;

    case "flashcards":
      prompt = `Extract 5 to 8 essential terms, concepts, or flashcard pairs from the study notes. Format EACH card strictly as follows so it can be rendered interactively:

---FLASHCARD---
FRONT: [Key Term, Concept, or Question]
BACK: [Clear Definition, Explanation, or Core Answer]

Notes:
"""
${notesText}
"""`;
      break;

    case "diagram":
      prompt = `Generate a clear Mermaid.js flowchart or visual mind map to illustrate the concepts or process flow in the notes:

\`\`\`mermaid
graph TD
  A["Main Topic / Process"] --> B["Key Component / Step 1"]
  A --> C["Key Component / Step 2"]
\`\`\`

Provide a 2-sentence summary below the diagram explaining the visual flowchart.

Notes:
"""
${notesText}
"""`;
      break;

    default:
      prompt = `Analyze and format these study notes with academic clarity:\n\n${notesText}`;
  }

  const generationConfig = {
    systemInstruction: systemInstruction,
    temperature: 0.3,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 2048
  };

  let accumulatedText = "";

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: generationConfig
    });

    for await (const chunk of responseStream) {
      const textChunk = chunk.text || "";
      if (textChunk) {
        accumulatedText += textChunk;
        if (onChunk) {
          onChunk(textChunk, accumulatedText);
        }
      }
    }

    return accumulatedText;
  } catch (err) {
    console.warn("Stream failed, falling back to generateContent:", err);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: generationConfig
    });

    const text = response.text || "";
    if (onChunk && text) onChunk(text, text);
    return text;
  }
}
