import type { Server, Socket } from "socket.io";
import { dbHelpers } from "../lib/db";
import DeploymentManager from "../lib/deployment";

// Create a new app
const createApp = async (data: {
  name: string;
  repository?: string;
  branch?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand: string;
  runtime?: 'node' | 'python' | 'bun';
  envVars?: Record<string, string>;
  autoDeploy?: boolean; // Whether to automatically queue for deployment
}, callback: (response: any) => void) => {
  try {
    const {
      name,
      repository,
      branch = 'main',
      startCommand,
      buildCommand,
      installCommand = 'npm install',
      runtime = 'node',
      envVars = {},
      autoDeploy = false
    } = data;

    if (!name || !startCommand) {
      callback({
        success: false,
        error: 'name and startCommand are required'
      });
      return;
    }

    // Check if app already exists
    const existingApp = dbHelpers.getAppByName(name);
    if (existingApp) {
      callback({
        success: false,
        error: `App with name '${name}' already exists`
      });
      return;
    }

    // Generate deploy path
    const appsDirectory = dbHelpers.getSetting('apps_directory') || '/var/www/apps';
    const deployPath = `${appsDirectory}/${name}`;

    // Create app in database
    const result = dbHelpers.createApp({
      name,
      repository_url: repository || null,
      branch,
      deploy_path: deployPath,
      start_command: startCommand,
      build_command: buildCommand || null,
      install_command: installCommand,
      runtime,
      status: 'stopped'
    });

    const appId = result.lastInsertRowid as number;

    // Set environment variables if provided
    if (Object.keys(envVars).length > 0) {
      for (const [key, value] of Object.entries(envVars)) {
        dbHelpers.setAppEnvVar(appId, key, value);
      }
    }

    let queueId = null;

    // If repository is provided and autoDeploy is true, add to deployment queue
    if (repository && autoDeploy) {
      try {
        const deploymentResult = await DeploymentManager.deployFromGit({
          appName: name,
          repository,
          branch,
          buildCommand,
          installCommand,
          startCommand,
          runtime,
          envVars
        });

        queueId = deploymentResult.queueId;
      } catch (error) {
        console.error('Failed to queue deployment:', error);
        // Don't fail the app creation if deployment queuing fails
      }
    }

    callback({
      success: true,
      data: {
        app: {
          id: appId,
          name,
          repository: repository || null,
          branch,
          build_command: buildCommand || null,
          install_command: installCommand,
          start_command: startCommand,
          runtime,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        queueId
      },
      message: `App '${name}' created successfully${queueId ? ' and queued for deployment' : ''}`
    });
  } catch (error) {
    console.error('Create app error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get all apps
const getAllApps = async (data: {}, callback: (response: any) => void) => {
  try {
    const apps = dbHelpers.getAllApps();
    callback({
      success: true,
      data: apps
    });
  } catch (error) {
    console.error('Get all apps error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get app by name
const getAppByName = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    callback({
      success: true,
      data: { 
        app: {
          id: app.id,
          name: app.name,
          repository_url: app.repository_url,
          branch: app.branch,
          build_command: app.build_command,
          install_command: app.install_command,
          start_command: app.start_command,
          runtime: app.runtime,
          created_at: app.created_at,
          updated_at: app.updated_at
        }
      }
    });
  } catch (error) {
    console.error('Get app by name error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Update app
const updateApp = async (data: {
  appName: string;
  repository?: string;
  branch?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  runtime?: 'node' | 'python' | 'bun';
}, callback: (response: any) => void) => {
  try {
    const { appName, ...updates } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName is required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    // Map frontend parameter names to database column names
    const dbUpdates: any = {};
    if (updates.repository !== undefined) dbUpdates.repository_url = updates.repository;
    if (updates.branch !== undefined) dbUpdates.branch = updates.branch;
    if (updates.buildCommand !== undefined) dbUpdates.build_command = updates.buildCommand;
    if (updates.installCommand !== undefined) dbUpdates.install_command = updates.installCommand;
    if (updates.startCommand !== undefined) dbUpdates.start_command = updates.startCommand;
    if (updates.runtime !== undefined) dbUpdates.runtime = updates.runtime;

    if (Object.keys(dbUpdates).length === 0) {
      callback({
        success: false,
        error: 'No valid updates provided'
      });
      return;
    }

    dbHelpers.updateApp(app.id, dbUpdates);

    // Get updated app data
    const updatedApp = dbHelpers.getAppByName(appName) as any;
    
    callback({
      success: true,
      data: {
        app: {
          id: updatedApp.id,
          name: updatedApp.name,
          repository: updatedApp.repository_url,
          branch: updatedApp.branch,
          build_command: updatedApp.build_command,
          install_command: updatedApp.install_command,
          start_command: updatedApp.start_command,
          runtime: updatedApp.runtime,
          created_at: updatedApp.created_at,
          updated_at: updatedApp.updated_at
        }
      },
      message: `App '${appName}' updated successfully`
    });
  } catch (error) {
    console.error('Update app error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete app
const deleteApp = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    // Use the deployment manager's delete method which handles systemctl cleanup
    await DeploymentManager.deleteApp(appName);

    callback({
      success: true,
      message: `App '${appName}' deleted successfully`
    });
  } catch (error) {
    console.error('Delete app error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get app domains
const getAppDomains = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    const domains = dbHelpers.getAppDomains(app.id);
    callback({
      success: true,
      data: { domains }
    });
  } catch (error) {
    console.error('Get app domains error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get app environment variables
const getAppEnvVars = async (data: { appName: string }, callback: (response: any) => void) => {
  try {
    const { appName } = data;
    if (!appName) {
      callback({
        success: false,
        error: 'appName parameter is required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    const envVars = dbHelpers.getAppEnvVars(app.id);
    callback({
      success: true,
      data: { envVars }
    });
  } catch (error) {
    console.error('Get app env vars error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Set app environment variable
const setAppEnvVar = async (data: {
  appName: string;
  key: string;
  value: string;
}, callback: (response: any) => void) => {
  try {
    const { appName, key, value } = data;
    if (!appName || !key || value === undefined) {
      callback({
        success: false,
        error: 'appName, key, and value are required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    dbHelpers.setAppEnvVar(app.id, key, value);

    callback({
      success: true,
      message: `Environment variable '${key}' set for app '${appName}'`
    });
  } catch (error) {
    console.error('Set app env var error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete app environment variable
const deleteAppEnvVar = async (data: {
  appName: string;
  key: string;
}, callback: (response: any) => void) => {
  try {
    const { appName, key } = data;
    if (!appName || !key) {
      callback({
        success: false,
        error: 'appName and key are required'
      });
      return;
    }

    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      callback({
        success: false,
        error: `App '${appName}' not found`
      });
      return;
    }

    dbHelpers.deleteAppEnvVar(app.id, key);

    callback({
      success: true,
      message: `Environment variable '${key}' deleted from app '${appName}'`
    });
  } catch (error) {
    console.error('Delete app env var error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  // App management
  socket.on("app:create", createApp);
  socket.on("app:list", getAllApps);
  socket.on("app:get", getAppByName);
  socket.on("app:update", updateApp);
  socket.on("app:delete", deleteApp);
  
  // App details
  socket.on("app:domains:list", getAppDomains);
  socket.on("app:env:list", getAppEnvVars);
  socket.on("app:env:set", setAppEnvVar);
  socket.on("app:env:delete", deleteAppEnvVar);
};
