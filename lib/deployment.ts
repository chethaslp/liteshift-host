import { promises as fs } from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import simpleGit from 'simple-git';
import { dbHelpers } from './db';
import systemctlManager from './systemctl';
import caddyManager from './caddy';
import envManager from './env';
import type { Server } from 'socket.io';

const execAsync = promisify(exec);

export interface DeploymentOptions {
  appName: string;
  repository?: string;
  branch?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand: string;
  runtime?: 'node' | 'python' | 'bun';
  envVars?: Record<string, string>;
  filePath?: string; // For file uploads
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: number;
  message: string;
  log?: string;
}

export interface QueuedDeployment {
  id: number;
  type: 'git' | 'file';
  options: DeploymentOptions;
  fileBuffer?: Buffer;
  status: 'queued' | 'building' | 'completed' | 'failed';
  createdAt: Date;
}

class DeploymentManager {
  private appsDirectory: string;
  private isProcessing: boolean = false;
  private io: Server | null = null;
  private activeStreams: Map<number, boolean> = new Map();

  constructor() {
    this.appsDirectory = dbHelpers.getSetting('apps_directory') || '/var/www/apps';
    // Start processing queue on initialization
    this.processQueue();
  }

  // Set the Socket.IO server instance for real-time streaming
  setSocketServer(io: Server) {
    this.io = io;
  }

  // Check if streaming is active for a deployment
  isStreamingActive(queueId: number): boolean {
    return this.activeStreams.get(queueId) || false;
  }

  // Start streaming for a deployment
  startStreaming(queueId: number) {
    this.activeStreams.set(queueId, true);
  }

  // Execute command with real-time streaming
  private async executeCommandWithStreaming(
    command: string,
    options: { cwd: string },
    queueId: number | undefined,
    commandName: string
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('sh', ['-c', command], {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Stream stdout
      child.stdout.on('data', async (data) => {
        const output = data.toString();
        stdout += output;
        
        // Log and stream the output in real-time
        await this.logToQueue(queueId, output);
      });

      // Stream stderr
      child.stderr.on('data', async (data) => {
        const output = data.toString();
        stderr += output;
        
        // Log and stream the error output in real-time
        await this.logToQueue(queueId, output);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`${commandName} failed with exit code ${code}\n${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute ${commandName}: ${error.message}`));
      });
    });
  }

  // Stop streaming for a deployment
  stopStreaming(queueId: number) {
    this.activeStreams.set(queueId, false);
  }

  // Helper method to log deployment progress and emit real-time updates
  private async logToQueue(queueId: number | undefined, message: string) {
    if (queueId) {
      try {
        dbHelpers.appendQueueLogs(queueId, message);
        
        // Emit real-time update if streaming is active and Socket.IO is available
        if (this.io && this.isStreamingActive(queueId)) {
          const deployment = dbHelpers.getQueueItem(queueId) as any;
          this.io.emit('deploy:log-stream', {
            queueId,
            status: deployment?.status || 'building',
            logs: deployment?.logs || '',
            newMessage: message,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Failed to log to queue:', error);
      }
    }
  }

  // Queue management methods
  addToQueue(type: 'git' | 'file', options: DeploymentOptions, fileBuffer?: Buffer): { queueId: number; message: string } {
    // Store options as JSON string
    const optionsJson = JSON.stringify(options);
    
    const result = dbHelpers.createQueueItem(options.appName, type, optionsJson);
    const queueId = result.lastInsertRowid as number;
    
    // For file uploads, store the buffer temporarily in filesystem
    if (fileBuffer && type === 'file') {
      const tempDir = path.join(this.appsDirectory, '.temp');
      fs.mkdir(tempDir, { recursive: true }).catch(console.error);
      const tempFilePath = path.join(tempDir, `queue_${queueId}.zip`);
      fs.writeFile(tempFilePath, fileBuffer).catch(console.error);
    }

    // Start processing if not already processing
    if (!this.isProcessing) {
      setTimeout(() => this.processQueue(), 100);
    }

    return {
      queueId,
      message: `Deployment queued for ${options.appName}. Queue ID: ${queueId}`
    };
  }

  getQueueStatus(): any[] {
    return dbHelpers.getAllQueueItems();
  }

  getDeploymentStatus(queueId: number): any | null {
    return dbHelpers.getQueueItem(queueId);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;

    try {
      const queuedItems = dbHelpers.getQueuedItems() as any[];
      
      for (const item of queuedItems) {
        try {
          // Update status to building
          dbHelpers.updateQueueStatus(item.id, 'building');
          
          const options = JSON.parse(item.options);
          let result: DeploymentResult;
          
          if (item.type === 'git') {
            result = await this.deployFromGitInternal(options, item.id);
          } else {
            // For file deployments, read the temporary file
            const tempDir = path.join(this.appsDirectory, '.temp');
            const tempFilePath = path.join(tempDir, `queue_${item.id}.zip`);
            
            try {
              const fileBuffer = await fs.readFile(tempFilePath);
              result = await this.deployFromFileInternal(options, fileBuffer, item.id);
              
              // Clean up temporary file
              await fs.unlink(tempFilePath).catch(console.error);
            } catch (error) {
              throw new Error(`Failed to read temporary file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          // Update status based on result
          if (result.success) {
            dbHelpers.updateQueueStatus(item.id, 'completed');
          } else {
            dbHelpers.updateQueueStatus(item.id, 'failed', result.message);
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          dbHelpers.updateQueueStatus(item.id, 'failed', errorMessage);
          console.error(`Queue item ${item.id} failed:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing queue:', error);
    }

    this.isProcessing = false;
    
    // Check again in 5 seconds for new items
    setTimeout(() => this.processQueue(), 5000);
  }

  // Public methods that add to queue
  async deployFromGit(options: DeploymentOptions): Promise<{ queueId: number; message: string }> {
    return this.addToQueue('git', options);
  }

  async deployFromFile(options: DeploymentOptions, fileBuffer: Buffer): Promise<{ queueId: number; message: string }> {
    return this.addToQueue('file', options, fileBuffer);
  }

  // Internal methods that do the actual work (renamed from original methods)
  private async deployFromGitInternal(options: DeploymentOptions, queueId?: number): Promise<DeploymentResult> {
    const { appName, repository, branch = 'main', buildCommand, installCommand = 'npm install', startCommand, runtime = 'node', envVars = {} } = options;
    
    if (!repository) {
      throw new Error('Repository URL is required for Git deployment');
    }

    const appPath = path.join(this.appsDirectory, appName);
    let deploymentLog = '';
    
    // Create deployment record
    const deployment = dbHelpers.createDeployment((await this.getOrCreateApp(appName, repository, branch, startCommand, buildCommand, installCommand, runtime)).lastInsertRowid as number);
    const deploymentId = deployment.lastInsertRowid as number;

    try {
      const logMessage = `Starting deployment for ${appName} from ${repository}\n`;
      deploymentLog += logMessage;
      await this.logToQueue(queueId, logMessage);
      
      // Ensure apps directory exists
      await fs.mkdir(this.appsDirectory, { recursive: true });
      
      // Stop existing PM2 process if running
    //   try {
    //     await pm2Manager.stop(appName);
    //     deploymentLog += `Stopped existing ${appName} process\n`;
    //   } catch (error) {
    //     deploymentLog += `No existing process to stop\n`;
    //   }

      // Clean up existing directory if it exists
      try {
        await fs.rm(appPath, { recursive: true, force: true });
        const cleanupMessage = `Cleaned up existing directory\n`;
        deploymentLog += cleanupMessage;
        await this.logToQueue(queueId, cleanupMessage);
      } catch (error) {
        // Directory might not exist
      }

      // Clone repository
      const cloneMessage = `Cloning repository...\n`;
      deploymentLog += cloneMessage;
      await this.logToQueue(queueId, cloneMessage);
      const git = simpleGit();
      await git.clone(repository, appPath, ['--branch', branch, '--single-branch']);
      const clonedMessage = `Repository cloned successfully\n`;
      deploymentLog += clonedMessage;
      await this.logToQueue(queueId, clonedMessage);

      // Change to app directory for subsequent commands
      const appGit = simpleGit(appPath);
      const gitInfo = await appGit.log(['-1']);
      const commitMessage = `Latest commit: ${gitInfo.latest?.hash} - ${gitInfo.latest?.message}\n`;
      deploymentLog += commitMessage;
      await this.logToQueue(queueId, commitMessage);

      // Install dependencies
      if (installCommand) {
        const installStartMessage = `Running install command: ${installCommand}\n`;
        deploymentLog += installStartMessage;
        await this.logToQueue(queueId, installStartMessage);
        
        try {
          // Use streaming execution if we have streaming active, otherwise fallback to regular exec
          if (queueId && this.isStreamingActive(queueId)) {
            const { stdout: installOutput, stderr: installError } = await this.executeCommandWithStreaming(
              installCommand,
              { cwd: appPath },
              queueId,
              'install command'
            );
            deploymentLog += installOutput;
            if (installError) deploymentLog += installError;
          } else {
            const { stdout: installOutput, stderr: installError } = await execAsync(installCommand, { cwd: appPath });
            deploymentLog += installOutput;
            await this.logToQueue(queueId, installOutput);
            if (installError) {
              deploymentLog += installError;
              await this.logToQueue(queueId, installError);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Install command failed';
          deploymentLog += errorMessage;
          await this.logToQueue(queueId, errorMessage);
          throw error;
        }
        
        const installCompleteMessage = `Install command completed\n`;
        deploymentLog += installCompleteMessage;
        await this.logToQueue(queueId, installCompleteMessage);
      }

      // Build application
      if (buildCommand) {
        const buildStartMessage = `Running build command: ${buildCommand}\n`;
        deploymentLog += buildStartMessage;
        await this.logToQueue(queueId, buildStartMessage);
        
        try {
          // Use streaming execution if we have streaming active, otherwise fallback to regular exec
          if (queueId && this.isStreamingActive(queueId)) {
            const { stdout: buildOutput, stderr: buildError } = await this.executeCommandWithStreaming(
              buildCommand,
              { cwd: appPath },
              queueId,
              'build command'
            );
            deploymentLog += buildOutput;
            if (buildError) deploymentLog += buildError;
          } else {
            const { stdout: buildOutput, stderr: buildError } = await execAsync(buildCommand, { cwd: appPath });
            deploymentLog += buildOutput;
            await this.logToQueue(queueId, buildOutput);
            if (buildError) {
              deploymentLog += buildError;
              await this.logToQueue(queueId, buildError);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Build command failed';
          deploymentLog += errorMessage;
          await this.logToQueue(queueId, errorMessage);
          throw error;
        }
        
        const buildCompleteMessage = `Build command completed\n`;
        deploymentLog += buildCompleteMessage;
        await this.logToQueue(queueId, buildCompleteMessage);
      }

      // Set environment variables in database
      const app = dbHelpers.getAppByName(appName) as any;
      for (const [key, value] of Object.entries(envVars)) {
        dbHelpers.setAppEnvVar(app.id, key, value);
      }

      // Update environment file
      try {
        await envManager.updateEnvFile(appName);
        const envFileMessage = `Environment file updated\n`;
        deploymentLog += envFileMessage;
        await this.logToQueue(queueId, envFileMessage);
      } catch (error) {
        const envErrorMessage = `Warning: Failed to update environment file: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        deploymentLog += envErrorMessage;
        await this.logToQueue(queueId, envErrorMessage);
      }

      // Get all env vars for this app
      const allEnvVars = dbHelpers.getAppEnvVars(app.id) as any[];
      const envObject: Record<string, string> = {};
      allEnvVars.forEach(env => {
        envObject[env.key] = env.value;
      });

      // Start application with systemctl
      const systemctlStartMessage = `Starting application with systemctl using ${runtime} runtime...\n`;
      deploymentLog += systemctlStartMessage;
      await this.logToQueue(queueId, systemctlStartMessage);
      
      // Create systemd service
      await systemctlManager.createService(appName, {
        scriptPath: startCommand,
        cwd: appPath,
        env: envObject,
        runtime: runtime,
        description: `LiteShift app: ${appName}`,
        user: 'root'
      });
      
      // Start and enable the service
      await systemctlManager.start(appName);
      await systemctlManager.enable(appName);

      const systemctlStartedMessage = `Application started successfully with systemctl\n`;
      deploymentLog += systemctlStartedMessage;
      await this.logToQueue(queueId, systemctlStartedMessage);

      // Update app status in database
      dbHelpers.updateApp(app.id, { 
        status: 'running',
        deploy_path: appPath
      });

      const serviceCreatedMessage = `Systemctl service created and enabled\n`;
      deploymentLog += serviceCreatedMessage;
      await this.logToQueue(queueId, serviceCreatedMessage);

      // Update Caddy configuration if domains are configured
      const domains = dbHelpers.getAppDomains(app.id);
      if (domains && (domains as any[]).length > 0) {
        const caddyUpdateMessage = `Updating Caddy configuration...\n`;
        deploymentLog += caddyUpdateMessage;
        await this.logToQueue(queueId, caddyUpdateMessage);
        
        await caddyManager.writeCaddyfile();
        await caddyManager.reloadCaddy();
        
        const caddyUpdatedMessage = `Caddy configuration updated\n`;
        deploymentLog += caddyUpdatedMessage;
        await this.logToQueue(queueId, caddyUpdatedMessage);
      }

      // Update deployment status
      dbHelpers.updateDeployment(deploymentId, 'success', deploymentLog);

      const completionMessage = `✅ Deployment completed successfully!\n`;
      await this.logToQueue(queueId, completionMessage);

      // Emit completion status for real-time streaming
      if (queueId) {
        this.emitDeploymentComplete(queueId, 'completed');
      }

      return {
        success: true,
        deploymentId,
        message: `${appName} deployed successfully from Git`,
        log: deploymentLog
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorLog = `\n❌ Error: ${errorMessage}\n`;
      deploymentLog += errorLog;
      await this.logToQueue(queueId, errorLog);
      
      // Update deployment status
      dbHelpers.updateDeployment(deploymentId, 'failed', deploymentLog);

      // Emit failure status for real-time streaming
      if (queueId) {
        this.emitDeploymentComplete(queueId, 'failed');
      }

      return {
        success: false,
        deploymentId,
        message: `Deployment failed: ${errorMessage}`,
        log: deploymentLog
      };
    }
  }

  private async deployFromFileInternal(options: DeploymentOptions, fileBuffer: Buffer, queueId?: number): Promise<DeploymentResult> {
    const { appName, startCommand, buildCommand, installCommand = 'npm install', runtime = 'node', envVars = {} } = options;
    
    const appPath = path.join(this.appsDirectory, appName);
    let deploymentLog = '';
    
    // Create deployment record
    const app = await this.getOrCreateApp(appName, null, 'main', startCommand, buildCommand, installCommand, runtime);
    const deployment = dbHelpers.createDeployment(app.lastInsertRowid as number);
    const deploymentId = deployment.lastInsertRowid as number;

    try {
      deploymentLog += `Starting file deployment for ${appName}\n`;
      
      // Ensure apps directory exists
      await fs.mkdir(this.appsDirectory, { recursive: true });
      
      // Stop existing systemctl service if running
      try {
        await systemctlManager.stop(appName);
        deploymentLog += `Stopped existing ${appName} service\n`;
      } catch (error) {
        deploymentLog += `No existing service to stop\n`;
      }

      // Clean up existing directory
      try {
        await fs.rm(appPath, { recursive: true, force: true });
        deploymentLog += `Cleaned up existing directory\n`;
      } catch (error) {
        // Directory might not exist
      }

      // Create app directory
      await fs.mkdir(appPath, { recursive: true });

      // Extract uploaded file (assuming it's a zip file)
      const tempFilePath = path.join(appPath, 'upload.zip');
      await fs.writeFile(tempFilePath, fileBuffer);
      
      deploymentLog += `File uploaded successfully\n`;

      // Extract zip file
      await execAsync(`unzip -q "${tempFilePath}" -d "${appPath}"`);
      await fs.unlink(tempFilePath);
      deploymentLog += `Files extracted successfully\n`;

      // Find package.json or main script in extracted files
      const files = await fs.readdir(appPath);
      const possibleMainDir = files.find(file => file !== 'upload.zip');
      
      if (possibleMainDir && files.length === 1) {
        // If there's only one directory, move its contents up
        const mainDirPath = path.join(appPath, possibleMainDir);
        const stat = await fs.stat(mainDirPath);
        
        if (stat.isDirectory()) {
          const innerFiles = await fs.readdir(mainDirPath);
          for (const file of innerFiles) {
            await fs.rename(
              path.join(mainDirPath, file),
              path.join(appPath, file)
            );
          }
          await fs.rmdir(mainDirPath);
          deploymentLog += `Moved files from subdirectory\n`;
        }
      }

      // Install dependencies
      if (installCommand) {
        deploymentLog += `Running install command: ${installCommand}\n`;
        try {
          // Use streaming execution if we have streaming active, otherwise fallback to regular exec
          if (queueId && this.isStreamingActive(queueId)) {
            const { stdout: installOutput, stderr: installError } = await this.executeCommandWithStreaming(
              installCommand,
              { cwd: appPath },
              queueId,
              'install command'
            );
            deploymentLog += installOutput;
            if (installError) deploymentLog += installError;
          } else {
            const { stdout: installOutput, stderr: installError } = await execAsync(installCommand, { cwd: appPath });
            deploymentLog += installOutput;
            if (installError) deploymentLog += installError;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Install command failed';
          deploymentLog += errorMessage;
          throw error;
        }
      }

      // Build application
      if (buildCommand) {
        deploymentLog += `Running build command: ${buildCommand}\n`;
        try {
          // Use streaming execution if we have streaming active, otherwise fallback to regular exec
          if (queueId && this.isStreamingActive(queueId)) {
            const { stdout: buildOutput, stderr: buildError } = await this.executeCommandWithStreaming(
              buildCommand,
              { cwd: appPath },
              queueId,
              'build command'
            );
            deploymentLog += buildOutput;
            if (buildError) deploymentLog += buildError;
          } else {
            const { stdout: buildOutput, stderr: buildError } = await execAsync(buildCommand, { cwd: appPath });
            deploymentLog += buildOutput;
            if (buildError) deploymentLog += buildError;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Build command failed';
          deploymentLog += errorMessage;
          throw error;
        }
      }

      // Set environment variables
      const appRecord = dbHelpers.getAppByName(appName) as any;
      for (const [key, value] of Object.entries(envVars)) {
        dbHelpers.setAppEnvVar(appRecord.id, key, value);
      }

      // Update environment file
      try {
        await envManager.updateEnvFile(appName);
        deploymentLog += `Environment file updated\n`;
      } catch (error) {
        deploymentLog += `Warning: Failed to update environment file: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
      }

      // Get all env vars for this app
      const allEnvVars = dbHelpers.getAppEnvVars(appRecord.id) as any[];
      const envObject: Record<string, string> = {};
      allEnvVars.forEach(env => {
        envObject[env.key] = env.value;
      });

      // Start application with systemctl
      deploymentLog += `Starting application with systemctl using ${runtime} runtime...\n`;
      
      // Create systemd service
      await systemctlManager.createService(appName, {
        scriptPath: startCommand,
        cwd: appPath,
        env: envObject,
        runtime: runtime,
        description: `LiteShift app: ${appName}`,
        user: 'www-data'
      });
      
      // Start and enable the service
      await systemctlManager.start(appName);
      await systemctlManager.enable(appName);

      // Update app status
      dbHelpers.updateApp(appRecord.id, { 
        status: 'running',
        deploy_path: appPath
      });

      deploymentLog += `Systemctl service created and enabled\n`;

      // Update Caddy if needed
      const domains = dbHelpers.getAppDomains(appRecord.id);
      if (domains && (domains as any[]).length > 0) {
        await caddyManager.writeCaddyfile();
        await caddyManager.reloadCaddy();
        deploymentLog += `Caddy configuration updated\n`;
      }

      // Update deployment status
      dbHelpers.updateDeployment(deploymentId, 'success', deploymentLog);

      // Emit completion status for real-time streaming
      if (queueId) {
        this.emitDeploymentComplete(queueId, 'completed');
      }

      return {
        success: true,
        deploymentId,
        message: `${appName} deployed successfully from file`,
        log: deploymentLog
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      deploymentLog += `\nError: ${errorMessage}\n`;
      
      dbHelpers.updateDeployment(deploymentId, 'failed', deploymentLog);

      // Emit failure status for real-time streaming
      if (queueId) {
        this.emitDeploymentComplete(queueId, 'failed');
      }

      return {
        success: false,
        deploymentId,
        message: `Deployment failed: ${errorMessage}`,
        log: deploymentLog
      };
    }
  }

  private async getOrCreateApp(name: string, repository: string | null, branch: string, startCommand: string, buildCommand?: string, installCommand?: string, runtime: 'node' | 'python' | 'bun' = 'node', port?: number) {
    const app = dbHelpers.getAppByName(name);

    if (!app) {
      // Create new app
      const appPath = path.join(this.appsDirectory, name);
      const result = dbHelpers.createApp({
        name,
        repository_url: repository,
        branch,
        deploy_path: appPath,
        start_command: startCommand,
        build_command: buildCommand,
        install_command: installCommand,
        runtime,
        port: port || dbHelpers.generateUniquePort(),
      });

      // Create environment file for the new app
      try {
        await envManager.createEnvFile(name);
      } catch (error) {
        console.error(`Failed to create environment file for ${name}:`, error);
      }

      return result;
    }
    
    // Update existing app
    const updates: any = {
      start_command: startCommand,
      runtime
    };
    
    if (repository) updates.repository_url = repository;
    if (branch) updates.branch = branch;
    if (buildCommand !== undefined) updates.build_command = buildCommand;
    if (installCommand !== undefined) updates.install_command = installCommand;
    
    dbHelpers.updateApp((app as any).id, updates);
    
    return { lastInsertRowid: (app as any).id };
  }

  async redeploy(appName: string): Promise<{ queueId: number; message: string }> {
    const app = dbHelpers.getAppByName(appName) as any;
    
    if (!app) {
      throw new Error(`App ${appName} not found`);
    }

    if (!app.repository_url) {
      throw new Error(`App ${appName} was not deployed from Git and cannot be redeployed`);
    }

    // Get existing environment variables
    const envVars = dbHelpers.getAppEnvVars(app.id) as any[];
    const envObject: Record<string, string> = {};
    envVars.forEach(env => {
      envObject[env.key] = env.value;
    });

    return this.deployFromGit({
      appName,
      repository: app.repository_url,
      branch: app.branch,
      buildCommand: app.build_command,
      installCommand: app.install_command,
      startCommand: app.start_command,
      runtime: app.runtime || 'node',
      envVars: envObject
    });
  }

  async getDeploymentLogs(appName: string, limit: number = 10) {
    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      throw new Error(`App ${appName} not found`);
    }

    return dbHelpers.getAppDeployments(app.id, limit);
  }

  async deleteApp(appName: string): Promise<void> {
    const app = dbHelpers.getAppByName(appName) as any;
    if (!app) {
      throw new Error(`App ${appName} not found`);
    }

    try {
      // Stop and delete systemctl service
      await systemctlManager.deleteService(appName);
    } catch (error) {
      // Service might not exist
      console.log(`No systemctl service found for ${appName}`);
    }

    // Remove app directory
    const appPath = path.join(this.appsDirectory, appName);
    try {
      await fs.rm(appPath, { recursive: true, force: true });
    } catch (error) {
      console.log(`Could not remove directory ${appPath}`);
    }

    // Remove environment file
    try {
      await envManager.deleteEnvFile(appName);
    } catch (error) {
      console.log(`Could not remove environment file for ${appName}:`, error);
    }

    // Remove from database (this will cascade to domains, env vars, etc.)
    dbHelpers.deleteApp(app.id);

    // Update Caddy configuration
    await caddyManager.writeCaddyfile();
    await caddyManager.reloadCaddy();
  }

  // Public methods for streaming control
  enableStreamingForDeployment(queueId: number) {
    this.startStreaming(queueId);
  }

  disableStreamingForDeployment(queueId: number) {
    this.stopStreaming(queueId);
  }

  // Method to emit completion status
  private emitDeploymentComplete(queueId: number, status: 'completed' | 'failed') {
    if (this.io && this.isStreamingActive(queueId)) {
      this.io.emit('deploy:log-stream-end', {
        queueId,
        finalStatus: status
      });
      this.stopStreaming(queueId);
    }
  }
}

export default new DeploymentManager();
