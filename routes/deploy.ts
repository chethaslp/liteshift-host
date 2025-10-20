import type { Server, Socket } from "socket.io";
import DeploymentManager from "../lib/deployment";

// Deploy from Git repository
const deployFromGit = async (data: {
  appName: string;
  repository: string;
  branch?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand: string;
  runtime?: 'node' | 'python' | 'bun';
  envVars?: Record<string, string>;
}, callback: (response: any) => void) => {
  try {
    const { appName, repository, branch, buildCommand, installCommand, startCommand, runtime, envVars } = data;
    
    if (!appName || !repository || !startCommand) {
      callback({
        success: false,
        error: 'appName, repository, and startCommand are required'
      });
      return;
    }

    const result = await DeploymentManager.deployFromGit({
      appName,
      repository,
      branch,
      buildCommand,
      installCommand,
      startCommand,
      runtime,
      envVars
    });

    callback({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Deploy from Git error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Deploy from file upload
const deployFromFile = async (data: {
  appName: string;
  startCommand: string;
  buildCommand?: string;
  installCommand?: string;
  runtime?: 'node' | 'python' | 'bun';
  envVars?: Record<string, string>;
  fileBuffer: Buffer;
}, callback: (response: any) => void) => {
  try {
    const { appName, startCommand, buildCommand, installCommand, runtime, envVars, fileBuffer } = data;
    
    if (!appName || !startCommand || !fileBuffer) {
      callback({
        success: false,
        error: 'appName, startCommand, and fileBuffer are required'
      });
      return;
    }

    const result = await DeploymentManager.deployFromFile({
      appName,
      startCommand,
      buildCommand,
      installCommand,
      runtime,
      envVars
    }, fileBuffer);

    callback({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Deploy from file error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Redeploy existing app
const redeployApp = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    const result = await DeploymentManager.redeploy(appName);
    callback({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Redeploy app error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get deployment queue status
const getQueueStatus = async (data: {}, callback: (response: any) => void) => {
  try {
    const queueStatus = DeploymentManager.getQueueStatus();
    callback({
      success: true,
      data: queueStatus
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get specific deployment status
const getDeploymentStatus = async (data: { queueId: number }, callback: (response: any) => void) => {
  try {
    const { queueId } = data;
    
    if (!queueId) {
      callback({
        success: false,
        error: 'queueId is required'
      });
      return;
    }

    const status = DeploymentManager.getDeploymentStatus(queueId);
    callback({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get deployment status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get deployment logs for an app
const getDeploymentLogs = async (data: { appName: string; limit?: number }, callback: (response: any) => void) => {
  try {
    const { appName, limit = 10 } = data;
    
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    const logs = await DeploymentManager.getDeploymentLogs(appName, limit);
    callback({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Get deployment logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete an app
const deleteApp = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    await DeploymentManager.deleteApp(appName);
    callback({
      success: true,
      message: `App ${appName} deleted successfully`
    });
  } catch (error) {
    console.error('Delete app error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stream deployment logs in real-time
const streamDeploymentLogs = (socket: Socket) => (data: { queueId: number }, callback: (response: any) => void) => {
  try {
    const { queueId } = data;
    
    if (!queueId) {
      callback({
        success: false,
        error: 'queueId is required'
      });
      return;
    }

    // Enable real-time streaming in the deployment manager
    DeploymentManager.enableStreamingForDeployment(queueId);

    // Store the streaming state for cleanup
    if (!socket.data.deploymentStreams) {
      socket.data.deploymentStreams = new Map();
    }
    socket.data.deploymentStreams.set(queueId, true);

    callback({
      success: true,
      message: `Started real-time streaming for deployment ${queueId}`
    });

    // Auto-cleanup when socket disconnects
    socket.on('disconnect', () => {
      if (socket.data.deploymentStreams && socket.data.deploymentStreams.has(queueId)) {
        DeploymentManager.disableStreamingForDeployment(queueId);
        socket.data.deploymentStreams.delete(queueId);
      }
    });

  } catch (error) {
    console.error('Stream deployment logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop streaming deployment logs
const stopStreamDeploymentLogs = (socket: Socket) => (data: { queueId: number }, callback: (response: any) => void) => {
  try {
    const { queueId } = data;
    
    if (!queueId) {
      callback({
        success: false,
        error: 'queueId is required'
      });
      return;
    }

    // Disable real-time streaming in the deployment manager
    DeploymentManager.disableStreamingForDeployment(queueId);

    if (socket.data.deploymentStreams && socket.data.deploymentStreams.has(queueId)) {
      socket.data.deploymentStreams.delete(queueId);
      
      callback({
        success: true,
        message: `Stopped streaming logs for deployment ${queueId}`
      });
    } else {
      callback({
        success: false,
        error: `No active log stream found for deployment ${queueId}`
      });
    }

  } catch (error) {
    console.error('Stop stream deployment logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  socket.on("deploy:from-git", deployFromGit);
  socket.on("deploy:from-file", deployFromFile);
  socket.on("deploy:redeploy", redeployApp);
  socket.on("deploy:queue-status", getQueueStatus);
  socket.on("deploy:status", getDeploymentStatus);
  socket.on("deploy:logs", getDeploymentLogs);
  socket.on("deploy:delete", deleteApp);
  socket.on("deploy:stream-logs", streamDeploymentLogs(socket));
  socket.on("deploy:stop-stream", stopStreamDeploymentLogs(socket));
}