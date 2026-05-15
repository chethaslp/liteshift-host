/**
 * processManager.ts
 *
 * Thin adapter that reads the `process_manager` setting from the database
 * and delegates all operations to either the PM2 or systemctl implementation.
 *
 * This allows the install script to let the user choose their preferred
 * process manager at install time without any runtime code changes.
 */

import { dbHelpers } from './db';
import pm2Manager, { PM2Process } from './pm2';
import systemctlManager, { SystemctlProcess } from './systemctl';
import type { Runtime } from './pm2';

export type ProcessStatus = PM2Process | SystemctlProcess;

export type ProcessManager = 'pm2' | 'systemctl';

function getManager(): ProcessManager {
  const setting = dbHelpers.getSetting('process_manager');
  if (setting === 'systemctl') return 'systemctl';
  return 'pm2'; // default
}

function backend() {
  return getManager() === 'systemctl' ? systemctlManager : pm2Manager;
}

export function getProcessManagerType(): ProcessManager {
  return getManager();
}

export const processManager = {
  createService: (appName: string, options: {
    scriptPath: string;
    cwd?: string;
    env?: Record<string, string>;
    runtime?: Runtime;
    description?: string;
    user?: string;
  }) => backend().createService(appName, options),

  start: (appName: string) => backend().start(appName),

  stop: (appName: string) => backend().stop(appName),

  restart: (appName: string) => backend().restart(appName),

  enable: (appName: string) => backend().enable(appName),

  disable: (appName: string) => backend().disable(appName),

  getStatus: (appName: string) => backend().getStatus(appName),

  list: () => backend().list(),

  getLogs: (appName: string, options: {
    lines?: number;
    follow?: boolean;
    since?: string;
  } = {}) => backend().getLogs(appName, options),

  deleteService: (appName: string) => backend().deleteService(appName),

  createLogStream: (appName: string, callback: (data: string) => void) =>
    backend().createLogStream(appName, callback),
};

export default processManager;
