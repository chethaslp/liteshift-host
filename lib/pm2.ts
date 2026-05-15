import { exec } from 'child_process';
import { promisify } from 'util';
import envManager from './env';

const execAsync = promisify(exec);

export type Runtime = 'node' | 'python' | 'bun';

export interface PM2Process {
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'launching' | 'stopping' | 'unknown';
  enabled: boolean; // whether it's saved in pm2 startup list
  description: string;
  runtime: Runtime;
  cwd?: string;
  env?: Record<string, string>;
  pid?: number;
  memory?: {
    current: string;
    currentBytes?: number;
  };
  cpu?: {
    usage: string;
  };
  uptime?: string;
  restarts?: number;
}

const PM2_PREFIX = 'liteshift-';

class PM2Manager {
  constructor() {
    // PM2 must be installed globally: npm install -g pm2
  }

  // Start (or restart if already exists) an app with pm2
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
      runtime = 'node',
      env = {}
    } = options;

    const processName = `${PM2_PREFIX}${appName}`;
    const envFilePath = envManager.getAppEnvFilePath(appName);

    // Build the interpreter / command based on runtime
    const interpreter = this.getInterpreter(runtime);

    // Build env args for pm2 start  --env vars are passed via --env-file or inline
    // We use --env-file when available, otherwise pass individual KEY=VALUE pairs
    const envArgs = Object.entries(env)
      .map(([k, v]) => `--env ${k}="${v.replace(/"/g, '\\"')}"`)
      .join(' ');

    // Delete any existing process with the same name first (ignore errors)
    await execAsync(`pm2 delete ${processName}`).catch(() => {});

    // Build pm2 start command
    const interpreterFlag = interpreter ? `--interpreter ${interpreter}` : '';
    const command = [
      'pm2 start',
      `"${scriptPath}"`,
      `--name ${processName}`,
      `--cwd "${cwd}"`,
      interpreterFlag,
      '--env-file', `"${envFilePath}"`,
      '--restart-delay 10000',
      '--no-autorestart false',
    ].filter(Boolean).join(' ');

    try {
      await execAsync(command);
      console.log(`PM2: started process ${processName}`);
    } catch (error) {
      console.error(`PM2: failed to start process ${processName}:`, error);
      throw error;
    }
  }

  // Start a stopped process
  async start(appName: string): Promise<void> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      await execAsync(`pm2 start ${processName}`);
      console.log(`PM2: started ${processName}`);
    } catch (error) {
      console.error(`PM2: failed to start ${processName}:`, error);
      throw error;
    }
  }

  // Stop a running process
  async stop(appName: string): Promise<void> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      await execAsync(`pm2 stop ${processName}`);
      console.log(`PM2: stopped ${processName}`);
    } catch (error) {
      console.error(`PM2: failed to stop ${processName}:`, error);
      throw error;
    }
  }

  // Restart a process
  async restart(appName: string): Promise<void> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      await execAsync(`pm2 restart ${processName}`);
      console.log(`PM2: restarted ${processName}`);
    } catch (error) {
      console.error(`PM2: failed to restart ${processName}:`, error);
      throw error;
    }
  }

  // Save the current pm2 process list so it auto-starts on reboot
  async enable(appName: string): Promise<void> {
    try {
      await execAsync('pm2 save');
      console.log(`PM2: saved process list (enabled auto-startup for ${appName})`);
    } catch (error) {
      console.error(`PM2: failed to save process list:`, error);
      throw error;
    }
  }

  // Remove an app from the saved startup list by deleting it and re-saving
  async disable(appName: string): Promise<void> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      await execAsync(`pm2 stop ${processName}`).catch(() => {});
      await execAsync('pm2 save');
      console.log(`PM2: saved process list (disabled auto-startup for ${appName})`);
    } catch (error) {
      console.error(`PM2: failed to disable ${appName}:`, error);
      throw error;
    }
  }

  // Get status of a single process
  async getStatus(appName: string): Promise<PM2Process> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      const { stdout } = await execAsync(`pm2 jlist`);
      const processes: any[] = JSON.parse(stdout);
      const proc = processes.find(p => p.name === processName);

      if (!proc) {
        return {
          name: appName,
          status: 'unknown',
          enabled: false,
          description: `LiteShift app: ${appName}`,
          runtime: 'node',
        };
      }

      return this.mapProcess(proc, appName);
    } catch (error) {
      console.error(`PM2: failed to get status for ${processName}:`, error);
      return {
        name: appName,
        status: 'unknown',
        enabled: false,
        description: `LiteShift app: ${appName}`,
        runtime: 'node',
      };
    }
  }

  // List all liteshift-prefixed processes
  async list(): Promise<PM2Process[]> {
    try {
      const { stdout } = await execAsync('pm2 jlist');
      const processes: any[] = JSON.parse(stdout);
      const liteShiftProcs = processes.filter(p => p.name?.startsWith(PM2_PREFIX));
      return liteShiftProcs.map(proc => {
        const appName = proc.name.replace(PM2_PREFIX, '');
        return this.mapProcess(proc, appName);
      });
    } catch (error) {
      console.error('PM2: failed to list processes:', error);
      return [];
    }
  }

  // Get logs for a process
  async getLogs(appName: string, options: {
    lines?: number;
    follow?: boolean;
    since?: string;
  } = {}): Promise<string> {
    const processName = `${PM2_PREFIX}${appName}`;
    const { lines = 100 } = options;

    try {
      const { stdout } = await execAsync(`pm2 logs ${processName} --lines ${lines} --nostream`);
      return stdout;
    } catch (error) {
      console.error(`PM2: failed to get logs for ${processName}:`, error);
      throw error;
    }
  }

  // Delete a process entirely
  async deleteService(appName: string): Promise<void> {
    const processName = `${PM2_PREFIX}${appName}`;
    try {
      await this.stop(appName).catch(() => {});
      await execAsync(`pm2 delete ${processName}`);
      await execAsync('pm2 save');
      console.log(`PM2: deleted process ${processName}`);
    } catch (error) {
      console.error(`PM2: failed to delete process ${processName}:`, error);
      throw error;
    }
  }

  // Stream logs in real-time using pm2 logs --raw --follow
  createLogStream(appName: string, callback: (data: string) => void): () => void {
    const processName = `${PM2_PREFIX}${appName}`;
    const child = exec(`pm2 logs ${processName} --raw`);

    child.stdout?.on('data', (data) => {
      callback(data.toString());
    });

    child.stderr?.on('data', (data) => {
      callback(`ERROR: ${data.toString()}`);
    });

    return () => {
      child.kill();
    };
  }

  // --- Private helpers ---

  private getInterpreter(runtime: Runtime): string {
    switch (runtime) {
      case 'python':
        return '/usr/bin/python3';
      case 'bun':
        return '/root/.bun/bin/bun';
      case 'node':
      default:
        return ''; // pm2 uses node by default
    }
  }

  private detectRuntime(execPath: string): Runtime {
    if (execPath.includes('python')) return 'python';
    if (execPath.includes('bun')) return 'bun';
    return 'node';
  }

  private mapProcess(proc: any, appName: string): PM2Process {
    const pm2Status = proc.pm2_env?.status as string;
    const status = this.mapStatus(pm2Status);

    const memBytes = proc.monit?.memory as number | undefined;
    const cpuPct = proc.monit?.cpu as number | undefined;

    const uptimeMs = proc.pm2_env?.pm_uptime as number | undefined;
    const uptime = uptimeMs ? this.formatDuration(Date.now() - uptimeMs) : undefined;

    return {
      name: appName,
      status,
      enabled: true, // pm2 save controls this; assume saved processes are enabled
      description: `LiteShift app: ${appName}`,
      runtime: this.detectRuntime(proc.pm2_env?.pm_exec_path || ''),
      cwd: proc.pm2_env?.pm_cwd,
      pid: proc.pid || undefined,
      memory: memBytes !== undefined ? {
        current: this.formatBytes(memBytes),
        currentBytes: memBytes,
      } : undefined,
      cpu: cpuPct !== undefined ? {
        usage: `${cpuPct}%`,
      } : undefined,
      uptime,
      restarts: proc.pm2_env?.restart_time,
    };
  }

  private mapStatus(pm2Status: string): PM2Process['status'] {
    switch (pm2Status) {
      case 'online': return 'online';
      case 'stopped': return 'stopped';
      case 'errored': return 'errored';
      case 'launching': return 'launching';
      case 'stopping': return 'stopping';
      default: return 'unknown';
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G', 'T'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s ago`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`;
    return `${seconds}s ago`;
  }
}

export default new PM2Manager();
