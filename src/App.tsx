/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import MobileFrame from './components/MobileFrame';
import Dashboard from './components/Dashboard';
import ProjectEditor from './components/ProjectEditor';
import { Project } from './types';
import { loadProjects, saveProjects } from './utils/storage';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // Load projects from localStorage on startup
  useEffect(() => {
    const loaded = loadProjects();
    setProjects(loaded);
  }, []);

  // Sync state variations instantly back to storage
  const handleSetProjects = (update: React.SetStateAction<Project[]>) => {
    setProjects(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      saveProjects(next);
      return next;
    });
  };

  const handleUpdateSingleProject = (updated: Project) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === updated.id ? updated : p);
      saveProjects(next);
      return next;
    });
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  return (
    <MobileFrame>
      <div className="w-full h-full flex flex-col bg-slate-50 text-slate-900 select-none">
        {activeProject ? (
          <ProjectEditor 
            project={activeProject}
            onExit={() => setActiveProjectId(null)}
            onSave={handleUpdateSingleProject}
          />
        ) : (
          <Dashboard 
            projects={projects}
            setProjects={handleSetProjects}
            onOpenProject={(id) => setActiveProjectId(id)}
          />
        )}
      </div>
    </MobileFrame>
  );
}
