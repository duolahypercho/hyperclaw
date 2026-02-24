// src/components/models/vrm/VRMBlink.ts
import { VRMCore } from "@pixiv/three-vrm-core";

export class VRMBlink {
  private isBlinking = false;
  private blinkProgress = 0;
  private timeSinceLastBlink = 0;
  private readonly BLINK_DURATION = 0.2;
  private readonly MIN_BLINK_INTERVAL = 1;
  private readonly MAX_BLINK_INTERVAL = 6;
  private nextBlinkTime =
    Math.random() * (this.MAX_BLINK_INTERVAL - this.MIN_BLINK_INTERVAL) +
    this.MIN_BLINK_INTERVAL;

  update(vrm: VRMCore | undefined, delta: number) {
    if (!vrm?.expressionManager) return;

    this.timeSinceLastBlink += delta;

    // Check if it's time for next blink
    if (!this.isBlinking && this.timeSinceLastBlink >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkProgress = 0;
    }

    // Handle blinking animation
    if (this.isBlinking) {
      this.blinkProgress += delta / this.BLINK_DURATION;

      // Smooth sine curve animation
      const blinkValue = Math.sin(Math.PI * this.blinkProgress);
      vrm.expressionManager.setValue("blink", blinkValue);

      // Reset when complete
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.timeSinceLastBlink = 0;
        vrm.expressionManager.setValue("blink", 0);
        this.nextBlinkTime =
          Math.random() * (this.MAX_BLINK_INTERVAL - this.MIN_BLINK_INTERVAL) +
          this.MIN_BLINK_INTERVAL;
      }
    }
  }
}
