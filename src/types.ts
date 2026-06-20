/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number; // Root offset X (only used if parentId is null)
  y: number; // Root offset Y (only used if parentId is null)
  length: number; // Bone length in pixels
  baseAngle: number; // Initial resting angle in degrees
  color: string; // HTML color string
}

export interface ProjectImage {
  id: string;
  name: string;
  src: string; // Base64 data URL
  boneId: string | null; // Rigged to this bone
  x: number; // Translational offset X relative to bone root
  y: number; // Translational offset Y relative to bone root
  scale: number; // Scaling multiplier
  rotation: number; // Extra rotation offset relative to bone angle
  anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right'; // Image anchor connection position
  anchorTop?: number;
  anchorBottom?: number;
  anchorLeft?: number;
  anchorRight?: number;
}

export interface BoneAngleOffset {
  rotation: number; // Rotation offset in degrees
  x?: number; // Position offset X (for root bones)
  y?: number; // Position offset Y (for root bones)
}

export interface Keyframe {
  id: string;
  frame: number; // Frame index (e.g. 0 to 47)
  boneOffsets: Record<string, BoneAngleOffset>; // boneId -> offset values
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  color: string; // Canvas background color
  fps: number;
  length: number; // Timeline length (e.g. 48 frames)
  bones: Bone[];
  keyframes: Keyframe[];
  images: ProjectImage[];
  createdAt: number;
  selected?: boolean;
}

export interface ComputedJoint {
  start: { x: number; y: number };
  end: { x: number; y: number };
  absoluteAngle: number; // In radians
}

export type ComputedSkeleton = Record<string, ComputedJoint>;
