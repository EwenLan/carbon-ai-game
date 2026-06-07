/**
 * HTTP 请求超时与重试工具。
 *
 * 为 SiliconFlow API 调用提供：
 * - 请求超时控制（避免无限等待）
 * - 自动重试（网络波动/服务端临时故障时自动重试）
 * - 指数退避（避免重试风暴）
 */

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数（不含首次请求），默认 2 */
  maxRetries?: number;
  /** 请求超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 退避基础间隔（毫秒），默认 1000，实际间隔 = baseDelay × 2^attempt */
  baseDelayMs?: number;
}

/** 默认重试配置 */
const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 2,
  timeoutMs: 30_000,
  baseDelayMs: 1_000,
};

/**
 * 判断错误是否应该重试。
 * 网络错误和 5xx 服务端错误会重试，4xx 客户端错误不重试。
 */
function shouldRetry(error: unknown): boolean {
  // 网络/超时错误
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("enetunreach") ||
      msg.includes("etimedout") ||
      msg.includes("network error") ||
      msg.includes("fetch failed") ||
      msg.includes("terminated")
    ) {
      return true;
    }

    // 检查是否为 OpenAI SDK 的 APIError（含 HTTP 状态码）
    const apiError = error as { status?: number; code?: string };
    if (apiError.status !== undefined) {
      // 服务端错误可重试
      if (apiError.status >= 500 && apiError.status < 600) return true;
      // 429 限流可重试
      if (apiError.status === 429) return true;
      // 4xx 客户端错误不重试
      return false;
    }

    // 其他未知错误尝试重试一次
    return true;
  }
  return false;
}

/**
 * 等待指定毫秒数。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise 包装。
 * 如果 fn 在 timeoutMs 内没有完成，则抛出超时错误。
 */
function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`请求超时（${timeoutMs / 1000}秒）`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 带超时和自动重试的异步请求执行器。
 *
 * 重试策略：指数退避 — 第 1 次重试等 1s，第 2 次等 2s，第 3 次等 4s...
 *
 * @param fn        - 要执行的异步请求函数
 * @param label     - 日志标签（如 "OCR"、"AI评价"）
 * @param config    - 重试与超时配置
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  config?: RetryConfig
): Promise<T> {
  const { maxRetries, timeoutMs, baseDelayMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[${label}] 第 ${attempt} 次重试，等待 ${delay / 1000}s...`);
        await sleep(delay);
      }

      const result = await withTimeout(fn, timeoutMs);
      return result;
    } catch (err) {
      lastError = err;

      // 最后一次尝试失败，不再重试
      if (attempt >= maxRetries) break;

      // 不可重试的错误直接抛出
      if (!shouldRetry(err)) {
        throw err;
      }

      console.warn(
        `[${label}] 请求失败（第 ${attempt + 1}/${maxRetries + 1} 次）:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw lastError ?? new Error(`[${label}] 请求失败且重试已耗尽`);
}
