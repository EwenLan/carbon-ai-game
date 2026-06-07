import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/** 词组配置项 */
export interface WordGroup {
  words: string[];
  used: boolean;
}

/** 题目（含在数组中的索引，用于标记已使用） */
export interface Question {
  words: string[];
  index: number;
}

/** 配置文件相对于项目根目录的路径 */
const CONFIG_PATH = path.resolve(__dirname, "../../../words.yaml");

/**
 * 读取完整词库配置。
 */
export function loadWordsConfig(): WordGroup[] {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config = yaml.load(raw) as WordGroup[];
  return Array.isArray(config) ? config : [];
}

/**
 * 保存词库配置（原地更新 used 标记）。
 */
export function saveWordsConfig(config: WordGroup[]): void {
  const raw = yaml.dump(config, {
    indent: 2,
    lineWidth: -1, // 不自动换行
  });
  fs.writeFileSync(CONFIG_PATH, raw, "utf-8");
}

/**
 * 随机获取一个未使用的词组题目。
 * 返回 null 表示所有题目都已使用过。
 */
export function getNextUnusedWord(): Question | null {
  const config = loadWordsConfig();

  // 收集所有未使用的词组及其索引
  const unused = config
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => !group.used);

  if (unused.length === 0) {
    return null;
  }

  // 随机选择一个
  const pick = unused[Math.floor(Math.random() * unused.length)];

  return {
    words: pick.group.words,
    index: pick.index,
  };
}

/**
 * 将指定索引的词组标记为已使用。
 */
export function markWordAsUsed(index: number): void {
  const config = loadWordsConfig();
  if (index >= 0 && index < config.length) {
    config[index].used = true;
    saveWordsConfig(config);
  }
}

/**
 * 重置所有词组的 used 状态（用于重新开始新一轮游戏）。
 */
export function resetAllWords(): void {
  const config = loadWordsConfig();
  config.forEach((g) => (g.used = false));
  saveWordsConfig(config);
}
