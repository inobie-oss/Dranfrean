import { Bone, BonePose, FrameKeyframe, ImagePose } from "./types";

export interface CalculatedBone extends Bone {
  worldX: number;
  worldY: number;
  worldRotation: number;
  tipX: number;
  tipY: number;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return a + diff * t;
}

export function getInterpolatedPose(
  boneId: string,
  currentFrame: number,
  keyframes: FrameKeyframe[],
  defaultBone: Bone
): { x: number; y: number; rotation: number } {
  // Filter keyframes containing this bone
  const boneFrames = keyframes
    .filter(k => k.bonePoses[boneId] !== undefined)
    .sort((a, b) => a.frame - b.frame);

  if (boneFrames.length === 0) {
    return { x: defaultBone.x, y: defaultBone.y, rotation: defaultBone.rotation };
  }

  // Find previous and next keyframes
  let prev: FrameKeyframe | undefined;
  let next: FrameKeyframe | undefined;

  for (let i = 0; i < boneFrames.length; i++) {
    const k = boneFrames[i];
    if (k.frame <= currentFrame) {
      if (!prev || k.frame > prev.frame) {
        prev = k;
      }
    }
    if (k.frame >= currentFrame) {
      if (!next || k.frame < next.frame) {
        next = k;
      }
    }
  }

  if (!prev && next) {
    const pose = next.bonePoses[boneId];
    return { x: pose.x, y: pose.y, rotation: pose.rotation };
  }
  if (prev && !next) {
    const pose = prev.bonePoses[boneId];
    return { x: pose.x, y: pose.y, rotation: pose.rotation };
  }
  if (prev && next) {
    if (prev.frame === next.frame) {
      const pose = prev.bonePoses[boneId];
      return { x: pose.x, y: pose.y, rotation: pose.rotation };
    }
    const t = (currentFrame - prev.frame) / (next.frame - prev.frame);
    const posePrev = prev.bonePoses[boneId];
    const poseNext = next.bonePoses[boneId];

    const x = posePrev.x + (poseNext.x - posePrev.x) * t;
    const y = posePrev.y + (poseNext.y - posePrev.y) * t;
    const rotation = lerpAngle(posePrev.rotation, poseNext.rotation, t);

    return { x, y, rotation };
  }

  return { x: defaultBone.x, y: defaultBone.y, rotation: defaultBone.rotation };
}

export function calculateWorldBones(
  originalBones: Bone[],
  currentFrame: number,
  keyframes: FrameKeyframe[]
): Record<string, CalculatedBone> {
  const calculated: Record<string, CalculatedBone> = {};
  const boneMap = new Map<string, Bone>();
  originalBones.forEach(b => boneMap.set(b.id, b));

  const visiting = new Set<string>();

  function resolveBone(boneId: string): CalculatedBone {
    if (calculated[boneId]) {
      return calculated[boneId];
    }

    const bone = boneMap.get(boneId);
    if (!bone) {
      // Return a safe dummy fallback if the bone is not found
      return {
        id: boneId,
        name: "Unknown Bone",
        parentId: null,
        x: 0,
        y: 0,
        rotation: 0,
        length: 50,
        color: "#ff0000",
        worldX: 0,
        worldY: 0,
        worldRotation: 0,
        tipX: 50,
        tipY: 0,
      };
    }

    if (visiting.has(boneId)) {
      // Loop detected! Treat as root bone to break recursive cycle.
      const pose = getInterpolatedPose(boneId, currentFrame, keyframes, bone);
      const rad = (pose.rotation * Math.PI) / 180;
      const tipX = pose.x + bone.length * Math.cos(rad);
      const tipY = pose.y + bone.length * Math.sin(rad);

      calculated[boneId] = {
        ...bone,
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation,
        worldX: pose.x,
        worldY: pose.y,
        worldRotation: pose.rotation,
        tipX,
        tipY,
      };
      return calculated[boneId];
    }

    visiting.add(boneId);

    const pose = getInterpolatedPose(boneId, currentFrame, keyframes, bone);

    if (!bone.parentId || !boneMap.has(bone.parentId)) {
      // Root bone is relative to canvas origin
      const rad = (pose.rotation * Math.PI) / 180;
      const tipX = pose.x + bone.length * Math.cos(rad);
      const tipY = pose.y + bone.length * Math.sin(rad);

      calculated[boneId] = {
        ...bone,
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation,
        worldX: pose.x,
        worldY: pose.y,
        worldRotation: pose.rotation,
        tipX,
        tipY,
      };
      visiting.delete(boneId);
      return calculated[boneId];
    }

    const parentCalculated = resolveBone(bone.parentId);

    // World rotation is parent's world rotation + child's local rotation
    const worldRotation = (parentCalculated.worldRotation + pose.rotation) % 360;
    const parentRad = (parentCalculated.worldRotation * Math.PI) / 180;

    // Relative offset (x, y) along parent's coordinate frame
    const worldX = parentCalculated.worldX + pose.x * Math.cos(parentRad) - pose.y * Math.sin(parentRad);
    const worldY = parentCalculated.worldY + pose.x * Math.sin(parentRad) + pose.y * Math.cos(parentRad);

    const rad = (worldRotation * Math.PI) / 180;
    const tipX = worldX + bone.length * Math.cos(rad);
    const tipY = worldY + bone.length * Math.sin(rad);

    calculated[boneId] = {
      ...bone,
      x: pose.x,
      y: pose.y,
      rotation: pose.rotation,
      worldX,
      worldY,
      worldRotation,
      tipX,
      tipY,
    };

    visiting.delete(boneId);
    return calculated[boneId];
  }

  originalBones.forEach(b => {
    resolveBone(b.id);
  });

  return calculated;
}

export function getInterpolatedImagePose(
  imageId: string,
  currentFrame: number,
  keyframes: FrameKeyframe[],
  defaultImage: { offsetX: number; offsetY: number; offsetRotation: number }
): { offsetX: number; offsetY: number; offsetRotation: number } {
  const imageFrames = keyframes
    .filter(k => k.imagePoses && k.imagePoses[imageId] !== undefined)
    .sort((a, b) => a.frame - b.frame);

  if (imageFrames.length === 0) {
    return { offsetX: defaultImage.offsetX, offsetY: defaultImage.offsetY, offsetRotation: defaultImage.offsetRotation };
  }

  // Find previous and next keyframes
  let prev: FrameKeyframe | undefined;
  let next: FrameKeyframe | undefined;

  for (let i = 0; i < imageFrames.length; i++) {
    const k = imageFrames[i];
    if (k.frame <= currentFrame) {
      if (!prev || k.frame > prev.frame) {
        prev = k;
      }
    }
    if (k.frame >= currentFrame) {
      if (!next || k.frame < next.frame) {
        next = k;
      }
    }
  }

  if (!prev && next) {
    const pose = next.imagePoses![imageId];
    return { offsetX: pose.offsetX, offsetY: pose.offsetY, offsetRotation: pose.offsetRotation };
  }
  if (prev && !next) {
    const pose = prev.imagePoses![imageId];
    return { offsetX: pose.offsetX, offsetY: pose.offsetY, offsetRotation: pose.offsetRotation };
  }
  if (prev && next) {
    if (prev.frame === next.frame) {
      const pose = prev.imagePoses![imageId];
      return { offsetX: pose.offsetX, offsetY: pose.offsetY, offsetRotation: pose.offsetRotation };
    }
    const t = (currentFrame - prev.frame) / (next.frame - prev.frame);
    const posePrev = prev.imagePoses![imageId];
    const poseNext = next.imagePoses![imageId];

    const offsetX = posePrev.offsetX + (poseNext.offsetX - posePrev.offsetX) * t;
    const offsetY = posePrev.offsetY + (poseNext.offsetY - posePrev.offsetY) * t;
    const offsetRotation = lerpAngle(posePrev.offsetRotation, poseNext.offsetRotation, t);

    return { offsetX, offsetY, offsetRotation };
  }

  return { offsetX: defaultImage.offsetX, offsetY: defaultImage.offsetY, offsetRotation: defaultImage.offsetRotation };
}
