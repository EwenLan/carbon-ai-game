import { app, BrowserWindow, ipcMain, Menu } from "electron";
import * as path from "path";

// 在应用启动时加载 .env 文件
import "dotenv/config";

import { getNextUnusedWord, markWordAsUsed, resetAllWords } from "./services/config-service";
import { recognizeHandwriting } from "./services/ocr-service";
import { evaluateSentence } from "./services/ai-service";

// 是否为开发模式
const isDev = !app.isPackaged;

// ── IPC Handlers ──────────────────────────────────────────────

function registerIpcHandlers(): void {
  // 获取下一个未使用的词组题目
  ipcMain.handle("game:get-next-words", async () => {
    const question = getNextUnusedWord();
    return question; // { words, index } | null
  });

  // 提交答案并进行 AI 评价
  ipcMain.handle(
    "game:submit-answer",
    async (
      _event,
      params: { words: string[]; sentence: string; index: number }
    ) => {
      const { words, sentence, index } = params;

      // 1. 标记该题目已使用
      markWordAsUsed(index);

      // 2. 调用 AI 评价
      const evaluation = await evaluateSentence(words, sentence);

      return evaluation;
    }
  );

  // 手写 OCR 识别
  ipcMain.handle(
    "ocr:recognize",
    async (_event, params: { imageBase64: string }) => {
      const text = await recognizeHandwriting(params.imageBase64);
      return text;
    }
  );

  // 重置所有词库（全部 used 设为 false）
  ipcMain.handle("game:reset-words", async () => {
    resetAllWords();
  });
}

// ── Window Management ────────────────────────────────────────

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 完全移除菜单栏
  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// ── App Lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
