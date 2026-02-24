// src/components/models/vrm/VRMAnimations.ts
import { VRMCore } from "@pixiv/three-vrm-core";
import { Vector3 } from "three";

export class VRMIdleEyeSaccades {
  private nextSaccadeAfter = -1;
  private fixationTarget = new Vector3();
  private timeSinceLastSaccade = 0;

  private randomSaccadeInterval(): number {
    return Math.random() * 3000 + 2000; // 2-5 seconds
  }

  private randFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  update(
    vrm: VRMCore | undefined,
    lookAtTarget: { x: number; y: number; z: number },
    delta: number
  ) {
    if (!vrm?.expressionManager || !vrm.lookAt) return;

    if (this.timeSinceLastSaccade >= this.nextSaccadeAfter) {
      // Generate random fixation target
      this.fixationTarget.set(
        lookAtTarget.x + this.randFloat(-0.25, 0.25),
        lookAtTarget.y + this.randFloat(-0.25, 0.25),
        lookAtTarget.z
      );
      this.timeSinceLastSaccade = 0;
      this.nextSaccadeAfter = this.randomSaccadeInterval() / 1000;
    }

    // Update look-at target
    if (vrm.lookAt.target) {
      vrm.lookAt.target.position.copy(this.fixationTarget);
    }

    this.timeSinceLastSaccade += delta;
  }
}
