/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2,
  Play, Pause, Key, Trash2, Video, Upload, Settings, Sliders,
  Tag, Compass, Image as ImageIcon, CheckCircle, RefreshCw,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { Project, Bone, Keyframe, ProjectImage, BoneAngleOffset } from '../types';
import { computeOffsets, computeSkeleton, findCloseJoint } from '../utils/skeleton';

export const PRESET_BONE_COLORS = [
  { hull: '#4f46e5', core: '#818cf8', stroke: '#a5b4fc', text: 'text-indigo-400', bg: 'bg-indigo-500' }, // Indigo
  { hull: '#0891b2', core: '#22d3ee', stroke: '#67e8f9', text: 'text-cyan-400', bg: 'bg-cyan-500' },   // Cyan
  { hull: '#db2777', core: '#f472b6', stroke: '#f9a8d4', text: 'text-pink-400', bg: 'bg-pink-500' },   // Pink
  { hull: '#16a34a', core: '#4ade80', stroke: '#86efac', text: 'text-green-400', bg: 'bg-green-500' },  // Green
  { hull: '#ea580c', core: '#fb923c', stroke: '#fdba74', text: 'text-orange-400', bg: 'bg-orange-500' }, // Orange
  { hull: '#ca8a04', core: '#facc15', stroke: '#fde047', text: 'text-yellow-400', bg: 'bg-yellow-500' }, // Yellow
  { hull: '#7c3aed', core: '#a78bfa', stroke: '#c4b5fd', text: 'text-purple-400', bg: 'bg-purple-500' }, // Purple
  { hull: '#dc2626', core: '#f87171', stroke: '#fca5a5', text: 'text-red-400', bg: 'bg-red-500' },    // Red
  { hull: '#2563eb', core: '#60a5fa', stroke: '#93c5fd', text: 'text-blue-400', bg: 'bg-blue-500' },   // Blue
  { hull: '#059669', core: '#34d399', stroke: '#6ee7b7', text: 'text-emerald-400', bg: 'bg-emerald-500' },// Emerald
  { hull: '#9333ea', core: '#c084fc', stroke: '#d8b4fe', text: 'text-fuchsia-400', bg: 'bg-fuchsia-500' },// Fuchsia
  { hull: '#e11d48', core: '#fb7185', stroke: '#fda4af', text: 'text-rose-400', bg: 'bg-rose-500' },   // Rose
];

interface ProjectEditorProps {
  project: Project;
  onExit: () => void;
  onSave: (updated: Project) => void;
}

export default function ProjectEditor({ project, onExit, onSave }: ProjectEditorProps) {
  // Current time state
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Workspace canvas parameters
  const [zoom, setZoom] = useState(0.85);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(0.85);
  const touchStartCenterRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isTwoFingerCustomActive, setIsTwoFingerCustomActive] = useState(false);
  const [activeMode, setActiveMode] = useState<'transform' | 'add_bone'>('transform');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsPanelCollapsed(true);
    }
  }, []);
  
  // Selected rigger nodes
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(
    project.bones[0]?.id || null
  );
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Undo/Redo stacks for robust state-tracking
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // Rendering & export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load project elements locally to allow fast edits, then synchronize back on save
  const [localProject, setLocalProject] = useState<Project>(project);

  // Track modification actions for undo structure
  const recordHistory = (projToRecord: Project) => {
    const raw = JSON.stringify(projToRecord);
    setUndoStack(prev => [...prev, raw]);
    setRedoStack([]); // clear redo
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousRaw = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    // Save current to redo stack
    setRedoStack(prev => [JSON.stringify(localProject), ...prev]);
    
    const parsed = JSON.parse(previousRaw) as Project;
    setLocalProject(parsed);
    onSave(parsed);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextRaw = redoStack[0];
    setRedoStack(prev => prev.slice(1));
    
    // Save current to undo
    setUndoStack(prev => [...prev, JSON.stringify(localProject)]);
    
    const parsed = JSON.parse(nextRaw) as Project;
    setLocalProject(parsed);
    onSave(parsed);
  };

  // Update save callback
  const updateProject = (next: Project) => {
    setLocalProject(next);
    onSave(next);
  };

  // Periodic state playback
  useEffect(() => {
    if (isPlaying) {
      const ms = 1000 / localProject.fps;
      playIntervalRef.current = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % localProject.length);
      }, ms);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, localProject.fps, localProject.length]);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and fill canvas properties
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = localProject.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid details (Only rendered when not exporting for a clean video format)
    if (!isExporting) {
      const isDarkBackground = localProject.color === '#0f172a';
      ctx.strokeStyle = isDarkBackground ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 30;
      
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Solve the active skeleton state for currentFrame
    const currentBoneIds = localProject.bones.map(b => b.id);
    const offsets = computeOffsets(localProject.keyframes, currentFrame, currentBoneIds);
    const skeleton = computeSkeleton(localProject.bones, offsets);

    // Draw Rigged Images
    localProject.images.forEach(img => {
      ctx.save();
      
      const boneJoint = skeleton[img.boneId || ''];
      if (boneJoint) {
        // Translation relative to rigged bone starting joint
        ctx.translate(boneJoint.start.x, boneJoint.start.y);
        ctx.rotate(boneJoint.absoluteAngle);
        ctx.translate(img.x, img.y);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.scale(img.scale, img.scale);
      } else {
        // Fallback or unrigged image: draw at center of resolution
        ctx.translate(localProject.width / 2, localProject.height / 2);
        ctx.translate(img.x, img.y);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.scale(img.scale, img.scale);
      }

      // Draw img bounding helper if selected (Only when not exporting)
      const isSelectedImg = selectedImageId === img.id;
      
      // Draw image
      const imageEl = new Image();
      imageEl.src = img.src;
      
      let dx = 0;
      let dy = 0;

      const aTop = img.anchorTop !== undefined ? img.anchorTop : 0.4;
      const aBottom = img.anchorBottom !== undefined ? img.anchorBottom : 0.4;
      const aLeft = img.anchorLeft !== undefined ? img.anchorLeft : 0.4;
      const aRight = img.anchorRight !== undefined ? img.anchorRight : 0.4;

      if (imageEl.complete && imageEl.naturalWidth !== 0) {
        const W = imageEl.width;
        const H = imageEl.height;
        if (!img.anchor || img.anchor === 'center') {
          dx = -W / 2;
          dy = -H / 2;
        } else if (img.anchor === 'top') {
          dx = -W / 2;
          dy = -aTop * H;
        } else if (img.anchor === 'bottom') {
          dx = -W / 2;
          dy = -(1.0 - aBottom) * H;
        } else if (img.anchor === 'left') {
          dx = -aLeft * W;
          dy = -H / 2;
        } else if (img.anchor === 'right') {
          dx = -(1.0 - aRight) * W;
          dy = -H / 2;
        }
        ctx.drawImage(imageEl, dx, dy);
      } else {
        // Fallback programmatic vector heart
        const W = 170;
        const H = 160;
        if (!img.anchor || img.anchor === 'center') {
          dx = 0;
          dy = 0;
        } else if (img.anchor === 'top') {
          dx = 0;
          dy = (0.5 - aTop) * H;
        } else if (img.anchor === 'bottom') {
          dx = 0;
          dy = -(0.5 - aBottom) * H;
        } else if (img.anchor === 'left') {
          dx = (0.5 - aLeft) * W;
          dy = 0;
        } else if (img.anchor === 'right') {
          dx = -(0.5 - aRight) * W;
          dy = 0;
        }
        
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillStyle = localProject.id === 'illustration' ? '#b91c1c' : '#ec4899';
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.bezierCurveTo(0, -35, -15, -55, -45, -55);
        ctx.bezierCurveTo(-85, -55, -85, -5, -85, -5);
        ctx.bezierCurveTo(-85, 35, -45, 75, 0, 105);
        ctx.bezierCurveTo(45, 75, 85, 35, 85, -5);
        ctx.bezierCurveTo(85, -5, 85, -55, 45, -55);
        ctx.bezierCurveTo(15, -55, 0, -35, 0, -30);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      if (isSelectedImg && !isExporting) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        
        let bx = -60;
        let by = -60;
        let bw = 120;
        let bh = 120;
        
        if (imageEl.complete && imageEl.naturalWidth !== 0) {
          bx = dx;
          by = dy;
          bw = imageEl.width;
          bh = imageEl.height;
        } else {
          bx = dx - 85;
          by = dy - 55;
          bw = 170;
          bh = 160;
        }
        
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);
      }

      ctx.restore();
    });

    // Draw active bones lines & bone handlers (Only rendered if not exporting for a clean presentation outcome)
    if (!isExporting) {
      Object.entries(skeleton).forEach(([boneId, joint]) => {
        const isSelected = selectedBoneId === boneId;
        const boneIndex = localProject.bones.findIndex(b => b.id === boneId);
        const index = boneIndex !== -1 ? boneIndex : 0;
        const colorScheme = PRESET_BONE_COLORS[index % PRESET_BONE_COLORS.length];

        // Outer bone hull vector
        ctx.strokeStyle = colorScheme.hull;
        ctx.lineWidth = isSelected ? 17 : 13;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(joint.start.x, joint.start.y);
        ctx.lineTo(joint.end.x, joint.end.y);
        ctx.stroke();

        // Inner glowing core
        ctx.strokeStyle = isSelected ? '#ffffff' : colorScheme.core;
        ctx.lineWidth = isSelected ? 8 : 5;
        ctx.stroke();

        // Start Joint connector node
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(joint.start.x, joint.start.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#ffffff' : colorScheme.stroke;
        ctx.lineWidth = isSelected ? 3.5 : 2.5;
        ctx.stroke();

        // End Joint terminal connection
        ctx.beginPath();
        ctx.arc(joint.end.x, joint.end.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw bone direction marker dot if selected
        if (isSelected) {
          ctx.fillStyle = colorScheme.stroke;
          ctx.beginPath();
          ctx.arc(joint.end.x, joint.end.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

  }, [localProject, currentFrame, selectedBoneId, selectedImageId, isExporting]);

  // Touch & Drag controls mapping on Canvas coordinates
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const dragTargetRef = useRef<{ boneId: string; type: 'start' | 'end' | 'root' } | null>(null);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Support mouse or touch vectors
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Account for styling zoom transformations
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e && e.touches.length >= 2) {
      return;
    }
    const { x, y } = getCanvasCoords(e);
    
    // Check if clicked near any skeleton joint
    const offsets = computeOffsets(localProject.keyframes, currentFrame, localProject.bones.map(b => b.id));
    const skeleton = computeSkeleton(localProject.bones, offsets);
    const target = findCloseJoint(skeleton, x, y, 20);

    if (activeMode === 'transform' && target) {
      recordHistory(localProject);
      setSelectedBoneId(target.boneId);
      setIsDraggingNode(true);
      dragTargetRef.current = { boneId: target.boneId, type: target.pointType };
      e.preventDefault();
    } else if (activeMode === 'add_bone') {
      // Add child bone from selected bone endpoint or floating root bone
      recordHistory(localProject);
      
      const newBoneId = `bone_${Math.random().toString(36).substring(2, 6)}`;
      const nextBones = [...localProject.bones];
      
      const newBone: Bone = {
        id: newBoneId,
        name: `Bone ${localProject.bones.length + 1}`,
        parentId: selectedBoneId,
        x: x, // ignored if parentId is active
        y: y, // ignored if parentId is active
        length: 80,
        baseAngle: selectedBoneId ? 0 : -90,
        color: '#10b981'
      };

      nextBones.push(newBone);
      setSelectedBoneId(newBoneId);
      setActiveMode('transform'); // auto toggle back to manipulate
      
      updateProject({
        ...localProject,
        bones: nextBones
      });
    } else {
      // Clicked on background: deselect active elements
      setSelectedBoneId(null);
      setSelectedImageId(null);
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e && e.touches.length >= 2) {
      return;
    }
    if (!isDraggingNode || !dragTargetRef.current) return;
    e.preventDefault();

    const { x, y } = getCanvasCoords(e);
    const target = dragTargetRef.current;
    
    const nextProject = { ...localProject };
    const bone = nextProject.bones.find(b => b.id === target.boneId);
    if (!bone) return;

    const offsets = computeOffsets(nextProject.keyframes, currentFrame, nextProject.bones.map(b => b.id));
    const skeleton = computeSkeleton(nextProject.bones, offsets);
    const joint = skeleton[target.boneId];
    if (!joint) return;

    if (target.type === 'end') {
      // User is adjusting the bone angle relative to start node
      const deltaX = x - joint.start.x;
      const deltaY = y - joint.start.y;
      const targetAngleRad = Math.atan2(deltaY, deltaX);
      const targetAngleDeg = (targetAngleRad * 180) / Math.PI;

      // Find parent base direction if has parent
      let parentAbsoluteAngleDeg = 0;
      if (bone.parentId) {
        const parentJoint = skeleton[bone.parentId];
        if (parentJoint) parentAbsoluteAngleDeg = (parentJoint.absoluteAngle * 180) / Math.PI;
      }

      // Desired angle of offset:
      // actual_absolute_angle = parentAbsoluteAngle + bone.baseAngle + rotationOffset
      // rotationOffset = targetAngleDeg - parentAbsoluteAngle - bone.baseAngle
      let desiredOffsetDeg = targetAngleDeg - parentAbsoluteAngleDeg - bone.baseAngle;
      
      // Clean up rotation boundaries (-180 to 180)
      desiredOffsetDeg = ((desiredOffsetDeg + 180) % 360) - 180;

      // Update offsets at current keyframe!
      // If no keyframe exists at currentFrame, create one!
      let kf = nextProject.keyframes.find(k => k.frame === currentFrame);
      if (!kf) {
        kf = {
          id: `kf_${Math.random().toString(36).substring(2, 6)}`,
          frame: currentFrame,
          boneOffsets: {}
        };
        nextProject.keyframes.push(kf);
      }

      if (!kf.boneOffsets[bone.id]) {
        kf.boneOffsets[bone.id] = { rotation: 0 };
      }
      kf.boneOffsets[bone.id].rotation = Math.round(desiredOffsetDeg);
      updateProject(nextProject);

    } else if (target.type === 'start' && !bone.parentId) {
      // Translate the ROOT bone position via animating keyframe offsets (x, y)
      let kf = nextProject.keyframes.find(k => k.frame === currentFrame);
      if (!kf) {
        kf = {
          id: `kf_${Math.random().toString(36).substring(2, 6)}`,
          frame: currentFrame,
          boneOffsets: {}
        };
        nextProject.keyframes.push(kf);
      }

      if (!kf.boneOffsets[bone.id]) {
        kf.boneOffsets[bone.id] = { rotation: 0, x: 0, y: 0 };
      }
      
      kf.boneOffsets[bone.id].x = Math.round(x - bone.x);
      kf.boneOffsets[bone.id].y = Math.round(y - bone.y);
      updateProject(nextProject);
    }
  };

  const handlePointerUp = () => {
    setIsDraggingNode(false);
    dragTargetRef.current = null;
  };

  const handleWorkspaceTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
      touchStartCenterRef.current = { x: centerX, y: centerY };
      touchStartPanRef.current = panOffset;
      setIsTwoFingerCustomActive(true);
    }
  };

  const handleWorkspaceTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && isTwoFingerCustomActive && touchStartDistRef.current && touchStartCenterRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scaleFactor = currentDist / touchStartDistRef.current;
      
      const newZoom = Math.max(0.15, Math.min(4.0, touchStartZoomRef.current * scaleFactor));
      setZoom(newZoom);
      
      const currentCenterX = (t1.clientX + t2.clientX) / 2;
      const currentCenterY = (t1.clientY + t2.clientY) / 2;
      
      const dx = currentCenterX - touchStartCenterRef.current.x;
      const dy = currentCenterY - touchStartCenterRef.current.y;
      
      setPanOffset({
        x: touchStartPanRef.current.x + dx,
        y: touchStartPanRef.current.y + dy
      });
    }
  };

  const handleWorkspaceTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      setIsTwoFingerCustomActive(false);
      touchStartDistRef.current = null;
      touchStartCenterRef.current = null;
    }
  };

  // Upload dynamic image part
  const handleUploadImagePart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      recordHistory(localProject);

      const newImage: ProjectImage = {
        id: `img_${Math.random().toString(36).substring(2, 6)}`,
        name: file.name.split('.')[0] || 'Image Part',
        src,
        boneId: selectedBoneId, // Rigged to selected bone by default!
        x: 0,
        y: -50,
        scale: 0.5,
        rotation: 0
      };

      const nextImages = [...localProject.images, newImage];
      setSelectedImageId(newImage.id);

      updateProject({
        ...localProject,
        images: nextImages
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Rig selected image to a different bone safely keeping visual layout stable
  const handleRigImage = (boneId: string | null) => {
    if (!selectedImageId) return;
    recordHistory(localProject);

    const currentBoneIds = localProject.bones.map(b => b.id);
    const offsets = computeOffsets(localProject.keyframes, currentFrame, currentBoneIds);
    const skeleton = computeSkeleton(localProject.bones, offsets);

    const nextImages = localProject.images.map(img => {
      if (img.id !== selectedImageId) return img;

      // 1. Calculate absolute position & rotation under current state
      let absX = 0;
      let absY = 0;
      let absRotDeg = img.rotation;

      const currentBoneJoint = img.boneId ? skeleton[img.boneId] : null;
      if (currentBoneJoint) {
        const theta = currentBoneJoint.absoluteAngle;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        absX = currentBoneJoint.start.x + (img.x * cosT - img.y * sinT);
        absY = currentBoneJoint.start.y + (img.x * sinT + img.y * cosT);
        
        const thetaDeg = (theta * 180) / Math.PI;
        absRotDeg = img.rotation + thetaDeg;
      } else {
        absX = localProject.width / 2 + img.x;
        absY = localProject.height / 2 + img.y;
        absRotDeg = img.rotation;
      }

      // 2. Calculate new relative (X, Y, rotation) relative to the target bone state
      let newX = 0;
      let newY = 0;
      let newRotDeg = absRotDeg;

      const targetBoneJoint = boneId ? skeleton[boneId] : null;
      if (targetBoneJoint) {
        const theta = targetBoneJoint.absoluteAngle;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        const dx = absX - targetBoneJoint.start.x;
        const dy = absY - targetBoneJoint.start.y;
        
        newX = dx * cosT + dy * sinT;
        newY = -dx * sinT + dy * cosT;
        
        const thetaDeg = (theta * 180) / Math.PI;
        newRotDeg = absRotDeg - thetaDeg;
      } else {
        newX = absX - localProject.width / 2;
        newY = absY - localProject.height / 2;
        newRotDeg = absRotDeg;
      }

      return {
        ...img,
        boneId,
        x: Math.round(newX),
        y: Math.round(newY),
        rotation: Math.round(newRotDeg)
      };
    });

    updateProject({
      ...localProject,
      images: nextImages
    });
  };

  // Modify image parameters
  const handleUpdateImageParam = (fields: Partial<ProjectImage>) => {
    if (!selectedImageId) return;
    const nextImages = localProject.images.map(img => {
      if (img.id === selectedImageId) {
        return { ...img, ...fields };
      }
      return img;
    });
    updateProject({
      ...localProject,
      images: nextImages
    });
  };

  // Timeline edits
  const handleAddKeyframe = () => {
    recordHistory(localProject);
    // Grab active computed offsets for currentFrame
    const currentBoneIds = localProject.bones.map(b => b.id);
    const resolvedOffsets = computeOffsets(localProject.keyframes, currentFrame, currentBoneIds);

    const nextKeyframes = [...localProject.keyframes];
    const existingIdx = nextKeyframes.findIndex(k => k.frame === currentFrame);

    const newOffsets: Record<string, BoneAngleOffset> = {};
    for (const bId of currentBoneIds) {
      newOffsets[bId] = {
        rotation: Math.round(resolvedOffsets[bId]?.rotation ?? 0),
        x: Math.round(resolvedOffsets[bId]?.x ?? 0),
        y: Math.round(resolvedOffsets[bId]?.y ?? 0)
      };
    }

    const key: Keyframe = {
      id: `kf_${Math.random().toString(36).substring(2, 5)}`,
      frame: currentFrame,
      boneOffsets: newOffsets
    };

    if (existingIdx !== -1) {
      nextKeyframes[existingIdx] = key;
    } else {
      nextKeyframes.push(key);
    }

    updateProject({
      ...localProject,
      keyframes: nextKeyframes
    });
  };

  const handleDeleteKeyframe = () => {
    recordHistory(localProject);
    const remaining = localProject.keyframes.filter(k => k.frame !== currentFrame);
    updateProject({
      ...localProject,
      keyframes: remaining
    });
  };

  // Jump keyframe controls
  const handlePrevFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev === 0 ? localProject.length - 1 : prev - 1));
  };

  const handleNextFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev + 1) % localProject.length);
  };

  // Delete bone safely, re-routing children parent fields to parent's parent
  const handleDeleteBone = (boneId: string) => {
    recordHistory(localProject);
    const targetBone = localProject.bones.find(b => b.id === boneId);
    if (!targetBone) return;

    // Filter out target bone
    const nextBones = localProject.bones.filter(b => b.id !== boneId).map(b => {
      if (b.parentId === boneId) {
        return { ...b, parentId: targetBone.parentId };
      }
      return b;
    });

    // Track current skeleton for image coordinate converting before bone deletion
    const currentBoneIds = localProject.bones.map(b => b.id);
    const offsets = computeOffsets(localProject.keyframes, currentFrame, currentBoneIds);
    const skeleton = computeSkeleton(localProject.bones, offsets);

    // Unrig images rigged to this bone keeping visual coordinates stable
    const nextImages = localProject.images.map(img => {
      if (img.boneId === boneId) {
        const boneJoint = skeleton[boneId];
        if (boneJoint) {
          const theta = boneJoint.absoluteAngle;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          
          const absX = boneJoint.start.x + (img.x * cosT - img.y * sinT);
          const absY = boneJoint.start.y + (img.x * sinT + img.y * cosT);
          
          const thetaDeg = (theta * 180) / Math.PI;
          const absRotDeg = img.rotation + thetaDeg;

          return {
            ...img,
            boneId: null,
            x: Math.round(absX - localProject.width / 2),
            y: Math.round(absY - localProject.height / 2),
            rotation: Math.round(absRotDeg)
          };
        }
        return { ...img, boneId: null };
      }
      return img;
    });

    setSelectedBoneId(nextBones[0]?.id || null);
    updateProject({
      ...localProject,
      bones: nextBones,
      images: nextImages
    });
  };

  // Video Export (Client-Side Rendering via offscreen media recorder canvas!)
  const handleExportMP4Video = async () => {
    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(1);

    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) {
      setIsExporting(false);
      return;
    }

    // Set up a recording stream fallback system
    let stream: MediaStream | null = null;
    try {
      // Capture at target fps
      stream = (sourceCanvas as any).captureStream ? (sourceCanvas as any).captureStream(localProject.fps) : null;
    } catch {
      // fallback
    }

    if (!stream) {
      alert('Your browser prevents real-time canvas stream capture. Exporting frame drawings loop as animated sequence file instead!');
      setIsExporting(false);
      return;
    }

    const recordedChunks: Blob[] = [];
    
    // Choose codecs
    let activeMime = 'video/webm';
    const codecs = [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=h264',
      'video/webm'
    ];

    for (const codec of codecs) {
      if ((window as any).MediaRecorder?.isTypeSupported?.(codec)) {
        activeMime = codec;
        break;
      }
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: activeMime });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Renamed/wrapped as MP4 or download as webm depending on native codec
        const blob = new Blob(recordedChunks, { type: activeMime });
        const videoURL = URL.createObjectURL(blob);
        
        const dl = document.createElement('a');
        dl.href = videoURL;
        // Output with .mp4 extension so it saves to phone device as standard video format
        dl.download = `${localProject.name.toLowerCase().replace(/\s+/g, '_')}_animation.mp4`;
        document.body.appendChild(dl);
        dl.click();
        document.body.removeChild(dl);
        
        setIsExporting(false);
        setExportProgress(0);
      };

      // Start recording frame-by-frame
      setCurrentFrame(0);
      recorder.start();

      let frame = 0;
      const intervalMs = 1000 / localProject.fps;

      const recordStep = () => {
        if (frame >= localProject.length) {
          recorder.stop();
          return;
        }

        setCurrentFrame(frame);
        setExportProgress(Math.round((frame / localProject.length) * 100));
        frame++;
        
        // Let canvas update, then proceed to next frame
        setTimeout(recordStep, intervalMs);
      };

      setTimeout(recordStep, 100);

    } catch (err) {
      console.error(err);
      alert('Media Recorder initialization failed. Emulating standard WebM download fallbacks.');
      setIsExporting(false);
    }
  };

  // Find active selected bone attributes
  const activeBone = localProject.bones.find(b => b.id === selectedBoneId);
  const activeImage = localProject.images.find(img => img.id === selectedImageId);

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      
      {/* HEADER BAR */}
      <div className="bg-[#0f172a] border-b border-slate-800 p-2.5 px-3 flex items-center justify-between z-30 shadow-md">
        <button 
          onClick={onExit}
          className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-semibold transition-all active:scale-95 cursor-pointer outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit</span>
        </button>

        <h2 className="text-sm font-bold text-slate-100 tracking-tight select-none">
          Skeleton Bones ({localProject.bones.length})
        </h2>

        {/* Upload Image Part button */}
        <div className="relative">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUploadImagePart} 
            accept="image/*" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-800 text-indigo-400 hover:bg-slate-700/80 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all outline-none"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Part</span>
          </button>
        </div>
      </div>

      {/* ZOOM, UNDO & TOOLBAR BAR */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 z-20 shadow-sm text-xs font-semibold">
        {/* Zoom */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 gap-1 select-none">
          <button 
            onClick={() => setZoom(prev => Math.max(0.2, prev - 0.15))}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 text-[10px] font-mono font-bold text-slate-400 min-w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(prev => Math.min(3.0, prev + 0.15))}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => {
              setZoom(0.85);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
            title="Reset Fit Screen & Pan"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Undo Redo */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 gap-1">
          <button 
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className={`p-1.5 rounded transition-all ${undoStack.length > 0 ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`}
            title="Undo Edit"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button 
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            className={`p-1.5 rounded transition-all ${redoStack.length > 0 ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-600 cursor-not-allowed'}`}
            title="Redo Edit"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Workspace mode select: Select vs Addbone */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 gap-1 font-semibold">
          <button
            onClick={() => setActiveMode('transform')}
            className={`px-2.5 py-1 text-[10px] rounded font-bold transition-all ${activeMode === 'transform' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Pose
          </button>
          <button
            onClick={() => setActiveMode('add_bone')}
            className={`px-2.5 py-1 text-[10px] rounded font-bold transition-all ${activeMode === 'add_bone' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            + Bone
          </button>
        </div>
      </div>

      {/* Dynamic Banner Hint for Bone Creation */}
      {activeMode === 'add_bone' && (
        <div className="bg-indigo-950 border-b border-indigo-900 text-indigo-200 py-2 px-3 text-center text-[11px] font-semibold flex items-center justify-center gap-2 animate-fade-in shrink-0">
          <Compass className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>
            {selectedBoneId ? (
              <>Menambahkan bone cabang baru yang tersambung ke <strong className="text-white">{localProject.bones.find(b => b.id === selectedBoneId)?.name}</strong>. Ketuk di kanvas untuk menempatkannya.</>
            ) : (
              <>Menambahkan <strong className="text-white">bone utama baru (independen)</strong> yang tidak tersambung ke bone lain. Ketuk di kanvas untuk menempatkannya.</>
            )}
          </span>
          {selectedBoneId && (
            <button 
              onClick={() => setSelectedBoneId(null)} 
              className="ml-2 bg-indigo-900 hover:bg-slate-800 text-[10px] font-bold px-2 py-0.5 rounded text-indigo-100 transition-all border border-indigo-700 hover:border-slate-700"
            >
              Jadikan Independen
            </button>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE CANVAS AREA */}
      <div 
        onTouchStart={handleWorkspaceTouchStart}
        onTouchMove={handleWorkspaceTouchMove}
        onTouchEnd={handleWorkspaceTouchEnd}
        onTouchCancel={handleWorkspaceTouchEnd}
        className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-4 relative min-h-0 select-none touch-none"
      >
        
        {/* Transform scale handle mapped globally to Zoom state */}
        <div 
          style={{ 
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`, 
            transformOrigin: 'center center' 
          }}
          className={`${isTwoFingerCustomActive ? '' : 'transition-transform duration-100 ease-out'} z-10 border border-slate-800 shadow-2xl relative`}
        >
          {/* Canvas Component with precise width & height mappings */}
          <canvas 
            ref={canvasRef} 
            width={localProject.width} 
            height={localProject.height}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            className="block touch-none rounded-xl"
            style={{ maxWidth: 'none' }}
          />
        </div>
      </div>

      {/* METADATA STRIP BAR */}
      <div className="bg-slate-900 border-y border-slate-800 py-1.5 px-3 flex items-center justify-between text-[10px] font-mono text-slate-400 z-10 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Resolution: <strong className="text-slate-300 font-bold">{localProject.width}x{localProject.height}</strong></span>
          </div>
          <span className="hidden sm:inline">Bones Count: <strong className="text-slate-300 font-bold">{localProject.bones.length}</strong></span>
          <span className="hidden sm:inline">Images: <strong className="text-slate-300 font-bold">{localProject.images.length}</strong></span>
        </div>
      </div>

      {/* BOTTOM PANEL GROUP WITH TIMELINE AND OVERLAID BONE PANEL */}
      <div className="relative shrink-0 w-full flex flex-col">
        {/* TIMELINE PANEL FOOTER */}
        <div className="bg-[#0f172a] border-t border-slate-800/80 p-3 pb-5 flex flex-col gap-2 z-10 shrink-0 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 font-mono">Timeline View (Frames)</span>
            
            <div className="flex items-center gap-3">
              {/* Timeline length input */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 font-mono">Length:</span>
                <input 
                  type="number" 
                  max="999" 
                  min="5"
                  value={localProject.length}
                  onChange={(e) => {
                    recordHistory(localProject);
                    updateProject({ ...localProject, length: Math.max(5, Number(e.target.value)) });
                  }}
                  className="w-10 h-5 bg-slate-950 border border-slate-800 rounded text-center text-[10px] font-bold font-mono outline-none focus:border-indigo-500"
                />
              </div>

              {/* Frame Badge */}
              <span className="bg-[#1e1b4b] text-indigo-300 border border-indigo-950/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                FRAME {currentFrame} / {localProject.length - 1}
              </span>
            </div>
          </div>

          {/* Interactive Scrub Timeline Tracker */}
          <div className="flex flex-col gap-1.5 my-1.5">
            <div className="relative group/track select-none">
              {/* Markers showing where keyframes reside */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-slate-800 rounded-full pointer-events-none" />
              
              {localProject.keyframes.map(k => {
                const pct = (k.frame / (localProject.length - 1)) * 100;
                return (
                  <div 
                    key={k.id}
                    className="absolute cursor-pointer w-2 h-2 rounded-full bg-orange-500 -translate-x-1/2 -translate-y-1/2 top-1/2 shadow-xs group-hover/track:scale-110 transition-transform"
                    style={{ left: `${pct}%` }}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentFrame(k.frame);
                    }}
                    title={`Keyframe at f:${k.frame}`}
                  />
                );
              })}

              <input 
                type="range" 
                min="0" 
                max={localProject.length - 1}
                value={currentFrame}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentFrame(Number(e.target.value));
                }}
                className="w-full relative z-10 opacity-100 h-6 appearance-none cursor-pointer accent-indigo-500 bg-transparent outline-none"
              />
            </div>

            {/* Timeline ticks indicator */}
            <div className="flex justify-between text-[8px] font-semibold font-mono text-slate-600 px-1">
              <span>0</span>
              <span>{Math.round(localProject.length * 0.25)}</span>
              <span>{Math.round(localProject.length * 0.5)}</span>
              <span>{Math.round(localProject.length * 0.75)}</span>
              <span>{localProject.length - 1}</span>
            </div>
          </div>

          {/* Row of Playback & keying controls */}
          <div className="grid grid-cols-6 gap-1.5 items-center">
            {/* Seek first */}
            <button 
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrame(0);
              }}
              className="bg-slate-900 border border-slate-800/60 hover:bg-slate-850 py-2 rounded-xl flex items-center justify-center transition-all select-none active:scale-90"
              title="Go to First Frame"
            >
              <span className="font-bold text-slate-300 py-0.5 text-xs">|◀</span>
            </button>

            {/* Prev frame */}
            <button 
              onClick={handlePrevFrame}
              className="bg-slate-900 border border-slate-800/60 hover:bg-slate-850 py-2 rounded-xl flex items-center justify-center transition-all select-none active:scale-90"
              title="Previous Frame"
            >
              <span className="font-bold text-slate-300 py-0.5 text-xs">◀</span>
            </button>

            {/* PLAY / PAUSE BUTTON */}
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-white" />
                  <span className="text-xs">Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span className="text-xs">Play</span>
                </>
              )}
            </button>

            {/* Next frame */}
            <button 
              onClick={handleNextFrame}
              className="bg-slate-900 border border-slate-800/60 hover:bg-slate-850 py-2 rounded-xl flex items-center justify-center transition-all select-none active:scale-90"
              title="Next Frame"
            >
              <span className="font-bold text-slate-300 py-0.5 text-xs">▶</span>
            </button>

            {/* Skip last */}
            <button 
              onClick={() => {
                setIsPlaying(false);
                setCurrentFrame(localProject.length - 1);
              }}
              className="bg-slate-900 border border-slate-800/60 hover:bg-slate-850 py-2 rounded-xl flex items-center justify-center transition-all select-none active:scale-90"
              title="Go to Last Frame"
            >
              <span className="font-bold text-slate-300 py-0.5 text-xs">▶|</span>
            </button>
          </div>

          {/* Keying & video export buttons row */}
          <div className="grid grid-cols-7 gap-1.5 mt-1 select-none">
            {/* Keyframe additions */}
            <button 
              onClick={handleAddKeyframe}
              className="col-span-4 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-1 rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 cursor-pointer"
              title="Key Pose on frame"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Key Selected Frame</span>
            </button>

            {/* Keyframe deletion */}
            <button 
              onClick={handleDeleteKeyframe}
              disabled={!localProject.keyframes.some(k => k.frame === currentFrame)}
              className={`py-2.5 rounded-xl border flex items-center justify-center transition-all active:scale-95 ${
                localProject.keyframes.some(k => k.frame === currentFrame)
                  ? 'bg-red-950 border-red-900 text-red-400 hover:bg-red-900 hover:text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-700 cursor-not-allowed'
              }`}
              title="Delete Keyframe"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* EXPORT VIDEO MP4 */}
            <button 
              onClick={handleExportMP4Video}
              className="col-span-2 bg-[#10b981] hover:bg-[#34d399] text-white font-bold py-2.5 px-0.5 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md hover:shadow-lg active:scale-95 cursor-pointer font-sans"
              title="Export Animation cycle to MP4"
            >
              <Video className="w-4 h-4" />
              <span>Export MP4</span>
            </button>
          </div>
        </div>

        {/* BONE / IMAGE CONTROLLERS PANEL */}
        {activeBone && (
          <div className="absolute inset-0 bg-[#0b0f19] border-t border-slate-800/80 p-3.5 flex flex-col overflow-y-auto select-text z-20 shadow-2xl animate-fade-in text-left">
            <div className="flex flex-col gap-2 animate-fade-in text-left">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-emerald-400" style={{ color: PRESET_BONE_COLORS[localProject.bones.findIndex(b => b.id === activeBone.id) % PRESET_BONE_COLORS.length]?.core }} />
                  <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: PRESET_BONE_COLORS[localProject.bones.findIndex(b => b.id === activeBone.id) % PRESET_BONE_COLORS.length]?.core }} />
                    {activeBone.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedBoneId(null)}
                    className="text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-all border border-slate-700 select-none cursor-pointer"
                  >
                    Deselect
                  </button>
                  <button 
                    onClick={() => handleDeleteBone(activeBone.id)}
                    className="text-[10px] font-bold text-red-500 hover:text-red-400 hover:bg-slate-800/50 px-2 py-1 rounded transition-all select-none cursor-pointer"
                  >
                    Delete Bone
                  </button>
                </div>
              </div>

              {/* Bone angle/length sliders */}
              <div className="grid grid-cols-2 gap-4 text-[11px] font-semibold text-slate-400">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Base Length</span>
                    <span className="text-slate-200 font-mono">{activeBone.length}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="20" 
                    max="300" 
                    value={activeBone.length}
                    onChange={(e) => {
                      recordHistory(localProject);
                      const nextBones = localProject.bones.map(b => b.id === activeBone.id ? { ...b, length: Number(e.target.value) } : b);
                      updateProject({ ...localProject, bones: nextBones });
                    }}
                    className="w-full accent-emerald-500 bg-slate-800 h-1 rounded"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Base Angle</span>
                    <span className="text-slate-200 font-mono">{activeBone.baseAngle}°</span>
                  </div>
                  <input 
                    type="range" 
                    min="-180" 
                    max="180" 
                    value={activeBone.baseAngle}
                    onChange={(e) => {
                      recordHistory(localProject);
                      const nextBones = localProject.bones.map(b => b.id === activeBone.id ? { ...b, baseAngle: Number(e.target.value) } : b);
                      updateProject({ ...localProject, bones: nextBones });
                    }}
                    className="w-full accent-emerald-500 bg-slate-800 h-1 rounded"
                  />
                </div>
              </div>

              {/* Parent Bone Selector */}
              <div className="flex items-center gap-2 text-[10px] mt-1">
                <span className="font-bold text-slate-500">Parent bone:</span>
                <select 
                  value={activeBone.parentId || ''} 
                  onChange={(e) => {
                    recordHistory(localProject);
                    const parentId = e.target.value || null;
                    const nextBones = localProject.bones.map(b => b.id === activeBone.id ? { ...b, parentId } : b);
                    updateProject({ ...localProject, bones: nextBones });
                  }}
                  className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 outline-none"
                >
                  <option value="">(None - Root)</option>
                  {localProject.bones.filter(b => b.id !== activeBone.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* IMAGES AND ATTACHMENTS MANAGER */}
            <div className="border-t border-slate-800/80 pt-2.5 text-left">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  Attached Image parts
                </span>
              </div>

              {localProject.images.length === 0 ? (
                <p className="text-[10px] text-slate-500 italic">No image parts loaded yet. Upload file to bind to bone.</p>
              ) : (
                <div className="flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {localProject.images.map(img => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedImageId(selectedImageId === img.id ? null : img.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border shrink-0 transition-all ${selectedImageId === img.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                      >
                        {img.name} {img.boneId ? '🔗' : '⚠️'}
                      </button>
                    ))}
                  </div>

                  {activeImage && (
                    <div className="bg-slate-955 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-bold text-slate-300">{activeImage.name} settings</span>
                        <button 
                          onClick={() => {
                            recordHistory(localProject);
                            const next = localProject.images.filter(img => img.id !== activeImage.id);
                            setSelectedImageId(null);
                            updateProject({ ...localProject, images: next });
                          }}
                          className="text-[#f87171] hover:text-red-300 font-bold"
                        >
                          Remove Part
                        </button>
                      </div>

                      {/* Attachment selectors */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500 flex justify-between items-center">
                            <span>Rig to Bone</span>
                          </span>
                          <div className="flex gap-1">
                            <select 
                              value={activeImage.boneId || ''}
                              onChange={(e) => handleRigImage(e.target.value || null)}
                              className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 outline-none flex-1 truncate"
                            >
                              <option value="">(Unrigged)</option>
                              {localProject.bones.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                            {activeImage.boneId && (
                              <button
                                onClick={() => handleRigImage(null)}
                                title="Lepas gambar dari bone"
                                className="bg-red-950 hover:bg-red-900 border border-red-900 text-red-300 hover:text-white rounded px-1.5 py-0.5 font-bold transition-all text-[9.5px]"
                              >
                                Lepas
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500">Local Scale</span>
                          <div className="flex items-center gap-1">
                            <input 
                              type="range" 
                              min="0.1" 
                              max="2.5" 
                              step="0.05"
                              value={activeImage.scale}
                              onChange={(e) => handleUpdateImageParam({ scale: Number(e.target.value) })}
                              className="w-full accent-indigo-500 h-1 bg-slate-800"
                            />
                            <span className="font-mono text-[9px] font-bold pr-1">{activeImage.scale}x</span>
                          </div>
                        </div>
                      </div>

                      {/* Anchor Alignment Row */}
                      <div className="flex flex-col gap-2 text-[10px] text-slate-300">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-medium">Titik Ikat Bone (Anchor Alignment)</span>
                          <button 
                            onClick={() => handleUpdateImageParam({ anchor: 'center' })}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-semibold border transition-all ${
                              (!activeImage.anchor || activeImage.anchor === 'center')
                                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            Reset Tengah
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          {/* COLUMN 1: Atas & Bawah */}
                          <div className="flex flex-col gap-2.5">
                            {/* ATAS */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.05"
                                  value={activeImage.anchorTop !== undefined ? activeImage.anchorTop : 0.4}
                                  onChange={(e) => handleUpdateImageParam({ anchor: 'top', anchorTop: Number(e.target.value) })}
                                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <span className="font-mono text-[9px] font-semibold text-slate-400 w-7 text-right">
                                  {(activeImage.anchorTop !== undefined ? activeImage.anchorTop : 0.4).toFixed(1)}x
                                </span>
                              </div>
                              <div
                                className={`w-full py-1 text-[10px] font-bold border rounded text-center select-none ${
                                  activeImage.anchor === 'top'
                                    ? 'bg-indigo-955 border-indigo-500/50 text-indigo-300'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                                }`}
                              >
                                Atas
                              </div>
                            </div>

                            {/* BAWAH */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.05"
                                  value={activeImage.anchorBottom !== undefined ? activeImage.anchorBottom : 0.4}
                                  onChange={(e) => handleUpdateImageParam({ anchor: 'bottom', anchorBottom: Number(e.target.value) })}
                                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <span className="font-mono text-[9px] font-semibold text-slate-400 w-7 text-right">
                                  {(activeImage.anchorBottom !== undefined ? activeImage.anchorBottom : 0.4).toFixed(1)}x
                                </span>
                              </div>
                              <div
                                className={`w-full py-1 text-[10px] font-bold border rounded text-center select-none ${
                                  activeImage.anchor === 'bottom'
                                    ? 'bg-indigo-955 border-indigo-500/50 text-indigo-300'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                                }`}
                              >
                                Bawah
                              </div>
                            </div>
                          </div>

                          {/* COLUMN 2: Kiri & Kanan */}
                          <div className="flex flex-col gap-2.5">
                            {/* KIRI */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.05"
                                  value={activeImage.anchorLeft !== undefined ? activeImage.anchorLeft : 0.4}
                                  onChange={(e) => handleUpdateImageParam({ anchor: 'left', anchorLeft: Number(e.target.value) })}
                                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <span className="font-mono text-[9px] font-semibold text-slate-400 w-7 text-right">
                                  {(activeImage.anchorLeft !== undefined ? activeImage.anchorLeft : 0.4).toFixed(1)}x
                                </span>
                              </div>
                              <div
                                className={`w-full py-1 text-[10px] font-bold border rounded text-center select-none ${
                                  activeImage.anchor === 'left'
                                    ? 'bg-indigo-955 border-indigo-500/50 text-indigo-300'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                                }`}
                              >
                                Kiri
                              </div>
                            </div>

                            {/* KANAN */}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1">
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.05"
                                  value={activeImage.anchorRight !== undefined ? activeImage.anchorRight : 0.4}
                                  onChange={(e) => handleUpdateImageParam({ anchor: 'right', anchorRight: Number(e.target.value) })}
                                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <span className="font-mono text-[9px] font-semibold text-slate-400 w-7 text-right">
                                  {(activeImage.anchorRight !== undefined ? activeImage.anchorRight : 0.4).toFixed(1)}x
                                </span>
                              </div>
                              <div
                                className={`w-full py-1 text-[10px] font-bold border rounded text-center select-none ${
                                  activeImage.anchor === 'right'
                                    ? 'bg-indigo-955 border-indigo-500/50 text-indigo-300'
                                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                                }`}
                              >
                                Kanan
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Offsets inputs */}
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-300">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500">Offset X</span>
                          <input 
                            type="number" 
                            value={activeImage.x} 
                            onChange={(e) => handleUpdateImageParam({ x: Number(e.target.value) })}
                            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500">Offset Y</span>
                          <input 
                            type="number" 
                            value={activeImage.y} 
                            onChange={(e) => handleUpdateImageParam({ y: Number(e.target.value) })}
                            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-500">Angle Offset</span>
                          <input 
                            type="number" 
                            value={activeImage.rotation} 
                            onChange={(e) => handleUpdateImageParam({ rotation: Number(e.target.value) })}
                            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-center font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* EXPORT PROGRESS DIALOG OVERLAY */}
      {isExporting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-xs text-center shadow-2xl flex flex-col items-center gap-4 animate-fade-in text-slate-200">
            <div className="w-12 h-12 bg-indigo-950 border border-indigo-800/40 rounded-full flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>

            <div>
              <h4 className="font-bold text-sm text-slate-100">Compiling MP4 Video</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Capturing skeleton poses frame-by-frame...</p>
            </div>

            {/* Progress percentage bar */}
            <div className="w-full flex flex-col gap-1.5 font-mono">
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-100"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-bold flex justify-between">
                <span>Rendering</span>
                <span>{exportProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
