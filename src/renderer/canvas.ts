/**
 * 手写画布组件
 *
 * 支持鼠标和触摸屏（包括触控笔）在 Canvas 上自由书写，
 * 提供清除、导出 base64 等功能。
 */

export class HandwritingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawing = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");
    this.ctx = ctx;

    this.initStyle();
    this.bindEvents();
  }

  /** 初始化画笔样式 */
  private initStyle(): void {
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = "#1a1a2e";
  }

  /**
   * 将 clientX/clientY 转换为 Canvas 内部坐标。
   * 根据设备像素比缩放，防止高分屏模糊。
   */
  private getScaledPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /** 开始绘制 */
  private startStroke(clientX: number, clientY: number): void {
    this.drawing = true;
    const pos = this.getScaledPosition(clientX, clientY);
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }

  /** 继续绘制 */
  private continueStroke(clientX: number, clientY: number): void {
    if (!this.drawing) return;
    const pos = this.getScaledPosition(clientX, clientY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  /** 结束绘制 */
  private endStroke(): void {
    this.drawing = false;
    this.ctx.closePath();
  }

  /** 绑定鼠标 + 触摸事件 */
  private bindEvents(): void {
    // ── 鼠标事件 ──
    this.canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.startStroke(e.clientX, e.clientY);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      e.preventDefault();
      this.continueStroke(e.clientX, e.clientY);
    });

    this.canvas.addEventListener("mouseup", (e) => {
      e.preventDefault();
      this.endStroke();
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.endStroke();
    });

    // ── 触摸事件（触摸屏 / 触控笔）──
    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault(); // 阻止页面滚动/缩放
        const touch = e.touches[0];
        if (touch) {
          this.startStroke(touch.clientX, touch.clientY);
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault(); // 阻止页面滚动
        const touch = e.touches[0];
        if (touch) {
          this.continueStroke(touch.clientX, touch.clientY);
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.endStroke();
    });

    this.canvas.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      this.endStroke();
    });
  }

  /** 清除画布内容 */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 画布是否为空（全白/全透明） */
  isEmpty(): boolean {
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const pixels = imageData.data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) return false; // 有不透明像素
    }
    return true;
  }

  /** 导出为 base64 PNG 字符串（含 data:image/png;base64 前缀） */
  toBase64(): string {
    return this.canvas.toDataURL("image/png");
  }

  /** 设置画笔颜色 */
  setColor(color: string): void {
    this.ctx.strokeStyle = color;
  }

  /** 设置画笔粗细 */
  setLineWidth(width: number): void {
    this.ctx.lineWidth = width;
  }
}
