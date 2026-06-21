/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Download, Trash2, ArrowUpDown, FileDown, 
  RefreshCw, Upload, Check, AlertCircle, Sparkles, FolderKanban
} from 'lucide-react';
import { Project } from '../types';
import { computeSkeleton, computeOffsets } from '../utils/skeleton';

interface DashboardProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  onOpenProject: (id: string) => void;
}

export default function Dashboard({ projects, setProjects, onOpenProject }: DashboardProps) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'bones'>('newest');
  
  // Project creation modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [projName, setProjName] = useState('');
  const [projWidth, setProjWidth] = useState(800);
  const [projHeight, setProjHeight] = useState(600);
  const [projColor, setProjColor] = useState('#ffffff');
  const [projFps, setProjFps] = useState(12);
  const [projLength, setProjLength] = useState(48);
  const [resPreset, setResPreset] = useState<'800x600' | '1080x1080' | '1920x1080' | 'custom'>('800x600');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toggle presets
  useEffect(() => {
    if (resPreset === '800x600') {
      setProjWidth(800);
      setProjHeight(600);
    } else if (resPreset === '1080x1080') {
      setProjWidth(1080);
      setProjHeight(1080);
    } else if (resPreset === '1920x1080') {
      setProjWidth(1920);
      setProjHeight(1080);
    }
  }, [resPreset]);

  // Select all logic
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const isAllSelected = filteredProjects.length > 0 && filteredProjects.every(p => selectedIds[p.id]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredProjects.forEach(p => {
        next[p.id] = true;
      });
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Sorting
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'newest') return b.createdAt - a.createdAt;
    if (sortBy === 'oldest') return a.createdAt - b.createdAt;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'bones') return b.bones.length - a.bones.length;
    return 0;
  });

  // Export selected as a file
  const handleDownloadSelected = (createNewIds: boolean) => {
    const active = projects.filter(p => selectedIds[p.id]);
    if (active.length === 0) {
      alert('Please select projects first.');
      return;
    }

    let payload = active;
    if (createNewIds) {
      // Clone projects with new distinct IDs
      payload = active.map(p => ({
        ...p,
        id: `proj_${Math.random().toString(36).substring(2, 9)}`,
        name: `${p.name} (Copy)`,
        createdAt: Date.now()
      }));
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', createNewIds ? 'dranfrean_clones.json' : 'dranfrean_exports.json');
    dlAnchor.click();
  };

  // Delete selected
  const handleDeleteSelected = () => {
    const activeIds = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (activeIds.length === 0) {
      alert('Please select projects to delete.');
      return;
    }
    if (confirm(`Are you sure you want to delete ${activeIds.length} projects?`)) {
      const remaining = projects.filter(p => !selectedIds[p.id]);
      setProjects(remaining);
      setSelectedIds({});
    }
  };

  // Individual Actions
  const handleDownloadSingle = (p: Project) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify([p], null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${p.name.toLowerCase()}_project.json`);
    dlAnchor.click();
  };

  const handleDuplicateSingle = (p: Project) => {
    const clone: Project = JSON.parse(JSON.stringify(p));
    clone.id = `proj_${Math.random().toString(36).substring(2, 9)}`;
    clone.name = `${p.name} (Copy)`;
    clone.createdAt = Date.now();
    setProjects(prev => [clone, ...prev]);
  };

  const handleDeleteSingle = (id: string, name: string) => {
    if (confirm(`Delete project "${name}"?`)) {
      setProjects(prev => prev.filter(p => p.id !== id));
      setSelectedIds(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Import JSON trigger
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const importedList = Array.isArray(data) ? data : [data];
        
        // Basic validation
        const verified: Project[] = [];
        for (const item of importedList) {
          if (item && item.name && Array.isArray(item.bones)) {
            verified.push({
              id: item.id || `proj_${Math.random().toString(36).substring(2, 9)}`,
              name: item.name,
              width: Number(item.width) || 800,
              height: Number(item.height) || 600,
              color: item.color || '#ffffff',
              fps: Number(item.fps) || 12,
              length: Number(item.length) || 48,
              bones: Array.isArray(item.bones) ? item.bones : [],
              keyframes: Array.isArray(item.keyframes) ? item.keyframes : [],
              images: Array.isArray(item.images) ? item.images : [],
              createdAt: item.createdAt || Date.now()
            });
          }
        }

        if (verified.length > 0) {
          // Merge imported. Prevent duplicates by ID: If ID matches, overwrite or rename
          setProjects(prev => {
            const next = [...prev];
            verified.forEach(v => {
              const idx = next.findIndex(p => p.id === v.id);
              if (idx !== -1) {
                // overwrite
                next[idx] = v;
              } else {
                next.unshift(v);
              }
            });
            return next;
          });
          alert(`Success! Imported ${verified.length} projects successfully.`);
        } else {
          alert('No valid projects found in JSON file.');
        }
      } catch (err) {
        alert('Failed to parse project JSON file. Check formatting.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Create Project
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = projName.trim() || 'New Animation';
    
    const newProj: Project = {
      id: `proj_${Math.random().toString(36).substring(2, 9)}`,
      name: finalName,
      width: projWidth,
      height: projHeight,
      color: projColor,
      fps: projFps,
      length: projLength,
      createdAt: Date.now(),
      bones: [
        {
          id: `b_${Math.random().toString(36).substring(2, 5)}`,
          name: 'Bone 1',
          parentId: null,
          x: projWidth / 2,
          y: projHeight * 0.75,
          length: 100,
          baseAngle: -90,
          color: '#10b981'
        }
      ],
      keyframes: [],
      images: []
    };

    setProjects(prev => [newProj, ...prev]);
    setShowAddModal(false);
    onOpenProject(newProj.id);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50 text-slate-800 p-4">
      
      {/* BRAND HEADER */}
      <div className="flex flex-col items-center justify-center text-center py-6 pb-4">
        <h1 className="text-4xl xs:text-5xl font-extrabold tracking-tight text-slate-900 font-serif italic">
          Dranfrean
        </h1>
        <p className="text-[10px] font-mono tracking-[0.25em] text-slate-500 uppercase font-semibold mt-1">
          2D ANIMATION BONE FRAMEWORK
        </p>
      </div>

      {/* SEARCH AND IMPORT ROW */}
      <div className="flex items-center gap-2 bg-white rounded-full border border-slate-200 p-1.5 shadow-xs mb-3">
        <button className="p-1 px-1.5 text-slate-400 hover:text-slate-600">
          <Search className="w-5 h-5" />
        </button>
        <input 
          type="text"
          placeholder="Search projects..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none w-full"
        />
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImportJSON} 
          accept=".json" 
          className="hidden" 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition-all outline-none"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import JSON</span>
        </button>
      </div>

      {/* SELECT ALL AND MASS ACTIONS BAR */}
      <div className="flex flex-col border border-slate-200 bg-[#f8fafc] rounded-2xl p-3 gap-2.5 shadow-2xs mb-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="w-4.5 h-4.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400 cursor-pointer"
            />
            <span>Select all</span>
          </label>

          {/* Sort Menu */}
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent outline-none cursor-pointer text-slate-600 pr-1"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A-Z</option>
              <option value="bones">Bones Count</option>
            </select>
          </div>
        </div>

        {/* Mass Actions buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          <button 
            onClick={() => handleDownloadSelected(true)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] sm:text-xs text-slate-700 font-semibold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition-all"
          >
            <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
            <span>Download as new</span>
          </button>
          
          <button 
            onClick={() => handleDownloadSelected(false)}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-[10px] sm:text-xs text-slate-700 font-semibold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition-all"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Overwrite download</span>
          </button>
          
          <button 
            onClick={handleDeleteSelected}
            className="bg-red-50 hover:bg-red-100 border border-red-200 text-[10px] sm:text-xs text-red-600 font-semibold py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected</span>
          </button>
        </div>
      </div>

      {/* PROJECT HEADER & ADD ROW */}
      <div className="flex items-center justify-between bg-white border border-slate-100 p-2.5 rounded-2xl shadow-3xs mb-4">
        <button 
          onClick={() => {
            setProjName('');
            setResPreset('800x600');
            setProjColor('#ffffff');
            setProjFps(12);
            setProjLength(48);
            setShowAddModal(true);
          }}
          className="bg-[#132237] hover:bg-[#1e3454] active:bg-[#0c1827] text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Add project</span>
        </button>

        <span className="text-xs font-bold text-indigo-600/90 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full font-mono">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </span>
      </div>

      {/* PROJECTS LIST GRID */}
      <div className="flex-1 overflow-y-auto">
        {sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
              <Plus className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">No animations found</p>
              <p className="text-xs text-slate-400 mt-1">Tap "+ Add project" to initialize skeletal rig.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-8">
            {sortedProjects.map(p => (
              <ProjectCard 
                key={p.id}
                project={p}
                isSelected={!!selectedIds[p.id]}
                onToggleSelect={() => toggleSelect(p.id)}
                onOpen={() => onOpenProject(p.id)}
                onDownload={() => handleDownloadSingle(p)}
                onDuplicate={() => handleDuplicateSingle(p)}
                onDelete={() => handleDeleteSingle(p.id, p.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* "+ ADD PROJECT" DIALOG POP-UP */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm border border-slate-100 shadow-2xl p-6 relative flex flex-col gap-4 text-left">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Configure Project</h3>
              <p className="text-xs text-slate-400">Specify bone canvas properties & dimensions</p>
            </div>

            <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
              {/* Project Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500">Project Name</label>
                <input 
                  type="text" 
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g. HeartBeat cycle"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500-xs transition-all"
                  required
                />
              </div>

              {/* Preset buttons */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500">Canvas Dimensions</label>
                <div className="grid grid-cols-3 gap-1 mb-2">
                  {(['800x600', '1080x1080', '1920x1080'] as const).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setResPreset(preset)}
                      className={`text-[10px] font-bold py-1.5 rounded-lg border transition-all ${
                        resPreset === preset 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Manual Resolution inputs */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Width</span>
                    <input 
                      type="number" 
                      value={projWidth}
                      onChange={(e) => {
                        setResPreset('custom');
                        setProjWidth(Math.max(100, Number(e.target.value)));
                      }}
                      className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400 font-mono">×</span>
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Height</span>
                    <input 
                      type="number" 
                      value={projHeight}
                      onChange={(e) => {
                        setResPreset('custom');
                        setProjHeight(Math.max(100, Number(e.target.value)));
                      }}
                      className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Color options */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500">Canvas Background Color</label>
                <div className="flex items-center gap-1.5">
                  {(['#ffffff', '#ffcc80', '#ffb74d', '#e0f2fe', '#0f172a'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProjColor(c)}
                      className={`w-7 h-7 rounded-lg border transition-all flex items-center justify-center ${
                        projColor === c 
                          ? 'border-indigo-600 ring-2 ring-indigo-100 scale-110' 
                          : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {projColor === c && (
                        <Check className={`w-3.5 h-3.5 ${c === '#ffffff' || c === '#ffcc80' || c === '#ffb74d' ? 'text-slate-800' : 'text-white'}`} />
                      )}
                    </button>
                  ))}
                  
                  {/* Custom color input picker */}
                  <input 
                    type="color" 
                    value={projColor}
                    onChange={(e) => setProjColor(e.target.value)}
                    className="w-7 h-7 rounded-lg cursor-pointer border border-slate-300 p-0 overflow-hidden" 
                  />
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase">{projColor}</span>
                </div>
              </div>

              {/* FPS slider & duration */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">FPS ({projFps})</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="60" 
                    value={projFps}
                    onChange={(e) => setProjFps(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Length ({projLength}f)</label>
                  <input 
                    type="number" 
                    min="2" 
                    max="1000" 
                    value={projLength}
                    onChange={(e) => setProjLength(Math.max(2, Number(e.target.value)))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 font-semibold text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Confirmation buttons */}
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold py-2.5 rounded-xl text-xs text-center border border-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#132237] hover:bg-[#1e3454] text-white font-bold py-2.5 rounded-xl text-xs text-center shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* PROJECT CARD SUBCOMPONENT */
interface CardProps {
  key?: string;
  project: Project;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, isSelected, onToggleSelect, onOpen, onDownload, onDuplicate, onDelete }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render thumbnail canvas representing the bone skeletal state
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill project color
    ctx.fillStyle = project.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context
    ctx.save();
    
    // Scale drawings so they fit in 140x170 box
    const scaleX = canvas.width / project.width;
    const scaleY = canvas.height / project.height;
    const scale = Math.min(scaleX, scaleY) * 0.95;
    
    // Center drawings
    const shiftX = (canvas.width - project.width * scale) / 2;
    const shiftY = (canvas.height - project.height * scale) / 2;
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-project.width / 2, -project.height / 2);

    // Grid draw if color is pale or dark
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let x = 0; x < project.width; x += 40) {
      ctx.fillRect(x, 0, 1, project.height);
    }
    for (let y = 0; y < project.height; y += 40) {
      ctx.fillRect(0, y, project.width, 1);
    }

    // Solve skeleton starting state values
    const offsets = computeOffsets(project.keyframes, 0, project.bones.map(b => b.id));
    const skeleton = computeSkeleton(project.bones, offsets);

    // Draw images
    project.images.forEach(img => {
      const boneJoint = skeleton[img.boneId || ''];
      
      const drawImageElement = () => {
        const i = new Image();
        i.src = img.src;
        i.onload = () => {
          if (!canvasRef.current) return;
          // Re-trigger redraw
        };
        // Draw heart programmatically if loaded, else use local drawing
        ctx.save();
        if (boneJoint) {
          ctx.translate(boneJoint.start.x, boneJoint.start.y);
          ctx.rotate(boneJoint.absoluteAngle);
          ctx.translate(img.x, img.y);
          ctx.rotate((img.rotation * Math.PI) / 180);
          ctx.scale(img.scale, img.scale);
        } else {
          ctx.translate(project.width / 2, project.height / 2);
        }
        
        ctx.fillStyle = project.id === 'illustration' ? '#b91c1c' : '#ec4899';
        // Draw miniature vector heart directly to ensure it renders instantly
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
      };
      drawImageElement();
    });

    // Draw Bones overlay
    Object.values(skeleton).forEach(joint => {
      // Draw joint connection line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(joint.start.x, joint.start.y);
      ctx.lineTo(joint.end.x, joint.end.y);
      ctx.stroke();

      // Yellow core
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Joint circles
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(joint.start.x, joint.start.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(joint.end.x, joint.end.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.restore();
  }, [project]);

  return (
    <div className="relative bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 p-2 text-left group animate-fade-in shadow-xs">
      
      {/* Top Checkbox Overlay */}
      <div className="absolute top-3.5 left-3.5 z-10">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={onToggleSelect}
          className="w-4.5 h-4.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400 cursor-pointer shadow-xs"
        />
      </div>

      {/* Render Canvas Thumbnail in high ratio */}
      <div 
        onClick={onOpen}
        className="aspect-square bg-slate-100 rounded-2xl relative overflow-hidden cursor-pointer flex items-center justify-center border border-slate-100"
      >
        <canvas 
          ref={canvasRef} 
          width={180} 
          height={180} 
          className="w-full h-full object-cover"
        />

        {/* Floating bones/keys badge inside card */}
        <div className="absolute bottom-1.5 right-1.5 bg-slate-900/80 backdrop-blur-xs text-[9px] font-bold text-white px-2 py-0.5 rounded-md font-mono select-none">
          {project.bones.length} {project.bones.length === 1 ? 'bone' : 'bones'} / {project.keyframes.length} {project.keyframes.length === 1 ? 'key' : 'keys'}
        </div>
      </div>

      {/* Info Label & Title */}
      <div className="p-2 pt-2.5">
        <h4 
          onClick={onOpen}
          className="text-sm font-bold text-slate-800 tracking-tight cursor-pointer truncate max-w-full hover:text-indigo-600 transition-colors"
        >
          {project.name}
        </h4>
        
        {/* Footer row containing action icons */}
        <div className="flex items-center justify-between mt-2.5 text-slate-400 border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            <button 
              onClick={onDownload}
              title="Download Project Backup"
              className="p-1 text-slate-400 hover:text-slate-600 active:scale-90 transition-all rounded hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={onDuplicate}
              title="Duplicate Project Template"
              className="p-1 text-slate-400 hover:text-slate-600 active:scale-90 transition-all rounded hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-600 font-semibold px-1 rounded transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
