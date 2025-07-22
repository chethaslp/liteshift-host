import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type Runtime = 'node' | 'python' | 'bun';

export interface SystemctlProcess {
  name: string;
  status: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating' | 'unknown';
  enabled: boolean;
  description: string;
  runtime: Runtime;
  cwd?: string;
  env?: Record<string, string>;
  // Enhanced status information from systemctl show and status
  loaded?: {
    state: 'loaded' | 'not-found' | 'bad-setting' | 'error' | 'masked';
    path: string;
    enabled: 'enabled' | 'disabled' | 'static' | 'masked';
    preset: 'enabled' | 'disabled';
  };
  active?: {
    state: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
    subState: string;
    since: string;
    duration: string;
  };
  mainPid?: {
    pid: number;
    command: string;
  };
  tasks?: {
    current: number;
    limit: number;
  };
  memory?: {
    current: string;
    peak?: string;
    currentBytes?: number;
    peakBytes?: number;
  };
  cpu?: {
    usage: string;
    usageNSec?: number;
  };
  cgroup?: {
    path: string;
    processes: Array<{
      pid: number;
      command: string;
    }>;
  };
}

class SystemctlManager {
  private servicesDirectory: string = '/etc/systemd/system';

  constructor() {
    // Ensure we can write to systemd directory (requires sudo)
  }

  // Create a systemd service file for an application
  async createService(appName: string, options: {
    scriptPath: string;
    cwd?: string;
    env?: Record<string, string>;
    runtime?: Runtime;
    description?: string;
    user?: string;
  }): Promise<void> {
    const {
      scriptPath,
      cwd = process.cwd(),
      env = {},
      runtime = 'node',
      description = `LiteShift app: ${appName}`,
      user = 'www-data'
    } = options;

    const serviceName = `liteshift-${appName}.service`;
    const servicePath = path.join(this.servicesDirectory, serviceName);

    // Get the correct interpreter based on runtime
    const interpreter = this.getInterpreter(runtime);
    
    // Build environment variables string
    const envVars = Object.entries(env)
      .map(([key, value]) => `Environment="${key}=${value}"`)
      .join('\n');

    // Create systemd service content
    const serviceContent = `[Unit]
Description=${description}
After=network.target
Wants=network.target

[Service]
Type=simple
User=${user}
Group=${user}
WorkingDirectory=${cwd}
ExecStart=${interpreter} ${scriptPath}
${envVars}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=liteshift-${appName}

[Install]
WantedBy=multi-user.target
`;

    try {
      // Write service file (requires sudo)
      await execAsync(`echo '${serviceContent}' | sudo tee ${servicePath}`);
      
      // Set proper permissions
      await execAsync(`sudo chmod 644 ${servicePath}`);
      
      // Reload systemd daemon
      await execAsync('sudo systemctl daemon-reload');
      
      console.log(`Created systemd service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to create service ${serviceName}:`, error);
      throw error;
    }
  }

  // Start a service
  async start(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      await execAsync(`sudo systemctl start ${serviceName}`);
      console.log(`Started service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to start service ${serviceName}:`, error);
      throw error;
    }
  }

  // Stop a service
  async stop(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      await execAsync(`sudo systemctl stop ${serviceName}`);
      console.log(`Stopped service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to stop service ${serviceName}:`, error);
      throw error;
    }
  }

  // Restart a service
  async restart(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      await execAsync(`sudo systemctl restart ${serviceName}`);
      console.log(`Restarted service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to restart service ${serviceName}:`, error);
      throw error;
    }
  }

  // Enable a service (auto-start on boot)
  async enable(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      await execAsync(`sudo systemctl enable ${serviceName}`);
      console.log(`Enabled service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to enable service ${serviceName}:`, error);
      throw error;
    }
  }

  // Disable a service
  async disable(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      await execAsync(`sudo systemctl disable ${serviceName}`);
      console.log(`Disabled service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to disable service ${serviceName}:`, error);
      throw error;
    }
  }

  // Get service status
  async getStatus(appName: string): Promise<SystemctlProcess> {
    const serviceName = `liteshift-${appName}.service`;
    
    try {
      // Get basic status
      const { stdout: statusOutput } = await execAsync(`systemctl is-active ${serviceName}`);
      const status = statusOutput.trim() as 'active' | 'inactive' | 'failed' | 'activating';
      
      // Check if enabled
      const { stdout: enabledOutput } = await execAsync(`systemctl is-enabled ${serviceName}`);
      const enabled = enabledOutput.trim() === 'enabled';
      
      // Get detailed service information
      const { stdout: showOutput } = await execAsync(`systemctl show ${serviceName}`);
      const properties = this.parseSystemctlShow(showOutput);
      
      // Get detailed status output for parsing
      let detailedStatus = null;
      try {
        const { stdout: detailedStatusOutput } = await execAsync(`systemctl status ${serviceName}`);
        detailedStatus = this.parseSystemctlStatus(detailedStatusOutput);
      } catch (error) {
        console.warn(`Could not get detailed status for ${serviceName}:`, error);
      }
      
      const result: SystemctlProcess = {
        name: appName,
        status: status || 'unknown',
        enabled,
        description: properties.Description || `LiteShift app: ${appName}`,
        runtime: this.detectRuntime(properties.ExecStart || ''),
        cwd: properties.WorkingDirectory
      };

      // Add enhanced status information
      if (properties.LoadState) {
        result.loaded = {
          state: properties.LoadState as any,
          path: properties.FragmentPath || '',
          enabled: properties.UnitFileState as any || (enabled ? 'enabled' : 'disabled'),
          preset: properties.UnitFilePreset as any || 'enabled'
        };
      }

      if (properties.ActiveState) {
        result.active = {
          state: properties.ActiveState as any,
          subState: properties.SubState || '',
          since: properties.ActiveEnterTimestamp || '',
          duration: this.calculateDuration(properties.ActiveEnterTimestamp)
        };
      }

      if (properties.MainPID && properties.MainPID !== '0') {
        result.mainPid = {
          pid: parseInt(properties.MainPID),
          command: properties.ExecMainStartTimestamp ? this.extractCommand(properties.ExecStart) : 'unknown'
        };
      }

      // Parse memory information
      if (properties.MemoryCurrent && properties.MemoryCurrent !== '[not set]') {
        const memoryBytes = parseInt(properties.MemoryCurrent);
        result.memory = {
          current: this.formatBytes(memoryBytes),
          currentBytes: memoryBytes
        };

        if (properties.MemoryPeak && properties.MemoryPeak !== '[not set]') {
          const peakBytes = parseInt(properties.MemoryPeak);
          result.memory.peak = this.formatBytes(peakBytes);
          result.memory.peakBytes = peakBytes;
        }
      }

      // Parse CPU information
      if (properties.CPUUsageNSec && properties.CPUUsageNSec !== '[not set]') {
        const cpuNSec = parseInt(properties.CPUUsageNSec);
        result.cpu = {
          usage: this.formatCPUTime(cpuNSec),
          usageNSec: cpuNSec
        };
      }

      // Parse tasks information
      if (properties.TasksCurrent && properties.TasksMax) {
        result.tasks = {
          current: parseInt(properties.TasksCurrent) || 0,
          limit: properties.TasksMax === 'infinity' ? 0 : parseInt(properties.TasksMax) || 0
        };
      }

      // Add detailed status parsing if available
      if (detailedStatus) {
        if (detailedStatus.loaded) result.loaded = { ...result.loaded, ...detailedStatus.loaded };
        if (detailedStatus.active) result.active = { ...result.active, ...detailedStatus.active };
        if (detailedStatus.mainPid) result.mainPid = detailedStatus.mainPid;
        if (detailedStatus.tasks) result.tasks = detailedStatus.tasks;
        if (detailedStatus.memory) result.memory = { ...result.memory, ...detailedStatus.memory };
        if (detailedStatus.cpu) result.cpu = detailedStatus.cpu;
        if (detailedStatus.cgroup) result.cgroup = detailedStatus.cgroup;
      }
      
      return result;
      
    } catch (error) {
      console.error(`Failed to get status for service ${serviceName}:`, error);
      return {
        name: appName,
        status: 'unknown',
        enabled: false,
        description: `LiteShift app: ${appName}`,
        runtime: 'node'
      };
    }
  }

  // List all LiteShift services
  async list(): Promise<SystemctlProcess[]> {
    try {
      const { stdout } = await execAsync('systemctl list-units --type=service --all | grep liteshift-');
      const services: SystemctlProcess[] = [];
      
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.includes('liteshift-')) {
          const match = line.match(/liteshift-(.+?)\.service/);
          if (match) {
            const appName = match[1];
            const status = await this.getStatus(appName);
            services.push(status);
          }
        }
      }
      
      return services;
    } catch (error) {
      console.error('Failed to list services:', error);
      return [];
    }
  }

  // Get service logs
  async getLogs(appName: string, options: {
    lines?: number;
    follow?: boolean;
    since?: string;
  } = {}): Promise<string> {
    const serviceName = `liteshift-${appName}.service`;
    const { lines = 100, follow = false, since } = options;
    
    try {
      let command = `journalctl -u ${serviceName}`;
      
      if (lines) {
        command += ` -n ${lines}`;
      }
      
      if (since) {
        command += ` --since="${since}"`;
      }
      
      if (follow) {
        command += ' -f';
      }
      
      const { stdout } = await execAsync(command);
      return stdout;
    } catch (error) {
      console.error(`Failed to get logs for service ${serviceName}:`, error);
      throw error;
    }
  }

  // Delete a service
  async deleteService(appName: string): Promise<void> {
    const serviceName = `liteshift-${appName}.service`;
    const servicePath = path.join(this.servicesDirectory, serviceName);
    
    try {
      // Stop and disable the service first
      await this.stop(appName).catch(() => {}); // Ignore errors if already stopped
      await this.disable(appName).catch(() => {}); // Ignore errors if not enabled
      
      // Remove service file
      await execAsync(`sudo rm -f ${servicePath}`);
      
      // Reload systemd daemon
      await execAsync('sudo systemctl daemon-reload');
      
      console.log(`Deleted service: ${serviceName}`);
    } catch (error) {
      console.error(`Failed to delete service ${serviceName}:`, error);
      throw error;
    }
  }

  // Private helper methods
  private getInterpreter(runtime: Runtime): string {
    switch (runtime) {
      case 'python':
        return 'python3';
      case 'bun':
        return 'bun';
      case 'node':
      default:
        return 'npm';
    }
  }

  private detectRuntime(execStart: string): Runtime {
    if (execStart.includes('python')) return 'python';
    if (execStart.includes('bun')) return 'bun';
    return 'node';
  }

  private parseSystemctlShow(output: string): Record<string, string> {
    const properties: Record<string, string> = {};
    
    output.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        properties[key] = valueParts.join('=');
      }
    });
    
    return properties;
  }

  // Parse systemctl status output for detailed information
  private parseSystemctlStatus(output: string): Partial<SystemctlProcess> {
    const result: Partial<SystemctlProcess> = {};
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse Loaded line
      if (trimmed.startsWith('Loaded:')) {
        const loadedMatch = trimmed.match(/Loaded:\s+(\w+)\s+\(([^;]+);\s*(\w+);\s*preset:\s*(\w+)/);
        if (loadedMatch) {
          result.loaded = {
            state: loadedMatch[1] as any,
            path: loadedMatch[2],
            enabled: loadedMatch[3] as any,
            preset: loadedMatch[4] as any
          };
        }
      }

      // Parse Active line
      if (trimmed.startsWith('Active:')) {
        const activeMatch = trimmed.match(/Active:\s+(\w+)\s+\((\w+)\)\s+since\s+(.+?);\s*(.+)/);
        if (activeMatch) {
          result.active = {
            state: activeMatch[1] as any,
            subState: activeMatch[2],
            since: activeMatch[3],
            duration: activeMatch[4]
          };
        }
      }

      // Parse Main PID line
      if (trimmed.startsWith('Main PID:')) {
        const pidMatch = trimmed.match(/Main PID:\s+(\d+)\s+\((.+?)\)/);
        if (pidMatch) {
          result.mainPid = {
            pid: parseInt(pidMatch[1]),
            command: pidMatch[2]
          };
        }
      }

      // Parse Tasks line
      if (trimmed.startsWith('Tasks:')) {
        const tasksMatch = trimmed.match(/Tasks:\s+(\d+)\s+\(limit:\s*(\d+|infinity)\)/);
        if (tasksMatch) {
          result.tasks = {
            current: parseInt(tasksMatch[1]),
            limit: tasksMatch[2] === 'infinity' ? 0 : parseInt(tasksMatch[2])
          };
        }
      }

      // Parse Memory line
      if (trimmed.startsWith('Memory:')) {
        const memoryMatch = trimmed.match(/Memory:\s+([0-9.]+[KMGT]?)\s*(?:\(peak:\s*([0-9.]+[KMGT]?)\))?/);
        if (memoryMatch) {
          result.memory = {
            current: memoryMatch[1],
            currentBytes: this.parseMemoryToBytes(memoryMatch[1])
          };
          if (memoryMatch[2]) {
            result.memory.peak = memoryMatch[2];
            result.memory.peakBytes = this.parseMemoryToBytes(memoryMatch[2]);
          }
        }
      }

      // Parse CPU line
      if (trimmed.startsWith('CPU:')) {
        const cpuMatch = trimmed.match(/CPU:\s+([0-9.]+[a-z]*)/);
        if (cpuMatch) {
          result.cpu = {
            usage: cpuMatch[1]
          };
        }
      }

      // Parse CGroup processes (basic parsing)
      if (trimmed.startsWith('├─') || trimmed.startsWith('└─')) {
        if (!result.cgroup) {
          result.cgroup = {
            path: '/system.slice/' + (result.loaded?.path?.split('/').pop() || 'unknown.service'),
            processes: []
          };
        }
        
        const processMatch = trimmed.match(/[├└]─(\d+)\s+(.+)/);
        if (processMatch) {
          result.cgroup.processes.push({
            pid: parseInt(processMatch[1]),
            command: processMatch[2]
          });
        }
      }
    }

    return result;
  }

  // Helper method to format bytes
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G', 'T'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  // Helper method to parse memory string to bytes
  private parseMemoryToBytes(memStr: string): number {
    const match = memStr.match(/([0-9.]+)([KMGT]?)/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    const multipliers: Record<string, number> = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };
    
    return Math.round(value * (multipliers[unit] || 1));
  }

  // Helper method to format CPU time from nanoseconds
  private formatCPUTime(nanoseconds: number): string {
    const seconds = nanoseconds / 1000000000;
    if (seconds < 1) return `${Math.round(nanoseconds / 1000000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(3)}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(3)}s`;
  }

  // Helper method to calculate duration from timestamp
  private calculateDuration(timestamp: string): string {
    if (!timestamp) return '';
    
    try {
      const startTime = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      
      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s ago`;
      } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s ago`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s ago`;
      } else {
        return `${seconds}s ago`;
      }
    } catch (error) {
      return timestamp;
    }
  }

  // Helper method to extract command from ExecStart
  private extractCommand(execStart: string): string {
    if (!execStart) return 'unknown';
    
    // Remove systemd exec prefix and path
    const cleaned = execStart.replace(/^[^=]*=/, '').trim();
    const parts = cleaned.split(' ');
    
    // Get the command name (last part of path + first argument)
    if (parts.length > 0) {
      const executable = parts[0].split('/').pop() || parts[0];
      const firstArg = parts[1] || '';
      return firstArg ? `${executable} ${firstArg}` : executable;
    }
    
    return cleaned.substring(0, 50) + (cleaned.length > 50 ? '...' : '');
  }

  // Stream logs in real-time
  createLogStream(appName: string, callback: (data: string) => void): () => void {
    const serviceName = `liteshift-${appName}.service`;
    const command = `journalctl -u ${serviceName} -f`;
    
    const process = exec(command);
    
    process.stdout?.on('data', (data) => {
      callback(data.toString());
    });
    
    process.stderr?.on('data', (data) => {
      callback(`ERROR: ${data.toString()}`);
    });
    
    // Return cleanup function
    return () => {
      process.kill();
    };
  }
}

export default new SystemctlManager();
