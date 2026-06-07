import { contextBridge, ipcRenderer } from "electron";

/**
 * 通过 contextBridge 安全地向渲染进程暴露游戏 API。
 *
 * 渲染进程中可通过 `window.electronAPI` 访问。
 */

// 评价结果类型（与 ai-service.ts 中的 Evaluation 保持一致）
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

contextBridge.exposeInMainWorld("electronAPI", {
  // ── 系统信息 ──
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // ── 游戏 API ──

  /** 获取下一个未使用的词组题目，返回 null 表示全部已使用 */
  getNextWords: (): Promise<Question | null> =>
    ipcRenderer.invoke("game:get-next-words"),

  /** 提交答案并获取 AI 评价 */
  submitAnswer: (params: {
    words: string[];
    sentence: string;
    index: number;
  }): Promise<Evaluation> => ipcRenderer.invoke("game:submit-answer", params),

  /** 手写文字 OCR 识别 */
  recognizeHandwriting: (imageBase64: string): Promise<string> =>
    ipcRenderer.invoke("ocr:recognize", { imageBase64 }),

  /** 重置所有词库（全部 used 设为 false） */
  resetWords: (): Promise<void> =>
    ipcRenderer.invoke("game:reset-words"),
});
