import "./style.css";
import { HandwritingCanvas } from "./canvas";

// ── 类型定义（与 preload 暴露的 API 一致）──

interface WordUsageItem {
  word: string;
  used: boolean;
}

interface Evaluation {
  score: number;
  wordUsage: WordUsageItem[];
  grammar: string;
  fluency: string;
  values: string;
  comment: string;
}

interface Question {
  words: string[];
  index: number;
}

interface ElectronGameAPI {
  platform: string;
  versions: { node: string; chrome: string; electron: string };
  getNextWords: () => Promise<Question | null>;
  submitAnswer: (params: {
    words: string[];
    sentence: string;
    index: number;
  }) => Promise<Evaluation>;
  recognizeHandwriting: (imageBase64: string) => Promise<string>;
  resetWords: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronGameAPI;
  }
}

// ── 游戏状态 ────────────────────────────────────────────────

type InputMode = "handwrite" | "keyboard";

const state = {
  /** 当前题目（null 表示未加载或全部用完） */
  question: null as Question | null,
  /** 当前输入模式 */
  inputMode: "handwrite" as InputMode,
  /** 手写画布实例 */
  canvas: null as HandwritingCanvas | null,
  /** 是否正在加载（OCR / AI 评价中） */
  loading: false,
  /** 请求代际计数器 — 切换题目时递增，用于忽略过期响应 */
  requestGeneration: 0,
};

// ── DOM 元素引用 ─────────────────────────────────────────────

const $ = (id: string): HTMLElement => document.getElementById(id)!;

const wordList = $("word-list");
const tabHandwrite = $("tab-handwrite");
const tabKeyboard = $("tab-keyboard");
const panelHandwrite = $("panel-handwrite");
const panelKeyboard = $("panel-keyboard");
const sentenceInput = $("sentence-input") as HTMLTextAreaElement;
const btnClear = $("btn-clear");
const btnRecognize = $("btn-recognize");
const btnSubmit = $("btn-submit");
const btnNext = $("btn-next");
const toast = $("toast");
const loadingOverlay = $("loading");
const loadingText = $("loading-text");
const resultArea = $("result-area");
const scoreStars = $("score-stars");
const scoreNumber = $("score-number");
const evalWordUsage = $("eval-word-usage");
const evalGrammar = $("eval-grammar");
const evalFluency = $("eval-fluency");
const evalValues = $("eval-values");
const evalComment = $("eval-comment");

// ── 初始化 ──────────────────────────────────────────────────

function init(): void {
  initCanvas();
  bindEvents();
  // 自动加载第一题
  loadNextQuestion();
}

function initCanvas(): void {
  const canvasEl = document.getElementById(
    "handwrite-canvas"
  ) as HTMLCanvasElement;
  if (!canvasEl) return;

  // 设置 Canvas 物理尺寸（高分辨率防模糊，跟随 CSS 实际高度）
  const rect = canvasEl.getBoundingClientRect();
  canvasEl.width = rect.width * devicePixelRatio;
  canvasEl.height = rect.height * devicePixelRatio;

  state.canvas = new HandwritingCanvas(canvasEl);
}

// ── 事件绑定 ────────────────────────────────────────────────

function bindEvents(): void {
  // 模式切换
  tabHandwrite.addEventListener("click", () => switchMode("handwrite"));
  tabKeyboard.addEventListener("click", () => switchMode("keyboard"));

  // 手写面板
  btnClear.addEventListener("click", () => state.canvas?.clear());
  btnRecognize.addEventListener("click", handleHandwriteSubmit);

  // 键盘面板
  btnSubmit.addEventListener("click", handleKeyboardSubmit);
  sentenceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleKeyboardSubmit();
    }
  });

  // 下一题
  btnNext.addEventListener("click", loadNextQuestion);
}

// ── 输入模式切换 ─────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function switchMode(mode: InputMode): void {
  state.inputMode = mode;
  tabHandwrite.classList.toggle("active", mode === "handwrite");
  tabKeyboard.classList.toggle("active", mode === "keyboard");
  panelHandwrite.classList.toggle("hidden", mode !== "handwrite");
  panelKeyboard.classList.toggle("hidden", mode !== "keyboard");

  // 切换到键盘模式时自动聚焦输入框
  if (mode === "keyboard") {
    // requestAnimationFrame 确保 DOM 已切换 visible 后再聚焦
    requestAnimationFrame(() => {
      sentenceInput.focus();
    });
  }
}

/**
 * 显示非阻塞的 Toast 通知（替代 alert，避免焦点丢失）。
 * @param message - 消息文本
 * @param type - "error" | "success" | "info"
 */
function showToast(message: string, type: "error" | "success" | "info" = "info"): void {
  if (toastTimer) clearTimeout(toastTimer);

  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove("hidden");

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
    toastTimer = null;
  }, 4000);
}

// ── 题目加载 ────────────────────────────────────────────────

async function loadNextQuestion(): Promise<void> {
  const api = window.electronAPI;
  if (!api) {
    wordList.textContent = "❌ 未检测到 Electron 环境";
    return;
  }

  // 如果当前是"重新开始"状态，先重置词库
  if (btnNext.classList.contains("btn-reset")) {
    await api.resetWords();
  }

  // 重置界面
  resetUI();

  const question = await api.getNextWords();
  if (!question) {
    wordList.textContent = "🎉 所有题目已完成！";
    btnNext.textContent = "🔄 重新开始";
    btnNext.classList.add("btn-reset");
    return;
  }

  state.question = question;

  // 显示词语（中间用 · 分隔）
  wordList.innerHTML = question.words
    .map((w) => `<span class="word-chip">${w}</span>`)
    .join('<span class="word-dot">·</span>');
}

// ── 重置 UI 状态 ────────────────────────────────────────────

function resetUI(): void {
  // 递增请求代际，使所有进行中的旧请求结果被忽略
  state.requestGeneration++;
  // 恢复按钮状态（无论之前是否在加载中）
  state.loading = false;
  loadingOverlay.classList.add("hidden");
  btnRecognize.removeAttribute("disabled");
  btnSubmit.removeAttribute("disabled");
  // 重置 UI
  resultArea.classList.add("hidden");
  state.canvas?.clear();
  sentenceInput.value = "";
  btnNext.classList.remove("btn-reset");
  btnNext.textContent = "▶️ 下一题";
}

// ── 手写提交 ────────────────────────────────────────────────

async function handleHandwriteSubmit(): Promise<void> {
  const api = window.electronAPI;
  if (!api || !state.question || !state.canvas) return;

  if (state.canvas.isEmpty()) {
    showToast("请先在画布上书写句子后再提交。", "error");
    return;
  }

  const imageBase64 = state.canvas.toBase64();
  await submitWithOCR(api, imageBase64);
}

async function submitWithOCR(
  api: ElectronGameAPI,
  imageBase64: string
): Promise<void> {
  if (!state.question) return;

  const gen = state.requestGeneration;
  showLoading("正在识别手写文字...");

  try {
    const recognizedText = await api.recognizeHandwriting(imageBase64);

    // 请求期间切换了题目，忽略过期响应
    if (state.requestGeneration !== gen) return;

    if (!recognizedText) {
      hideLoading();
      showToast("未能识别出手写文字，请重试或切换到键盘输入。", "error");
      return;
    }

    // 将识别结果填入键盘输入框，方便确认
    sentenceInput.value = recognizedText;

    // 请求期间切换了题目，忽略过期响应
    if (state.requestGeneration !== gen) return;

    // 继续 AI 评价
    loadingText.textContent = "AI 正在评价你的句子...";
    await submitToAI(api, recognizedText, gen);
  } catch (err) {
    // 请求期间切换了题目，不显示错误
    if (state.requestGeneration !== gen) return;
    hideLoading();
    showToast(`识别失败: ${err instanceof Error ? err.message : err}`, "error");
  }
}

// ── 键盘提交 ────────────────────────────────────────────────

async function handleKeyboardSubmit(): Promise<void> {
  const api = window.electronAPI;
  if (!api || !state.question) return;

  const sentence = sentenceInput.value.trim();
  if (!sentence) {
    showToast("请输入你的句子。", "error");
    return;
  }

  const gen = state.requestGeneration;
  showLoading("AI 正在评价你的句子...");
  await submitToAI(api, sentence, gen);
}

// ── 提交 AI 评价 ─────────────────────────────────────────────

async function submitToAI(
  api: ElectronGameAPI,
  sentence: string,
  gen: number
): Promise<void> {
  if (!state.question) return;

  try {
    const evaluation = await api.submitAnswer({
      words: state.question.words,
      sentence,
      index: state.question.index,
    });

    // 请求期间切换了题目，忽略过期响应
    if (state.requestGeneration !== gen) return;

    displayEvaluation(evaluation);
  } catch (err) {
    // 请求期间切换了题目，不显示错误
    if (state.requestGeneration !== gen) return;
    showToast(`AI 评价失败: ${err instanceof Error ? err.message : err}`, "error");
  } finally {
    // 仅当未切换题目时才恢复按钮状态
    if (state.requestGeneration === gen) {
      hideLoading();
    }
  }
}

// ── 显示评价结果 ─────────────────────────────────────────────

function displayEvaluation(eval_: Evaluation): void {
  // 星级显示
  const fullStars = Math.round(eval_.score / 2); // 10 分制转 5 星
  scoreStars.textContent = "⭐".repeat(fullStars) + "☆".repeat(5 - fullStars);
  scoreNumber.textContent = `${eval_.score}/10`;

  // 词语使用
  evalWordUsage.innerHTML = eval_.wordUsage
    .map(
      (wu) =>
        `<span class="word-check ${wu.used ? "used" : "missing"}">${
          wu.used ? "✅" : "❌"
        }${wu.word}</span>`
    )
    .join(" ");

  // 各维度评价
  evalGrammar.textContent = eval_.grammar;
  evalFluency.textContent = eval_.fluency;
  evalValues.textContent = eval_.values;
  evalComment.textContent = eval_.comment;

  // 显示结果区域
  resultArea.classList.remove("hidden");
}

// ── 加载状态 ────────────────────────────────────────────────

function showLoading(text: string): void {
  state.loading = true;
  loadingText.textContent = text;
  loadingOverlay.classList.remove("hidden");
  btnRecognize.setAttribute("disabled", "true");
  btnSubmit.setAttribute("disabled", "true");
}

function hideLoading(): void {
  state.loading = false;
  loadingOverlay.classList.add("hidden");
  btnRecognize.removeAttribute("disabled");
  btnSubmit.removeAttribute("disabled");
}

// ── 启动 ────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
