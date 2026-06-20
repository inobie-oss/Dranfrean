import React, { useRef, useEffect, useState, useMemo } from "react";
import { Bone, ImageAsset, Project, FrameKeyframe } from "../types";
import { CalculatedBone, calculateWorldBones, getInterpolatedPose, getInterpolatedImagePose } from "../boneUtils";
import { Move, Plus, MousePointer, RotateCw, Trash2, Maximize2, ZoomIn, ZoomOut, Eye, Settings, HelpCircle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface BoneCanvasProps {
  project: Project;
  currentFrame: number;
  activeTool: "select" | "add_bone";
  setActiveTool: (tool: "select" | "add_bone") => void;
  selectedBoneId: string | null;
  setSelectedBoneId: (id: string | null) => void;
  selectedImageId: string | null;
  setSelectedImageId: (id: string | null) => void;
  onUpdateBones: (bones: Bone[]) => void;
  onUpdateImages: (images: ImageAsset[]) => void;
  onAutoKeyframe: (boneId: string, updates: { x: number; y: number; rotation: number }) => void;
  onAutoKeyframeImage?: (imageId: string, updates: { offsetX: number; offsetY: number; offsetRotation: number }) => void;
  isRecording?: boolean;
  onCaptureFrameRef?: React.MutableRefObject<((ctx: CanvasRenderingContext2D) => void) | null>;
  onDragEnd?: () => void;
}

export const BoneCanvas: React.FC<BoneCanvasProps> = ({
  project,
  currentFrame,
  activeTool,
  setActiveTool,
  selectedBoneId,
  setSelectedBoneId,
  selectedImageId,
  setSelectedImageId,
  onUpdateBones,
  onUpdateImages,
  onAutoKeyframe,
  onAutoKeyframeImage,
  isRecording = false,
  onCaptureFrameRef,
  onDragEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Canvas Viewport Pan & Zoom for comfortable workflow
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Loaded images cache
  const [imageElements, setImageElements] = useState<Record<string, HTMLImageElement>>({});

  // Render trigger dependency
  const [redrawTrigger, setRedrawTrigger] = useState(0);

  // Quick controls custom state
  const [stepSize, setStepSize] = useState<number>(5);

  const selectedBone = useMemo(() => {
    return project.bones.find((b) => b.id === selectedBoneId) || null;
  }, [project.bones, selectedBoneId]);

  const handleMoveBoneDir = (dx: number, dy: number) => {
    if (!selectedBone) return;
    const newX = selectedBone.x + dx;
    const newY = selectedBone.y + dy;
    const nextBones = project.bones.map((b) =>
      b.id === selectedBone.id ? { ...b, x: newX, y: newY } : b
    );
    onUpdateBones(nextBones);
    onAutoKeyframe(selectedBone.id, { x: newX, y: newY, rotation: selectedBone.rotation });
  };

  const handleResizeBoneLength = (amount: number) => {
    if (!selectedBone) return;
    const newLength = Math.max(15, Math.min(500, selectedBone.length + amount));
    const nextBones = project.bones.map((b) =>
      b.id === selectedBone.id ? { ...b, length: newLength } : b
    );
    onUpdateBones(nextBones);
  };

  const handleAttachImageToBone = (imgId: string, boneId: string) => {
    const img = project.images.find(i => i.id === imgId);
    if (!img) return;

    const bone = worldBones[boneId];
    if (!bone) return;

    // Ambil pose interpolasi dari image saat ini secara presisi
    const imgPose = getInterpolatedImagePose(img.id, currentFrame, project.keyframes, {
      offsetX: img.offsetX,
      offsetY: img.offsetY,
      offsetRotation: img.offsetRotation,
    });

    let currentWorldX = 0;
    let currentWorldY = 0;
    let currentWorldRot = 0;

    if (img.attachedBoneId && worldBones[img.attachedBoneId]) {
      // Jika sebelumnya sudah menempel ke bone lain, hitung koordinat dunianya dari bone itu
      const prevBone = worldBones[img.attachedBoneId];
      const prevBoneRad = (prevBone.worldRotation * Math.PI) / 180;
      currentWorldX = prevBone.worldX + imgPose.offsetX * Math.cos(prevBoneRad) - imgPose.offsetY * Math.sin(prevBoneRad);
      currentWorldY = prevBone.worldY + imgPose.offsetX * Math.sin(prevBoneRad) + imgPose.offsetY * Math.cos(prevBoneRad);
      currentWorldRot = prevBone.worldRotation + imgPose.offsetRotation;
    } else {
      // Jika sebelumnya bebas (floating), posisinya relatif terhadap tengah panggung
      currentWorldX = project.width / 2 + imgPose.offsetX;
      currentWorldY = project.height / 2 + imgPose.offsetY;
      currentWorldRot = imgPose.offsetRotation;
    }

    // Sekarang, kita ingin menempelkannya ke `boneId` baru pada koordinat (currentWorldX, currentWorldY)
    const boneRad = (bone.worldRotation * Math.PI) / 180;
    const dx = currentWorldX - bone.worldX;
    const dy = currentWorldY - bone.worldY;

    // Rotasi balik (inverse rotation)
    const newOffsetX = dx * Math.cos(-boneRad) - dy * Math.sin(-boneRad);
    const newOffsetY = dx * Math.sin(-boneRad) + dy * Math.cos(-boneRad);
    const newOffsetRotation = currentWorldRot - bone.worldRotation;

    const nextImages = project.images.map((i) =>
      i.id === imgId
        ? {
            ...i,
            attachedBoneId: boneId,
            offsetX: Math.round(newOffsetX),
            offsetY: Math.round(newOffsetY),
            offsetRotation: Math.round(newOffsetRotation),
          }
        : i
    );
    onUpdateImages(nextImages);
  };

  const handleDetachImageFromBone = (imgId: string) => {
    const img = project.images.find(i => i.id === imgId);
    if (!img) return;

    if (!img.attachedBoneId || !worldBones[img.attachedBoneId]) {
      // Sudah lepas
      return;
    }

    const bone = worldBones[img.attachedBoneId];
    const imgPose = getInterpolatedImagePose(img.id, currentFrame, project.keyframes, {
      offsetX: img.offsetX,
      offsetY: img.offsetY,
      offsetRotation: img.offsetRotation,
    });

    const boneRad = (bone.worldRotation * Math.PI) / 180;
    const currentWorldX = bone.worldX + imgPose.offsetX * Math.cos(boneRad) - imgPose.offsetY * Math.sin(boneRad);
    const currentWorldY = bone.worldY + imgPose.offsetX * Math.sin(boneRad) + imgPose.offsetY * Math.cos(boneRad);
    const currentWorldRot = bone.worldRotation + imgPose.offsetRotation;

    // Konversi ke posisi floating (relatif terhadap pusat panggung)
    const newOffsetX = currentWorldX - project.width / 2;
    const newOffsetY = currentWorldY - project.height / 2;
    const newOffsetRotation = currentWorldRot;

    const nextImages = project.images.map((i) =>
      i.id === imgId
        ? {
            ...i,
            attachedBoneId: null,
            offsetX: Math.round(newOffsetX),
            offsetY: Math.round(newOffsetY),
            offsetRotation: Math.round(newOffsetRotation),
          }
        : i
    );
    onUpdateImages(nextImages);
  };

  // Dragging states
  const [dragType, setDragType] = useState<"bone_joint" | "bone_rotation" | "image_offset" | null>(null);
  const [dragBoneId, setDragBoneId] = useState<string | null>(null);
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 });
  const [dragStartBoneLocalPos, setDragStartBoneLocalPos] = useState({ x: 0, y: 0 });
  const [dragStartBoneLocalRot, setDragStartBoneLocalRot] = useState(0);
  const [dragStartImageOffset, setDragStartImageOffset] = useState({ x: 0, y: 0, rotation: 0 });

  // Calculate World Bones recursively
  const worldBones = useMemo(() => {
    return calculateWorldBones(project.bones, currentFrame, project.keyframes);
  }, [project.bones, currentFrame, project.keyframes]);

  // Load and cache all uploaded image assets
  useEffect(() => {
    const newElements: Record<string, HTMLImageElement> = { ...imageElements };
    let loadedAny = false;

    project.images.forEach((img) => {
      if (!newElements[img.id]) {
        const hImg = new Image();
        hImg.src = img.url;
        hImg.onload = () => {
          setImageElements((prev) => ({ ...prev, [img.id]: hImg }));
          setRedrawTrigger((t) => t + 1);
        };
        newElements[img.id] = hImg;
        loadedAny = true;
      }
    });
  }, [project.images]);

  // Center the canvas inside the viewport on first load or when resolution changes
  useEffect(() => {
    if (containerRef.current && canvasRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      setPan({
        x: (containerWidth - project.width) / 2,
        y: (containerHeight - project.height) / 2,
      });
      setZoom(1);
    }
  }, [project.width, project.height]);

  // Redraw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high-density rendering support if desired
    canvas.width = project.width;
    canvas.height = project.height;

    // 1. Draw Canvas Background
    ctx.fillStyle = project.backgroundColor || "#ffffff";
    ctx.fillRect(0, 0, project.width, project.height);

    // Optional subtle grid lines
    ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < project.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, project.height);
      ctx.stroke();
    }
    for (let y = 0; y < project.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(project.width, y);
      ctx.stroke();
    }

    // 2. Draw Image Assets based on Z-Index or whether they are attached
    const sortedImages = [...project.images].sort((a, b) => a.zIndex - b.zIndex);

    sortedImages.forEach((img) => {
      const hImg = imageElements[img.id];
      if (!hImg || !hImg.complete) return;

      const imgPose = getInterpolatedImagePose(img.id, currentFrame, project.keyframes, {
        offsetX: img.offsetX,
        offsetY: img.offsetY,
        offsetRotation: img.offsetRotation,
      });

      let renderX = 0;
      let renderY = 0;
      let renderRot = 0; // degrees

      if (img.attachedBoneId && worldBones[img.attachedBoneId]) {
        // Render relative to the attached Bone
        const bone = worldBones[img.attachedBoneId];
        const boneRad = (bone.worldRotation * Math.PI) / 180;
        
        // Transform offset with bone rotation
        renderX = bone.worldX + imgPose.offsetX * Math.cos(boneRad) - imgPose.offsetY * Math.sin(boneRad);
        renderY = bone.worldY + imgPose.offsetX * Math.sin(boneRad) + imgPose.offsetY * Math.cos(boneRad);
        renderRot = bone.worldRotation + imgPose.offsetRotation;
      } else {
        // Redraw unattached flat background attachment at local offset relative to grid center
        renderX = project.width / 2 + imgPose.offsetX;
        renderY = project.height / 2 + imgPose.offsetY;
        renderRot = imgPose.offsetRotation;
      }

      ctx.save();
      // Translate to world attachment spot
      ctx.translate(renderX, renderY);
      ctx.rotate((renderRot * Math.PI) / 180);
      ctx.scale(img.offsetScaleX, img.offsetScaleY);

      // Draw centering the image
      const w = img.width || hImg.width || 100;
      const h = img.height || hImg.height || 100;

      // Draw translucent selected boundary
      if (selectedImageId === img.id && !isRecording) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }

      ctx.drawImage(hImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    });

    // 3. Draw Bone Segments (Only if we aren't rendering a final clean video)
    if (!isRecording) {
      Object.keys(worldBones).forEach((boneId) => {
        const bone = worldBones[boneId];
        const isSelected = selectedBoneId === bone.id;
        
        ctx.save();
        
        // Draw the beautiful skeletal bone body (Tapered Diamond Shape)
        const boneRad = (bone.worldRotation * Math.PI) / 180;
        const normX = -Math.sin(boneRad);
        const normY = Math.cos(boneRad);

        const jointRadius = isSelected ? 8 : 6;
        const thickness = Math.max(jointRadius * 1.5, bone.length * 0.12);

        // Calculate Bone Polygon
        const ptJoint = { x: bone.worldX, y: bone.worldY };
        const ptTip = { x: bone.tipX, y: bone.tipY };
        const ptLeft = {
          x: bone.worldX + bone.length * 0.18 * Math.cos(boneRad) + thickness * normX,
          y: bone.worldY + bone.length * 0.18 * Math.sin(boneRad) + thickness * normY,
        };
        const ptRight = {
          x: bone.worldX + bone.length * 0.18 * Math.cos(boneRad) - thickness * normX,
          y: bone.worldY + bone.length * 0.18 * Math.sin(boneRad) - thickness * normY,
        };

        // Draw bone polygon
        ctx.beginPath();
        ctx.moveTo(ptJoint.x, ptJoint.y);
        ctx.lineTo(ptLeft.x, ptLeft.y);
        ctx.lineTo(ptTip.x, ptTip.y);
        ctx.lineTo(ptRight.x, ptRight.y);
        ctx.closePath();

        // Fill color based on hierarchy or selected status
        ctx.fillStyle = isSelected ? "rgba(59, 130, 246, 0.7)" : `${bone.color}6f` || "rgba(107, 114, 128, 0.4)";
        ctx.strokeStyle = isSelected ? "#2563eb" : "#4b5563";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.fill();
        ctx.stroke();

        // Draw joint circle (base of bone)
        ctx.beginPath();
        ctx.arc(bone.worldX, bone.worldY, jointRadius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#3b82f6" : "#6b7280";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw tip handle (bone end)
        ctx.beginPath();
        ctx.arc(bone.tipX, bone.tipY, 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#60a5fa" : "#9ca3af";
        ctx.fill();
        ctx.stroke();

        // Draw subtle direction needle inside selected bone
        if (isSelected) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.moveTo(bone.worldX, bone.worldY);
          ctx.lineTo(bone.tipX, bone.tipY);
          ctx.stroke();
        }

        ctx.restore();
      });
    }

    // Capture Frame Ref in case we are recording an export video
    if (onCaptureFrameRef) {
      onCaptureFrameRef.current = (recordingCtx: CanvasRenderingContext2D) => {
        recordingCtx.drawImage(canvas, 0, 0);
      };
    }
  }, [project, worldBones, selectedBoneId, selectedImageId, imageElements, redrawTrigger, isRecording]);

  // Convert client cursor coords into local canvas-scale coords
  const getCanvasMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Zoom/Pan independent coord mapping
    const clientXOnCanvas = e.clientX - rect.left;
    const clientYOnCanvas = e.clientY - rect.top;
    
    const canvasScaleX = canvas.width / rect.width;
    const canvasScaleY = canvas.height / rect.height;

    return {
      x: clientXOnCanvas * canvasScaleX,
      y: clientYOnCanvas * canvasScaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Left-click with panning tool or space key dragging
    if (e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y } = getCanvasMouseCoords(e);

    // 1. Check if we clicked any Bone Joint rotation handle
    if (selectedBoneId && worldBones[selectedBoneId]) {
      const activeBone = worldBones[selectedBoneId];
      // Rotation handle is at the tip (end of bone)
      const distToTip = Math.hypot(x - activeBone.tipX, y - activeBone.tipY);
      
      if (distToTip < 15) {
        setDragType("bone_rotation");
        setDragBoneId(selectedBoneId);
        setDragStartMouse({ x, y });
        // Calculate angle of click relative to bone world joint
        const angleRad = Math.atan2(y - activeBone.worldX, x - activeBone.worldX);
        const pose = getInterpolatedPose(selectedBoneId, currentFrame, project.keyframes, activeBone);
        setDragStartBoneLocalRot(pose.rotation);
        return;
      }
    }

    // 2. Click-test other items: First check Bone Joints
    let foundBoneId: string | null = null;
    const boneIdList = Object.keys(worldBones);

    // Priority check: did we click a joint?
    for (let i = 0; i < boneIdList.length; i++) {
      const boneId = boneIdList[i];
      const bone = worldBones[boneId];
      const distToJoint = Math.hypot(x - bone.worldX, y - bone.worldY);
      if (distToJoint < 12) {
        foundBoneId = boneId;
        break;
      }
    }

    // Secondary check: did we click along the bone body?
    if (!foundBoneId) {
      for (let i = 0; i < boneIdList.length; i++) {
        const boneId = boneIdList[i];
        const bone = worldBones[boneId];
        
        // Distance from point to line segment
        const A = x - bone.worldX;
        const B = y - bone.worldY;
        const C = bone.tipX - bone.worldX;
        const D = bone.tipY - bone.worldY;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;
        if (param < 0) {
          xx = bone.worldX;
          yy = bone.worldY;
        } else if (param > 1) {
          xx = bone.tipX;
          yy = bone.tipY;
        } else {
          xx = bone.worldX + param * C;
          yy = bone.worldY + param * D;
        }

        const dist = Math.hypot(x - xx, y - yy);
        if (dist < 15) {
          foundBoneId = boneId;
          break;
        }
      }
    }

    if (foundBoneId) {
      setSelectedBoneId(foundBoneId);
      setSelectedImageId(null);

      // Always allow translation-dragging of custom bones sesuka kita!
      setDragType("bone_joint");
      setDragBoneId(foundBoneId);
      setDragStartMouse({ x, y });
      const boneRef = worldBones[foundBoneId];
      const pose = getInterpolatedPose(foundBoneId, currentFrame, project.keyframes, boneRef);
      setDragStartBoneLocalPos({ x: pose.x, y: pose.y });
      return;
    }

    // 3. Click-test Images for Selection or Dragging
    let foundImageId: string | null = null;
    const sortedImages = [...project.images].sort((a, b) => b.zIndex - a.zIndex); // Click front-most first

    for (let i = 0; i < sortedImages.length; i++) {
      const img = sortedImages[i];
      const hImg = imageElements[img.id];
      const w = img.width || (hImg ? hImg.width : 100);
      const h = img.height || (hImg ? hImg.height : 100);

      const imgPose = getInterpolatedImagePose(img.id, currentFrame, project.keyframes, {
        offsetX: img.offsetX,
        offsetY: img.offsetY,
        offsetRotation: img.offsetRotation,
      });

      // Determine absolute world position of image
      let imgX = 0;
      let imgY = 0;
      let imgRot = 0;

      if (img.attachedBoneId && worldBones[img.attachedBoneId]) {
        const bone = worldBones[img.attachedBoneId];
        const rad = (bone.worldRotation * Math.PI) / 180;
        imgX = bone.worldX + imgPose.offsetX * Math.cos(rad) - imgPose.offsetY * Math.sin(rad);
        imgY = bone.worldY + imgPose.offsetX * Math.sin(rad) + imgPose.offsetY * Math.cos(rad);
        imgRot = bone.worldRotation + imgPose.offsetRotation;
      } else {
        imgX = project.width / 2 + imgPose.offsetX;
        imgY = project.height / 2 + imgPose.offsetY;
        imgRot = imgPose.offsetRotation;
      }

      // Convert mouse click into image local space
      const dx = x - imgX;
      const dy = y - imgY;
      const radRot = (-imgRot * Math.PI) / 180;
      const localX = dx * Math.cos(radRot) - dy * Math.sin(radRot);
      const localY = dx * Math.sin(radRot) + dy * Math.cos(radRot);

      if (localX >= -w / 2 && localX <= w / 2 && localY >= -h / 2 && localY <= h / 2) {
        foundImageId = img.id;
        break;
      }
    }

    if (foundImageId) {
      setSelectedImageId(foundImageId);
      setSelectedBoneId(null);
      setDragType("image_offset");
      setDragImageId(foundImageId);
      setDragStartMouse({ x, y });
      
      const imgRef = project.images.find(img => img.id === foundImageId)!;
      const imgPose = getInterpolatedImagePose(imgRef.id, currentFrame, project.keyframes, {
        offsetX: imgRef.offsetX,
        offsetY: imgRef.offsetY,
        offsetRotation: imgRef.offsetRotation,
      });

      setDragStartImageOffset({
        x: imgPose.offsetX,
        y: imgPose.offsetY,
        rotation: imgPose.offsetRotation
      });
      return;
    }

    // 4. If Clicked Canvas space on "Add Bone" tool: ADD bone!
    if (activeTool === "add_bone") {
      const parentId = selectedBoneId;
      const nextId = "bone_" + Math.random().toString(36).substring(2, 7);
      
      let localX = x;
      let localY = y;
      let localRot = 45; // default 45 deg angle

      if (parentId && worldBones[parentId]) {
        // Find coordinates relative to parent joint
        const parent = worldBones[parentId];
        
        // Default position child at parent's tip
        localX = parent.length;
        localY = 0;
        localRot = 0; // extend from parent direction
      }

      const colors = ["#22c55e", "#ef4444", "#3b82f6", "#eab308", "#a855f7", "#ec4899", "#14b8a6"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newBone: Bone = {
        id: nextId,
        name: `Bone ${project.bones.length + 1}`,
        parentId,
        x: localX,
        y: localY,
        rotation: localRot,
        length: 70,
        color: randomColor,
      };

      onUpdateBones([...project.bones, newBone]);
      setSelectedBoneId(nextId);
      setSelectedImageId(null);
      // Switch back to select tool so they can pose immediately
      setActiveTool("select");
      return;
    }

    // Clear selection
    setSelectedBoneId(null);
    setSelectedImageId(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    const { x, y } = getCanvasMouseCoords(e);

    // Update canvas cursor styling dynamically based on hovered elements when not dragging
    if (!dragType) {
      const canvas = canvasRef.current;
      if (canvas) {
        let isHoveringTip = false;
        if (selectedBoneId && worldBones[selectedBoneId]) {
          const activeBone = worldBones[selectedBoneId];
          const distToTip = Math.hypot(x - activeBone.tipX, y - activeBone.tipY);
          if (distToTip < 16) {
            isHoveringTip = true;
          }
        }

        if (isHoveringTip) {
          canvas.style.cursor = "grab";
        } else {
          let foundBone = false;
          const boneIdList = Object.keys(worldBones);

          // Check joint bases hover
          for (let i = 0; i < boneIdList.length; i++) {
            const boneId = boneIdList[i];
            const bone = worldBones[boneId];
            const distToJoint = Math.hypot(x - bone.worldX, y - bone.worldY);
            if (distToJoint < 16) {
              foundBone = true;
              break;
            }
          }

          // Check bone bodies hover
          if (!foundBone) {
            for (let i = 0; i < boneIdList.length; i++) {
              const boneId = boneIdList[i];
              const bone = worldBones[boneId];
              
              const A = x - bone.worldX;
              const B = y - bone.worldY;
              const C = bone.tipX - bone.worldX;
              const D = bone.tipY - bone.worldY;

              const dot = A * C + B * D;
              const lenSq = C * C + D * D;
              let param = -1;
              if (lenSq !== 0) param = dot / lenSq;

              let xx, yy;
              if (param < 0) {
                xx = bone.worldX;
                yy = bone.worldY;
              } else if (param > 1) {
                xx = bone.tipX;
                yy = bone.tipY;
              } else {
                xx = bone.worldX + param * C;
                yy = bone.worldY + param * D;
              }

              const dist = Math.hypot(x - xx, y - yy);
              if (dist < 20) {
                foundBone = true;
                break;
              }
            }
          }

          if (foundBone) {
            canvas.style.cursor = "move";
          } else {
            // Check images hover
            let foundImage = false;
            const sortedImages = [...project.images].sort((a, b) => b.zIndex - a.zIndex);

            for (let i = 0; i < sortedImages.length; i++) {
              const img = sortedImages[i];
              const hImg = imageElements[img.id];
              const w = img.width || (hImg ? hImg.width : 100);
              const h = img.height || (hImg ? hImg.height : 100);

              const imgPose = getInterpolatedImagePose(img.id, currentFrame, project.keyframes, {
                offsetX: img.offsetX,
                offsetY: img.offsetY,
                offsetRotation: img.offsetRotation,
              });

              let imgX = 0, imgY = 0, imgRot = 0;
              if (img.attachedBoneId && worldBones[img.attachedBoneId]) {
                const bone = worldBones[img.attachedBoneId];
                const rad = (bone.worldRotation * Math.PI) / 180;
                imgX = bone.worldX + imgPose.offsetX * Math.cos(rad) - imgPose.offsetY * Math.sin(rad);
                imgY = bone.worldY + imgPose.offsetX * Math.sin(rad) + imgPose.offsetY * Math.cos(rad);
                imgRot = bone.worldRotation + imgPose.offsetRotation;
              } else {
                imgX = project.width / 2 + imgPose.offsetX;
                imgY = project.height / 2 + imgPose.offsetY;
                imgRot = imgPose.offsetRotation;
              }

              const dxInput = x - imgX;
              const dyInput = y - imgY;
              const radRot = (-imgRot * Math.PI) / 180;
              const localX = dxInput * Math.cos(radRot) - dyInput * Math.sin(radRot);
              const localY = dxInput * Math.sin(radRot) + dyInput * Math.cos(radRot);

              if (localX >= -w / 2 && localX <= w / 2 && localY >= -h / 2 && localY <= h / 2) {
                foundImage = true;
                break;
              }
            }

            if (foundImage) {
              canvas.style.cursor = "pointer";
            } else {
              canvas.style.cursor = "default";
            }
          }
        }
      }
    }

    if (!dragType) return;
    const dx = x - dragStartMouse.x;
    const dy = y - dragStartMouse.y;

    if (dragType === "bone_joint" && dragBoneId) {
      // Set moving cursor style active
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = "grabbing";

      // Move bone: updates local (x, y) coordinates
      const bone = project.bones.find(b => b.id === dragBoneId);
      if (bone) {
        let newX = dragStartBoneLocalPos.x;
        let newY = dragStartBoneLocalPos.y;

        if (!bone.parentId) {
          // Absolute local translation for root
          newX = dragStartBoneLocalPos.x + dx;
          newY = dragStartBoneLocalPos.y + dy;
        } else {
          // If it has parent, translation is computed inside parent world direction!
          // We can projects parent scale & rotation
          const parent = worldBones[bone.parentId];
          const parentRad = (parent.worldRotation * Math.PI) / 180;
          
          // Rotate joint delta back to local coordinates
          const localDx = dx * Math.cos(-parentRad) - dy * Math.sin(-parentRad);
          const localDy = dx * Math.sin(-parentRad) + dy * Math.cos(-parentRad);

          newX = dragStartBoneLocalPos.x + localDx;
          newY = dragStartBoneLocalPos.y + localDy;
        }

        // Apply visual updates
        const updatedBones = project.bones.map(b => b.id === dragBoneId ? { ...b, x: Math.round(newX), y: Math.round(newY) } : b);
        onUpdateBones(updatedBones);
        onAutoKeyframe(dragBoneId, { x: Math.round(newX), y: Math.round(newY), rotation: bone.rotation });
      }
    } else if (dragType === "bone_rotation" && dragBoneId && worldBones[dragBoneId]) {
      // Rotation joint helper calculation
      const activeBone = worldBones[dragBoneId];
      // Angle of pointer relative to joint world position
      const radNow = Math.atan2(y - activeBone.worldY, x - activeBone.worldX);
      const degNow = (radNow * 180) / Math.PI;

      // Base bone angle
      let localAngle = degNow;
      if (activeBone.parentId && worldBones[activeBone.parentId]) {
        localAngle = degNow - worldBones[activeBone.parentId].worldRotation;
      }

      // Keep normalize 0-360 or positive
      localAngle = (localAngle + 720) % 360;

      const updatedBones = project.bones.map(b => b.id === dragBoneId ? { ...b, rotation: Math.round(localAngle) } : b);
      onUpdateBones(updatedBones);
      
      const bone = project.bones.find(b => b.id === dragBoneId)!;
      onAutoKeyframe(dragBoneId, { x: bone.x, y: bone.y, rotation: Math.round(localAngle) });
    } else if (dragType === "image_offset" && dragImageId) {
      // Translate the image
      const img = project.images.find(assets => assets.id === dragImageId);
      if (img) {
        let newX = dragStartImageOffset.x + dx;
        let newY = dragStartImageOffset.y + dy;

        if (img.attachedBoneId && worldBones[img.attachedBoneId]) {
          // If the image is attached to a bone, standard displacement (dx, dy)
          // must be rotated back into the local alignment of the bone
          const bone = worldBones[img.attachedBoneId];
          const boneRad = (bone.worldRotation * Math.PI) / 180;
          const rotatedDx = dx * Math.cos(-boneRad) - dy * Math.sin(-boneRad);
          const rotatedDy = dx * Math.sin(-boneRad) + dy * Math.cos(-boneRad);

          newX = dragStartImageOffset.x + rotatedDx;
          newY = dragStartImageOffset.y + rotatedDy;
        }

        const updatedImages = project.images.map(assets =>
          assets.id === dragImageId ? { ...assets, offsetX: Math.round(newX), offsetY: Math.round(newY) } : assets
        );
        onUpdateImages(updatedImages);
        onAutoKeyframeImage?.(dragImageId, { offsetX: Math.round(newX), offsetY: Math.round(newY), offsetRotation: img.offsetRotation });
      }
    }
  };

  const handleMouseUp = () => {
    if (dragType) {
      onDragEnd?.();
    }
    setDragType(null);
    setDragBoneId(null);
    setDragImageId(null);
    setIsPanning(false);
  };

  // Zoom helpers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newZoom = zoom;

    if (e.deltaY < 0) {
      newZoom = Math.min(newZoom * zoomFactor, 8);
    } else {
      newZoom = Math.max(newZoom / zoomFactor, 0.2);
    }
    setZoom(newZoom);
  };

  // Handle key deletions of active bones or attachments
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        // Don't trigger if user is focusing an input field
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;

        if (selectedBoneId) {
          // Delete selected bone and update family tree parentIds to this bone's parent
          const boneToDelete = project.bones.find(b => b.id === selectedBoneId);
          if (boneToDelete) {
            const nextBones = project.bones
              .filter(b => b.id !== selectedBoneId)
              .map(b => b.parentId === selectedBoneId ? { ...b, parentId: boneToDelete.parentId } : b);
            
            // Remove attachments
            const nextImages = project.images.map(img => img.attachedBoneId === selectedBoneId ? { ...img, attachedBoneId: null } : img);

            onUpdateBones(nextBones);
            onUpdateImages(nextImages);
            setSelectedBoneId(null);
          }
        } else if (selectedImageId) {
          // Filter image
          const nextImages = project.images.filter(img => img.id !== selectedImageId);
          onUpdateImages(nextImages);
          setSelectedImageId(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBoneId, selectedImageId, project.bones, project.images]);

  return (
    <div className="relative flex-1 h-full flex flex-col bg-slate-900 border border-slate-700 rounded-xl overflow-hidden select-none">
      {/* Visual Canvas Utilities Header Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        
        {/* Left Toolbar Option: Select, Bone Brush */}
        <div className="flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-700 shadow-xl pointer-events-auto">
          <div
            className="p-1.5 rounded-md flex items-center gap-1.5 bg-indigo-600 text-white font-semibold"
            title="Rigging, Selection and Pose Posing"
          >
            <MousePointer className="w-4 h-4 text-indigo-200" />
            <span className="text-xs font-semibold">Pose & Rig</span>
          </div>
        </div>

        {/* Diagnostic instructions */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-950/75 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            Drag a bone joint/body to slide and reposition it freely, drag the outer small tip to rotate!
          </span>
        </div>

        {/* Viewport Scale Control Options */}
        <div className="flex items-center gap-1 bg-slate-950/85 backdrop-blur-md px-2 py-1.5 rounded-lg border border-slate-700 shadow-xl pointer-events-auto">
          <button 
            onClick={() => setZoom(z => Math.max(z - 0.15, 0.25))} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800" 
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono font-semibold text-slate-300 px-1 bg-slate-900 rounded">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(z => Math.min(z + 0.15, 6))} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800" 
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button 
            onClick={() => {
              if (containerRef.current) {
                const containerWidth = containerRef.current.clientWidth;
                const containerHeight = containerRef.current.clientHeight;
                setPan({
                  x: (containerWidth - project.width) / 2,
                  y: (containerHeight - project.height) / 2,
                });
                setZoom(1);
              }
            }} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 border-l border-slate-800 ml-1" 
            title="Recenter view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Infinite viewport scrolling pane */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={(e) => {
          // If middle mouse or space bar click pan
          if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            e.preventDefault();
          }
        }}
        onMouseMove={(e) => {
          if (isPanning) {
            setPan({
              x: e.clientX - panStart.x,
              y: e.clientY - panStart.y,
            });
          }
        }}
        onMouseUp={() => setIsPanning(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Render Canvas block positioned strictly inside the pan/zoom space wrapper */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="absolute shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-indigo-500/10"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="block"
            id="animation_canvas"
          />
        </div>
      </div>

      {/* HUD Kontrol Bone Mengambang */}
      {selectedBone && (
        <div className="absolute bottom-14 left-4 z-20 bg-slate-950/95 backdrop-blur-md rounded-xl border border-slate-800 hover:border-slate-700 shadow-2xl p-4 w-72 flex flex-col gap-3.5 pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full border border-white/20 shadow-inner" 
                style={{ backgroundColor: selectedBone.color || "#4f46e5" }} 
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-100 truncate max-w-[140px]">
                  {selectedBone.name}
                </span>
                <span className="text-[9px] text-indigo-400 font-mono tracking-wider font-semibold uppercase">
                  Kontrol Bone Aktif
                </span>
              </div>
            </div>
            <button
              onClick={() => setSelectedBoneId(null)}
              className="text-[10px] text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-0.5 rounded transition-all cursor-pointer font-bold"
            >
              Tutup
            </button>
          </div>

          {/* Posisi (Ke Atas, Bawah, Samping) */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
              <span>Atur Posisi (Joint)</span>
              <span className="text-indigo-400 font-mono lowercase font-bold">Langkah: {stepSize}px</span>
            </div>

            {/* Step Selection Button Panel */}
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-850">
              {[1, 5, 10, 20].map((step) => (
                <button
                  key={step}
                  onClick={() => setStepSize(step)}
                  className={`text-[10px] py-1 rounded transition-all font-mono font-bold cursor-pointer ${
                    stepSize === step
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {step}px
                </button>
              ))}
            </div>

            {/* D-Pad Controller */}
            <div className="flex items-center justify-center p-3 bg-slate-900/60 rounded-xl border border-slate-900">
              <div className="grid grid-cols-3 gap-1.5 w-36 justify-center items-center">
                {/* UP */}
                <div />
                <button
                  onClick={() => handleMoveBoneDir(0, -stepSize)}
                  className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-indigo-700 border border-slate-700 text-slate-200 hover:text-white active:scale-95 transition-all shadow-md group cursor-pointer"
                  title="Geser ke Atas"
                >
                  <ChevronUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
                <div />

                {/* LEFT / POS / RIGHT */}
                <button
                  onClick={() => handleMoveBoneDir(-stepSize, 0)}
                  className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-indigo-700 border border-slate-700 text-slate-200 hover:text-white active:scale-95 transition-all shadow-md group cursor-pointer"
                  title="Geser ke Samping Kiri"
                >
                  <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                </button>
                <div className="flex flex-col items-center justify-center rounded bg-slate-950 py-1 select-none">
                  <span className="text-[9px] text-slate-500 font-mono leading-none font-bold">X:{selectedBone.x}</span>
                  <span className="text-[9px] text-slate-500 font-mono leading-none font-bold mt-1">Y:{selectedBone.y}</span>
                </div>
                <button
                  onClick={() => handleMoveBoneDir(stepSize, 0)}
                  className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-indigo-700 border border-slate-700 text-slate-200 hover:text-white active:scale-95 transition-all shadow-md group cursor-pointer"
                  title="Geser ke Samping Kanan"
                >
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* DOWN */}
                <div />
                <button
                  onClick={() => handleMoveBoneDir(0, stepSize)}
                  className="flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-indigo-700 border border-slate-700 text-slate-200 hover:text-white active:scale-95 transition-all shadow-md group cursor-pointer"
                  title="Geser ke Bawah"
                >
                  <ChevronDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                </button>
                <div />
              </div>
            </div>
          </div>

          {/* Ukuran Bone (Membesarkan Bone) */}
          <div className="flex flex-col gap-2 border-t border-slate-900 pt-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
              Membesarkan / Panjang Bone
            </span>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResizeBoneLength(-5)}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 font-bold transition-all cursor-pointer text-xs"
                title="Perkecil Bone (-5)"
              >
                -5
              </button>
              
              <div className="flex-1 flex flex-col gap-1 items-center bg-slate-900/40 p-1.5 rounded-lg border border-slate-900">
                <input
                  type="range"
                  min={15}
                  max={300}
                  value={selectedBone.length}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 30;
                    const nextBones = project.bones.map((b) =>
                      b.id === selectedBone.id ? { ...b, length: val } : b
                    );
                    onUpdateBones(nextBones);
                  }}
                  className="w-full accent-indigo-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                />
                <span className="text-[10px] font-mono text-slate-400 font-bold leading-none mt-1">
                  {selectedBone.length} px
                </span>
              </div>

              <button
                onClick={() => handleResizeBoneLength(5)}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 hover:border-indigo-750 text-indigo-300 hover:text-white active:scale-95 font-bold transition-all cursor-pointer text-xs"
                title="Membesarkan Bone (+5)"
              >
                +5
              </button>
            </div>
          </div>

          {/* Opsi Tempel Gambar ke Bone Ini */}
          <div className="flex flex-col gap-2 border-t border-slate-900 pt-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
              Tempel / Ikat Gambar ke Bone ini
            </span>

            {project.images.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic bg-slate-900/40 p-2.5 rounded text-center leading-relaxed">
                Belum ada gambar yang diimport.<br />Silakan upload gambar terlebih dahulu.
              </p>
            ) : (
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1 bg-slate-900/30 rounded-lg p-1.5 border border-slate-900/80">
                {project.images.map((img) => {
                  const isAttachedToMe = img.attachedBoneId === selectedBone.id;
                  return (
                    <div
                      key={img.id}
                      className={`flex items-center justify-between p-1 rounded-lg border text-[10px] transition-colors ${
                        isAttachedToMe
                          ? "bg-indigo-950/75 border-indigo-800/80 text-indigo-200 animate-pulse"
                          : "bg-slate-900 border-slate-800/60 hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <img
                          src={img.url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 object-contain bg-slate-800 rounded border border-slate-700 flex-shrink-0"
                        />
                        <span className="truncate font-semibold max-w-[120px]">{img.name}</span>
                      </div>

                      {isAttachedToMe ? (
                        <button
                          onClick={() => handleDetachImageFromBone(img.id)}
                          className="px-1.5 py-0.5 rounded bg-red-950 hover:bg-red-900 text-red-350 hover:text-white border border-red-800/50 text-[9px] font-mono font-bold cursor-pointer transition-colors active:scale-95"
                          title="Lepas gambar dari bone ini"
                        >
                          Lepas ✂️
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAttachImageToBone(img.id, selectedBone.id)}
                          className="px-1.5 py-0.5 rounded bg-slate-850 hover:bg-indigo-600 hover:text-white text-slate-300 border border-slate-800 hover:border-indigo-500 text-[9px] font-mono font-semibold cursor-pointer transition-colors active:scale-95"
                          title="Tempel gambar ke bone ini"
                        >
                          Ikat 🔗
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Diagnostic Bar */}
      <div className="bg-slate-950 px-4 py-2 border-t border-slate-850 flex justify-between items-center text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Resolution: <b>{project.width}x{project.height}</b></span>
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Bones Count: <b>{project.bones.length}</b></span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">Images: <b>{project.images.length}</b></span>
        </div>
        <div>
          <span>FPS: <b>{project.fps}</b></span>
        </div>
      </div>
    </div>
  );
};
