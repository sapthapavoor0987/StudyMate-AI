import { generateStudyAIStream } from "./geminiService.js";

// State Management
let currentApiKey = localStorage.getItem("studymate_gemini_key") || "";
let currentTheme = localStorage.getItem("studymate_theme") || "dark";
let speechUtterance = null;

// Dynamic Lazy-Loaded Modules for Bundle Reduction & Rapid Initial Load
let mermaidModule = null;
let confettiModule = null;
let markedModule = null;

async function getMarked() {
  if (!markedModule) {
    const mod = await import("marked");
    markedModule = mod.marked;
    markedModule.setOptions({
      breaks: true,
      gfm: true
    });
  }
  return markedModule;
}

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import("mermaid");
    mermaidModule = mod.default || mod;
    mermaidModule.initialize({
      startOnLoad: false,
      theme: currentTheme === "dark" ? "dark" : "default",
      securityLevel: "loose",
      fontFamily: "Inter, sans-serif"
    });
  }
  return mermaidModule;
}

async function getConfetti() {
  if (!confettiModule) {
    const mod = await import("canvas-confetti");
    confettiModule = mod.default || mod;
  }
  return confettiModule;
}

// Flashcard Deck Interactive State
let flashcardDeck = [];
let currentCardIndex = 0;
let isFlipped = false;
let flashcardViewMode = "flip"; // 'flip' | 'list'

// Quiz Interactive State
let quizQuestions = [];
let currentQuizIndex = 0;
let userQuizAnswers = {};
let quizScore = 0;

let currentAction = "";
let lastRawResponse = "";

// Sample Notes Templates (Computer Science & Engineering Topics)
const PRESETS = {
  bankers: `Operating Systems: Banker's Algorithm (Deadlock Avoidance)

The Banker's Algorithm is a deadlock avoidance and resource allocation algorithm developed by Edsger Dijkstra. It tests for safety by simulating the allocation of maximum declared resources for all active processes before determining whether the system state remains safe.

Key Data Structures (for n processes and m resource types):
1. Available[m]: Vector of available instances of each resource type.
2. Max[n][m]: Matrix defining maximum demand of each process.
3. Allocation[n][m]: Matrix defining currently allocated resources to each process.
4. Need[n][m]: Matrix defining remaining resource request needed by each process.
   Formula: Need[i][j] = Max[i][j] - Allocation[i][j]

Safety Algorithm Steps:
1. Let Work = Available and Finish[i] = false for all i in [0, n-1].
2. Find an index i such that Finish[i] == false and Need[i] <= Work.
3. If no such process i exists, jump to step 4. If found:
   Work = Work + Allocation[i]
   Finish[i] = true
   Repeat step 2.
4. If Finish[i] == true for all i, the system is in a SAFE STATE. Otherwise, UNSAFE state (potential deadlock).

Time Complexity: O(m * n^2) where n is number of processes and m is resource types.`,

  dijkstra: `Data Structures & Algorithms: Dijkstra's Shortest Path Algorithm

Dijkstra's algorithm is a greedy single-source shortest path algorithm for directed or undirected weighted graphs with non-negative edge weights.

Algorithm Workflow:
1. Initialize distance array dist[v] = Infinity for all vertices v except dist[source] = 0.
2. Maintain a Min-Priority Queue PQ storing (distance, vertex) pairs. Insert (0, source) into PQ.
3. While PQ is not empty:
   a. Extract vertex u with minimum distance dist[u] from PQ.
   b. For each neighboring vertex v connected by edge (u, v) with weight w:
      If dist[u] + w < dist[v] (Relaxation Step):
         dist[v] = dist[u] + w
         Insert (dist[v], v) into PQ.
4. Return dist array containing shortest distance from source to all vertices.

Complexity Analysis:
- Time Complexity with Min-Heap: O((V + E) log V) where V is vertices and E is edges.
- Space Complexity: O(V + E) for storing adjacency list graph and priority queue.
- Limitation: Fails on graphs containing negative edge weights (requires Bellman-Ford algorithm).`,

  bplusTree: `Database Management Systems: B+ Tree Indexing

A B+ Tree is a self-balancing N-ary search tree used extensively in database storage engines (such as MySQL InnoDB and PostgreSQL) to optimize block disk I/O operations for index searches and range queries.

Structural Characteristics:
1. Internal Nodes: Store search key values and child node pointers ONLY for routing. They do NOT store actual data records.
2. Leaf Nodes: Store all data records (or data record pointers) connected together in a doubly-linked list.
3. High Fanout (Order M): Every node (except root) contains between ceil(M/2) and M child pointers, keeping tree height extremely low (typically height = 3 to 4 for millions of records).

Operations & Performance:
- Point Lookup Query: O(log_B N) where B is fanout factor and N is total records.
- Range Scan Query (e.g. WHERE age BETWEEN 20 AND 30): Locates starting key in O(log_B N), then traverses the leaf node doubly-linked list sequentially in O(K) without traversing up the tree.
- Space Complexity: O(N). Node splits occur when a node exceeds M keys; node merges occur when a node drops below ceil(M/2) keys.`
};

// DOM Elements
const notesInput = document.getElementById("notesInput");
const wordCountEl = document.getElementById("wordCount");
const charCountEl = document.getElementById("charCount");
const keyIndicator = document.getElementById("keyIndicator");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const pasteBtn = document.getElementById("pasteBtn");
const clearBtn = document.getElementById("clearBtn");

// Action Buttons
const btnSummarize = document.getElementById("btnSummarize");
const btnExplain = document.getElementById("btnExplain");
const btnQuestions = document.getElementById("btnQuestions");
const btnFlashcards = document.getElementById("btnFlashcards");
const btnDiagram = document.getElementById("btnDiagram");

// Output Containers
const outputIcon = document.getElementById("outputIcon");
const outputTitle = document.getElementById("outputTitle");
const outputControls = document.getElementById("outputControls");
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const loadingText = document.getElementById("loadingText");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const errorFixBtn = document.getElementById("errorFixBtn");
const responseContainer = document.getElementById("responseContainer");

// Tools
const copyBtn = document.getElementById("copyBtn");
const speakBtn = document.getElementById("speakBtn");
const downloadBtn = document.getElementById("downloadBtn");
const toast = document.getElementById("toast");

// Modal Elements
const apiKeyBtn = document.getElementById("apiKeyBtn");
const apiKeyModal = document.getElementById("apiKeyModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelKeyBtn = document.getElementById("cancelKeyBtn");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const removeKeyBtn = document.getElementById("removeKeyBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");

// Generic Debounce Utility (200ms delay) for high performance typing
function debounce(fn, delay = 200) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Helper: Escape HTML
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  updateApiKeyStatusUI();
  setupEventListeners();
  updateWordAndCharCount();
});

function initTheme() {
  document.body.setAttribute("data-theme", currentTheme);
  themeToggleBtn.querySelector(".theme-icon").textContent = currentTheme === "dark" ? "🌙" : "☀️";
  if (mermaidModule) {
    mermaidModule.initialize({
      theme: currentTheme === "dark" ? "dark" : "default"
    });
  }
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("studymate_theme", currentTheme);
  initTheme();
}

function updateApiKeyStatusUI() {
  const activeKey = currentApiKey?.trim() || import.meta.env.VITE_GEMINI_API_KEY || "";
  if (activeKey && activeKey.length > 5) {
    keyIndicator.classList.add("active");
    keyIndicator.title = "Gemini API Key is Active & Ready!";
    apiKeyBtn.title = "API Key Status: Active & Ready (Click to edit)";
  } else {
    keyIndicator.classList.remove("active");
    keyIndicator.title = "No API Key configured - click to enter key";
    apiKeyBtn.title = "API Key Status: Not Set (Click to configure)";
  }
}

function updateWordAndCharCount() {
  const text = notesInput.value.trim();
  const charCount = text.length;
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  wordCountEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
  charCountEl.textContent = `${charCount} char${charCount === 1 ? '' : 's'}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function showState(stateName) {
  requestAnimationFrame(() => {
    emptyState.style.display = stateName === "empty" ? "flex" : "none";
    loadingState.style.display = stateName === "loading" ? "flex" : "none";
    errorState.style.display = stateName === "error" ? "flex" : "none";
    responseContainer.style.display = stateName === "response" ? "block" : "none";
    outputControls.style.display = stateName === "response" ? "flex" : "none";
  });
}

/**
 * Lazy-loads Mermaid.js and renders Mermaid Code Blocks into Interactive SVG Diagrams
 */
async function processMermaidDiagrams(container) {
  const codeBlocks = container.querySelectorAll("pre code.language-mermaid, pre code.lang-mermaid, pre code");
  let renderedCount = 0;

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const rawText = codeEl.textContent.trim();

    if (rawText.startsWith("graph ") || rawText.startsWith("flowchart ") || rawText.startsWith("mindmap") || codeEl.classList.contains("language-mermaid")) {
      const preEl = codeEl.parentElement;
      try {
        const mermaid = await getMermaid();
        const id = `mermaid-svg-${Date.now()}-${i}`;
        const { svg } = await mermaid.render(id, rawText);

        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-wrapper";
        wrapper.innerHTML = svg;

        preEl.replaceWith(wrapper);
        renderedCount++;
      } catch (err) {
        console.warn("Mermaid rendering warning:", err);
      }
    }
  }
  return renderedCount;
}

/**
 * Parses raw text into structured Flashcard objects [{ front, back }]
 */
function parseFlashcards(text) {
  const cards = [];

  if (text.includes("---FLASHCARD---") || (text.includes("FRONT:") && text.includes("BACK:"))) {
    const blocks = text.split(/---FLASHCARD---|---/i).filter(b => b.includes("FRONT:") && b.includes("BACK:"));
    for (const block of blocks) {
      const frontMatch = block.match(/FRONT:\s*(.*?)(?=BACK:|$)/s);
      const backMatch = block.match(/BACK:\s*(.*?)$/s);
      if (frontMatch && backMatch) {
        cards.push({
          front: frontMatch[1].trim().replace(/^\**|\**$/g, ''),
          back: backMatch[1].trim().replace(/^\**|\**$/g, '')
        });
      }
    }
  }

  if (cards.length === 0) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentFront = "";
    let currentBack = "";

    for (const line of lines) {
      if (line.match(/^(?:-\s*)?(?:Front|\*\*Front\*\*|Question|Term):\s*(.*)/i)) {
        if (currentFront && currentBack) {
          cards.push({ front: currentFront, back: currentBack });
          currentBack = "";
        }
        currentFront = line.replace(/^(?:-\s*)?(?:Front|\*\*Front\*\*|Question|Term):\s*/i, '').replace(/\*/g, '').trim();
      } else if (line.match(/^(?:-\s*)?(?:Back|\*\*Back\*\*|Answer|Definition):\s*(.*)/i)) {
        currentBack = line.replace(/^(?:-\s*)?(?:Back|\*\*Back\*\*|Answer|Definition):\s*/i, '').replace(/\*/g, '').trim();
      }
    }

    if (currentFront && currentBack) {
      cards.push({ front: currentFront, back: currentBack });
    }
  }

  return cards;
}

/**
 * Parses raw text into structured Quiz Question objects [{ question, options, correctAnswer, explanation }]
 */
function parseQuizQuestions(text) {
  const questions = [];

  const blocks = text.split(/---QUESTION---|---/i).filter(b => b.includes("Q:") || b.match(/\bA\)/));

  for (const block of blocks) {
    const qMatch = block.match(/Q:\s*(.*?)(?=\s*[A-D]\)|$)/s);
    const aMatch = block.match(/A\)\s*(.*?)(?=\s*B\)|$)/s);
    const bMatch = block.match(/B\)\s*(.*?)(?=\s*C\)|$)/s);
    const cMatch = block.match(/C\)\s*(.*?)(?=\s*D\)|$)/s);
    const dMatch = block.match(/D\)\s*(.*?)(?=\s*CORRECT:|\s*EXPLANATION:|$)/s);
    const correctMatch = block.match(/CORRECT:\s*([A-D])/i);
    const expMatch = block.match(/EXPLANATION:\s*(.*?)$/s);

    if (qMatch && aMatch && bMatch && cMatch && dMatch && correctMatch) {
      questions.push({
        question: qMatch[1].trim(),
        options: [
          aMatch[1].trim(),
          bMatch[1].trim(),
          cMatch[1].trim(),
          dMatch[1].trim()
        ],
        correctAnswer: correctMatch[1].toUpperCase(),
        explanation: expMatch ? expMatch[1].trim() : "Correct answer based on your study notes."
      });
    }
  }

  return questions;
}

/**
 * Renders Interactive Practice Quiz Suite Component
 */
async function renderQuizSuite() {
  if (!quizQuestions || quizQuestions.length === 0) {
    const marked = await getMarked();
    responseContainer.innerHTML = marked.parse(lastRawResponse);
    return;
  }

  const totalQ = quizQuestions.length;
  const answeredCount = Object.keys(userQuizAnswers).length;

  if (currentQuizIndex >= totalQ) {
    const percent = Math.round((quizScore / totalQ) * 100);
    let feedbackMsg = "Keep reviewing your study notes to master all key topics!";
    let icon = "📊";
    if (percent === 100) {
      feedbackMsg = "🌟 Outstanding! Perfect 100% Score! You've mastered these notes completely.";
      icon = "🏆";
    } else if (percent >= 75) {
      feedbackMsg = "🎉 Great Job! You have a solid grasp of the core concepts.";
      icon = "🥇";
    } else if (percent >= 50) {
      feedbackMsg = "👍 Good effort! Review your notes once more for a top score.";
      icon = "📚";
    }

    responseContainer.innerHTML = `
      <div class="quiz-results-container">
        <div class="results-badge-icon">${icon}</div>
        <h3 style="font-family: var(--font-heading); font-size: 1.5rem;">Practice Quiz Complete!</h3>
        <div class="results-score-display">
          Score: ${quizScore} / ${totalQ} (<span class="score-percent">${percent}%</span>)
        </div>
        <p class="results-feedback">${feedbackMsg}</p>
        <button id="retryQuizBtn" class="primary-btn" style="margin-top: 0.5rem;">🔄 Retake Practice Quiz</button>
      </div>
    `;

    document.getElementById("retryQuizBtn").addEventListener("click", () => {
      quizQuestions.sort(() => Math.random() - 0.5);
      currentQuizIndex = 0;
      userQuizAnswers = {};
      quizScore = 0;
      renderQuizSuite();
    });

    const confetti = await getConfetti();
    confetti({
      particleCount: percent >= 75 ? 85 : 35,
      spread: 70,
      origin: { y: 0.7 }
    });

    return;
  }

  const q = quizQuestions[currentQuizIndex];
  const previousAnswer = userQuizAnswers[currentQuizIndex];
  const letters = ['A', 'B', 'C', 'D'];

  let optionsHTML = '';
  q.options.forEach((opt, idx) => {
    const letter = letters[idx];
    let extraClass = '';
    let statusIcon = '';

    if (previousAnswer) {
      extraClass = 'disabled';
      if (previousAnswer.selected === letter) {
        if (previousAnswer.isCorrect) {
          extraClass += ' selected-correct';
          statusIcon = '<span class="option-status-icon">✓</span>';
        } else {
          extraClass += ' selected-wrong';
          statusIcon = '<span class="option-status-icon">✗</span>';
        }
      } else if (q.correctAnswer === letter) {
        extraClass += ' show-correct-hint';
        statusIcon = '<span class="option-status-icon">✓</span>';
      }
    }

    optionsHTML += `
      <button class="quiz-option-btn ${extraClass}" data-letter="${letter}">
        <span class="option-letter">${letter}</span>
        <span class="option-text">${escapeHTML(opt)}</span>
        ${statusIcon}
      </button>
    `;
  });

  let explanationHTML = '';
  if (previousAnswer) {
    explanationHTML = `
      <div class="quiz-explanation-box">
        <span class="explanation-title">💡 Explanation:</span>
        <div class="explanation-text">${escapeHTML(q.explanation)}</div>
      </div>
    `;
  }

  const html = `
    <div class="quiz-suite-container">
      <div class="quiz-header-bar">
        <span class="card-counter-badge">Question ${currentQuizIndex + 1} of ${totalQ}</span>
        <span class="quiz-score-badge">Score: ${quizScore} / ${answeredCount}</span>
      </div>

      <div class="quiz-card">
        <div class="quiz-question-title">
          <span style="color: var(--primary);">Q${currentQuizIndex + 1}.</span> ${escapeHTML(q.question)}
        </div>

        <div class="quiz-options-grid">
          ${optionsHTML}
        </div>

        ${explanationHTML}

        <div class="flashcard-nav-controls" style="margin-top: 0.5rem;">
          <button id="prevQuizBtn" class="nav-circle-btn" ${currentQuizIndex === 0 ? 'disabled' : ''} title="Previous Question">◀</button>
          <button id="nextQuizBtn" class="primary-btn" ${!previousAnswer ? 'disabled' : ''}>
            ${currentQuizIndex === totalQ - 1 ? 'Finish Quiz 🏁' : 'Next Question ➔'}
          </button>
        </div>
      </div>
    </div>
  `;

  responseContainer.innerHTML = html;

  // Bind Option Clicks
  const optionBtns = responseContainer.querySelectorAll(".quiz-option-btn");
  optionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (userQuizAnswers[currentQuizIndex]) return;

      const selectedLetter = btn.dataset.letter;
      const isCorrect = selectedLetter === q.correctAnswer;

      userQuizAnswers[currentQuizIndex] = {
        selected: selectedLetter,
        isCorrect: isCorrect
      };

      if (isCorrect) {
        quizScore++;
        getConfetti().then(confetti => {
          confetti({
            particleCount: 25,
            spread: 50,
            origin: { y: 0.8 }
          });
        });
      }

      renderQuizSuite();
    });
  });

  // Bind Navigation
  const prevBtn = document.getElementById("prevQuizBtn");
  const nextBtn = document.getElementById("nextQuizBtn");

  prevBtn.addEventListener("click", () => {
    if (currentQuizIndex > 0) {
      currentQuizIndex--;
      renderQuizSuite();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (userQuizAnswers[currentQuizIndex] && currentQuizIndex < totalQ) {
      currentQuizIndex++;
      renderQuizSuite();
    }
  });
}

/**
 * Renders Interactive 3D Flashcards Deck Component
 */
async function renderFlashcardsDeck() {
  if (!flashcardDeck || flashcardDeck.length === 0) {
    const marked = await getMarked();
    responseContainer.innerHTML = marked.parse(lastRawResponse);
    return;
  }

  if (flashcardViewMode === "list") {
    let listHTML = `
      <div class="flashcard-deck-container">
        <div class="flashcard-toolbar">
          <span class="card-counter-badge">Total Cards: ${flashcardDeck.length}</span>
          <div class="deck-actions">
            <button id="toggleViewModeBtn" class="tool-btn">🎴 Switch to 3D Flip Cards</button>
          </div>
        </div>
        <div class="flashcards-list-view">
    `;

    flashcardDeck.forEach((card, idx) => {
      listHTML += `
        <div class="flashcard-list-item">
          <div class="list-front">🎴 Card ${idx + 1}: ${escapeHTML(card.front)}</div>
          <div class="list-back">💡 ${escapeHTML(card.back)}</div>
        </div>
      `;
    });
    listHTML += `</div></div>`;
    responseContainer.innerHTML = listHTML;

    document.getElementById("toggleViewModeBtn").addEventListener("click", () => {
      flashcardViewMode = "flip";
      renderFlashcardsDeck();
    });
    return;
  }

  const card = flashcardDeck[currentCardIndex];

  const html = `
    <div class="flashcard-deck-container">
      <div class="flashcard-toolbar">
        <span class="card-counter-badge">Card ${currentCardIndex + 1} of ${flashcardDeck.length}</span>
        <div class="deck-actions">
          <button id="shuffleDeckBtn" class="tool-btn" title="Shuffle Cards">🔀 Shuffle</button>
          <button id="toggleViewModeBtn" class="tool-btn" title="View as List">📋 View List</button>
        </div>
      </div>

      <div class="flashcard-scene" id="flashcardScene">
        <div class="flashcard-3d ${isFlipped ? 'is-flipped' : ''}" id="flashcardElement">
          
          <!-- Front Face -->
          <div class="card-face card-face-front">
            <div class="card-face-header">
              <span class="face-tag tag-front">QUESTION / TERM</span>
              <span class="face-counter">#${currentCardIndex + 1}</span>
            </div>
            <div class="card-face-body">
              <div class="card-question-text">${escapeHTML(card.front)}</div>
            </div>
            <div class="card-face-footer">
              <span class="flip-hint">💡 Click card or press Space to flip 🔄</span>
            </div>
          </div>

          <!-- Back Face -->
          <div class="card-face card-face-back">
            <div class="card-face-header">
              <span class="face-tag tag-back">ANSWER / DEFINITION</span>
              <span class="face-counter">#${currentCardIndex + 1}</span>
            </div>
            <div class="card-face-body">
              <div class="card-answer-text">${escapeHTML(card.back)}</div>
            </div>
            <div class="card-face-footer">
              <span class="flip-hint">🔄 Click card to flip back</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Navigation Controls -->
      <div class="flashcard-nav-controls">
        <button id="prevCardBtn" class="nav-circle-btn" ${currentCardIndex === 0 ? 'disabled' : ''} title="Previous Card (← Left Arrow)">◀</button>
        <button id="flipCardMainBtn" class="flip-btn-main">🔄 Flip Card</button>
        <button id="nextCardBtn" class="nav-circle-btn" ${currentCardIndex === flashcardDeck.length - 1 ? 'disabled' : ''} title="Next Card (→ Right Arrow)">▶</button>
      </div>
    </div>
  `;

  responseContainer.innerHTML = html;

  // Event Listeners for Flashcard Deck
  const scene = document.getElementById("flashcardScene");
  const cardElem = document.getElementById("flashcardElement");
  const prevBtn = document.getElementById("prevCardBtn");
  const nextBtn = document.getElementById("nextCardBtn");
  const flipBtn = document.getElementById("flipCardMainBtn");
  const shuffleBtn = document.getElementById("shuffleDeckBtn");
  const toggleViewBtn = document.getElementById("toggleViewModeBtn");

  const flipCard = () => {
    isFlipped = !isFlipped;
    cardElem.classList.toggle("is-flipped", isFlipped);
  };

  scene.addEventListener("click", flipCard);
  flipBtn.addEventListener("click", flipCard);

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentCardIndex > 0) {
      isFlipped = false;
      currentCardIndex--;
      renderFlashcardsDeck();
    }
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentCardIndex < flashcardDeck.length - 1) {
      isFlipped = false;
      currentCardIndex++;
      renderFlashcardsDeck();
    }
  });

  shuffleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    flashcardDeck.sort(() => Math.random() - 0.5);
    currentCardIndex = 0;
    isFlipped = false;
    renderFlashcardsDeck();
    showToast("🔀 Flashcard deck shuffled!");
  });

  toggleViewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    flashcardViewMode = "list";
    renderFlashcardsDeck();
  });
}

async function handleAIAction(actionType) {
  currentAction = actionType;
  const notesText = notesInput.value.trim();

  if (!notesText) {
    showToast("⚠️ Please enter or paste study notes first!");
    notesInput.focus();
    return;
  }

  // Cancel any ongoing speech synthesis
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (speakBtn) {
    speakBtn.classList.remove("is-speaking");
    speakBtn.innerHTML = `<span class="speaker-icon-anim">🔊</span> <span class="speak-label">Listen</span>`;
  }

  // Titles & Icons map
  const actionMeta = {
    summarize: { title: "Study Summary", icon: "✨", loading: "Streaming key takeaways..." },
    explain: { title: "Simplified Explanation", icon: "💡", loading: "Streaming step-by-step breakdown..." },
    questions: { title: "Interactive Practice Quiz", icon: "🎯", loading: "Streaming practice quiz..." },
    flashcards: { title: "Interactive Flashcard Deck", icon: "🎴", loading: "Streaming 3D flashcards..." },
    diagram: { title: "Mind Map & Visual Diagram", icon: "🗺️", loading: "Streaming visual flowchart code..." }
  };

  const meta = actionMeta[actionType] || { title: "AI Response", icon: "🤖", loading: "Processing..." };

  outputIcon.textContent = meta.icon;
  outputTitle.textContent = meta.title;
  loadingText.textContent = meta.loading;

  const outputSection = document.getElementById("outputSection");
  if (outputSection) outputSection.classList.add("is-streaming");

  showState("loading");

  let streamStarted = false;
  let fullMarkdown = "";

  try {
    fullMarkdown = await generateStudyAIStream(
      currentApiKey,
      actionType,
      notesText,
      (chunkText, currentFullText) => {
        if (!streamStarted) {
          streamStarted = true;
          showState("response");
          responseContainer.innerHTML = "";
        }

        // Lightweight DOM Streaming Buffer: Plain text update during stream (NO heavy Markdown re-parsing on every chunk)
        responseContainer.innerHTML = `<div class="streaming-text-box">${escapeHTML(currentFullText)}</div>`;
      }
    );

    if (outputSection) outputSection.classList.remove("is-streaming");
    lastRawResponse = fullMarkdown;
    const marked = await getMarked();

    // Parse Markdown ONCE when stream finishes
    if (actionType === "flashcards") {
      flashcardDeck = parseFlashcards(fullMarkdown);
      currentCardIndex = 0;
      isFlipped = false;
      flashcardViewMode = "flip";

      if (flashcardDeck.length > 0) {
        await renderFlashcardsDeck();
      } else {
        responseContainer.innerHTML = marked.parse(fullMarkdown);
      }
    } else if (actionType === "questions") {
      quizQuestions = parseQuizQuestions(fullMarkdown);
      currentQuizIndex = 0;
      userQuizAnswers = {};
      quizScore = 0;

      if (quizQuestions.length > 0) {
        await renderQuizSuite();
      } else {
        responseContainer.innerHTML = marked.parse(fullMarkdown);
      }
    } else if (actionType === "diagram") {
      responseContainer.innerHTML = marked.parse(fullMarkdown);
      await processMermaidDiagrams(responseContainer);
    } else {
      responseContainer.innerHTML = marked.parse(fullMarkdown);
      await processMermaidDiagrams(responseContainer);
    }

    showState("response");

    // Trigger celebration for diagram
    if (actionType === "diagram") {
      const confetti = await getConfetti();
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.85 }
      });
    }

  } catch (error) {
    if (outputSection) outputSection.classList.remove("is-streaming");
    console.error("Gemini AI Error:", error);
    showState("error");

    if (error.message === "API_KEY_REQUIRED" || error.message.includes("API key")) {
      errorMessage.textContent = "Gemini API key is required to perform AI actions. Click 'Fix API Key' below to enter your key.";
      errorFixBtn.style.display = "inline-block";
    } else {
      errorMessage.textContent = error.message || "An unexpected error occurred while communicating with Gemini API.";
      errorFixBtn.style.display = "none";
    }
  }
}

function setupEventListeners() {
  // Theme Toggle
  themeToggleBtn.addEventListener("click", toggleTheme);

  // Debounced Live Counter (200ms delay) to ensure fast 60fps typing performance
  notesInput.addEventListener("input", debounce(updateWordAndCharCount, 200));

  // Preset Chips
  document.querySelectorAll(".chip-btn").forEach(chip => {
    chip.addEventListener("click", (e) => {
      const presetKey = e.target.dataset.preset;
      if (PRESETS[presetKey]) {
        notesInput.value = PRESETS[presetKey];
        updateWordAndCharCount();
        showToast(`Loaded ${e.target.textContent} preset!`);
      }
    });
  });

  // Clear & Paste
  clearBtn.addEventListener("click", () => {
    notesInput.value = "";
    updateWordAndCharCount();
    showState("empty");
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    showToast("Notes cleared.");
  });

  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        notesInput.value = text;
        updateWordAndCharCount();
        showToast("Pasted from clipboard!");
      }
    } catch (err) {
      showToast("Unable to read clipboard. Please paste manually.");
    }
  });

  // Keyboard Shortcuts for Flashcards
  document.addEventListener("keydown", (e) => {
    if (currentAction === "flashcards" && responseContainer.style.display !== "none" && flashcardDeck.length > 0 && flashcardViewMode === "flip") {
      if (e.code === "Space") {
        e.preventDefault();
        const cardElem = document.getElementById("flashcardElement");
        if (cardElem) {
          isFlipped = !isFlipped;
          cardElem.classList.toggle("is-flipped", isFlipped);
        }
      } else if (e.code === "ArrowLeft" && currentCardIndex > 0) {
        e.preventDefault();
        isFlipped = false;
        currentCardIndex--;
        renderFlashcardsDeck();
      } else if (e.code === "ArrowRight" && currentCardIndex < flashcardDeck.length - 1) {
        e.preventDefault();
        isFlipped = false;
        currentCardIndex++;
        renderFlashcardsDeck();
      }
    }
  });

  // Action Buttons
  btnSummarize.addEventListener("click", () => handleAIAction("summarize"));
  btnExplain.addEventListener("click", () => handleAIAction("explain"));
  btnQuestions.addEventListener("click", () => handleAIAction("questions"));
  btnFlashcards.addEventListener("click", () => handleAIAction("flashcards"));
  if (btnDiagram) btnDiagram.addEventListener("click", () => handleAIAction("diagram"));

  // Copy Tool
  copyBtn.addEventListener("click", () => {
    if (!lastRawResponse && !responseContainer.textContent) return;
    const textToCopy = lastRawResponse || responseContainer.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast("📋 Response copied to clipboard!");
    });
  });

  // PDF Export Tool
  const pdfBtn = document.getElementById("pdfBtn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      if (!responseContainer.textContent.trim()) return;
      showToast("📄 Opening print/PDF dialog...");
      setTimeout(() => {
        window.print();
      }, 250);
    });
  }

  // Text-to-Speech Read Aloud Hands-Free Audio Reader
  speakBtn.addEventListener("click", () => {
    if (!responseContainer.textContent.trim()) return;

    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      speakBtn.classList.remove("is-speaking");
      speakBtn.innerHTML = `<span class="speaker-icon-anim">🔊</span> <span class="speak-label">Listen</span>`;
      showToast("Audio stopped.");
      return;
    }

    let cleanText = responseContainer.textContent;
    if (currentAction === "flashcards" && flashcardDeck.length > 0) {
      const card = flashcardDeck[currentCardIndex];
      cleanText = `Card ${currentCardIndex + 1}. Question: ${card.front}. Answer: ${card.back}`;
    } else if (currentAction === "questions" && quizQuestions.length > 0 && currentQuizIndex < quizQuestions.length) {
      const q = quizQuestions[currentQuizIndex];
      cleanText = `Question ${currentQuizIndex + 1}. ${q.question}. Options: ${q.options.join(", ")}`;
    }

    speechUtterance = new SpeechSynthesisUtterance(cleanText.replace(/#/g, '').replace(/\*/g, ''));
    speechUtterance.rate = 1.0;

    speechUtterance.onstart = () => {
      speakBtn.classList.add("is-speaking");
      speakBtn.innerHTML = `<span class="speaker-icon-anim">⏹️</span> <span class="speak-label">Stop</span>`;
      showToast("🔊 Reading explanation aloud...");
    };

    speechUtterance.onend = () => {
      speakBtn.classList.remove("is-speaking");
      speakBtn.innerHTML = `<span class="speaker-icon-anim">🔊</span> <span class="speak-label">Listen</span>`;
    };

    speechUtterance.onerror = () => {
      speakBtn.classList.remove("is-speaking");
      speakBtn.innerHTML = `<span class="speaker-icon-anim">🔊</span> <span class="speak-label">Listen</span>`;
    };

    window.speechSynthesis.speak(speechUtterance);
  });

  // Download Tool
  downloadBtn.addEventListener("click", () => {
    if (!lastRawResponse) return;
    const blob = new Blob([lastRawResponse], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${outputTitle.textContent.replace(/\s+/g, "_")}_StudyMate.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("💾 Study notes downloaded!");
  });

  // API Key Modal Controls (Optimized with requestAnimationFrame for smooth 60fps)
  const openModal = () => {
    apiKeyInput.value = currentApiKey;
    requestAnimationFrame(() => {
      apiKeyModal.style.display = "flex";
    });
  };

  const closeModal = () => {
    requestAnimationFrame(() => {
      apiKeyModal.style.display = "none";
    });
  };

  apiKeyBtn.addEventListener("click", openModal);
  errorFixBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  cancelKeyBtn.addEventListener("click", closeModal);

  apiKeyModal.addEventListener("click", (e) => {
    if (e.target === apiKeyModal) closeModal();
  });

  toggleKeyVisibility.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  });

  saveKeyBtn.addEventListener("click", () => {
    const inputVal = apiKeyInput.value.trim();
    currentApiKey = inputVal;
    localStorage.setItem("studymate_gemini_key", inputVal);
    updateApiKeyStatusUI();
    closeModal();
    showToast("🔑 API Key saved!");
  });

  removeKeyBtn.addEventListener("click", () => {
    currentApiKey = "";
    localStorage.removeItem("studymate_gemini_key");
    apiKeyInput.value = "";
    updateApiKeyStatusUI();
    closeModal();
    showToast("API key removed.");
  });
}
