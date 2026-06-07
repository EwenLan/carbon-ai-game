"""
DeepSeek-OCR 手写文字识别 Demo
=============================
使用 SiliconFlow 的 deepseek-ai/DeepSeek-OCR 模型识别 test.png 中的手写文字。

前置条件:
    1. 注册 SiliconFlow 并获取 API Key: https://cloud.siliconflow.cn
    2. 创建 .env 文件，写入: SILICONFLOW_API_KEY=your_api_key_here
    3. 安装依赖: pip install openai python-dotenv
"""

import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


def encode_image_to_base64(image_path: str) -> str:
    """将图片文件编码为 base64 data URL 字符串。"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    # 根据文件扩展名确定 MIME 类型
    ext = Path(image_path).suffix.lower()
    mime_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    mime_type = mime_types.get(ext, "image/png")
    return f"data:{mime_type};base64,{image_data}"


def recognize_handwriting(image_path: str) -> str:
    """
    调用 SiliconFlow DeepSeek-OCR 模型识别图片中的文字。

    Args:
        image_path: 图片文件路径

    Returns:
        模型识别出的文字内容
    """
    # 加载 .env 中的 API Key
    load_dotenv()
    api_key = os.getenv("SILICONFLOW_API_KEY")
    if not api_key:
        raise RuntimeError(
            "未找到 SILICONFLOW_API_KEY，请在项目根目录创建 .env 文件并写入:\n"
            "SILICONFLOW_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx"
        )

    # 初始化 SiliconFlow 客户端（OpenAI 兼容接口）
    client = OpenAI(
        api_key=api_key,
        base_url="https://api.siliconflow.cn/v1",
    )

    # 将图片编码为 base64
    image_data_url = encode_image_to_base64(image_path)

    print(f"📷 正在识别图片: {image_path}")
    print(f"📏 图片大小: {os.path.getsize(image_path) / 1024:.1f} KB\n")

    # 调用 DeepSeek-OCR 模型
    response = client.chat.completions.create(
        model="deepseek-ai/DeepSeek-OCR",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data_url,
                        },
                    },
                    {
                        "type": "text",
                        "text": "请识别并提取图片中的所有文字内容，保持原有的格式和排版。",
                    },
                ],
            }
        ],
        max_tokens=4096,
        temperature=0.1,  # 低温度以获得更稳定的输出
    )

    # 提取识别结果
    result = response.choices[0].message.content
    return result.strip() if result else ""


def main():
    # 图片路径
    image_path = Path(__file__).parent / "test.png"

    if not image_path.exists():
        print(f"❌ 找不到图片文件: {image_path}")
        return

    try:
        text = recognize_handwriting(str(image_path))

        print("=" * 60)
        print("📝 识别结果:")
        print("=" * 60)
        print(text)
        print("=" * 60)

        # 同时输出 token 用量信息
        # （已在请求中，这里仅展示结果）

    except RuntimeError as e:
        print(f"❌ 配置错误: {e}")
    except Exception as e:
        print(f"❌ 识别失败: {e}")


if __name__ == "__main__":
    main()
