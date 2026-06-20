import React, { useState, useEffect, useRef } from "react";
import { Project, Bone, ImageAsset, FrameKeyframe, BonePose, ImagePose } from "../types";
import { BoneCanvas } from "./BoneCanvas";
import { Timeline } from "./Timeline";
import { saveProjectToDB } from "../storage";
import { calculateWorldBones, getInterpolatedImagePose } from "../boneUtils";
import { 
  ArrowLeft, Upload, FileImage, Image as ImageIcon, Settings, 
  Trash2, User, Sparkles, FolderOpen, Video, Info, RefreshCw, Layers, CheckCircle2,
  Undo, Redo, Plus
} from "lucide-react";

interface ProjectWorkspaceProps {
  project: Project;
  onExit: () => void;
  onSave: (updatedProject: Project) => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  onExit,
  onSave,
}) => {
  // Local project state clone for high frequency edits
  const [localProject, setLocalProject] = useState<Project>(project);
  useEffect(() => {
    setLocalProject(project);
    // Refresh history when dynamic project shifts
    setHistory([project]);
    setHistoryIndex(0);
  }, [project.id]);

  // UNDO & REDO HISTORY MANAGER
  const [history, setHistory] = useState<Project[]>([project]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushToHistory = (nextState: Project) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    setHistory([...updatedHistory, nextState]);
    setHistoryIndex(updatedHistory.length);
  };

  const commitAction = (nextProject: Project) => {
    handleProjectUpdate(nextProject);
    pushToHistory(nextProject);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const targetState = history[prevIndex];
      setHistoryIndex(prevIndex);
      setLocalProject(targetState);
      onSave(targetState);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const targetState = history[nextIndex];
      setHistoryIndex(nextIndex);
      setLocalProject(targetState);
      onSave(targetState);
    }
  };

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleUndoRedoKeys = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleUndoRedoKeys);
    return () => window.removeEventListener("keydown", handleUndoRedoKeys);
  }, [historyIndex, history]);

  // Timeline States
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalFrames, setTotalFrames] = useState(project.fps * 2 || 48); // default 2 seconds
  const [autoKeyframe, setAutoKeyframe] = useState(true);

  // Active Tool selection and Selected element IDs
  const [activeTool, setActiveTool] = useState<"select" | "add_bone">("select");
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Exporters / Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState("");
  const onCaptureFrameRef = useRef<((ctx: CanvasRenderingContext2D) => void) | null>(null);

  // Side panels toggle
  const [activeTab, setActiveTab] = useState<"bones" | "images" | "blueprints">("images");

  // Save project helper to sync back to localIndexedDB
  const handleProjectUpdate = (updated: Project) => {
    setLocalProject(updated);
    onSave(updated);
  };

  // Bone update callbacks
  const handleUpdateBones = (nextBones: Bone[]) => {
    setLocalProject((prevProject) => {
      const updated = {
        ...prevProject,
        bones: nextBones,
        updatedAt: Date.now(),
      };
      onSave(updated);
      return updated;
    });
  };

  // Image assets adjustments callback
  const handleUpdateImages = (nextImages: ImageAsset[]) => {
    setLocalProject((prevProject) => {
      const updated = {
        ...prevProject,
        images: nextImages,
        updatedAt: Date.now(),
      };
      onSave(updated);
      return updated;
    });
  };

  // Helper to commit state snapshot on slider release
  const handleSliderChangeComplete = () => {
    pushToHistory(localProject);
  };

  // Custom Skeletal Hierarchy Control Helpers
  const handleAddRootBone = () => {
    const rootBones = localProject.bones.filter(b => b.parentId === null);
    const numbers = rootBones.map(b => {
      const match = b.name.match(/^Bone\s+(\d+)$/i);
      return match ? parseInt(match[1], 10) : 0;
    });
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const nextId = "bone_" + Math.random().toString(36).substring(2, 7);
    
    const colors = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
    const randomColor = colors[nextNumber % colors.length];

    const newBone: Bone = {
      id: nextId,
      name: `Bone ${nextNumber}`,
      parentId: null,
      x: Math.round(localProject.width / 2) + (rootBones.length * 20 - 45),
      y: Math.max(150, Math.round(localProject.height * 0.7)),
      rotation: 270,
      length: 80,
      color: randomColor,
    };

    const nextBones = [...localProject.bones, newBone];
    const updated = {
      ...localProject,
      bones: nextBones,
      updatedAt: Date.now(),
    };
    commitAction(updated);
    setSelectedBoneId(nextId);
  };

  const handleAddChildBone = (parentBoneId: string) => {
    const parent = localProject.bones.find(b => b.id === parentBoneId);
    if (!parent) return;

    const siblingBones = localProject.bones.filter(b => b.parentId === parentBoneId);
    const childNumbers = siblingBones.map(b => {
      const match = b.name.match(/^anak\s+bone\s+(\d+)/i) || b.name.match(/^child\s+bone\s+(\d+)/i);
      return match ? parseInt(match[1], 10) : 0;
    });
    const nextChildNumber = childNumbers.length > 0 ? Math.max(...childNumbers) + 1 : 1;
    const nextId = "bone_" + Math.random().toString(36).substring(2, 7);

    const colors = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
    const randomColor = colors[(siblingBones.length + 2) % colors.length];

    const newBone: Bone = {
      id: nextId,
      name: `Anak bone ${nextChildNumber}`,
      parentId: parentBoneId,
      x: parent.length || 70,
      y: 0,
      rotation: 30,
      length: 60,
      color: randomColor,
    };

    const nextBones = [...localProject.bones, newBone];
    const updated = {
      ...localProject,
      bones: nextBones,
      updatedAt: Date.now(),
    };
    commitAction(updated);
    setSelectedBoneId(nextId);
  };

  const handleDeleteBone = (boneId: string) => {
    const remainingBones = localProject.bones.filter(
      (b) => b.id !== boneId && b.parentId !== boneId
    );
    const updatedImages = localProject.images.map((img) =>
      img.attachedBoneId === boneId || (img.attachedBoneId && localProject.bones.find(x => x.id === img.attachedBoneId)?.parentId === boneId)
        ? { ...img, attachedBoneId: null }
        : img
    );
    const updatedKeyframes = localProject.keyframes.map((k) => {
      const remainingPoses = { ...k.bonePoses };
      delete remainingPoses[boneId];
      localProject.bones.forEach((b) => {
        if (b.parentId === boneId) {
          delete remainingPoses[b.id];
        }
      });
      return { ...k, bonePoses: remainingPoses };
    });

    const updated = {
      ...localProject,
      bones: remainingBones,
      images: updatedImages,
      keyframes: updatedKeyframes,
      updatedAt: Date.now(),
    };
    commitAction(updated);
    
    if (selectedBoneId === boneId) {
      setSelectedBoneId(null);
    }
  };

  // AUTO KEYFRAMER ENGINE: Automatically saves bone state changes during posing
  const handleAutoKeyframe = (boneId: string, deltaPose: { x: number; y: number; rotation: number }) => {
    if (!autoKeyframe) return;

    setLocalProject((prevProject) => {
      const nextKeyframes = [...prevProject.keyframes];
      let keyIndex = nextKeyframes.findIndex((k) => k.frame === currentFrame);

      if (keyIndex === -1) {
        // Create new keyframe block
        const newKeyframe: FrameKeyframe = {
          frame: currentFrame,
          bonePoses: {
            [boneId]: {
              boneId,
              x: deltaPose.x,
              y: deltaPose.y,
              rotation: deltaPose.rotation,
            },
          },
        };
        nextKeyframes.push(newKeyframe);
      } else {
        // Edit in-place
        nextKeyframes[keyIndex] = {
          ...nextKeyframes[keyIndex],
          bonePoses: {
            ...nextKeyframes[keyIndex].bonePoses,
            [boneId]: {
              boneId,
              x: deltaPose.x,
              y: deltaPose.y,
              rotation: deltaPose.rotation,
            },
          },
        };
      }

      const updated = {
        ...prevProject,
        keyframes: nextKeyframes,
        updatedAt: Date.now(),
      };
      onSave(updated);
      return updated;
    });
  };

  const handleAutoKeyframeImage = (
    imageId: string,
    deltaPose: { offsetX: number; offsetY: number; offsetRotation: number }
  ) => {
    if (!autoKeyframe) return;

    setLocalProject((prevProject) => {
      const nextKeyframes = [...prevProject.keyframes];
      let keyIndex = nextKeyframes.findIndex((k) => k.frame === currentFrame);

      if (keyIndex === -1) {
        const newKeyframe: FrameKeyframe = {
          frame: currentFrame,
          bonePoses: {},
          imagePoses: {
            [imageId]: {
              imageId,
              offsetX: deltaPose.offsetX,
              offsetY: deltaPose.offsetY,
              offsetRotation: deltaPose.offsetRotation,
            },
          },
        };
        nextKeyframes.push(newKeyframe);
      } else {
        nextKeyframes[keyIndex] = {
          ...nextKeyframes[keyIndex],
          imagePoses: {
            ...(nextKeyframes[keyIndex].imagePoses || {}),
            [imageId]: {
              imageId,
              offsetX: deltaPose.offsetX,
              offsetY: deltaPose.offsetY,
              offsetRotation: deltaPose.offsetRotation,
            },
          },
        };
      }

      const updated = {
        ...prevProject,
        keyframes: nextKeyframes,
        updatedAt: Date.now(),
      };
      onSave(updated);
      return updated;
    });
  };

  // Manual keyframe creation
  const handleAddKeyframe = (frame: number) => {
    // Generate whole snapshot of ALL active bone states at this current frame!
    const keyframePosesRecord: Record<string, BonePose> = {};
    const worldRec = calculateWorldBones(localProject.bones, frame, localProject.keyframes);

    localProject.bones.forEach((bone) => {
      const activeState = worldRec[bone.id];
      if (activeState) {
        keyframePosesRecord[bone.id] = {
          boneId: bone.id,
          x: activeState.x,
          y: activeState.y,
          rotation: activeState.rotation,
        };
      }
    });

    // Capture snapshot of ALL active image poses at this current frame!
    const imagePosesRecord: Record<string, ImagePose> = {};
    localProject.images.forEach((img) => {
      const currentPose = getInterpolatedImagePose(img.id, frame, localProject.keyframes, {
        offsetX: img.offsetX,
        offsetY: img.offsetY,
        offsetRotation: img.offsetRotation,
      });
      imagePosesRecord[img.id] = {
        imageId: img.id,
        offsetX: currentPose.offsetX,
        offsetY: currentPose.offsetY,
        offsetRotation: currentPose.offsetRotation,
      };
    });

    const nextKeyframes = [...localProject.keyframes];
    const keyIndex = nextKeyframes.findIndex((k) => k.frame === frame);

    if (keyIndex === -1) {
      nextKeyframes.push({ frame, bonePoses: keyframePosesRecord, imagePoses: imagePosesRecord });
    } else {
      nextKeyframes[keyIndex] = {
        ...nextKeyframes[keyIndex],
        frame,
        bonePoses: keyframePosesRecord,
        imagePoses: imagePosesRecord,
      };
    }

    const updated = {
      ...localProject,
      keyframes: nextKeyframes,
      updatedAt: Date.now(),
    };
    commitAction(updated);
  };

  const handleRemoveKeyframe = (frame: number) => {
    // Filter
    const nextKeyframes = localProject.keyframes.filter((k) => k.frame !== frame);
    const updated = {
      ...localProject,
      keyframes: nextKeyframes,
      updatedAt: Date.now(),
    };
    commitAction(updated);
  };

  const handleClearKeyframes = () => {
    if (window.confirm("Do you want to purge all keyframe coordinate milestones inside this canvas?")) {
      const updated = {
        ...localProject,
        keyframes: [],
        updatedAt: Date.now(),
      };
      commitAction(updated);
    }
  };

  // Bulk Image File Uploader to character attachments list
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files as FileList).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        
        // Find dimensions before inserting
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          const newAsset: ImageAsset = {
            id: "img_" + Math.random().toString(36).substring(2, 7),
            name: file.name.split(".")[0],
            url: dataUrl,
            width: img.width > 200 ? Math.round(img.width * 0.5) : img.width, // auto scaled down if too huge
            height: img.height > 200 ? Math.round(img.height * 0.5) : img.height,
            attachedBoneId: selectedBoneId, // directly rig to selected bone!
            offsetX: 0,
            offsetY: 0,
            offsetRotation: 0,
            offsetScaleX: 1,
            offsetScaleY: 1,
            zIndex: localProject.images.length + 1,
          };
          
          handleUpdateImages([...localProject.images, newAsset]);
        };
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // Generic sample assets generator so users have materials immediately
  const handleGenerateSampleAsset = (type: "heart" | "character_body" | "hand") => {
    let canvasSvg = "";
    let name = "";
    let width = 100;
    let height = 100;

    if (type === "heart") {
      canvasSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444" stroke="%23b91c1c" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      name = "Cute Heart";
      width = 80;
      height = 80;
    } else if (type === "character_body") {
      canvasSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23a855f7" stroke="%236b21a8" stroke-width="3"><rect x="25" y="20" width="50" height="60" rx="10"/></svg>';
      name = "Bean Torso";
      width = 120;
      height = 130;
    } else {
      canvasSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%233b82f6" stroke="%231d4ed8" stroke-width="4"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="10" fill="white"/></svg>';
      name = "Joint Eye";
      width = 60;
      height = 60;
    }

    const dataUrl = `data:image/svg+xml;utf8,${canvasSvg}`;
    const newAsset: ImageAsset = {
      id: "img_" + Math.random().toString(36).substring(2, 7),
      name,
      url: dataUrl,
      width,
      height,
      attachedBoneId: selectedBoneId,
      offsetX: 0,
      offsetY: 0,
      offsetRotation: 0,
      offsetScaleX: 1,
      offsetScaleY: 1,
      zIndex: localProject.images.length + 1,
    };

    handleUpdateImages([...localProject.images, newAsset]);
  };

  // SKELETAL PRESET TEMPLATES BLUEPRINT LOADER
  const handleLoadPresetBlueprint = (preset: "stick_biped" | "butterfly") => {
    if (
      localProject.bones.length > 0 &&
      !window.confirm("Loading a skeletal rigging plan resets current skeleton of this canvas. Continue?")
    ) {
      return;
    }

    if (preset === "stick_biped") {
      // Create joints for a biped figure starting around canvas center
      const centerX = Math.round(localProject.width / 2);
      const centerY = Math.round(localProject.height / 2);

      const presetBones: Bone[] = [
        { id: "root", name: "Hips Root", parentId: null, x: centerX, y: centerY + 50, rotation: 270, length: 10, color: "#3b82f6" },
        { id: "spine", name: "Spine segment", parentId: "root", x: 10, y: 0, rotation: 0, length: 60, color: "#22c55e" },
        { id: "neck", name: "Neck Joint", parentId: "spine", x: 60, y: 0, rotation: 0, length: 20, color: "#eab308" },
        { id: "head", name: "Head", parentId: "neck", x: 20, y: 0, rotation: 0, length: 30, color: "#f43f5e" },
        // Left arm
        { id: "l_shoulder", name: "L Upper Arm", parentId: "spine", x: 60, y: 0, rotation: 60, length: 45, color: "#a855f7" },
        { id: "l_elbow", name: "L Forearm", parentId: "l_shoulder", x: 45, y: 0, rotation: 40, length: 40, color: "#ec4899" },
        // Right arm
        { id: "r_shoulder", name: "R Upper Arm", parentId: "spine", x: 60, y: 0, rotation: -60, length: 45, color: "#a855f7" },
        { id: "r_elbow", name: "R Forearm", parentId: "r_shoulder", x: 45, y: 0, rotation: -40, length: 40, color: "#ec4899" },
        // Left leg
        { id: "l_hip", name: "L Thigh", parentId: "root", x: 0, y: 0, rotation: 110, length: 50, color: "#06b6d4" },
        { id: "l_knee", name: "L Shin", parentId: "l_hip", x: 50, y: 0, rotation: -20, length: 45, color: "#14b8a6" },
        // Right leg
        { id: "r_hip", name: "R Thigh", parentId: "root", x: 0, y: 0, rotation: 70, length: 50, color: "#06b6d4" },
        { id: "r_knee", name: "R Shin", parentId: "r_hip", x: 50, y: 0, rotation: 20, length: 45, color: "#14b8a6" },
      ];

      // Add a couple placeholder stick circles for testing immediately
      const headSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23f43f5e" stroke="%23be123c" stroke-width="4"><circle cx="50" cy="50" r="40"/></svg>';
      const headAsset: ImageAsset = {
        id: "stick_head_img",
        name: "Joint Head",
        url: `data:image/svg+xml;utf8,${headSvg}`,
        width: 45,
        height: 45,
        attachedBoneId: "head",
        offsetX: 15,
        offsetY: 0,
        offsetRotation: 0,
        offsetScaleX: 1,
        offsetScaleY: 1,
        zIndex: 10,
      };

      const bodySvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120" fill="%23475569" stroke="%231e293b" stroke-width="4"><rect x="10" y="10" width="60" height="100" rx="15"/></svg>';
      const chestAsset: ImageAsset = {
        id: "stick_body_img",
        name: "Armor Torso",
        url: `data:image/svg+xml;utf8,${bodySvg}`,
        width: 48,
        height: 65,
        attachedBoneId: "spine",
        offsetX: 30,
        offsetY: 0,
        offsetRotation: -90, // align horizontally on spine orientation
        offsetScaleX: 1,
        offsetScaleY: 1,
        zIndex: 5,
      };

      const updated = {
        ...localProject,
        bones: presetBones,
        images: [headAsset, chestAsset],
        keyframes: [], // clear keyframes to match fresh setup
        updatedAt: Date.now(),
      };
      
      setSelectedBoneId("root");
      setSelectedImageId(null);
      handleProjectUpdate(updated);

    } else if (preset === "butterfly") {
      const centerX = Math.round(localProject.width / 2);
      const centerY = Math.round(localProject.height / 2);

      const presetBones: Bone[] = [
        { id: "body", name: "Core Body", parentId: null, x: centerX, y: centerY, rotation: 270, length: 70, color: "#3b82f6" },
        { id: "wing_l", name: "Left Wing parent", parentId: "body", x: 35, y: 0, rotation: 180, length: 60, color: "#ec4899" },
        { id: "wing_r", name: "Right Wing parent", parentId: "body", x: 35, y: 0, rotation: 0, length: 60, color: "#a855f7" },
      ];

      // Wing templates
      const wingLSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23f472b6" stroke="%23ec4899" stroke-width="4"><path d="M90 50 C90 10, 10 10, 10 50 C10 90, 80 90, 90 50 Z"/></svg>';
      const wingRSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="%23c084fc" stroke="%23a855f7" stroke-width="4"><path d="M10 50 C10 10, 90 10, 90 50 C90 90, 20 90, 10 50 Z"/></svg>';

      const wingLAsset: ImageAsset = {
        id: "wing_l_img",
        name: "Wing Left (Rigged)",
        url: `data:image/svg+xml;utf8,${wingLSvg}`,
        width: 110,
        height: 75,
        attachedBoneId: "wing_l",
        offsetX: 30,
        offsetY: 0,
        offsetRotation: 0,
        offsetScaleX: 1,
        offsetScaleY: 1,
        zIndex: 4,
      };

      const wingRAsset: ImageAsset = {
        id: "wing_r_img",
        name: "Wing Right (Rigged)",
        url: `data:image/svg+xml;utf8,${wingRSvg}`,
        width: 110,
        height: 75,
        attachedBoneId: "wing_r",
        offsetX: 30,
        offsetY: 0,
        offsetRotation: 0,
        offsetScaleX: 1,
        offsetScaleY: 1,
        zIndex: 4,
      };

      const updated = {
        ...localProject,
        bones: presetBones,
        images: [wingLAsset, wingRAsset],
        keyframes: [
          // Create a dynamic beating sample loop automatically over 24 frames
          {
            frame: 0,
            bonePoses: {
              "wing_l": { boneId: "wing_l", x: 35, y: 0, rotation: 180 },
              "wing_r": { boneId: "wing_r", x: 35, y: 0, rotation: 0 },
            }
          },
          {
            frame: 10,
            bonePoses: {
              "wing_l": { boneId: "wing_l", x: 35, y: 0, rotation: 125 }, // wing sweep forward
              "wing_r": { boneId: "wing_r", x: 35, y: 0, rotation: 55 },
            }
          },
          {
            frame: 20,
            bonePoses: {
              "wing_l": { boneId: "wing_l", x: 35, y: 0, rotation: 180 }, // wings sweep open
              "wing_r": { boneId: "wing_r", x: 35, y: 0, rotation: 0 },
            }
          }
        ],
        updatedAt: Date.now(),
      };

      setSelectedBoneId("body");
      setSelectedImageId(null);
      handleProjectUpdate(updated);
    }
  };

  // BULK CANVAS MP4 RECORDING ENGINE
  const handleExportMP4 = async () => {
    const canvas = document.getElementById("animation_canvas") as HTMLCanvasElement;
    if (!canvas) {
      alert("Error: Canvas layer could not be loaded into recorder memory.");
      return;
    }

    try {
      setIsPlaying(false);
      setIsRecording(true);
      setRecordingProgress(0);
      setRecordingStatus("Preparing local compilation frames stream...");

      const recordedChunks: Blob[] = [];
      const streams = canvas.captureStream(localProject.fps);

      // Check supported recording containers
      let supportedType = "video/webm";
      if (MediaRecorder.isTypeSupported("video/mp4;codecs=h264")) {
        supportedType = "video/mp4;codecs=h264";
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        supportedType = "video/mp4";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        supportedType = "video/webm;codecs=vp9";
      }

      console.log("Selected target MediaRecorder type:", supportedType);
      const mediaRecorder = new MediaRecorder(streams, {
        mimeType: supportedType,
        videoBitsPerSecond: 5000000, // 5 Mbps Quality
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        setRecordingStatus("Injecting and assembling MP4 stream...");
        // Define Blob with video content boundaries
        // Although the container recorded can be webm, saving with an mp4 extension facilitates compatibility with general video players, but using supported type guarantees playable clips.
        const outputBlob = new Blob(recordedChunks, { type: supportedType });
        const videoURL = URL.createObjectURL(outputBlob);
        
        // Dynamic anchor trigger download block
        const fileExtension = supportedType.includes("mp4") ? "mp4" : "webm";
        const downloadElement = document.createElement("a");
        downloadElement.href = videoURL;
        downloadElement.download = `${localProject.name.replace(/\s+/g, "_")}_animation.${fileExtension}`;
        document.body.appendChild(downloadElement);
        downloadElement.click();
        downloadElement.remove();

        setIsRecording(false);
        setRecordingProgress(100);
        setCurrentFrame(0);
        alert(`Congratulations! Export complete. Rendered frame rate: ${localProject.fps}fps.`);
      };

      // Play through the frames sequentially one-by-one, capturing exact renders
      mediaRecorder.start();
      setCurrentFrame(0);

      const delayBetweenFramesMs = 1000 / localProject.fps;
      let frameCounter = 0;

      const recordStep = () => {
        if (frameCounter < totalFrames) {
          setCurrentFrame(frameCounter);
          setRecordingProgress(Math.round((frameCounter / totalFrames) * 100));
          setRecordingStatus(`Rendering & flattening frame ${frameCounter} of ${totalFrames}...`);
          
          frameCounter++;
          setTimeout(recordStep, delayBetweenFramesMs);
        } else {
          // Finished rendering
          mediaRecorder.stop();
        }
      };

      // Initiate recursive step
      setTimeout(recordStep, 200);

    } catch (recorderError) {
      console.error(recorderError);
      alert("Local MediaRecorder failed to initiate in this frame constraint. Saving file...");
      setIsRecording(false);
    }
  };

  // Find currently selected image reference in localProject
  const activeImage = localProject.images.find((img) => img.id === selectedImageId);
  const activeBone = localProject.bones.find((b) => b.id === selectedBoneId);

  return (
    <div className="w-full h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      
      {/* 1. Header Toolbar workspace control board */}
      <header className="bg-slate-900 border-b border-slate-800 h-16 px-4 md:px-6 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsPlaying(false);
              onExit();
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Exit to Dashboard</span>
          </button>
          
          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            <span className="p-1 px-2.5 rounded bg-indigo-950 font-serif font-bold italic text-indigo-400 border border-indigo-900 text-xs">
              Dranfrean
            </span>
            <h2 className="font-bold text-sm text-slate-200 truncate max-w-[120px] sm:max-w-xs">{localProject.name}</h2>
          </div>

          {/* Undo/Redo Controls Panel */}
          <div className="flex items-center gap-1 border-l border-slate-800 lg:pl-3 ml-1 h-7">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`p-1.5 rounded-md border text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                historyIndex > 0
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  : "bg-slate-900/60 border-slate-850 text-slate-600 cursor-not-allowed"
              }`}
              title="Undo last action (Ctrl + Z)"
              id="btn_undo_project"
            >
              <Undo className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Undo</span>
            </button>

            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`p-1.5 rounded-md border text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                historyIndex < history.length - 1
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  : "bg-slate-900/60 border-slate-850 text-slate-600 cursor-not-allowed"
              }`}
              title="Redo action (Ctrl + Y)"
              id="btn_redo_project"
            >
              <Redo className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Redo</span>
            </button>
          </div>
        </div>

        {/* Action button decks */}
        <div className="flex items-center gap-2.5">
          {/* Base64 Custom image upload */}
          <label className="bg-slate-800 border-slate-700 border hover:bg-slate-750 text-slate-200 text-xs font-bold px-3.5 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer hover:text-white transition-all">
            <Upload className="w-4 h-4 text-slate-400" />
            <span>Upload Image Part</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              multiple
            />
          </label>

          {/* Quick template helpers generator */}
          <div className="hidden lg:flex items-center gap-1 pr-1 border-r border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase mr-1">No file?</span>
            <button
              onClick={() => handleGenerateSampleAsset("heart")}
              className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] py-1 px-2 rounded-md transition-colors"
            >
              + Dummy Heart
            </button>
            <button
              onClick={() => handleGenerateSampleAsset("character_body")}
              className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] py-1 px-2 rounded-md transition-colors"
            >
              + Dummy Torso
            </button>
          </div>

          <button
            onClick={handleExportMP4}
            className="bg-emerald-600 hover:bg-emerald-500 shadow-lg text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer hover:scale-[1.01] transition-transform"
          >
            <Video className="w-4 h-4 text-emerald-100" />
            <span>Export MP4 Video</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workspace core layout split pane */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Bones, Attachments Images layers lists */}
        <section className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
          
          {/* Rigging menu tabs */}
          <div className="flex bg-slate-950 p-1 border-b border-slate-800">
            <button
              onClick={() => setActiveTab("images")}
              className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-colors ${activeTab === "images" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-slate-200"}`}
            >
              Attachments ({localProject.images.length})
            </button>
            <button
              onClick={() => setActiveTab("bones")}
              className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-colors ${activeTab === "bones" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-slate-200"}`}
            >
              Skeleton Bones ({localProject.bones.length})
            </button>
            <button
              onClick={() => setActiveTab("blueprints")}
              className={`flex-1 py-2 text-center text-xs font-bold rounded-md transition-colors ${activeTab === "blueprints" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-slate-200"}`}
            >
              Mannequins presets
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            
            {/* TAB A: ATTACHMENTS AND SKIN RIGGING SLIDERS */}
            {activeTab === "images" && (
              <div className="flex flex-col gap-4">
                
                {/* Fine tuning parameters panel */}
                {activeImage ? (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-500 animate-pulse" />
                        <span className="font-bold text-xs text-amber-500 truncate max-w-[150px]">
                          Rigging: {activeImage.name}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const filterImages = localProject.images.filter((img) => img.id !== selectedImageId);
                          handleUpdateImages(filterImages);
                          setSelectedImageId(null);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete Image Part"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Joint assignment select dropdown */}
                    <div className="flex flex-col gap-1.5 bg-slate-900/45 p-2 rounded-lg border border-slate-900">
                      <label className="text-[10px] text-slate-400 uppercase font-mono font-semibold">Bound Bone Joint Anchor</label>
                      <select
                        value={activeImage.attachedBoneId || ""}
                        onChange={(e) => {
                          const nextBoneId = e.target.value ? e.target.value : null;

                          // Hitung worldBones secara rekursif berdasarkan frame saat ini
                          const worldBones = calculateWorldBones(localProject.bones, currentFrame, localProject.keyframes);

                          // Mengambil pose interpolasi gambar saat ini
                          const imgPose = getInterpolatedImagePose(activeImage.id, currentFrame, localProject.keyframes, {
                            offsetX: activeImage.offsetX,
                            offsetY: activeImage.offsetY,
                            offsetRotation: activeImage.offsetRotation,
                          });

                          let currentWorldX = 0;
                          let currentWorldY = 0;
                          let currentWorldRot = 0;

                          // 1. Dapatkan posisi global (Stage World coordinates) gambar saat ini
                          if (activeImage.attachedBoneId && worldBones[activeImage.attachedBoneId]) {
                            const prevBone = worldBones[activeImage.attachedBoneId];
                            const prevBoneRad = (prevBone.worldRotation * Math.PI) / 180;
                            currentWorldX = prevBone.worldX + imgPose.offsetX * Math.cos(prevBoneRad) - imgPose.offsetY * Math.sin(prevBoneRad);
                            currentWorldY = prevBone.worldY + imgPose.offsetX * Math.sin(prevBoneRad) + imgPose.offsetY * Math.cos(prevBoneRad);
                            currentWorldRot = prevBone.worldRotation + imgPose.offsetRotation;
                          } else {
                            currentWorldX = localProject.width / 2 + imgPose.offsetX;
                            currentWorldY = localProject.height / 2 + imgPose.offsetY;
                            currentWorldRot = imgPose.offsetRotation;
                          }

                          let newOffsetX = imgPose.offsetX;
                          let newOffsetY = imgPose.offsetY;
                          let newOffsetRotation = imgPose.offsetRotation;

                          // 2. Jika dipindahkan ke bone pengait baru
                          if (nextBoneId && worldBones[nextBoneId]) {
                            const bone = worldBones[nextBoneId];
                            const boneRad = (bone.worldRotation * Math.PI) / 180;
                            const dx = currentWorldX - bone.worldX;
                            const dy = currentWorldY - bone.worldY;

                            // Rotasi balik (inverse rotation)
                            newOffsetX = dx * Math.cos(-boneRad) - dy * Math.sin(-boneRad);
                            newOffsetY = dx * Math.sin(-boneRad) + dy * Math.cos(-boneRad);
                            newOffsetRotation = currentWorldRot - bone.worldRotation;
                          } else {
                            // Jika dilepas dari bone menjadi mengambang
                            newOffsetX = currentWorldX - localProject.width / 2;
                            newOffsetY = currentWorldY - localProject.height / 2;
                            newOffsetRotation = currentWorldRot;
                          }

                          const nextImages = localProject.images.map((assets) =>
                            assets.id === activeImage.id
                              ? {
                                  ...assets,
                                  attachedBoneId: nextBoneId,
                                  offsetX: Math.round(newOffsetX),
                                  offsetY: Math.round(newOffsetY),
                                  offsetRotation: Math.round(newOffsetRotation),
                                }
                              : assets
                          );
                          handleUpdateImages(nextImages);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none"
                      >
                        <option value="">Unattached (Float/Background)</option>
                        {localProject.bones.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.id})
                          </option>
                        ))}
                      </select>

                      {/* Quick attachment button if a bone is selected */}
                      {selectedBoneId && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetBone = localProject.bones.find((b) => b.id === selectedBoneId);
                            if (!targetBone) return;

                            // Triger pemindahan bone menggunakan kalkulasi pintar tanpa lompatan
                            const worldBones = calculateWorldBones(localProject.bones, currentFrame, localProject.keyframes);
                            const imgPose = getInterpolatedImagePose(activeImage.id, currentFrame, localProject.keyframes, {
                              offsetX: activeImage.offsetX,
                              offsetY: activeImage.offsetY,
                              offsetRotation: activeImage.offsetRotation,
                            });

                            let currentWorldX = 0;
                            let currentWorldY = 0;
                            let currentWorldRot = 0;

                            if (activeImage.attachedBoneId && worldBones[activeImage.attachedBoneId]) {
                              const prevBone = worldBones[activeImage.attachedBoneId];
                              const prevBoneRad = (prevBone.worldRotation * Math.PI) / 180;
                              currentWorldX = prevBone.worldX + imgPose.offsetX * Math.cos(prevBoneRad) - imgPose.offsetY * Math.sin(prevBoneRad);
                              currentWorldY = prevBone.worldY + imgPose.offsetX * Math.sin(prevBoneRad) + imgPose.offsetY * Math.cos(prevBoneRad);
                              currentWorldRot = prevBone.worldRotation + imgPose.offsetRotation;
                            } else {
                              currentWorldX = localProject.width / 2 + imgPose.offsetX;
                              currentWorldY = localProject.height / 2 + imgPose.offsetY;
                              currentWorldRot = imgPose.offsetRotation;
                            }

                            const bone = worldBones[selectedBoneId];
                            if (bone) {
                              const boneRad = (bone.worldRotation * Math.PI) / 180;
                              const dx = currentWorldX - bone.worldX;
                              const dy = currentWorldY - bone.worldY;

                              const newOffsetX = dx * Math.cos(-boneRad) - dy * Math.sin(-boneRad);
                              const newOffsetY = dx * Math.sin(-boneRad) + dy * Math.cos(-boneRad);
                              const newOffsetRotation = currentWorldRot - bone.worldRotation;

                              const nextImages = localProject.images.map((assets) =>
                                assets.id === activeImage.id
                                  ? {
                                      ...assets,
                                      attachedBoneId: selectedBoneId,
                                      offsetX: Math.round(newOffsetX),
                                      offsetY: Math.round(newOffsetY),
                                      offsetRotation: Math.round(newOffsetRotation),
                                    }
                                  : assets
                              );
                              handleUpdateImages(nextImages);
                            }
                          }}
                          className="mt-1 w-full bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-700 hover:border-indigo-500 text-white font-bold rounded px-2.5 py-1.5 text-[10px] transition-colors cursor-pointer text-center"
                        >
                          🔗 Tempel Gambar ke Bone Terpilih ({localProject.bones.find((b) => b.id === selectedBoneId)?.name})
                        </button>
                      )}
                    </div>

                    {/* Image Offsets sliders rigging */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-mono">X OFFSET: {activeImage.offsetX}px</span>
                        <input
                          type="range"
                          min={-300}
                          max={300}
                          value={activeImage.offsetX}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, offsetX: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block font-mono">Y OFFSET: {activeImage.offsetY}px</span>
                        <input
                          type="range"
                          min={-300}
                          max={300}
                          value={activeImage.offsetY}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, offsetY: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block font-mono">SCALE X: {activeImage.offsetScaleX.toFixed(2)}</span>
                        <input
                          type="range"
                          min={0.1}
                          max={3}
                          step={0.05}
                          value={activeImage.offsetScaleX}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, offsetScaleX: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block font-mono">SCALE Y: {activeImage.offsetScaleY.toFixed(2)}</span>
                        <input
                          type="range"
                          min={0.1}
                          max={3}
                          step={0.05}
                          value={activeImage.offsetScaleY}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, offsetScaleY: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 block font-mono">ANGLE ROT: {activeImage.offsetRotation}°</span>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={activeImage.offsetRotation}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, offsetRotation: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 block font-mono">Z-INDEX (LAYERING): {activeImage.zIndex}</span>
                        <input
                          type="range"
                          min={1}
                          max={50}
                          value={activeImage.zIndex}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            const nextImages = localProject.images.map((img) =>
                              img.id === activeImage.id ? { ...img, zIndex: val } : img
                            );
                            handleUpdateImages(nextImages);
                          }}
                          className="w-full accent-amber-500"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-[#fbbf24]/90 bg-amber-500/10 p-2 rounded leading-relaxed border border-amber-500/25 mt-1">
                      💡 Tip: Dragging selected image parts on the stage transforms offsets automatically!
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-dotted border-slate-800 text-center py-6 text-slate-500 text-xs flex flex-col items-center gap-1">
                    <ImageIcon className="w-8 h-8 text-slate-600 mb-1" />
                    <span>No Image Part Selected</span>
                    <span className="text-[10px] text-slate-600 max-w-[180px] leading-relaxed">
                      Please upload pictures of skeleton segments (arms, heads) and click on them to adjust binding offsets!
                    </span>
                  </div>
                )}

                {/* Project Assets Shelf list */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider">Animation skins</span>
                  {localProject.images.length === 0 ? (
                    <span className="text-xs text-slate-600 font-mono italic p-2 bg-slate-950 rounded text-center">Shelf empty; upload file</span>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                      {localProject.images.map((assets) => {
                        const isChosen = assets.id === selectedImageId;
                        return (
                          <div
                            key={assets.id}
                            onClick={() => {
                              setSelectedImageId(assets.id);
                              setSelectedBoneId(null);
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${isChosen ? "bg-amber-600 text-white" : "bg-slate-950 border border-slate-850 hover:bg-slate-800"}`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <img
                                src={assets.url}
                                alt="Th"
                                referrerPolicy="no-referrer"
                                className="w-7 h-7 object-contain bg-slate-800 rounded border border-slate-750"
                              />
                              <span className="text-xs font-semibold truncate max-w-[130px]">{assets.name}</span>
                            </div>

                            <span className="text-[9px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-400 px-1 py-0.5 rounded leading-none">
                              {assets.attachedBoneId ? `Rigged: ${assets.attachedBoneId}` : "Float"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB B: SKELETON BONES AND LINKING ASSIGNMENT */}
            {activeTab === "bones" && (
              <div className="flex flex-col gap-4">
                
                {/* Fine tuning active bone specs */}
                {activeBone ? (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-xs text-indigo-400 uppercase font-mono">
                        ⚙️ Joint: {activeBone.name}
                      </span>
                      <button
                        onClick={() => {
                          const listBones = localProject.bones
                            .filter((b) => b.id !== selectedBoneId)
                            .map((b) => b.parentId === selectedBoneId ? { ...b, parentId: activeBone.parentId } : b);
                          
                          const listImages = localProject.images.map((img) =>
                            img.attachedBoneId === selectedBoneId ? { ...img, attachedBoneId: null } : img
                          );

                          handleUpdateBones(listBones);
                          handleUpdateImages(listImages);
                          setSelectedBoneId(null);
                        }}
                        className="p-1 rounded text-red-400 hover:bg-slate-800 transition-all"
                        title="Delete Bone Segment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Change Bone Name */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">Label</label>
                      <input
                        type="text"
                        value={activeBone.name}
                        onChange={(e) => {
                          const nextBones = localProject.bones.map((b) =>
                            b.id === activeBone.id ? { ...b, name: e.target.value } : b
                          );
                          handleUpdateBones(nextBones);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-semibold focus:outline-none"
                      />
                    </div>

                    {/* Change Bone Parent */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">Parent Bone</label>
                      <select
                        value={activeBone.parentId || ""}
                        onChange={(e) => {
                          const val = e.target.value ? e.target.value : null;
                          const nextBones = localProject.bones.map((b) =>
                            b.id === activeBone.id ? { ...b, parentId: val } : b
                          );
                          handleUpdateBones(nextBones);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-semibold focus:outline-none"
                      >
                        <option value="">No Parent (Root Joint)</option>
                        {localProject.bones
                          .filter((b) => b.id !== activeBone.id) // cannot be its own parent
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.id})
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Length, Color, Translation parameters */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Length: {activeBone.length}px</span>
                        <input
                          type="range"
                          min={15}
                          max={300}
                          value={activeBone.length}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 30;
                            const nextBones = localProject.bones.map((b) =>
                              b.id === activeBone.id ? { ...b, length: val } : b
                            );
                            handleUpdateBones(nextBones);
                          }}
                          className="w-full accent-indigo-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Joint Color</span>
                        <div className="flex gap-1 items-center mt-1">
                          <input
                            type="color"
                            value={activeBone.color}
                            onChange={(e) => {
                              const nextBones = localProject.bones.map((b) =>
                                b.id === activeBone.id ? { ...b, color: e.target.value } : b
                              );
                              handleUpdateBones(nextBones);
                            }}
                            className="bg-transparent border-0 h-6 w-8 cursor-pointer p-0"
                          />
                          <span className="text-[10px] font-mono text-slate-400 uppercase leading-none">{activeBone.color}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Local position X ({activeBone.x})</span>
                        <input
                          type="number"
                          value={activeBone.x}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextBones = localProject.bones.map((b) =>
                              b.id === activeBone.id ? { ...b, x: val } : b
                            );
                            handleUpdateBones(nextBones);
                            handleAutoKeyframe(activeBone.id, { x: val, y: activeBone.y, rotation: activeBone.rotation });
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs text-slate-200"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Local position Y ({activeBone.y})</span>
                        <input
                          type="number"
                          value={activeBone.y}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextBones = localProject.bones.map((b) =>
                              b.id === activeBone.id ? { ...b, y: val } : b
                            );
                            handleUpdateBones(nextBones);
                            handleAutoKeyframe(activeBone.id, { x: activeBone.x, y: val, rotation: activeBone.rotation });
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-xs text-slate-200"
                        />
                      </div>

                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 font-mono block">Pose Rotation: {activeBone.rotation}°</span>
                        <input
                          type="range"
                          min={0}
                          max={359}
                          value={activeBone.rotation}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const nextBones = localProject.bones.map((b) =>
                              b.id === activeBone.id ? { ...b, rotation: val } : b
                            );
                            handleUpdateBones(nextBones);
                            handleAutoKeyframe(activeBone.id, { x: activeBone.x, y: activeBone.y, rotation: val });
                          }}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-dotted border-slate-800 text-center py-6 text-slate-500 text-xs flex flex-col items-center gap-1 select-none">
                    <User className="w-8 h-8 text-slate-600 mb-1" />
                    <span>No Bone Selected</span>
                    <span className="text-[10px] text-slate-600 max-w-[180px] leading-relaxed">
                      Select custom bones on the canvas or construct new joints to view linking structures and parenting hierarchies!
                    </span>
                  </div>
                )}

                {/* List skeleton bones */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider">Hierarchy map</span>
                  {localProject.bones.length === 0 ? (
                    <div className="flex flex-col gap-2 p-4 text-center rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-xs text-slate-500 font-mono italic">No bones created yet.</span>
                      <button
                        onClick={handleAddRootBone}
                        className="mx-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add New Bone</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1 select-none">
                        {localProject.bones.filter(b => b.parentId === null).map((parentBone) => {
                          const children = localProject.bones.filter(b => b.parentId === parentBone.id);
                          const isParentSelected = parentBone.id === selectedBoneId;

                          return (
                            <div key={parentBone.id} className="flex flex-col gap-1.5 bg-slate-950/60 p-2 rounded-lg border border-slate-850">
                              {/* Parent/Root Bone Row */}
                              <div
                                onClick={() => {
                                  setSelectedBoneId(parentBone.id);
                                  setSelectedImageId(null);
                                }}
                                className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-all ${
                                  isParentSelected
                                    ? "bg-indigo-600 text-white border border-indigo-500"
                                    : "bg-slate-900 border border-slate-800 hover:bg-slate-850"
                                }`}
                              >
                                <span className="text-xs font-semibold flex items-center gap-1.5 truncate">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full inline-block shrink-0 border border-black/15 shadow-sm"
                                    style={{ backgroundColor: parentBone.color }}
                                  />
                                  {parentBone.name}
                                </span>

                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {/* Add Child Bone Button "+" */}
                                  <button
                                    onClick={() => handleAddChildBone(parentBone.id)}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                    title={`Add child to ${parentBone.name}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>

                                  {/* Trash Button */}
                                  <button
                                    onClick={() => handleDeleteBone(parentBone.id)}
                                    className="p-1 rounded bg-slate-800 hover:bg-red-900/65 text-slate-400 hover:text-red-200 transition-colors"
                                    title={`Delete ${parentBone.name}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Children rendering */}
                              {children.length > 0 && (
                                <div className="flex flex-col gap-1 pl-4 border-l-2 border-slate-800 ml-3">
                                  {children.map((childBone) => {
                                    const isChildSelected = childBone.id === selectedBoneId;
                                    return (
                                      <div
                                        key={childBone.id}
                                        onClick={() => {
                                          setSelectedBoneId(childBone.id);
                                          setSelectedImageId(null);
                                        }}
                                        className={`flex items-center justify-between p-1.5 py-1 px-2.5 rounded-md cursor-pointer transition-all ${
                                          isChildSelected
                                            ? "bg-indigo-500 text-white border border-indigo-400"
                                            : "bg-slate-900 hover:bg-slate-800 border border-slate-850"
                                        }`}
                                      >
                                        <span className="text-xs font-medium flex items-center gap-1.5 truncate text-slate-300">
                                          <span
                                            className="h-2 w-2 rounded-full inline-block shrink-0"
                                            style={{ backgroundColor: childBone.color }}
                                          />
                                          {childBone.name}
                                        </span>

                                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                          {/* child bone only has deletion trash can */}
                                          <button
                                            onClick={() => handleDeleteBone(childBone.id)}
                                            className="p-1 rounded bg-slate-800 hover:bg-red-900/65 text-slate-400 hover:text-red-200 transition-colors"
                                            title={`Delete ${childBone.name}`}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Root Bone Button "+" under "Skeleton Bones" list */}
                      <button
                        onClick={handleAddRootBone}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-indigo-900 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-300 hover:text-indigo-200 text-xs font-semibold rounded-lg transition-all"
                      >
                        <Plus className="w-4 h-4 text-indigo-400" />
                        <span>Add new bone/joint</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB C: PRESETS AND QUICK LOADS */}
            {activeTab === "blueprints" && (
              <div className="flex flex-col gap-4">
                <div className="bg-indigo-950/40 p-3 rounded-lg border border-indigo-900/50 text-xs text-indigo-300 leading-relaxed">
                  <Sparkles className="w-4 h-4 text-indigo-400 inline mb-1 mr-1.5" />
                  <span>
                    Get started instantly without drawing! Load mannequin presets showing how bone joints coordinate with images.
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-200">2D Biped Mannequin</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Generates a full skeleton mannequin with a torso, head attachment, spine, elbows, and knee joints.
                    </p>
                    <button
                      onClick={() => handleLoadPresetBlueprint("stick_biped")}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-1.5 rounded transition-transform select-none"
                    >
                      Rig Stick Figure
                    </button>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-200">Beating Butterfly Wings</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Generates a double-wing skeleton structure complete with a looping beat animation frame plan.
                    </p>
                    <button
                      onClick={() => handleLoadPresetBlueprint("butterfly")}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-1.5 rounded transition-transform select-none"
                    >
                      Rig Flying Butterfly
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Center: The actual rendering canvas workspace element */}
        <section className="flex-1 h-full flex flex-col p-4 relative overflow-hidden">
          
          {/* Overlay recorder compiled screen block */}
          {isRecording && (
            <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center p-6 text-center select-none backdrop-blur-xs">
              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-sm w-full flex flex-col items-center gap-4">
                <div className="animate-spin h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
                <div className="w-full flex-col">
                  <h3 className="font-bold text-slate-200">Compiling Anim Sequence</h3>
                  <p className="text-xs text-slate-400 mt-1">{recordingStatus}</p>
                </div>
                
                {/* Progress bar container */}
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${recordingProgress}%` }}
                  />
                </div>
                
                <span className="text-xs font-bold text-slate-400 font-mono bg-slate-950 py-1 px-3 rounded">
                  {recordingProgress}%
                </span>
              </div>
            </div>
          )}

          <BoneCanvas
            project={localProject}
            currentFrame={currentFrame}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            selectedBoneId={selectedBoneId}
            setSelectedBoneId={setSelectedBoneId}
            selectedImageId={selectedImageId}
            setSelectedImageId={setSelectedImageId}
            onUpdateBones={handleUpdateBones}
            onUpdateImages={handleUpdateImages}
            onAutoKeyframe={handleAutoKeyframe}
            onAutoKeyframeImage={handleAutoKeyframeImage}
            isRecording={isRecording}
            onCaptureFrameRef={onCaptureFrameRef}
            onDragEnd={() => pushToHistory(localProject)}
          />
        </section>
      </main>

      {/* 3. Footer Control deck containing Timeline elements */}
      <footer className="p-4 bg-slate-950 border-t border-slate-900 select-none">
        <Timeline
          project={localProject}
          currentFrame={currentFrame}
          setCurrentFrame={setCurrentFrame}
          keyframes={localProject.keyframes}
          onAddKeyframe={handleAddKeyframe}
          onRemoveKeyframe={handleRemoveKeyframe}
          onClearKeyframes={handleClearKeyframes}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          totalFrames={totalFrames}
          setTotalFrames={setTotalFrames}
          autoKeyframe={autoKeyframe}
          setAutoKeyframe={setAutoKeyframe}
          onExportVideo={handleExportMP4}
        />
      </footer>
    </div>
  );
};
