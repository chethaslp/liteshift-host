import type { Server, Socket } from "socket.io";
import { dbHelpers } from "../lib/db";
import DeploymentManager from "../lib/deployment";
import envManager from "../lib/env";

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
  port?: number; // Optional port, will auto-generate if not provided
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
      autoDeploy = false,
      port
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

    const appPort = port || dbHelpers.generateUniquePort();

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
      status: 'stopped',
      port: appPort
    });

    const appId = result.lastInsertRowid as number;

    // Set PORT environment variable along with other env vars
    const finalEnvVars = {
      ...envVars,
      PORT: appPort.toString()
    };

    // Set environment variables if provided
    if (Object.keys(finalEnvVars).length > 0) {
      for (const [key, value] of Object.entries(finalEnvVars)) {
        dbHelpers.setAppEnvVar(appId, key, value);
      }
    }

    // Create environment file
    try {
      await envManager.createEnvFile(name);
    } catch (error) {
      console.error(`Failed to create environment file for ${name}:`, error);
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
          port: appPort,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        queueId
      },
      message: `App '${name}' created successfully on port ${appPort}${queueId ? ' and queued for deployment' : ''}`
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
          port: app.port,
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
  port?: number;
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
    if (updates.port !== undefined) dbUpdates.port = updates.port;

    if (Object.keys(dbUpdates).length === 0) {
      callback({
        success: false,
        error: 'No valid updates provided'
      });
      return;
    }

    // If port is being updated, also update the PORT environment variable
    if (updates.port !== undefined) {
      dbHelpers.setAppEnvVar(app.id, 'PORT', updates.port.toString());
    }

    dbHelpers.updateApp(app.id, dbUpdates);

    // Update environment file if PORT was changed
    if (updates.port !== undefined) {
      try {
        await envManager.updateEnvFile(appName);
      } catch (error) {
        console.error(`Failed to update environment file for ${appName}:`, error);
      }
    }

    // Get updated app data
    const updatedApp = dbHelpers.getAppByName(appName) as any;
    
    callback({
      success: true,
      data: {
        app: {
          id: updatedApp.id,
          name: updatedApp.name,
          repository_url: updatedApp.repository_url,
          branch: updatedApp.branch,
          build_command: updatedApp.build_command,
          install_command: updatedApp.install_command,
          start_command: updatedApp.start_command,
          runtime: updatedApp.runtime,
          port: updatedApp.port,
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

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

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

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

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

// Update app environment variable (alias for setAppEnvVar)
const updateAppEnvVar = async (data: {
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

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

    callback({
      success: true,
      message: `Environment variable '${key}' updated for app '${appName}'`
    });
  } catch (error) {
    console.error('Update app env var error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Add environment variable (alias for setAppEnvVar with different messaging)
const addAppEnvVar = async (data: {
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

    // Check if env var already exists
    const existingEnvVars = dbHelpers.getAppEnvVars(app.id) as any[];
    const existingVar = existingEnvVars.find(env => env.key === key);
    
    if (existingVar) {
      callback({
        success: false,
        error: `Environment variable '${key}' already exists for app '${appName}'. Use update instead.`
      });
      return;
    }

    dbHelpers.setAppEnvVar(app.id, key, value);

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

    callback({
      success: true,
      message: `Environment variable '${key}' added to app '${appName}'`
    });
  } catch (error) {
    console.error('Add app env var error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Set multiple environment variables at once
const setAppEnvVars = async (data: {
  appName: string;
  envVars: Record<string, string>;
}, callback: (response: any) => void) => {
  try {
    const { appName, envVars } = data;
    if (!appName || !envVars || typeof envVars !== 'object') {
      callback({
        success: false,
        error: 'appName and envVars object are required'
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

    const envVarKeys = Object.keys(envVars);
    if (envVarKeys.length === 0) {
      callback({
        success: false,
        error: 'At least one environment variable is required'
      });
      return;
    }

    // Set all environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (value === undefined || value === null) {
        callback({
          success: false,
          error: `Invalid value for environment variable '${key}'`
        });
        return;
      }
      dbHelpers.setAppEnvVar(app.id, key, value);
    }

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

    callback({
      success: true,
      message: `${envVarKeys.length} environment variable(s) set for app '${appName}': ${envVarKeys.join(', ')}`
    });
  } catch (error) {
    console.error('Set app env vars error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete multiple environment variables at once
const deleteAppEnvVars = async (data: {
  appName: string;
  keys: string[];
}, callback: (response: any) => void) => {
  try {
    const { appName, keys } = data;
    if (!appName || !keys || !Array.isArray(keys)) {
      callback({
        success: false,
        error: 'appName and keys array are required'
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

    if (keys.length === 0) {
      callback({
        success: false,
        error: 'At least one key is required'
      });
      return;
    }

    // Delete all specified environment variables
    const deletedKeys: string[] = [];
    const failedKeys: string[] = [];

    for (const key of keys) {
      try {
        dbHelpers.deleteAppEnvVar(app.id, key);
        deletedKeys.push(key);
      } catch (error) {
        failedKeys.push(key);
        console.error(`Failed to delete env var '${key}' for app '${appName}':`, error);
      }
    }

    // Update environment file
    try {
      await envManager.updateEnvFile(appName);
    } catch (error) {
      console.error(`Failed to update environment file for ${appName}:`, error);
    }

    if (failedKeys.length > 0) {
      callback({
        success: false,
        error: `Failed to delete some environment variables: ${failedKeys.join(', ')}`,
        data: {
          deleted: deletedKeys,
          failed: failedKeys
        }
      });
      return;
    }

    callback({
      success: true,
      message: `${deletedKeys.length} environment variable(s) deleted from app '${appName}': ${deletedKeys.join(', ')}`
    });
  } catch (error) {
    console.error('Delete app env vars error:', error);
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
  
  // Environment variable management - single operations
  socket.on("app:env:add", addAppEnvVar);
  socket.on("app:env:set", setAppEnvVar);
  socket.on("app:env:update", updateAppEnvVar);
  socket.on("app:env:delete", deleteAppEnvVar);
  
  // Environment variable management - batch operations
  socket.on("app:env:set-multiple", setAppEnvVars);
  socket.on("app:env:delete-multiple", deleteAppEnvVars);
};
