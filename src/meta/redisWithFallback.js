const Redis = require("ioredis");
const LocalStorage = require('./localStorage');

class RedisWithFallback {
  constructor(redisConfig = {}) {
    this.redis = new Redis({
      host: "82.112.241.117",
      port: 6379,
      db: process.env.REDIS_DB,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      lazyConnect: true,
      ...redisConfig
    });

    this.localStorage = new LocalStorage();
    this.isRedisHealthy = false;
    this.lastHealthCheck = 0;
    this.healthCheckInterval = 30000; 

    this.setupRedisEventHandlers();
    
    // Start periodic cleanup for local storage
    setInterval(() => {
      this.localStorage.cleanup();
    }, 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  setupRedisEventHandlers() {
    this.redis.on("connect", () => {
      console.log("✅ Connected to Redis");
      this.isRedisHealthy = true;
    });

    this.redis.on("error", (err) => {
      console.error("❌ Redis connection error:", err.message);
      this.isRedisHealthy = false;
    });

    this.redis.on("close", () => {
      console.log("🔌 Redis connection closed");
      this.isRedisHealthy = false;
    });

    this.redis.on("reconnecting", () => {
      console.log("🔄 Reconnecting to Redis...");
    });
  }

  async checkRedisHealth() {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.isRedisHealthy) {
      return this.isRedisHealthy;
    }

    try {
      const pong = await this.redis.ping();
      this.isRedisHealthy = pong === "PONG";
      this.lastHealthCheck = now;
    } catch (error) {
      console.error("❌ Redis health check failed:", error.message);
      this.isRedisHealthy = false;
    }

    return this.isRedisHealthy;
  }

  async set(key, value, mode = null, time = null) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        if (mode && time) {
          return await this.redis.set(key, value, mode, time);
        }
        return await this.redis.set(key, value);
      } catch (error) {
        console.error("❌ Redis SET failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.set(key, value, mode, time);
      }
    } else {
      console.log("📁 Using local storage for SET:", key);
      return await this.localStorage.set(key, value, mode, time);
    }
  }

  async get(key) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.get(key);
      } catch (error) {
        console.error("❌ Redis GET failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.get(key);
      }
    } else {
      console.log("📁 Using local storage for GET:", key);
      return await this.localStorage.get(key);
    }
  }

  async del(key) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.del(key);
      } catch (error) {
        console.error("❌ Redis DEL failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.del(key);
      }
    } else {
      console.log("📁 Using local storage for DEL:", key);
      return await this.localStorage.del(key);
    }
  }

  async rpush(key, ...values) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.rpush(key, ...values);
      } catch (error) {
        console.error("❌ Redis RPUSH failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.rpush(key, ...values);
      }
    } else {
      console.log("📁 Using local storage for RPUSH:", key);
      return await this.localStorage.rpush(key, ...values);
    }
  }

  async lrange(key, start, end) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.lrange(key, start, end);
      } catch (error) {
        console.error("❌ Redis LRANGE failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.lrange(key, start, end);
      }
    } else {
      console.log("📁 Using local storage for LRANGE:", key);
      return await this.localStorage.lrange(key, start, end);
    }
  }

  async expire(key, seconds) {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.expire(key, seconds);
      } catch (error) {
        console.error("❌ Redis EXPIRE failed, using local storage:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.expire(key, seconds);
      }
    } else {
      console.log("📁 Using local storage for EXPIRE:", key);
      return await this.localStorage.expire(key, seconds);
    }
  }

  async ping() {
    const isHealthy = await this.checkRedisHealth();
    
    if (isHealthy) {
      try {
        return await this.redis.ping();
      } catch (error) {
        console.error("❌ Redis PING failed:", error.message);
        this.isRedisHealthy = false;
        return await this.localStorage.ping();
      }
    } else {
      return await this.localStorage.ping();
    }
  }

  async syncToRedis() {
    if (!this.isRedisHealthy) return false;

    try {
      const storageDir = this.localStorage.storageDir;
      const fs = require('fs').promises;
      const files = await fs.readdir(storageDir);

      let syncCount = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          const key = file.replace('.json', '').replace(/_/g, ':');
          const localValue = await this.localStorage.get(key);
          
          if (localValue !== null) {
            try {
              const filePath = this.localStorage.getFilePath(key);
              const fileContent = await fs.readFile(filePath, 'utf8');
              const data = JSON.parse(fileContent);
              
              if (Array.isArray(data.value)) {
                await this.redis.del(key);
                if (data.value.length > 0) {
                  await this.redis.rpush(key, ...data.value);
                }
              } else {
                await this.redis.set(key, localValue);
              }
              
              if (data.ttl) {
                const remainingTTL = Math.max(0, Math.floor((data.ttl - (Date.now() - data.timestamp)) / 1000));
                if (remainingTTL > 0) {
                  await this.redis.expire(key, remainingTTL);
                }
              }
              
              syncCount++;
            } catch (error) {
              console.error(`❌ Error syncing key ${key} to Redis:`, error.message);
            }
          }
        }
      }

      console.log(`🔄 Synced ${syncCount} keys from local storage to Redis`);
      return true;
    } catch (error) {
      console.error("❌ Error during sync to Redis:", error);
      return false;
    }
  }

  getStatus() {
    return {
      redis: this.isRedisHealthy,
      localStorage: true,
      currentStorage: this.isRedisHealthy ? 'redis' : 'localStorage'
    };
  }
}

module.exports = RedisWithFallback;