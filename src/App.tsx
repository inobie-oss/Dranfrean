import React, { useEffect, useState } from "react";
import { Project, Bone, ImageAsset } from "./types";
import { getAllProjectsFromDB, saveProjectToDB, deleteProjectFromDB } from "./storage";
import { ProjectList } from "./components/ProjectList";
import { ProjectWorkspace } from "./components/ProjectWorkspace";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load projects from database
  useEffect(() => {
    async function loadData() {
      try {
        const list = await getAllProjectsFromDB();
        
        // Seed an initial "Illustration" project matching the screenshot on first load
        if (list.length === 0) {
          const defaultProj: Project = {
            id: "proj_tutorial",
            name: "Illustration",
            width: 720,
            height: 900,
            backgroundColor: "#fbc587", // Warm Peach (matching the heart screenshot)
            fps: 24,
            bones: [
              { id: "torso", name: "Spine Body", parentId: null, x: 360, y: 550, rotation: 270, length: 120, color: "#3b82f6" },
              { id: "ribs", name: "Chest Bone", parentId: "torso", x: 100, y: 0, rotation: 0, length: 20, color: "#10b981" },
            ],
            images: [
              {
                id: "heart_icon",
                name: "Floating Heart",
                // Base64 or standard SVG Data URI of a beautiful drawing
                url: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23b91c1c" stroke="%237f1d1d" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
                width: 140,
                height: 140,
                attachedBoneId: "torso",
                offsetX: 60,
                offsetY: 0,
                offsetRotation: 90, // vertical facing
                offsetScaleX: 1.1,
                offsetScaleY: 1.1,
                zIndex: 10,
              }
            ],
            keyframes: [
              {
                frame: 0,
                bonePoses: {
                  "torso": { boneId: "torso", x: 360, y: 550, rotation: 270 },
                }
              },
              {
                frame: 12,
                bonePoses: {
                  "torso": { boneId: "torso", x: 360, y: 530, rotation: 285 }, // float heart up & tilt
                }
              },
              {
                frame: 24,
                bonePoses: {
                  "torso": { boneId: "torso", x: 360, y: 550, rotation: 270 },
                }
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await saveProjectToDB(defaultProj);
          setProjects([defaultProj]);
        } else {
          setProjects(list);
        }
      } catch (err) {
        console.error("Database seed error", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Creation of a new animation project workspace
  const handleAddProject = async (config: {
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
    fps: number;
  }) => {
    const nextId = "proj_" + Math.random().toString(36).substring(2, 9);
    
    // Default bones loaded inside: Add single center root bone so they have something initial
    const centerRoot: Bone = {
      id: "root",
      name: "Root Hub",
      parentId: null,
      x: Math.round(config.width / 2),
      y: Math.max(100, Math.round(config.height * 0.75)), // bottom base
      rotation: 270, // face upwards
      length: 80,
      color: "#22c55e",
    };

    const newProject: Project = {
      id: nextId,
      name: config.name,
      width: config.width,
      height: config.height,
      backgroundColor: config.backgroundColor,
      fps: config.fps,
      bones: [centerRoot],
      images: [],
      keyframes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProjectToDB(newProject);
    setProjects((prev) => [newProject, ...prev]);
    // Immediately open editor
    setActiveProjectId(nextId);
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProjectFromDB(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
  };

  // Sync back project state changes list
  const handleSaveProject = async (updatedProject: Project) => {
    await saveProjectToDB(updatedProject);
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
  };

  const handleImportProjects = async (importedList: Project[]) => {
    for (const p of importedList) {
      await saveProjectToDB(p);
    }
    const syncedList = await getAllProjectsFromDB();
    setProjects(syncedList);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        <span className="text-slate-400 font-mono text-xs">Accessing Dranfrean Studio...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {activeProject ? (
        <ProjectWorkspace
          project={activeProject}
          onExit={() => setActiveProjectId(null)}
          onSave={handleSaveProject}
        />
      ) : (
        <ProjectList
          projects={projects}
          onAddProject={handleAddProject}
          onDeleteProject={handleDeleteProject}
          onImportProjects={handleImportProjects}
          onSelectProject={setActiveProjectId}
        />
      )}
    </div>
  );
}
