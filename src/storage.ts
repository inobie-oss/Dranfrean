import { Project } from "./types";

const DB_NAME = "DranfreanProjectsDB_v1";
const STORE_NAME = "projects";

// Memory fallback cache in case IndexedDB is unavailable
let memoryProjects: Record<string, Project> = {};

function getIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB connection failed"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function saveProjectToDB(project: Project): Promise<void> {
  project.updatedAt = Date.now();
  memoryProjects[project.id] = project;
  
  try {
    const db = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn("IndexedDB unavailable, falling back to LocalStorage & memory", e);
    try {
      const fallbackList = JSON.parse(localStorage.getItem(STORE_NAME) || "[]") as Project[];
      const index = fallbackList.findIndex(p => p.id === project.id);
      if (index >= 0) {
        fallbackList[index] = project;
      } else {
        fallbackList.push(project);
      }
      localStorage.setItem(STORE_NAME, JSON.stringify(fallbackList));
    } catch (lsError) {
      console.error("LocalStorage also failed (likely quota exceeded)", lsError);
    }
  }
}

export async function getAllProjectsFromDB(): Promise<Project[]> {
  try {
    const db = await getIndexedDB();
    return new Promise<Project[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        // Sync to memoryProjects
        list.forEach(p => {
          memoryProjects[p.id] = p;
        });
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn("IndexedDB unavailable, loading from LocalStorage & memory fallback", e);
    try {
      const fallbackList = JSON.parse(localStorage.getItem(STORE_NAME) || "[]") as Project[];
      fallbackList.forEach(p => {
        memoryProjects[p.id] = p;
      });
      return fallbackList;
    } catch (lsError) {
      return Object.values(memoryProjects);
    }
  }
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  delete memoryProjects[id];
  try {
    const db = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn("IndexedDB unavailable, deleting from LocalStorage", e);
    try {
      const fallbackList = JSON.parse(localStorage.getItem(STORE_NAME) || "[]") as Project[];
      const filtered = fallbackList.filter(p => p.id !== id);
      localStorage.setItem(STORE_NAME, JSON.stringify(filtered));
    } catch (lsError) {
      console.error(lsError);
    }
  }
}
