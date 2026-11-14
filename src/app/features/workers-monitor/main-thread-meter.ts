export interface FrameSample {
  fps: number;
  longestFrameMs: number;
  blockedFrames: number;
}

export class FrameMeter {
  private frames: number[] = [];

  record(timestamp: number): void {
    this.frames.push(timestamp);
    const limit = timestamp - 1000;
    while (this.frames.length && this.frames[0] < limit) this.frames.shift();
  }

  sample(): FrameSample {
    let longest = 0;
    let blocked = 0;
    for (let i = 1; i < this.frames.length; i++) {
      const gap = this.frames[i] - this.frames[i - 1];
      if (gap > longest) longest = gap;
      if (gap > 50) blocked++;
    }
    return { fps: this.frames.length, longestFrameMs: Math.round(longest), blockedFrames: blocked };
  }
}
