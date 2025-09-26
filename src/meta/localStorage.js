const fs = require('fs').promises;
const path = require('path');

class LocalStorage {
  constructor(storageDir = './local_storage') {
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  async ensureStorageDir() {
    try {
      await fs.access(this.storageDir);
    } catch (error) {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log(`📁 Created local storage directory: ${this.storageDir}`);
    }
  }

  getFilePath(key) {
    // Replace invalid filename characters
    const safeKey = key.replace(/[<>:"/\\|?*]/g, '_');
    return path.join(this.storageDir, `${safeKey}.json`);
  }

  async set(key, value, expirationMode = null, expirationTime = null) {
    try {
      const data = {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        timestamp: Date.now(),
        ttl: expirationMode === 'EX' ? expirationTime * 1000 : null // Convert seconds to milliseconds
      };

      const filePath = this.getFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      
      console.log(`💾 Stored locally: ${key}`);
      return 'OK';
    } catch (error) {
      console.error(`❌ Error storing locally: ${key}`, error);
      throw error;
    }
  }

  async get(key) {
    try {
      const filePath = this.getFilePath(key);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      // Check if data has expired
      if (data.ttl && (Date.now() - data.timestamp) > data.ttl) {
        await this.del(key); // Remove expired data
        return null;
      }

      return data.value;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      console.error(`❌ Error reading locally: ${key}`, error);
      throw error;
    }
  }

  async del(key) {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted locally: ${key}`);
      return 1;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // File doesn't exist
      }
      console.error(`❌ Error deleting locally: ${key}`, error);
      throw error;
    }
  }

  async rpush(key, ...values) {
    try {
      const filePath = this.getFilePath(key);
      let existingData = [];

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // Check if data has expired
        if (data.ttl && (Date.now() - data.timestamp) > data.ttl) {
          existingData = [];
        } else {
          existingData = Array.isArray(data.value) ? data.value : [];
        }
      } catch (error) {
        // File doesn't exist or is corrupted, start with empty array
        existingData = [];
      }

      // Add new values
      existingData.push(...values);

      const data = {
        value: existingData,
        timestamp: Date.now(),
        ttl: null // Lists don't expire by default
      };

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`📝 Pushed to local list: ${key}`);
      return existingData.length;
    } catch (error) {
      console.error(`❌ Error pushing to local list: ${key}`, error);
      throw error;
    }
  }

  async lrange(key, start, end) {
    try {
      const filePath = this.getFilePath(key);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      // Check if data has expired
      if (data.ttl && (Date.now() - data.timestamp) > data.ttl) {
        await this.del(key);
        return [];
      }

      const list = Array.isArray(data.value) ? data.value : [];
      
      // Handle negative indices and slice the array
      if (end === -1) {
        return list.slice(start);
      }
      return list.slice(start, end + 1);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // File doesn't exist
      }
      console.error(`❌ Error reading local list: ${key}`, error);
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      const filePath = this.getFilePath(key);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      data.ttl = seconds * 1000; 
      data.timestamp = Date.now(); 

      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`⏰ Set expiration for local key: ${key} (${seconds}s)`);
      return 1;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // File doesn't exist
      }
      console.error(`❌ Error setting expiration locally: ${key}`, error);
      throw error;
    }
  }

  async ping() {
    return 'PONG';
  }

  async cleanup() {
    try {
      const files = await fs.readdir(this.storageDir);
      let cleanedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storageDir, file);
          try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(fileContent);

            if (data.ttl && (Date.now() - data.timestamp) > data.ttl) {
              await fs.unlink(filePath);
              cleanedCount++;
            }
          } catch (error) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired local storage files`);
      }
    } catch (error) {
      console.error('❌ Error during local storage cleanup:', error);
    }
  }
}

module.exports = LocalStorage;