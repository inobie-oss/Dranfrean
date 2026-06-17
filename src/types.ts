export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number; // joint X coordinate relative to parent (or canvas-absolute if parent is null)
  y: number; // joint Y coordinate relative to parent (or canvas-absolute if parent is null)
  rotation: number; // local rotation relative to parent in degrees
  length: number; // length of the bone for rendering and tip calculation
  color: string; // display color for this bone's segment
}

export interface ImageAsset {
  id: string;
  name: string;
  url: string; // base64 Data URL or blob URL
  width: number;
  height: number;
  // Rigging assignment fields
  attachedBoneId: string | null;
  offsetX: number; // X offset relative to the bone's joint
  offsetY: number; // Y offset relative to the bone's joint
  offsetRotation: number; // added rotation relative to the bone's rotation (degrees)
  offsetScaleX: number;
  offsetScaleY: number;
  zIndex: number;
}

export interface BonePose {
  boneId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface ImagePose {
  imageId: string;
  offsetX: number;
  offsetY: number;
  offsetRotation: number;
}

export interface FrameKeyframe {
  frame: number;
  bonePoses: Record<string, BonePose>; // boneId -> BonePose
  imagePoses?: Record<string, ImagePose>; // imageId -> ImagePose
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  fps: number;
  bones: Bone[];
  images: ImageAsset[];
  keyframes: FrameKeyframe[];
  createdAt: number;
  updatedAt: number;
}
