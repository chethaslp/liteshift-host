import type { Server, Socket } from "socket.io";
import processManager from "../lib/processManager";

// List all Process Manager processes managed by LiteShift
const listPMProcesses = async (data: {}, callback: (response: any) => void) => {
  try {
    const processes = await processManager.list();
    callback({
      success: true,
      data: { processes }
    });
  } catch (error) {
    console.error('Process Manager list error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get process status
const getPMStatus = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName parameter is required' });
      return;
    }

    const status = await processManager.getStatus(appName);
    callback({ success: true, data: { status } });
  } catch (error) {
    console.error('Process Manager status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Start a process
const startPMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.start(appName);
    callback({ success: true, message: `Process ${appName} started successfully` });
  } catch (error) {
    console.error('Process Manager start error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop a process
const stopPMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.stop(appName);
    callback({ success: true, message: `Process ${appName} stopped successfully` });
  } catch (error) {
    console.error('Process Manager stop error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Restart a process
const restartPMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.restart(appName);
    callback({ success: true, message: `Process ${appName} restarted successfully` });
  } catch (error) {
    console.error('Process Manager restart error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Enable (save) a process to auto-start on boot
const enablePMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.enable(appName);
    callback({ success: true, message: `Process ${appName} enabled for auto-startup` });
  } catch (error) {
    console.error('Process Manager enable error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Disable a process from auto-start
const disablePMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.disable(appName);
    callback({ success: true, message: `Process ${appName} disabled from auto-startup` });
  } catch (error) {
    console.error('Process Manager disable error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get process logs
const getPMLogs = async (data: {
  appName: string;
  lines?: number;
  since?: string;
}, callback: (response: any) => void) => {
  try {
    const { appName, lines = 100, since } = data;
    if (!appName) {
      callback({ success: false, error: 'appName parameter is required' });
      return;
    }

    const logs = await processManager.getLogs(appName, { lines, since });
    callback({ success: true, data: { logs } });
  } catch (error) {
    console.error('Process Manager logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stream logs in real-time
const streamPMLogs = (socket: Socket) => (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName parameter is required' });
      return;
    }

    const cleanup = processManager.createLogStream(appName, (logData) => {
      socket.emit('pm:log-stream', {
        appName,
        data: logData,
        timestamp: new Date().toISOString()
      });
    });

    if (!socket.data.pmStreams) {
      socket.data.pmStreams = new Map();
    }
    socket.data.pmStreams.set(appName, cleanup);

    callback({ success: true, message: `Started streaming logs for ${appName}` });

    socket.on('disconnect', () => {
      if (socket.data.pmStreams?.has(appName)) {
        socket.data.pmStreams.get(appName)();
        socket.data.pmStreams.delete(appName);
      }
    });
  } catch (error) {
    console.error('Process Manager stream logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop log streaming
const stopstreamPMLogs = (socket: Socket) => (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName parameter is required' });
      return;
    }

    if (socket.data.pmStreams?.has(appName)) {
      socket.data.pmStreams.get(appName)();
      socket.data.pmStreams.delete(appName);
      callback({ success: true, message: `Stopped streaming logs for ${appName}` });
    } else {
      callback({ success: false, error: `No active log stream found for ${appName}` });
    }
  } catch (error) {
    console.error('Process Manager stop stream error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete a process entirely
const deletePMProcess = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({ success: false, error: 'appName is required' });
      return;
    }

    await processManager.deleteService(appName);
    callback({ success: true, message: `Process ${appName} deleted successfully` });
  } catch (error) {
    console.error('Process Manager delete error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  // Process management
  socket.on("pm:list", listPMProcesses);
  socket.on("pm:status", getPMStatus);
  socket.on("pm:start", startPMProcess);
  socket.on("pm:stop", stopPMProcess);
  socket.on("pm:restart", restartPMProcess);
  socket.on("pm:enable", enablePMProcess);
  socket.on("pm:disable", disablePMProcess);
  socket.on("pm:delete", deletePMProcess);

  // Logs
  socket.on("pm:logs", getPMLogs);
  socket.on("pm:stream-logs", streamPMLogs(socket));
  socket.on("pm:stop-stream", stopstreamPMLogs(socket));
};
