import { GoogleGenAI } from "@google/genai";

/**
 * Calls Gemini API with hyper-fast real-time response streaming for Computer Science & Engineering content.
 * Configured with Engineering Professor persona, temperature 0.3, topP 0.8, topK 20, maxOutputTokens 800.
 * 
 * @param {string} apiKey User-provided API key or fallback env variable.
 * @param {string} actionType 'summarize' | 'explain' | 'questions' | 'flashcards' | 'diagram'
 * @param {string} notesText The student's study notes content.
 * @param {function(string, string): void} onChunk Callback invoked as each streaming chunk arrives (chunkText, currentFullText).
 * @returns {Promise<string>} Full accumulated markdown text response.
 */
export async function generateStudyAIStream(apiKey, actionType, notesText, onChunk) {
  const activeKey = apiKey?.trim() || import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!activeKey) {
    throw new Error("API_KEY_REQUIRED");
  }

  const ai = new GoogleGenAI({ apiKey: activeKey });
  const modelName = "gemini-3.6-flash";

  let prompt = "";
  const systemInstruction = `You are an expert Computer Science & Engineering Professor and AI Tutor.
Provide rigorous, technical explanations using clear, concise language and intuitive real-world engineering analogies.
Rules:
- Format output systematically with clear Markdown headings, technical key terms, time/space complexity (e.g., O(n), O((V+E) log V), O(log_B N)), and logical step-by-step breakdowns.
- Omit conversational fluff, elementary filler, or generic introductory/concluding pleasantries.
- Output high-impact, exam-ready engineering content directly.`;

  switch (actionType) {
    case "summarize":
      prompt = `Provide a rigorous, high-impact engineering summary of these notes:

📌 **ENGINEERING EXECUTIVE SUMMARY**
(2 technical sentences summarizing core system/algorithm mechanism)

🎯 **CORE ARCHITECTURAL TAKEAWAYS**
(Bulleted list of critical engineering principles, invariants, and implementation facts)

🧠 **TECHNICAL TERMS & COMPLEXITY**
(Bold key terms with 1-line definitions and time/space complexity bounds where applicable)

Notes:
"""
${notesText}
"""`;
      break;

    case "explain":
      prompt = `Provide a rigorous yet intuitive engineering breakdown of the core concepts:

1. **System Architecture / Core Mechanism**: Technical high-level overview.
2. **Algorithmic Step-by-Step Flow**: Logical sequential execution breakdown.
3. **Engineering Analogy**: 1 clear, intuitive real-world system analogy (e.g. bank teller resource allocation, highway network routing, disk block indexing).
4. **Complexity & Edge Cases**: Big-O Time/Space complexity analysis and critical edge case traps to avoid in exams/interviews.

Notes:
"""
${notesText}
"""`;
      break;

    case "questions":
      prompt = `Generate 4 to 5 rigorous multiple-choice engineering exam questions based on the notes. Format EACH question strictly:

---QUESTION---
Q: [Technical question testing algorithms, data structures, or systems concepts]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [A, B, C, or D]
EXPLANATION: [Concise technical justification with mathematical or algorithmic proof]

Notes:
"""
${notesText}
"""`;
      break;

    case "flashcards":
      prompt = `Extract 5 to 8 key engineering flashcard pairs (formulas, algorithms, data structures, complexities) from the notes. Format EACH card strictly:

---FLASHCARD---
FRONT: [Engineering Term, Formula, or Question]
BACK: [Technical Definition, Algorithmic Step, or Complexity Bound]

Notes:
"""
${notesText}
"""`;
      break;

    case "diagram":
      prompt = `Generate a clear Mermaid.js flowchart or architectural mind map to visualize the system flow or data structure:

\`\`\`mermaid
graph TD
  A["Start Process / Node"] --> B["Next Step / Subtree"]
\`\`\`

Provide a 2-sentence technical architectural explanation below the diagram.

Notes:
"""
${notesText}
"""`;
      break;

    default:
      prompt = `Analyze and format these CS engineering notes with technical rigor:\n\n${notesText}`;
  }

  const generationConfig = {
    systemInstruction: systemInstruction,
    temperature: 0.3,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 800
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

    // Fallback standard call
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
