import OpenAI from "openai";
import { executeWithRetry } from "./request-utils";

/** SiliconFlow API 基础地址 */
const BASE_URL = "https://api.siliconflow.cn/v1";

/** AI 评价模型 ID（SiliconFlow 上的 DeepSeek-V4-Pro） */
const MODEL = "deepseek-ai/DeepSeek-V4-Pro";

/** AI 评价请求超时时间（大模型推理可能较慢） */
const AI_TIMEOUT_MS = 90_000;

/** AI 评价最大重试次数 */
const AI_MAX_RETRIES = 2;

/** AI 评价结果结构 */
export interface Evaluation {
  /** 综合评分 (1-10) */
  score: number;
  /** 各词语是否使用到位 */
  wordUsage: { word: string; used: boolean }[];
  /** 语法评价 */
  grammar: string;
  /** 语句通顺度评价 */
  fluency: string;
  /** 社会主义核心价值观评价 */
  values: string;
  /** 综合评语 */
  comment: string;
}

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
 * 生成 AI 评价的 system prompt。
 */
function buildSystemPrompt(): string {
  return `你是一位资深的语文老师，正在课堂上进行"连词成句"游戏。你的任务是对学生造的句子进行全面评分和点评。

## 评分维度（综合评分 1-10 分）

### 1. 词语使用
检查句子是否正确且自然地使用了所有指定的关联词语，关联词搭配是否恰当。

### 2. 语法正确性
检查句子是否存在语法错误，包括但不限于：主谓搭配不当、语序混乱、成分残缺、逻辑矛盾等。

### 3. 语句通顺度
检查句子是否通顺自然，是否符合中文表达习惯，读起来是否流畅。

### 4. 社会主义核心价值观（非常重要）
检查句子内容是否符合社会主义核心价值观：
- 富强、民主、文明、和谐（国家层面）
- 自由、平等、公正、法治（社会层面）
- 爱国、敬业、诚信、友善（个人层面）
如果句子内容积极向上、传递正能量，应予以肯定；如果存在不当言论、消极价值观或违背公序良俗的内容，必须明确指出并扣分。

## 评分标准
- 9-10 分：四个维度均表现优秀
- 7-8 分：三个维度表现良好，有 1 个维度略有不足
- 5-6 分：存在明显问题，如语法错误较多或价值观有偏差
- 1-4 分：多个维度存在严重问题

## 点评要求
- 语气亲切鼓励，以肯定为主，保护学生的学习积极性
- 对于不足之处，用建议的方式提出，而非批评
- 价值观维度的点评要自然融入，不要生硬说教

## 输出格式
请严格按照以下 JSON 格式输出（不要包含任何其他内容）：
{
  "score": 8,
  "wordUsage": [
    {"word": "虽然", "used": true},
    {"word": "但是", "used": true}
  ],
  "grammar": "语法完全正确，主谓搭配得当，没有语病。",
  "fluency": "语句通顺自然，转折关系表达清晰，读起来一气呵成。",
  "values": "句子内容积极向上，传递了努力学习的正能量，符合社会主义核心价值观。",
  "comment": "总体来说造得很棒！\"虽然\"和\"但是\"的转折关系用得恰到好处，句子既通顺又有思想深度。如果能让内容再多一些个人特色就更完美了！"
}`;
}

/**
 * 调用 DeepSeek-V4-Pro 对大模型对学生的句子进行评分和点评。
 * 包含 90 秒超时和最多 2 次自动重试。
 *
 * @param words   - 题目要求的关联词语
 * @param sentence - 学生造的句子
 * @returns 结构化评价结果
 */
export async function evaluateSentence(
  words: string[],
  sentence: string
): Promise<Evaluation> {
  const apiKey = getApiKey();

  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 0, // 由我们自己的重试逻辑控制
  });

  const wordList = words.map((w) => `"${w}"`).join("、");

  const userPrompt = `题目要求使用以下关联词语造句：${wordList}

学生造的句子：${sentence}

请对上面的句子进行评分和点评。`;

  const evaluation = await executeWithRetry(
    async () => {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      });

      const rawJson = response.choices[0]?.message?.content?.trim() ?? "";

      // 尝试从回复中提取 JSON（有时模型会在 JSON 前后加说明文字）
      const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`AI 返回格式异常，无法解析 JSON: ${rawJson}`);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Evaluation;

      // 基础校验
      if (
        typeof parsed.score !== "number" ||
        !Array.isArray(parsed.wordUsage) ||
        typeof parsed.values !== "string"
      ) {
        throw new Error(`AI 返回数据不完整: ${rawJson}`);
      }

      return parsed;
    },
    "AI评价",
    { timeoutMs: AI_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES }
  );

  return evaluation;
}
