import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PM2Process {
  pm_id: number;
  name: string;
  status: string;
  pid?: number;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
  unstable_restarts: number;
  created_at: number;
  pm2_env: {
    PM2_HOME: string;
    status: string;
    restart_time: number;
    unstable_restarts: number;
    created_at: number;
    pm_uptime: number;
    instances?: number;
    exec_mode?: string;
    watch?: boolean;
    pm_exec_path?: string;
    pm_cwd?: string;
    exec_interpreter?: string;
    pm_out_log_path?: string;
    pm_err_log_path?: string;
    pm_log_path?: string;
    node_args?: string[];
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface PM2ProcessInfo {
  pid: number;
  name: string;
  pm2_env: {
    status: string;
    restart_time: number;
    unstable_restarts: number;
    created_at: number;
    pm_uptime: number;
    pm_id: number;
    instances: number;
    exec_mode: string;
    watch: boolean;
    pm_exec_path: string;
    pm_cwd: string;
    exec_interpreter: string;
    pm_out_log_path: string;
    pm_err_log_path: string;
    pm_log_path: string;
    node_args: string[];
    args: string[];
    env: Record<string, string>;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

class PM2Manager {
  private async runPM2Command(command: string[]): Promise<any> {
    try {
      const { stdout, stderr } = await execAsync(`pm2 ${command.join(' ')}`);
      if (stderr && !stderr.includes('use --update-env')) {
        throw new Error(stderr);
      }
      return stdout;
    } catch (error) {
      console.error('PM2 command failed:', error);
    }
  }

  async list(): Promise<PM2Process[]> {
    try {
      const output = await this.runPM2Command(['jlist']);
      const processes = JSON.parse(output || '[]');
      
      return processes.map((proc: PM2ProcessInfo) => ({
        pm_id: proc.pm2_env.pm_id,
        name: proc.name || `app-${proc.pm2_env.pm_id}`,
        status: proc.pm2_env.status,
        pid: proc.pid,
        cpu: proc.monit?.cpu || 0,
        memory: proc.monit?.memory || 0,
        uptime: proc.pm2_env.pm_uptime,
        restarts: proc.pm2_env.restart_time,
        unstable_restarts: proc.pm2_env.unstable_restarts,
        created_at: proc.pm2_env.created_at
      }));
    } catch (error) {
      console.error('Failed to list PM2 processes:', error);
      return [];
    }
  }

  async start(appName: string, scriptPath: string, options: {
    cwd?: string;
    env?: Record<string, string>;
    instances?: number;
    watch?: boolean;
    nodeArgs?: string[];
    args?: string[];
  } = {}): Promise<void> {
    const command = ['start', scriptPath];
    
    command.push('--name', appName);
    
    if (options.cwd) {
      command.push('--cwd', options.cwd);
    }
    
    if (options.instances) {
      command.push('-i', options.instances.toString());
    }
    
    if (options.watch) {
      command.push('--watch');
    }
    
    if (options.nodeArgs && options.nodeArgs.length > 0) {
      command.push('--node-args', options.nodeArgs.join(' '));
    }
    
    if (options.args && options.args.length > 0) {
      command.push('--', ...options.args);
    }

    // Handle environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        command.push('--env', `${key}=${value}`);
      }
    }

    await this.runPM2Command(command);
  }

  async stop(appName: string): Promise<void> {
    await this.runPM2Command(['stop', appName]);
  }

  async restart(appName: string): Promise<void> {
    await this.runPM2Command(['restart', appName]);
  }

  async delete(appName: string): Promise<void> {
    await this.runPM2Command(['delete', appName]);
  }

  async reload(appName: string): Promise<void> {
    await this.runPM2Command(['reload', appName]);
  }

  async logs(appName: string, lines: number = 100): Promise<string> {
    try {
      const output = await this.runPM2Command(['logs', appName, '--lines', lines.toString(), '--nostream']);
      return output;
    } catch (error) {
      console.error('Failed to get logs:', error);
      return '';
    }
  }

  async flush(appName?: string): Promise<void> {
    const command = ['flush'];
    if (appName) {
      command.push(appName);
    }
    await this.runPM2Command(command);
  }

  async save(): Promise<void> {
    await this.runPM2Command(['save']);
  }

  async startup(): Promise<string> {
    const output = await this.runPM2Command(['startup']);
    return output;
  }

  async unstartup(): Promise<void> {
    await this.runPM2Command(['unstartup']);
  }

  async updateEnv(appName: string, env: Record<string, string>): Promise<void> {
    const envArgs: string[] = [];
    for (const [key, value] of Object.entries(env)) {
      envArgs.push('--env', `${key}=${value}`);
    }
    
    await this.runPM2Command(['restart', appName, '--update-env', ...envArgs]);
  }

  async getProcessInfo(appName: string): Promise<PM2Process | null> {
    const processes = await this.list();
    return processes.find(proc => proc.name === appName) || null;
  }

  async getLogPaths(appName: string): Promise<{ out: string; error: string } | null> {
    const process = await this.getProcessInfo(appName);
    if (!process) return null;

    return {
      out: process.pm2_env.pm_out_log_path || '',
      error: process.pm2_env.pm_err_log_path || ''
    };
  }

  async monit(): Promise<void> {
    // Start monitoring in the background
    spawn('pm2', ['monit'], { detached: true, stdio: 'ignore' });
  }

  // Stream logs in real-time
  streamLogs(appName: string, callback: (data: string, isError: boolean) => void): () => void {
    const process = spawn('pm2', ['logs', appName, '--lines', '0'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    process.stdout.on('data', (data) => {
      callback(data.toString(), false);
    });

    process.stderr.on('data', (data) => {
      callback(data.toString(), true);
    });

    // Return a function to stop streaming
    return () => {
      process.kill();
    };
  }

  async describe(appName: string): Promise<any> {
    try {
      const output = await this.runPM2Command(['describe', appName]);
      return JSON.parse(output);
    } catch (error) {
      console.error('Failed to describe process:', error);
      return null;
    }
  }

  async reset(appName: string): Promise<void> {
    await this.runPM2Command(['reset', appName]);
  }

  async sendSignal(signal: string, appName: string): Promise<void> {
    await this.runPM2Command(['sendSignal', signal, appName]);
  }
}

export default new PM2Manager();
