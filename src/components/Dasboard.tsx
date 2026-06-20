import React, { useState } from "react";
import { Project } from "../types";
import { Search, Plus, Trash2, ArrowUpDown, Download, ArrowLeft, History, Heart, FileDown, Upload, Info } from "lucide-react";

interface ProjectListProps {
  projects: Project[];
  onAddProject: (projectData: { name: string; width: number; height: number; backgroundColor: string; fps: number }) => void;
  onDeleteProject: (id: string) => void;
  onImportProjects: (imported: Project[]) => void;
  onSelectProject: (id: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onAddProject,
  onDeleteProject,
  onImportProjects,
  onSelectProject,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date_new" | "date_old">("date_new");
  
  // Selection map for batch operations
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Project Creation Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [projName, setProjName] = useState("");
  const [projWidth, setProjWidth] = useState(800);
  const [projHeight, setProjHeight] = useState(600);
  const [projCanvasColor, setProjCanvasColor] = useState("#fbc587"); // default warm peach or standard options
  const [projFPS, setProjFPS] = useState(24);

  // Filter and sort projects list
  const filteredProjects = React.useMemo(() => {
    let result = projects.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "date_new") {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortBy === "date_old") {
      result.sort((a, b) => a.updatedAt - b.updatedAt);
    }
    return result;
  }, [projects, searchTerm, sortBy]);

  // Select all helper
  const handleSelectAll = (checked: boolean) => {
    const nextSelected: Record<string, boolean> = {};
    if (checked) {
      filteredProjects.forEach((p) => {
        nextSelected[p.id] = true;
      });
    }
    setSelectedIds(nextSelected);
  };

  const isAllSelected = filteredProjects.length > 0 && 
    filteredProjects.every((p) => selectedIds[p.id]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleBatchDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedCount} projects?`)) {
      Object.keys(selectedIds).forEach((id) => {
        if (selectedIds[id]) {
          onDeleteProject(id);
        }
      });
      setSelectedIds({});
    }
  };

  // Export selected projects as JSON file (Download as New)
  const handleBatchExport = (renamePrefix = false) => {
    const listToExport = projects.filter((p) => selectedIds[p.id]);
    if (listToExport.length === 0) return;

    listToExport.forEach((project) => {
      const exportedProject = { ...project };
      if (renamePrefix) {
        exportedProject.name = `Copy of ${project.name}`;
        exportedProject.id = "proj_" + Math.random().toString(36).substring(2, 9);
      }
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(exportedProject, null, 2)
      )}`;
      
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `${exportedProject.name.replace(/\s+/g, "_")}_project.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  };

  // Import project JSON from computer
  const handleJSONImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files as FileList).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          // Simple validation coordinates
          if (parsed && typeof parsed.name === "string" && Array.isArray(parsed.bones)) {
            // Remap ID if it's imported as a copy, or keep
            const importedProj: Project = {
              id: parsed.id || "imported_" + Math.random().toString(36).substring(2, 9),
              name: parsed.name,
              width: parsed.width || 800,
              height: parsed.height || 600,
              backgroundColor: parsed.backgroundColor || "#ffffff",
              fps: parsed.fps || 24,
              bones: parsed.bones || [],
              images: parsed.images || [],
              keyframes: parsed.keyframes || [],
              createdAt: parsed.createdAt || Date.now(),
              updatedAt: Date.now(),
            };
            onImportProjects([importedProj]);
          } else {
            alert("Oops! Invalid project structure inside JSON file.");
          }
        } catch (error) {
          alert("Error parsing file. Please check is valid JSON.");
        }
      };
      reader.readAsText(file);
    });
    // Clear value
    e.target.value = "";
  };

  const handleCreateConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) {
      alert("Please provide a project name.");
      return;
    }
    onAddProject({
      name: projName,
      width: Number(projWidth) || 800,
      height: Number(projHeight) || 600,
      backgroundColor: projCanvasColor,
      fps: Number(projFPS) || 24,
    });
    // Reset form states
    setProjName("");
    setShowAddModal(false);
  };

  const handleDownloadSingle = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(project, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `${project.name.replace(/\s+/g, "_")}_project.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 select-none">
      {/* 1. Header Branded Banner */}
      <div className="text-center flex flex-col items-center gap-1">
        <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-slate-800 font-bold italic select-none">
          Dranfrean
        </h1>
        <p className="text-slate-500 font-mono text-sm tracking-wider uppercase">
          2d animation bone framework
        </p>
      </div>

      {/* 2. Top search bar panel block of screenshot (pill bar shape) */}
      <div className="bg-white border-2 border-slate-705/10 rounded-full h-14 shadow-md px-4 flex items-center justify-between gap-3 bg-slate-50 border border-slate-200">
        <div className="p-1 px-2 text-slate-400">
          <ArrowLeft className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-700" title="Back" />
        </div>
        
        <div className="flex-1 flex items-center gap-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-1.5 rounded-full bg-white text-slate-800 text-sm focus:outline-none border-0 focus:ring-2 focus:ring-indigo-500 shadow-inner"
          />
        </div>

        {/* File Import upload invisible target */}
        <label className="flex items-center gap-1.5 p-2 px-3.5 rounded-full bg-slate-200 hover:bg-slate-300 transition-colors text-slate-700 font-mono text-xs cursor-pointer border border-slate-300">
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Import JSON</span>
          <input
            type="file"
            accept=".json"
            onChange={handleJSONImport}
            className="hidden"
            multiple
          />
        </label>
      </div>

      {/* 3. Action pill deck matching top gray action board of drawing */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-slate-100 rounded-xl border border-slate-200 shadow-sm text-xs font-medium text-slate-600">
        
        {/* Selection options control */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="accent-indigo-600 rounded border-slate-300 h-4.5 w-4.5 bg-white"
            />
            <span className="font-semibold text-slate-700 text-sm">Select all</span>
          </label>

          {selectedCount > 0 && (
            <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full text-[11px]">
              {selectedCount} selected
            </span>
          )}
        </div>

        {/* Batch Operations Options (Only enabled when selection exists) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleBatchExport(true)}
            disabled={selectedCount === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-slate-300 shadow-sm transition-all text-[11px] ${
              selectedCount === 0
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-slate-50 hover:text-slate-800 active:scale-95"
            }`}
            title="Saves a duplicate copy of highlighted files"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download as new</span>
          </button>

          <button
            onClick={() => handleBatchExport(false)}
            disabled={selectedCount === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-slate-300 shadow-sm transition-all text-[11px] ${
              selectedCount === 0
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-slate-50 hover:text-slate-800 active:scale-95"
            }`}
            title="Saves project matching current settings"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Download and overwrite</span>
          </button>

          <button
            onClick={handleBatchDelete}
            disabled={selectedCount === 0}
            className={`flex items-center gap-1 px-2 py-1.5 rounded transition-all text-[11px] font-semibold ${
              selectedCount === 0
                ? "opacity-40 cursor-not-allowed text-slate-400"
                : "bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 border border-red-200"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected</span>
          </button>

          {/* Sort selector dropdown */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 shadow-xs ml-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-0 p-0 text-[11px] text-slate-600 focus:outline-none focus:ring-0 cursor-pointer font-medium"
            >
              <option value="date_new">Upload date (Newest)</option>
              <option value="date_old">Upload date (Oldest)</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Project Creation Launch button and counter */}
      <div className="flex justify-between items-center bg-white p-3.5 px-5 rounded-xl border border-slate-200/85 shadow-xs">
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-slate-800 hover:bg-slate-750 font-bold text-sm tracking-wide text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all hover:shadow-md cursor-pointer"
          id="add_project_btn"
        >
          <Plus className="w-4 h-4" />
          <span>Add project</span>
        </button>

        <span className="font-semibold text-slate-600 bg-slate-100 py-1.5 px-3.5 rounded-full border border-slate-200 font-mono text-xs">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </span>
      </div>

      {/* 5. Projects list Grid layout */}
      {filteredProjects.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-16 flex flex-col items-center gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
            <Heart className="w-8 h-8 fill-slate-200 text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">No projects found</h3>
            <p className="text-sm text-slate-400 max-w-sm mt-1">
              Add your first 2D skeletal skeletal project using the button above or import key settings!
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-white bg-indigo-600 hover:bg-indigo-500 font-bold text-xs py-2 px-5 rounded-lg shadow transition-colors mt-2"
          >
            Create first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {filteredProjects.map((p) => {
            const isSelected = !!selectedIds[p.id];

            return (
              <div
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className={`group relative bg-white border-2 rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer flex flex-col select-none ${
                  isSelected ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-200"
                }`}
              >
                {/* Checkbox item overlay */}
                <div
                  className="absolute top-2.5 left-2.5 z-10 p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    className="accent-indigo-600 rounded border-slate-300 h-4.5 w-4.5 bg-white drop-shadow"
                  />
                </div>

                {/* Core illustration drawing holder (matches heart on peach color background of mock screenshot) */}
                <div
                  className="w-full aspect-[4/5] flex items-center justify-center relative overflow-hidden select-none transition-colors"
                  style={{ backgroundColor: p.backgroundColor || "#fbc587" }}
                >
                  {/* Bone armature schematic visualizer background */}
                  <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />

                  {/* Icon illustration: Standard nice drawing fallback */}
                  <div className="relative z-1 flex flex-col items-center gap-1 transform group-hover:scale-110 transition-transform">
                    {p.images.length > 0 ? (
                      <img
                        src={p.images[0].url}
                        alt="Project asset thumbnail"
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 object-contain drop-shadow-md rounded-lg max-h-32"
                      />
                    ) : (
                      <Heart className="w-16 h-16 text-rose-500 fill-rose-500/80 drop-shadow-[0_4px_12px_rgba(244,63,94,0.4)]" />
                    )}
                  </div>
                  
                  {/* Frame counts overlay stamp */}
                  <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                    {p.bones.length} bones / {p.keyframes.length} keys
                  </span>
                </div>

                {/* Card descriptions info */}
                <div className="p-3 border-t border-slate-100 bg-white flex flex-col gap-1.5">
                  <span className="font-bold text-slate-800 text-sm truncate select-none leading-none pt-0.5 group-hover:text-indigo-600 transition-colors">
                    {p.name}
                  </span>
                  
                  {/* Interactive card helper utilities */}
                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDownloadSingle(e, p)}
                        className="p-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all"
                        title="Download Project JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <span className="p-1 rounded bg-slate-50 text-slate-400">
                        <History className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete project "${p.name}"? This action is irreversible.`)) {
                          onDeleteProject(p.id);
                        }
                      }}
                      className="text-xs text-slate-400 hover:text-red-600 transition-colors font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. CREATE PROJECT POPUP DIALOG WINDOW (Strict Reference Replica) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-zinc-300 border-2 border-zinc-500 rounded-2xl w-full max-w-sm overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform animate-scale-up border-slate-400 text-zinc-800 font-sans">
            
            {/* Header layout */}
            <div className="bg-zinc-400 px-4 py-2.5 border-b border-zinc-500 text-center font-bold text-zinc-900 flex justify-between items-center">
              <span>Create Project</span>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-600 hover:text-zinc-900 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateConfirm} className="p-5 flex flex-col gap-4">
              
              {/* Project Title Entry */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-zinc-700 uppercase">Project Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Animation character"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full bg-zinc-100 border border-zinc-400 rounded px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Resolution options section */}
              <div className="flex flex-col gap-1 bg-zinc-200 p-2.5 rounded border border-zinc-400">
                <span className="text-xs font-bold text-zinc-800 text-center block mb-1.5">Resolution</span>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 mb-0.5">Wide (px)</span>
                    <input
                      type="number"
                      required
                      min={100}
                      max={4000}
                      value={projWidth}
                      onChange={(e) => setProjWidth(Math.max(100, parseInt(e.target.value) || 800))}
                      placeholder="Wide"
                      className="w-full bg-zinc-100 border border-zinc-400 rounded px-2 py-1 text-xs font-bold text-center text-zinc-900 focus:outline-none"
                    />
                  </div>
                  
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 mb-0.5">Height (px)</span>
                    <input
                      type="number"
                      required
                      min={100}
                      max={4000}
                      value={projHeight}
                      onChange={(e) => setProjHeight(Math.max(100, parseInt(e.target.value) || 600))}
                      placeholder="Height"
                      className="w-full bg-zinc-100 border border-zinc-400 rounded px-2 py-1 text-xs font-bold text-center text-zinc-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Color Picks option mapping drawing color checkboxes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-zinc-700">Canvas color</span>
                  <div className="flex items-center gap-1.5">
                    {/* Peach preset (matches illustration template colors) */}
                    <button
                      type="button"
                      onClick={() => setProjCanvasColor("#fbc587")}
                      className={`h-7 w-7 rounded border ${projCanvasColor === "#fbc587" ? "ring-2 ring-indigo-500 border-white" : "border-zinc-400"}`}
                      style={{ backgroundColor: "#fbc587" }}
                      title="Warm Peach"
                    />
                    {/* White preset */}
                    <button
                      type="button"
                      onClick={() => setProjCanvasColor("#ffffff")}
                      className={`h-7 w-7 rounded border ${projCanvasColor === "#ffffff" ? "ring-2 ring-indigo-500 border-white" : "border-zinc-400"}`}
                      style={{ backgroundColor: "#ffffff" }}
                      title="Pure White"
                    />
                    {/* Black preset */}
                    <button
                      type="button"
                      onClick={() => setProjCanvasColor("#000000")}
                      className={`h-7 w-7 rounded border ${projCanvasColor === "#000000" ? "ring-2 ring-indigo-500 border-white" : "border-zinc-400"}`}
                      style={{ backgroundColor: "#000000" }}
                      title="Deep Black"
                    />
                    {/* Custom Picker option */}
                    <input
                      type="color"
                      value={projCanvasColor}
                      onChange={(e) => setProjCanvasColor(e.target.value)}
                      className="h-7 w-8 bg-transparent border-0 cursor-pointer p-0"
                      title="Custom Palette Color"
                    />
                  </div>
                </div>

                {/* Framerate field */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-zinc-700">Fps</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={60}
                    value={projFPS}
                    onChange={(e) => setProjFPS(Math.max(1, Math.min(60, parseInt(e.target.value) || 24)))}
                    placeholder="00"
                    className="w-full bg-zinc-100 border border-zinc-400 rounded px-2.5 py-1 text-center font-bold text-zinc-900 text-sm focus:outline-none focus:border-zinc-700"
                  />
                </div>
              </div>

              {/* Action confirmation button replica */}
              <button
                type="submit"
                className="w-full mt-2 py-2 bg-white hover:bg-zinc-50 border-2 border-zinc-700 hover:border-zinc-900 rounded font-bold text-zinc-900 shadow transition-colors font-mono tracking-wide"
              >
                Confirmation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
