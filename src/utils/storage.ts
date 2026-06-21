/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, Bone, Keyframe, ProjectImage } from '../types';

export function generateHeartBase64(color: string = '#ef4444', glowColor: string = 'rgba(239, 68, 68, 0.35)'): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    
    // Heart path calculations centered at (128, 128)
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    
    ctx.beginPath();
    ctx.moveTo(128, 90);
    ctx.bezierCurveTo(128, 85, 115, 55, 85, 55);
    ctx.bezierCurveTo(45, 55, 45, 105, 45, 105);
    ctx.bezierCurveTo(45, 145, 85, 185, 128, 215);
    ctx.bezierCurveTo(171, 185, 211, 145, 211, 105);
    ctx.bezierCurveTo(211, 105, 211, 55, 171, 55);
    ctx.bezierCurveTo(141, 55, 128, 85, 128, 90);
    ctx.closePath();
    ctx.fill();
    
    // High-spec polish gloss
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(95, 90, 12, 22, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL();
}

/**
 * Creates the initial reference projects if localStorage is empty
 */
export function getInitialProjects(): Project[] {
  const heartImg = generateHeartBase64('#ec4899', 'rgba(236,72,153,0.4)'); // Pink glow heart for Ofo
  const rtyHeartImg = generateHeartBase64('#ec4899', 'rgba(236,72,153,0.3)');
  const darkHeartImg = generateHeartBase64('#b91c1c', 'rgba(185,28,28,0.2)'); // Darker crimson red for Illustration

  // Predesigned reference projects
  const ofo: Project = {
    id: 'ofo',
    name: 'Ofo',
    width: 800,
    height: 600,
    color: '#ffffff', // White base
    fps: 12,
    length: 48,
    createdAt: Date.now() - 3600000 * 3, // 3 hours ago
    bones: [
      {
        id: 'o-b1',
        name: 'Bone 1',
        parentId: null,
        x: 400,
        y: 440,
        length: 120,
        baseAngle: -90,
        color: '#10b981'
      }
    ],
    keyframes: [],
    images: [
      {
        id: 'o-img1',
        name: 'HeartPart',
        src: heartImg,
        boneId: 'o-b1',
        x: 0,
        y: -100,
        scale: 0.8,
        rotation: 0
      }
    ]
  };

  const rty: Project = {
    id: 'rty',
    name: 'Rty',
    width: 800,
    height: 600,
    color: '#ffcc80', // Peach orange grid background
    fps: 12,
    length: 48,
    createdAt: Date.now() - 3600000 * 2, // 2 hours ago
    bones: [
      {
        id: 'r-b1',
        name: 'Bone 1',
        parentId: null,
        x: 400,
        y: 440,
        length: 120,
        baseAngle: -90,
        color: '#10b981'
      }
    ],
    keyframes: [],
    images: [
      {
        id: 'r-img1',
        name: 'HeartPart',
        src: rtyHeartImg,
        boneId: 'r-b1',
        x: 0,
        y: -100,
        scale: 0.8,
        rotation: 0
      }
    ]
  };

  const illustration: Project = {
    id: 'illustration',
    name: 'Illustration',
    width: 800,
    height: 600,
    color: '#ffb74d', // Deeper peach background
    fps: 12,
    length: 48,
    createdAt: Date.now() - 3600000 * 1, // 1 hour ago
    bones: [
      {
        id: 'i-b1',
        name: 'Bone 1',
        parentId: null,
        x: 400,
        y: 450,
        length: 90,
        baseAngle: -90,
        color: '#10b981'
      },
      {
        id: 'i-b2',
        name: 'Bone 2',
        parentId: 'i-b1',
        x: 0,
        y: 0, // start is computed automatically at parent end
        length: 80,
        baseAngle: 0,
        color: '#10b981'
      }
    ],
    keyframes: [
      {
        id: 'k1',
        frame: 0,
        boneOffsets: {
          'i-b1': { rotation: 0 },
          'i-b2': { rotation: 0 }
        }
      },
      {
        id: 'k2',
        frame: 24,
        boneOffsets: {
          'i-b1': { rotation: -30 },
          'i-b2': { rotation: 50 }
        }
      },
      {
        id: 'k3',
        frame: 47,
        boneOffsets: {
          'i-b1': { rotation: 0 },
          'i-b2': { rotation: 0 }
        }
      }
    ],
    images: [
      {
        id: 'i-img1',
        name: 'CrimsonHeart',
        src: darkHeartImg,
        boneId: 'i-b2',
        x: 0,
        y: -70,
        scale: 0.75,
        rotation: 0
      }
    ]
  };

  return [ofo, rty, illustration];
}

const STORAGE_KEY = 'dranfrean_projects';

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialProjects();
      saveProjects(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as Project[];
    if (parsed.length === 0) {
      const initial = getInitialProjects();
      saveProjects(initial);
      return initial;
    }
    return parsed;
  } catch (err) {
    console.error('Error loading projects', err);
    return getInitialProjects();
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error('Error saving projects', err);
  }
}

/**
 * Download standard workspace state as a JSON file
 */
export function exportProjectsToJSON(projects: Project[], fileName: string = 'dranfrean_backup.json') {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(projects, null, 2));
  const dlAnchorElement = document.createElement('a');
  dlAnchorElement.setAttribute('href', dataStr);
  dlAnchorElement.setAttribute('download', fileName);
  dlAnchorElement.click();
      }
