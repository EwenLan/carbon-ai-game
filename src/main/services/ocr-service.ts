import OpenAI from "openai";
import { executeWithRetry } from "./request-utils";

/** SiliconFlow API 基础地址 */
const BASE_URL = "https://api.siliconflow.cn/v1";

/** OCR 模型 ID */
const MODEL = "deepseek-ai/DeepSeek-OCR";

/** OCR 请求超时时间（图片传输 + 识别可能较慢） */
const OCR_TIMEOUT_MS = 60_000;

/** OCR 最大重试次数 */
const OCR_MAX_RETRIES = 2;

/**
 * 从环境变量获取 API Key。
 */
function getApiKey(): string {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) {
    throw new Error(
      "未找到 SILICONFLOW_API_KEY。请确保 .env 文件中配置了 SILICONFLOW_API_KEY=sk-xxxxxxxx"
    );
  }
  return key;
}

/**
 * 调用 DeepSeek-OCR 识别手写文字图片。
 * 包含 60 秒超时和最多 2 次自动重试。
 *
 * @param imageBase64 - 图片的 base64 编码字符串
 * @returns 识别出的文本内容
 */
export async function recognizeHandwriting(imageBase64: string): Promise<string> {
  const apiKey = getApiKey();

  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    timeout: OCR_TIMEOUT_MS,
    maxRetries: 0, // 由我们自己的重试逻辑控制
  });

  // 确保 base64 字符串带有 data URL 前缀
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  const result = await executeWithRetry(
    async () => {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
              {
                type: "text",
                text: "请识别并提取图片中的所有手写文字内容，只返回识别出的文字，不要添加额外说明。",
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });

      const text = response.choices[0]?.message?.content;
      return text?.trim() ?? "";
    },
    "OCR",
    { timeoutMs: OCR_TIMEOUT_MS, maxRetries: OCR_MAX_RETRIES }
  );

  return result;
}
