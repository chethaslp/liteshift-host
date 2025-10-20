import type { Server, Socket } from "socket.io";
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { formatBytes } from "../lib/utils";
import { dbHelpers } from "../lib/db";
import { formatUptime } from "../lib/utils";

const execAsync = promisify(exec);

// Helper function to get disk information
async function getDiskInfo() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n').slice(1);
      
      let totalSize = 0;
      let totalFreeSpace = 0;
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const freeSpace = parseInt(parts[1]) || 0;
          const size = parseInt(parts[2]) || 0;
          totalFreeSpace += freeSpace;
          totalSize += size;
        }
      });
      
      const total = formatBytes(totalSize);
      const used = formatBytes(totalSize - totalFreeSpace);

      return {
        total,
        used,
        formatted: `${used.value} / ${total.value} ${total.unit}`,
        usedPercentage: (((totalSize - totalFreeSpace) / totalSize) * 100).toFixed(2) || 0,
      };
    } else {
      const { stdout } = await execAsync('df -k');
      const lines = stdout.trim().split('\n').slice(1);
      
      let totalSize = 0;
      let totalUsed = 0;
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          totalSize += parseInt(parts[1]) * 1024 || 0;
          totalUsed += parseInt(parts[2]) * 1024 || 0;
        }
      });
      
      const total = formatBytes(totalSize);
      const used = formatBytes(totalUsed);
      return {
        total,
        used,
        formatted: `${used.value} ${used.unit} / ${total.value} ${total.unit}`,
        usedPercentage: ((totalUsed / totalSize) * 100).toFixed(2) || 0,
      };
    }
  } catch (error) {
    console.error('Error getting disk info:', error);
    return {
      total: formatBytes(0),
      free: formatBytes(0),
      used: formatBytes(0),
      usedPercentage: 0,
    };
  }
}

// Helper function to get Caddy status
function getCaddyStatus() {
  return new Promise((resolve) => {
    exec('systemctl is-active caddy', (error, stdout) => {
      if (error) {
        resolve('inactive');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Get system analytics
const getSystemAnalytics = async (data: {}, callback: (response: any) => void) => {
  try {
    // CPU information
    const loadAvg = os.loadavg();
    const cpuInfo = {
      loadAvg1min: Math.round(loadAvg[0] * 100) / 100,
      loadAvg5min: Math.round(loadAvg[1] * 100) / 100,
      loadAvg15min: Math.round(loadAvg[2] * 100) / 100,
      cores: os.cpus().length,
      formatted: `${loadAvg[0].toFixed(2)} / ${loadAvg[1].toFixed(2)} / ${loadAvg[2].toFixed(2)}`,
      usagePercentage: (loadAvg[0] / os.cpus().length * 100).toFixed(2)
    };

    // Memory information
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const total = formatBytes(totalMemory);
    const used = formatBytes(totalMemory - freeMemory);
    const memoryInfo = {
      total,
      used,
      formatted: `${used.value} / ${total.value} ${total.unit}`,
      usedPercentage: (((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2),
    };

    // Disk information
    const diskInfo = await getDiskInfo();

    // System uptime
    const uptime = os.uptime();

    // Caddy status
    const caddyStatus = await getCaddyStatus();

    callback({
      success: true,
      data: {
        cpu: cpuInfo,
        memory: memoryInfo,
        disk: diskInfo,
        uptime: uptime,
        caddyStatus,
        timestamp: new Date(),
      }
    });
  } catch (error) {
    console.error('Get system analytics error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get CPU information only
const getCPUInfo = async (data: {}, callback: (response: any) => void) => {
  try {
    const loadAvg = os.loadavg();
    const cpuInfo = {
      loadAvg1min: Math.round(loadAvg[0] * 100) / 100,
      loadAvg5min: Math.round(loadAvg[1] * 100) / 100,
      loadAvg15min: Math.round(loadAvg[2] * 100) / 100,
      cores: os.cpus().length,
      formatted: `${loadAvg[0].toFixed(2)} / ${loadAvg[1].toFixed(2)} / ${loadAvg[2].toFixed(2)}`,
      usagePercentage: (loadAvg[0] / os.cpus().length * 100).toFixed(2)
    };

    callback({
      success: true,
      data: { cpu: cpuInfo }
    });
  } catch (error) {
    console.error('Get CPU info error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get memory information only
const getMemoryInfo = async (data: {}, callback: (response: any) => void) => {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const total = formatBytes(totalMemory);
    const used = formatBytes(totalMemory - freeMemory);
    const memoryInfo = {
      total,
      used,
      formatted: `${used.value} / ${total.value} ${total.unit}`,
      usedPercentage: (((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2),
    };

    callback({
      success: true,
      data: { memory: memoryInfo }
    });
  } catch (error) {
    console.error('Get memory info error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get disk information only
const getDiskInformation = async (data: {}, callback: (response: any) => void) => {
  try {
    const diskInfo = await getDiskInfo();

    callback({
      success: true,
      data: { disk: diskInfo }
    });
  } catch (error) {
    console.error('Get disk info error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get system uptime
const getSystemUptime = async (data: {}, callback: (response: any) => void) => {
  try {
    const uptime = os.uptime();

    callback({
      success: true,
      data: { 
        uptime,
        formatted: formatUptime(uptime)
      }
    });
  } catch (error) {
    console.error('Get system uptime error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get Caddy service status
const getCaddyServiceStatus = async (data: {}, callback: (response: any) => void) => {
  try {
    const caddyStatus = await getCaddyStatus();

    callback({
      success: true,
      data: { 
        caddyStatus,
        isActive: caddyStatus === 'active'
      }
    });
  } catch (error) {
    console.error('Get Caddy status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stream system analytics in real-time
const streamSystemAnalytics = (socket: Socket) => (data: { interval?: number }, callback: (response: any) => void) => {
  try {
    const { interval = 5000 } = data; // Default 5 seconds

    // Validate interval (minimum 1 second, maximum 60 seconds)
    const validInterval = Math.max(1000, Math.min(60000, interval));

    const streamInterval = setInterval(async () => {
      try {
        // Get all system info
        const loadAvg = os.loadavg();
        const cpuInfo = {
          loadAvg1min: Math.round(loadAvg[0] * 100) / 100,
          loadAvg5min: Math.round(loadAvg[1] * 100) / 100,
          loadAvg15min: Math.round(loadAvg[2] * 100) / 100,
          cores: os.cpus().length,
          formatted: `${loadAvg[0].toFixed(2)} / ${loadAvg[1].toFixed(2)} / ${loadAvg[2].toFixed(2)}`,
          usagePercentage: (loadAvg[0] / os.cpus().length * 100).toFixed(2)
        };

        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const total = formatBytes(totalMemory);
        const used = formatBytes(totalMemory - freeMemory);
        const memoryInfo = {
          total,
          used,
          formatted: `${used.value} / ${total.value} ${total.unit}`,
          usedPercentage: (((totalMemory - freeMemory) / totalMemory) * 100).toFixed(2),
        };

        const diskInfo = await getDiskInfo();
        const uptime = os.uptime();
        const caddyStatus = await getCaddyStatus();

        // Emit real-time data
        socket.emit('system:analytics-stream', {
          cpu: cpuInfo,
          memory: memoryInfo,
          disk: diskInfo,
          uptime: uptime,
          caddyStatus,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Error streaming system analytics:', error);
        clearInterval(streamInterval);
      }
    }, validInterval);

    // Store the interval ID for cleanup
    if (!socket.data.systemStreams) {
      socket.data.systemStreams = new Map();
    }
    socket.data.systemStreams.set('analytics', streamInterval);

    callback({
      success: true,
      message: `Started streaming system analytics every ${validInterval}ms`
    });

    // Auto-cleanup when socket disconnects
    socket.on('disconnect', () => {
      if (socket.data.systemStreams && socket.data.systemStreams.has('analytics')) {
        const interval = socket.data.systemStreams.get('analytics');
        clearInterval(interval);
        socket.data.systemStreams.delete('analytics');
      }
    });

  } catch (error) {
    console.error('Stream system analytics error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop streaming system analytics
const stopStreamSystemAnalytics = (socket: Socket) => (data: {}, callback: (response: any) => void) => {
  try {
    if (socket.data.systemStreams && socket.data.systemStreams.has('analytics')) {
      const interval = socket.data.systemStreams.get('analytics');
      clearInterval(interval);
      socket.data.systemStreams.delete('analytics');
      
      callback({
        success: true,
        message: 'Stopped streaming system analytics'
      });
    } else {
      callback({
        success: false,
        error: 'No active system analytics stream found'
      });
    }

  } catch (error) {
    console.error('Stop stream system analytics error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};




// Get all configuration settings
const getSettings = async (data: {}, callback: (response: any) => void) => {
  try {
    const settings = dbHelpers.getAllSettings();
    
    callback({
      success: true,
      data: { settings }
    });
  } catch (error) {
    console.error('Get all settings error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Set multiple settings at once
const setSettings = async (data: { settings: Record<string, string> }, callback: (response: any) => void) => {
  try {
    const { settings } = data;
    
    if (!settings || typeof settings !== 'object') {
      callback({
        success: false,
        error: 'settings object is required'
      });
      return;
    }

    const settingsKeys = Object.keys(settings);
    if (settingsKeys.length === 0) {
      callback({
        success: false,
        error: 'At least one setting is required'
      });
      return;
    }

    // Validate all keys first
    for (const key of settingsKeys) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        callback({
          success: false,
          error: `Invalid key format for '${key}'. Use only alphanumeric characters, underscores, and dashes.`
        });
        return;
      }
    }

    // Set all settings
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined || value === null) {
        callback({
          success: false,
          error: `Invalid value for setting '${key}'`
        });
        return;
      }
      dbHelpers.setSetting(key, String(value));
    }
    
    callback({
      success: true,
      message: `${settingsKeys.length} setting(s) updated successfully: ${settingsKeys.join(', ')}`,
    });
  } catch (error) {
    console.error('Set multiple settings error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  socket.on("system:analytics", getSystemAnalytics);
  socket.on("system:cpu", getCPUInfo);
  socket.on("system:memory", getMemoryInfo);
  socket.on("system:disk", getDiskInformation);
  socket.on("system:uptime", getSystemUptime);
  socket.on("system:caddy-status", getCaddyServiceStatus);
  socket.on("system:stream-analytics", streamSystemAnalytics(socket));
  socket.on("system:stop-stream", stopStreamSystemAnalytics(socket));
  
  // Configuration management routes
  socket.on("system:get-settings", getSettings);
  socket.on("system:set-settings", setSettings);

}
