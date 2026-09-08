import { fileStorageDB } from "./fileStorageDB";

const fileRegistry = new Map<string, File>();

export const fileRegistryService = {
  // Initialize and restore files from IndexedDB
  init: async () => {
    try {
      await fileStorageDB.init();
      const storedFiles = await fileStorageDB.getAllFiles();
      storedFiles.forEach((file, id) => {
        fileRegistry.set(id, file);
      });
      console.log(`Restored ${storedFiles.size} files from storage`);
    } catch (error) {
      console.error("Failed to initialize file storage:", error);
    }
  },

  setFile: async (id: string, file: File) => {
    fileRegistry.set(id, file);
    try {
      await fileStorageDB.saveFile(id, file);
    } catch (error) {
      console.error("Failed to persist file:", error);
    }
  },

  getFile: (id: string) => fileRegistry.get(id),

  getFileAsync: async (id: string) => {
    const inMemory = fileRegistry.get(id);
    if (inMemory) {
      return inMemory;
    }

    try {
      const file = await fileStorageDB.getFile(id);
      if (file) {
        fileRegistry.set(id, file);
      }
      return file;
    } catch (error) {
      console.error("Failed to load file from persistent storage:", error);
      return null;
    }
  },

  removeFile: async (id: string) => {
    fileRegistry.delete(id);
    try {
      await fileStorageDB.removeFile(id);
    } catch (error) {
      console.error("Failed to remove file from storage:", error);
    }
  },

  clear: async () => {
    fileRegistry.clear();
    try {
      await fileStorageDB.clearAll();
    } catch (error) {
      console.error("Failed to clear storage:", error);
    }
  },
};
