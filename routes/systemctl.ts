import type { Server, Socket } from "socket.io";
import systemctlManager from "../lib/systemctl";

// List all systemctl services
const listSystemctlServices = async (data: {}, callback: (response: any) => void) => {
  try {
    const services = await systemctlManager.list();
    callback({
      success: true,
      data: { services }
    });
  } catch (error) {
    console.error('List systemctl services error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get service status
const getSystemctlStatus = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }
    
    const status = await systemctlManager.getStatus(appName);
    callback({
      success: true,
      data: { status }
    });
  } catch (error) {
    console.error('Get systemctl status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Start systemctl service
const startSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.start(appName);
    callback({
      success: true,
      message: `Service ${appName} started successfully`
    });
  } catch (error) {
    console.error('Start systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop systemctl service
const stopSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.stop(appName);
    callback({
      success: true,
      message: `Service ${appName} stopped successfully`
    });
  } catch (error) {
    console.error('Stop systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Restart systemctl service
const restartSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.restart(appName);
    callback({
      success: true,
      message: `Service ${appName} restarted successfully`
    });
  } catch (error) {
    console.error('Restart systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Enable systemctl service
const enableSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.enable(appName);
    callback({
      success: true,
      message: `Service ${appName} enabled successfully`
    });
  } catch (error) {
    console.error('Enable systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Disable systemctl service
const disableSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.disable(appName);
    callback({
      success: true,
      message: `Service ${appName} disabled successfully`
    });
  } catch (error) {
    console.error('Disable systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get service logs
const getSystemctlLogs = async (data: { 
  appName: string; 
  lines?: number; 
  since?: string;
}, callback: (response: any) => void) => {
  try {
    const { appName, lines = 100, since } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }
    
    const logs = await systemctlManager.getLogs(appName, { lines, since });
    callback({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Get systemctl logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stream logs in real-time
const streamSystemctlLogs = (socket: Socket) => (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    // Start log streaming
    const cleanup = systemctlManager.createLogStream(appName, (logData) => {
      socket.emit('systemctl:log-stream', {
        appName,
        data: logData,
        timestamp: new Date().toISOString()
      });
    });

    // Store cleanup function for this stream
    if (!socket.data.systemctlStreams) {
      socket.data.systemctlStreams = new Map();
    }
    socket.data.systemctlStreams.set(appName, cleanup);

    callback({
      success: true,
      message: `Started streaming logs for ${appName}`
    });

    // Auto-cleanup when socket disconnects
    socket.on('disconnect', () => {
      if (socket.data.systemctlStreams && socket.data.systemctlStreams.has(appName)) {
        const cleanupFn = socket.data.systemctlStreams.get(appName);
        cleanupFn();
        socket.data.systemctlStreams.delete(appName);
      }
    });

  } catch (error) {
    console.error('Stream systemctl logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop log streaming
const stopStreamSystemctlLogs = (socket: Socket) => (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    if (socket.data.systemctlStreams && socket.data.systemctlStreams.has(appName)) {
      const cleanup = socket.data.systemctlStreams.get(appName);
      cleanup();
      socket.data.systemctlStreams.delete(appName);
      
      callback({
        success: true,
        message: `Stopped streaming logs for ${appName}`
      });
    } else {
      callback({
        success: false,
        error: `No active log stream found for ${appName}`
      });
    }

  } catch (error) {
    console.error('Stop stream systemctl logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete systemctl service
const deleteSystemctlService = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await systemctlManager.deleteService(appName);
    callback({
      success: true,
      message: `Service ${appName} deleted successfully`
    });
  } catch (error) {
    console.error('Delete systemctl service error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  // Service management
  socket.on("systemctl:list", listSystemctlServices);
  socket.on("systemctl:status", getSystemctlStatus);
  socket.on("systemctl:start", startSystemctlService);
  socket.on("systemctl:stop", stopSystemctlService);
  socket.on("systemctl:restart", restartSystemctlService);
  socket.on("systemctl:enable", enableSystemctlService);
  socket.on("systemctl:disable", disableSystemctlService);
  socket.on("systemctl:delete", deleteSystemctlService);
  
  // Logs
  socket.on("systemctl:logs", getSystemctlLogs);
  socket.on("systemctl:stream-logs", streamSystemctlLogs(socket));
  socket.on("systemctl:stop-stream", stopStreamSystemctlLogs(socket));
};
