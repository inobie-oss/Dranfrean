/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bone, Keyframe, BoneAngleOffset, ComputedSkeleton, ComputedJoint } from '../types';

export function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end;
}

export function computeOffsets(
  keyframes: Keyframe[],
  currentFrame: number,
  boneIds: string[]
): Record<string, BoneAngleOffset> {
  const result: Record<string, BoneAngleOffset> = {};
  
  if (keyframes.length === 0) {
    for (const bId of boneIds) {
      result[bId] = { rotation: 0, x: 0, y: 0 };
    }
    return result;
  }
  
  // Sort keyframes
  const sortedKeys = [...keyframes].sort((a, b) => a.frame - b.frame);
  
  // Exact match
  const exact = sortedKeys.find(k => k.frame === currentFrame);
  if (exact) {
    for (const bId of boneIds) {
      result[bId] = {
        rotation: exact.boneOffsets[bId]?.rotation ?? 0,
        x: exact.boneOffsets[bId]?.x ?? 0,
        y: exact.boneOffsets[bId]?.y ?? 0,
      };
    }
    return result;
  }
  
  // Find surrounding keyframes
  let prev: Keyframe | null = null;
  let next: Keyframe | null = null;
  
  for (const k of sortedKeys) {
    if (k.frame < currentFrame) {
      prev = k;
    } else if (k.frame > currentFrame) {
      if (!next) next = k;
    }
  }
  
  if (prev && next) {
    const t = (currentFrame - prev.frame) / (next.frame - prev.frame);
    for (const bId of boneIds) {
      const pOff = prev.boneOffsets[bId] || { rotation: 0, x: 0, y: 0 };
      const nOff = next.boneOffsets[bId] || { rotation: 0, x: 0, y: 0 };
      result[bId] = {
        rotation: lerp(pOff.rotation, nOff.rotation, t),
        x: lerp(pOff.x ?? 0, nOff.x ?? 0, t),
        y: lerp(pOff.y ?? 0, nOff.y ?? 0, t),
      };
    }
  } else if (prev) {
    for (const bId of boneIds) {
      const pOff = prev.boneOffsets[bId] || { rotation: 0, x: 0, y: 0 };
      result[bId] = {
        rotation: pOff.rotation,
        x: pOff.x ?? 0,
        y: pOff.y ?? 0,
      };
    }
  } else if (next) {
    for (const bId of boneIds) {
      const nOff = next.boneOffsets[bId] || { rotation: 0, x: 0, y: 0 };
      result[bId] = {
        rotation: nOff.rotation,
        x: nOff.x ?? 0,
        y: nOff.y ?? 0,
      };
    }
  } else {
    for (const bId of boneIds) {
      result[bId] = { rotation: 0, x: 0, y: 0 };
    }
  }
  
  return result;
}

export function computeSkeleton(
  bones: Bone[],
  offsets: Record<string, BoneAngleOffset>
): ComputedSkeleton {
  const skeleton: ComputedSkeleton = {};
  
  const solveBone = (boneId: string): ComputedJoint => {
    if (skeleton[boneId]) {
      return skeleton[boneId];
    }
    
    const bone = bones.find(b => b.id === boneId);
    if (!bone) {
      throw new Error(`Bone not found: ${boneId}`);
    }
    
    const off = offsets[boneId] || { rotation: 0, x: 0, y: 0 };
    
    let startX = bone.x + (off.x ?? 0);
    let startY = bone.y + (off.y ?? 0);
    let parentAbsoluteAngleRad = 0;
    
    if (bone.parentId) {
      try {
        const parentJoint = solveBone(bone.parentId);
        startX = parentJoint.end.x;
        startY = parentJoint.end.y;
        parentAbsoluteAngleRad = parentJoint.absoluteAngle;
      } catch (err) {
        // Fallback for broken structures
        console.error("Hierarchy cycle or broken parent ID", err);
      }
    }
    
    const baseAngleRad = (bone.baseAngle * Math.PI) / 180;
    const offsetAngleRad = (off.rotation * Math.PI) / 180;
    const absoluteAngle = parentAbsoluteAngleRad + baseAngleRad + offsetAngleRad;
    
    const endX = startX + bone.length * Math.cos(absoluteAngle);
    const endY = startY + bone.length * Math.sin(absoluteAngle);
    
    const joint: ComputedJoint = {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      absoluteAngle,
    };
    
    skeleton[boneId] = joint;
    return joint;
  };
  
  for (const b of bones) {
    try {
      solveBone(b.id);
    } catch {
      // Ignore errors for individual skeleton lines to stay resilient
    }
  }
  
  return skeleton;
}

/**
 * Finds if a coordinate (x,y) is near a joint endpoint in the canvas view
 */
export function findCloseJoint(
  skeleton: ComputedSkeleton,
  mouseX: number,
  mouseY: number,
  maxDist: number = 15
): { boneId: string; pointType: 'start' | 'end' } | null {
  for (const [boneId, joint] of Object.entries(skeleton)) {
    const dStart = Math.hypot(joint.start.x - mouseX, joint.start.y - mouseY);
    if (dStart < maxDist) {
      return { boneId, pointType: 'start' };
    }
    const dEnd = Math.hypot(joint.end.x - mouseX, joint.end.y - mouseY);
    if (dEnd < maxDist) {
      return { boneId, pointType: 'end' };
    }
  }
  return null;
  }
      
