# LiteShift Host Socket.IO Events Documentation

This document describes all available Socket.IO events for the LiteShift Host server. The server provides real-time communication for managing applications, deployments, Caddy reverse proxy, systemctl process management, system monitoring, and user account management.

## Table of Contents

1. [Caddy Management Events](#caddy-management-events)
2. [Systemctl Process Management Events](#systemctl-process-management-events)
3. [App Management Events](#app-management-events)
4. [Deployment Management Events](#deployment-management-events)
5. [User Management Events](#user-management-events)
6. [System Monitoring Events](#system-monitoring-events)
7. [Real-time Streaming Events](#real-time-streaming-events)
8. [Usage Examples](#usage-examples)

---

## Caddy Management Events

### Information Retrieval

#### `caddy:status`
Get Caddy server status and information.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    running: boolean;
    version: string;
    status: any;
  };
}
```

#### `caddy:logs`
Get Caddy server logs.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    logs: string;
  };
}
```

#### `caddy:config`
Get current Caddy configuration.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    config: string; // Generated Caddyfile content
  };
}
```

#### `caddy:validate`
Validate current Caddy configuration.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    valid: boolean;
  };
}
```

#### `caddy:domains`
Get all configured domains.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    domains: Array<{
      id: number;
      app_id: number;
      domain: string;
      is_primary: boolean;
      ssl_enabled: boolean;
      created_at: string;
    }>;
  };
}
```

### Service Management

#### `caddy:start`
Start Caddy server.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:stop`
Stop Caddy server.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:reload`
Reload Caddy server configuration.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:regenerate`
Regenerate Caddyfile from database configuration.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Domain Management

#### `caddy:add-domain`
Add a domain to an application.

**Parameters:**
```typescript
{
  appName: string;
  domain: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:remove-domain`
Remove a domain by ID.

**Parameters:**
```typescript
{
  domainId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:update-config`
Update and reload Caddy configuration.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `caddy:delete`
Delete a domain (alternative to remove-domain).

**Parameters:**
```typescript
{
  domainId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Systemctl Process Management Events

### Native systemd Integration

LiteShift now uses **systemctl** and **systemd** for robust process management, providing:
- **Native Linux service management** with systemd
- **Multi-runtime support**: Node.js, Python, and Bun
- **Automatic restart policies** and service monitoring
- **Centralized logging** with journalctl
- **Boot-time auto-start** capabilities
- **Resource management** and service isolation

Each app gets its own systemd service file at `/etc/systemd/system/liteshift-{appName}.service` with runtime-specific configurations and proper user isolation.

### Information Retrieval

#### `systemctl:list`
Get list of all systemctl services managed by LiteShift.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    services: Array<{
      name: string;
      status: 'active' | 'inactive' | 'failed' | 'unknown';
      enabled: boolean;
      description: string;
      runtime: 'node' | 'python' | 'bun';
      cwd?: string;
    }>;
  };
}
```

#### `systemctl:status`
Get status of a specific systemctl service with detailed parsed information.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    status: {
      name: string;
      status: 'active' | 'inactive' | 'failed' | 'unknown';
      enabled: boolean;
      description: string;
      runtime: 'node' | 'python' | 'bun';
      cwd?: string;
      // Enhanced parsed systemctl status information
      loaded: {
        state: 'loaded' | 'not-found' | 'bad-setting' | 'error' | 'masked';
        path: string; // e.g., "/etc/systemd/system/mubot.service"
        enabled: 'enabled' | 'disabled' | 'static' | 'masked';
        preset: 'enabled' | 'disabled';
      };
      active: {
        state: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
        subState: 'running' | 'exited' | 'dead' | 'start-pre' | 'start' | 'start-post' | 'reload' | 'stop' | 'stop-watchdog' | 'stop-sigterm' | 'stop-sigkill' | 'stop-post' | 'final-sigterm' | 'final-sigkill' | 'failed';
        since: string; // e.g., "Mon 2025-07-21 00:53:29 IST"
        duration: string; // e.g., "3min 4s ago"
      };
      mainPid?: {
        pid: number; // e.g., 10841
        command: string; // e.g., "npm start"
      };
      tasks?: {
        current: number; // e.g., 35
        limit: number; // e.g., 1129
      };
      memory?: {
        current: string; // e.g., "130.0M"
        peak?: string; // e.g., "153.8M"
      };
      cpu?: string; // e.g., "2.388s"
      cgroup?: {
        path: string; // e.g., "/system.slice/mubot.service"
        processes: Array<{
          pid: number;
          command: string;
        }>;
      };
    };
  };
}
```

**Example Response:**
```typescript
{
  success: true,
  data: {
    status: {
      name: "mubot",
      status: "active",
      enabled: true,
      description: "LiteShift managed service for mubot",
      runtime: "node",
      cwd: "/home/ubuntu/mubot",
      loaded: {
        state: "loaded",
        path: "/etc/systemd/system/liteshift-mubot.service",
        enabled: "enabled",
        preset: "enabled"
      },
      active: {
        state: "active",
        subState: "running",
        since: "Mon 2025-07-21 00:53:29 IST",
        duration: "3min 4s ago"
      },
      mainPid: {
        pid: 10841,
        command: "npm start"
      },
      tasks: {
        current: 35,
        limit: 1129
      },
      memory: {
        current: "130.0M",
        peak: "153.8M",
        currentBytes: 136314880,
        peakBytes: 161243136
      },
      cpu: {
        usage: "2.388s",
        usageNSec: 2388000000
      },
      cgroup: {
        path: "/system.slice/liteshift-mubot.service",
        processes: [
          { pid: 10841, command: "npm start" },
          { pid: 10852, command: "sh -c \"tsx src/index.ts\"" },
          { pid: 10853, command: "node /home/ubuntu/mubot/node_modules/.bin/tsx src/index.ts" },
          { pid: 10864, command: "/usr/bin/node --require /home/ubuntu/mubot/node_modules/ts..." }
        ]
      }
    }
  }
}
```

**Note:** The enhanced status information includes:
- **Real-time resource usage**: Current and peak memory usage, CPU time
- **Process hierarchy**: All child processes with their PIDs and commands
- **Service lifecycle**: Precise start time, duration, and state transitions
- **System integration**: Full systemd service configuration and status
- **Performance metrics**: Task count, memory in both human-readable and byte formats

#### `systemctl:logs`
Get logs for a specific systemctl service using journalctl.

**Parameters:**
```typescript
{
  appName: string;
  lines?: number; // Default: 100
  since?: string; // e.g., "2024-01-01", "1 hour ago"
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    logs: string;
  };
}
```

### Service Management

#### `systemctl:start`
Start a systemctl service.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `systemctl:stop`
Stop a systemctl service.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `systemctl:restart`
Restart a systemctl service.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `systemctl:enable`
Enable a systemctl service (auto-start on boot).

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `systemctl:disable`
Disable a systemctl service.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `systemctl:delete`
Delete a systemctl service completely.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Real-time Log Streaming

#### `systemctl:stream-logs`
Start streaming logs from a systemctl service in real-time using journalctl.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Emitted Events:**
- `systemctl:log-stream` - Real-time log data

#### `systemctl:stop-stream`
Stop streaming logs from a systemctl service.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## App Management Events

### App Operations

#### `app:create`
Create a new application with configuration stored in database.

**Parameters:**
```typescript
{
  name: string;
  repository?: string;
  branch?: string; // Default: 'main'
  buildCommand?: string;
  installCommand?: string;
  startCommand: string;
  runtime: 'node' | 'python' | 'bun'; // Default: 'node'
  envVars?: Record<string, string>;
  autoDeploy?: boolean; // Default: false
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    app: {
      id: number;
      name: string;
      repository: string | null;
      branch: string;
      build_command: string | null;
      install_command: string;
      start_command: string;
      runtime: string;
      created_at: string;
      updated_at: string;
    };
    queueId?: number; // If autoDeploy is true
  };
  message: string;
}
```

**Note:** If `autoDeploy` is true and a repository is provided, a deployment will be automatically queued after app creation.

#### `app:list`
Get list of all applications.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    apps: Array<{
      id: number;
      name: string;
      repository: string | null;
      branch: string;
      build_command: string | null;
      install_command: string;
      start_command: string;
      runtime: string;
      created_at: string;
      updated_at: string;
    }>;
  };
}
```

#### `app:get`
Get specific application details.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    app: {
      id: number;
      name: string;
      repository: string | null;
      branch: string;
      build_command: string | null;
      install_command: string;
      start_command: string;
      runtime: string;
      created_at: string;
      updated_at: string;
    } | null;
  };
}
```

#### `app:update`
Update application configuration.

**Parameters:**
```typescript
{
  appName: string;
  repository?: string;
  branch?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  runtime?: 'node' | 'python' | 'bun';
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    app: {
      id: number;
      name: string;
      repository: string | null;
      branch: string;
      build_command: string | null;
      install_command: string;
      start_command: string;
      runtime: string;
      created_at: string;
      updated_at: string;
    };
  };
  message: string;
}
```

#### `app:delete`
Delete an application and all its resources.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Environment Variable Management

#### `app:env:list`
Get environment variables for an application.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    envVars: Array<{
      id: number;
      app_id: number;
      key: string;
      value: string;
      created_at: string;
    }>;
  };
}
```

#### `app:env:set`
Set environment variable for an application.

**Parameters:**
```typescript
{
  appName: string;
  key: string;
  value: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `app:env:delete`
Delete environment variable from an application.

**Parameters:**
```typescript
{
  appName: string;
  key: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Domain Management

#### `app:domains:list`
Get domains for an application.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    domains: Array<{
      id: number;
      app_id: number;
      domain: string;
      is_primary: boolean;
      ssl_enabled: boolean;
      created_at: string;
    }>;
  };
}
```

#### `app:domains:add`
Add domain to an application.

**Parameters:**
```typescript
{
  appName: string;
  domain: string;
  isPrimary?: boolean; // Default: false
  sslEnabled?: boolean; // Default: true
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

#### `app:domains:delete`
Remove domain from an application.

**Parameters:**
```typescript
{
  appName: string;
  domainId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Deployment Management Events

### Deployment Operations

#### `deploy:from-git`
Deploy application from Git repository with runtime support.

**Parameters:**
```typescript
{
  appName: string;
  repository: string;
  branch?: string; // Default: 'main'
  buildCommand?: string;
  installCommand?: string; // Default: 'npm install'
  startCommand: string;
  runtime?: 'node' | 'python' | 'bun'; // NEW: Runtime support (default: 'node')
  envVars?: Record<string, string>;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    queueId: number;
    message: string;
  };
}
```

**Note:** The runtime parameter determines which interpreter systemctl will use and generates appropriate systemd service configurations.

#### `deploy:from-file`
Deploy application from uploaded file with runtime support.

**Parameters:**
```typescript
{
  appName: string;
  startCommand: string;
  buildCommand?: string;
  installCommand?: string;
  runtime?: 'node' | 'python' | 'bun'; // NEW: Runtime support (default: 'node')
  envVars?: Record<string, string>;
  fileBuffer: Buffer; // Uploaded file content
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    queueId: number;
    message: string;
  };
}
```

**Note:** The runtime parameter determines which interpreter systemctl will use and generates appropriate systemd service configurations.

#### `deploy:redeploy`
Redeploy existing application.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    queueId: number;
    message: string;
  };
}
```

### Status and Monitoring

#### `deploy:queue-status`
Get deployment queue status.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: Array<{
    id: number;
    app_name: string;
    type: 'git' | 'file';
    status: 'queued' | 'building' | 'completed' | 'failed';
    created_at: string;
    logs?: string;
  }>;
}
```

#### `deploy:status`
Get specific deployment status.

**Parameters:**
```typescript
{
  queueId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    id: number;
    app_name: string;
    type: 'git' | 'file';
    status: 'queued' | 'building' | 'completed' | 'failed';
    created_at: string;
    logs?: string;
  } | null;
}
```

#### `deploy:logs`
Get deployment logs for an application.

**Parameters:**
```typescript
{
  appName: string;
  limit?: number; // Default: 10
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    logs: Array<{
      id: number;
      app_id: number;
      status: string;
      logs: string;
      created_at: string;
    }>;
  };
}
```

### Management

#### `deploy:delete`
Delete an application and all its resources.

**Parameters:**
```typescript
{
  appName: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

### Deployment Log Streaming

#### `deploy:stream-logs`
Start streaming deployment logs in real-time.

**Parameters:**
```typescript
{
  queueId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Emitted Events:**
- `deploy:log-stream` - Real-time deployment updates
- `deploy:log-stream-end` - Deployment completion

#### `deploy:stop-stream`
Stop streaming deployment logs.

**Parameters:**
```typescript
{
  queueId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## User Management Events

### Profile Management

#### `user:get`
Get authenticated user's information.

**Parameters:**
```typescript
{
  userId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    user: {
      id: number;
      username: string;
      email: string;
      role: string; // 'admin' or 'user'
      created_at: string;
      last_login: string;
    };
  };
}
```

#### `user:edit`
Update user profile information.

**Parameters:**
```typescript
{
  userId: number;
  username?: string;    // Optional - minimum 3 characters
  email?: string;       // Optional - valid email format
  role?: string;        // Optional - 'admin' or 'user'
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  data: {
    user: {
      id: number;
      username: string;
      email: string;
      role: string;
      created_at: string;
      last_login: string;
    };
  };
}
```

### Security Management

#### `user:changePassword`
Change user password with current password verification.

**Parameters:**
```typescript
{
  userId: number;
  currentPassword: string;
  newPassword: string; // Minimum 6 characters
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Special Behavior:**
- Automatically disconnects the socket after successful password change for security
- Requires current password verification before allowing change
- New password must be at least 6 characters long

---

## System Monitoring Events

### System Analytics

#### `system:analytics`
Get comprehensive system analytics including CPU, memory, disk, and uptime.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    cpu: {
      loadAvg1min: number;
      loadAvg5min: number;
      loadAvg15min: number;
      cores: number;
      formatted: string; // "load1 / load5 / load15"
      usagePercentage: string;
    };
    memory: {
      total: { value: number; unit: string; raw: number };
      used: { value: number; unit: string; raw: number };
      formatted: string; // "used / total unit"
      usedPercentage: string;
    };
    disk: {
      total: { value: number; unit: string; raw: number };
      used: { value: number; unit: string; raw: number };
      formatted: string; // "used / total unit"
      usedPercentage: string;
    };
    uptime: number; // seconds
    caddyStatus: string; // "active" | "inactive"
    timestamp: string;
  };
}
```

### Individual Component Information

#### `system:cpu`
Get CPU information only.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    cpu: {
      loadAvg1min: number;
      loadAvg5min: number;
      loadAvg15min: number;
      cores: number;
      formatted: string;
      usagePercentage: string;
    };
  };
}
```

#### `system:memory`
Get memory information only.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    memory: {
      total: { value: number; unit: string; raw: number };
      used: { value: number; unit: string; raw: number };
      formatted: string;
      usedPercentage: string;
    };
  };
}
```

#### `system:disk`
Get disk information only.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    disk: {
      total: { value: number; unit: string; raw: number };
      used: { value: number; unit: string; raw: number };
      formatted: string;
      usedPercentage: string;
    };
  };
}
```

#### `system:uptime`
Get system uptime information.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    uptime: number; // seconds
    formatted: string; // "1d 2h 3m 4s"
  };
}
```

#### `system:caddy-status`
Get Caddy service status.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  data: {
    caddyStatus: string; // "active" | "inactive"
    isActive: boolean;
  };
}
```

### Real-time System Monitoring

#### `system:stream-analytics`
Start streaming system analytics in real-time.

**Parameters:**
```typescript
{
  interval?: number; // Milliseconds, default: 5000, min: 1000, max: 60000
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Emitted Events:**
- `system:analytics-stream` - Real-time system data

#### `system:stop-stream`
Stop streaming system analytics.

**Parameters:** `{}`

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Real-time Streaming Events

### System Analytics Stream Events

#### `system:analytics-stream` (Emitted)
Real-time system analytics data.

**Data:**
```typescript
{
  cpu: {
    loadAvg1min: number;
    loadAvg5min: number;
    loadAvg15min: number;
    cores: number;
    formatted: string;
    usagePercentage: string;
  };
  memory: {
    total: { value: number; unit: string; raw: number };
    used: { value: number; unit: string; raw: number };
    formatted: string;
    usedPercentage: string;
  };
  disk: {
    total: { value: number; unit: string; raw: number };
    used: { value: number; unit: string; raw: number };
    formatted: string;
    usedPercentage: string;
  };
  uptime: number;
  caddyStatus: string;
  timestamp: string; // ISO timestamp
}
```

### Systemctl Log Stream Events

#### `systemctl:log-stream` (Emitted)
Real-time log data from systemctl services via journalctl.

**Data:**
```typescript
{
  appName: string;
  data: string; // Log content
  timestamp: string; // ISO timestamp
}
```

### Deployment Stream Events

#### `deploy:log-stream` (Emitted)
Real-time deployment progress updates.

**Data:**
```typescript
{
  queueId: number;
  status: 'queued' | 'building' | 'completed' | 'failed';
  logs: string; // Current log content
  timestamp: string; // ISO timestamp
}
```

#### `deploy:log-stream-end` (Emitted)
Deployment completion notification.

**Data:**
```typescript
{
  queueId: number;
  finalStatus: 'completed' | 'failed';
}
```

---

## Usage Examples

### Basic Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to LiteShift Host');
});
```

### Create and Deploy Application

```javascript
// Create a new app with configuration stored in database
socket.emit('app:create', {
  name: 'my-web-app',
  repository: 'https://github.com/user/my-app.git',
  branch: 'main',
  startCommand: 'npm start',
  buildCommand: 'npm run build',
  runtime: 'node',
  envVars: {
    NODE_ENV: 'production',
    PORT: '3000'
  },
  autoDeploy: true // Automatically queue deployment
}, (response) => {
  if (response.success) {
    console.log('App created:', response.data.app);
    if (response.data.queueId) {
      console.log('Deployment queued:', response.data.queueId);
      
      // Start streaming deployment logs
      socket.emit('deploy:stream-logs', {
        queueId: response.data.queueId
      });
    }
  }
});

// Listen for deployment updates
socket.on('deploy:log-stream', (data) => {
  console.log(`[${data.timestamp}] ${data.status}: ${data.logs}`);
});

socket.on('deploy:log-stream-end', (data) => {
  console.log(`Deployment finished with status: ${data.finalStatus}`);
});
```

### Deploy Application from Git

```javascript
socket.emit('deploy:from-git', {
  appName: 'my-web-app',
  repository: 'https://github.com/user/my-app.git',
  branch: 'main',
  startCommand: 'npm start',
  buildCommand: 'npm run build',
  envVars: {
    NODE_ENV: 'production',
    PORT: '3000'
  }
}, (response) => {
  if (response.success) {
    console.log('Deployment queued:', response.data.queueId);
    
    // Start streaming deployment logs
    socket.emit('deploy:stream-logs', {
      queueId: response.data.queueId
    });
  }
});

// Listen for deployment updates
socket.on('deploy:log-stream', (data) => {
  console.log(`[${data.timestamp}] ${data.status}: ${data.logs}`);
});

socket.on('deploy:log-stream-end', (data) => {
  console.log(`Deployment finished with status: ${data.finalStatus}`);
});
```

### Monitor Systemctl Service Logs

```javascript
// Start streaming logs for a specific systemctl service
socket.emit('systemctl:stream-logs', {
  appName: 'my-web-app'
}, (response) => {
  if (response.success) {
    console.log('Started streaming systemctl logs');
  }
});

// Listen for real-time logs
socket.on('systemctl:log-stream', (logData) => {
  const { appName, data, timestamp } = logData;
  console.log(`[${timestamp}] ${appName}:`, data);
});

// Stop streaming when done
socket.emit('systemctl:stop-stream', {
  appName: 'my-web-app'
});

// Get systemctl service status
socket.emit('systemctl:status', {
  appName: 'my-web-app'
}, (response) => {
  if (response.success) {
    const status = response.data.status;
    console.log(`Service: ${status.name}`);
    console.log(`Status: ${status.status}`);
    console.log(`Enabled: ${status.enabled}`);
    console.log(`Runtime: ${status.runtime}`);
  }
});

// Restart a systemctl service
socket.emit('systemctl:restart', {
  appName: 'my-web-app'
}, (response) => {
  if (response.success) {
    console.log('Service restarted successfully');
  }
});
```

### Manage App Environment Variables

```javascript
// Get all environment variables for an app
socket.emit('app:env:list', {
  appName: 'my-web-app'
}, (response) => {
  if (response.success) {
    response.data.envVars.forEach(envVar => {
      console.log(`${envVar.key}=${envVar.value}`);
    });
  }
});

// Set a new environment variable
socket.emit('app:env:set', {
  appName: 'my-web-app',
  key: 'DATABASE_URL',
  value: 'postgres://user:pass@localhost/db'
}, (response) => {
  if (response.success) {
    console.log('Environment variable set successfully');
  }
});

// Delete an environment variable
socket.emit('app:env:delete', {
  appName: 'my-web-app',
  key: 'OLD_VAR'
}, (response) => {
  if (response.success) {
    console.log('Environment variable deleted successfully');
  }
});
```

### Manage App Domains

```javascript
// Get all domains for an app
socket.emit('app:domains:list', {
  appName: 'my-web-app'
}, (response) => {
  if (response.success) {
    response.data.domains.forEach(domain => {
      console.log(`${domain.domain} (Primary: ${domain.is_primary}, SSL: ${domain.ssl_enabled})`);
    });
  }
});

// Add a new domain
socket.emit('app:domains:add', {
  appName: 'my-web-app',
  domain: 'example.com',
  isPrimary: true,
  sslEnabled: true
}, (response) => {
  if (response.success) {
    console.log('Domain added successfully');
  }
});

// Remove a domain
socket.emit('app:domains:delete', {
  appName: 'my-web-app',
  domainId: 123
}, (response) => {
  if (response.success) {
    console.log('Domain removed successfully');
  }
});
```

### Manage Caddy Domains

```javascript
// Add a domain to an app
socket.emit('caddy:add-domain', {
  appName: 'my-web-app',
  domain: 'example.com'
}, (response) => {
  if (response.success) {
    console.log('Domain added successfully');
    
    // Reload Caddy to apply changes
    socket.emit('caddy:reload', {}, (reloadResponse) => {
      console.log('Caddy reloaded');
    });
  }
});

// Get all configured domains
socket.emit('caddy:domains', {}, (response) => {
  if (response.success) {
    response.data.domains.forEach(domain => {
      console.log(`${domain.domain} -> App ID: ${domain.app_id}`);
    });
  }
});
```

### Manage User Profile

```javascript
// Get current user information
socket.emit('user:get', { userId: 123 }, (response) => {
  if (response.success) {
    const user = response.data.user;
    console.log(`User: ${user.username} (${user.email})`);
    console.log(`Role: ${user.role}`);
  }
});

// Update user profile
socket.emit('user:edit', {
  userId: 123,
  username: 'newUsername',
  email: 'newemail@example.com'
}, (response) => {
  if (response.success) {
    console.log('Profile updated successfully');
    console.log('Updated user:', response.data.user);
  } else {
    console.error('Failed to update profile:', response.error);
  }
});

// Change password
socket.emit('user:changePassword', {
  userId: 123,
  currentPassword: 'currentPassword123',
  newPassword: 'newSecurePassword456'
}, (response) => {
  if (response.success) {
    console.log('Password changed successfully');
    // Note: Socket will be automatically disconnected for security
  } else {
    console.error('Failed to change password:', response.error);
  }
});

// Handle automatic disconnection after password change
socket.on('disconnect', (reason) => {
  if (reason === 'server disconnect') {
    console.log('Disconnected by server (likely due to password change)');
    // Redirect to login page or show re-authentication prompt
  }
});
```

### Monitor System Resources

```javascript
// Get complete system analytics
socket.emit('system:analytics', {}, (response) => {
  if (response.success) {
    const { cpu, memory, disk, uptime, caddyStatus } = response.data;
    console.log(`CPU Usage: ${cpu.usagePercentage}% (${cpu.formatted})`);
    console.log(`Memory: ${memory.formatted} (${memory.usedPercentage}% used)`);
    console.log(`Disk: ${disk.formatted} (${disk.usedPercentage}% used)`);
    console.log(`Uptime: ${uptime} seconds`);
    console.log(`Caddy Status: ${caddyStatus}`);
  }
});

// Get individual component information
socket.emit('system:cpu', {}, (response) => {
  if (response.success) {
    const cpu = response.data.cpu;
    console.log(`CPU Load: ${cpu.formatted} (${cpu.usagePercentage}%)`);
  }
});

socket.emit('system:memory', {}, (response) => {
  if (response.success) {
    const memory = response.data.memory;
    console.log(`Memory Usage: ${memory.formatted}`);
  }
});

// Start real-time system monitoring
socket.emit('system:stream-analytics', {
  interval: 3000 // Update every 3 seconds
}, (response) => {
  if (response.success) {
    console.log('Started real-time system monitoring');
  }
});

// Listen for real-time system updates
socket.on('system:analytics-stream', (data) => {
  console.log(`[${data.timestamp}] CPU: ${data.cpu.usagePercentage}%`);
  console.log(`[${data.timestamp}] Memory: ${data.memory.usedPercentage}%`);
  console.log(`[${data.timestamp}] Disk: ${data.disk.usedPercentage}%`);
});

// Stop real-time monitoring
socket.emit('system:stop-stream', {}, (response) => {
  console.log('Stopped system monitoring');
});

// Get formatted uptime
socket.emit('system:uptime', {}, (response) => {
  if (response.success) {
    console.log(`System uptime: ${response.data.formatted}`);
  }
});

// Check Caddy service status
socket.emit('system:caddy-status', {}, (response) => {
  if (response.success) {
    const isRunning = response.data.isActive;
    console.log(`Caddy is ${isRunning ? 'running' : 'stopped'}`);
  }
});
```

### Error Handling

All events follow a consistent error handling pattern:

```javascript
socket.emit('any:event', params, (response) => {
  if (response.success) {
    // Handle success
    console.log('Success:', response.message || response.data);
  } else {
    // Handle error
    console.error('Error:', response.error);
  }
});
```

### Auto-cleanup

The server automatically cleans up streaming connections when the socket disconnects, but you can also manually stop streams:

```javascript
// Manually stop systemctl log streaming
socket.emit('systemctl:stop-stream', { appName: 'my-app' });

// Manually stop deployment log streaming
socket.emit('deploy:stop-stream', { queueId: 123 });
```

---

## Notes

- All events return responses via callbacks
- Streaming events automatically clean up on socket disconnect
- Queue-based deployments prevent resource conflicts
- Real-time updates provide immediate feedback
- Comprehensive error handling ensures reliable operation
- TypeScript types are provided for all parameters and responses
- User password changes automatically disconnect the socket for security
- User management includes input validation and duplicate checking
- Password changes require current password verification for security
- System monitoring supports cross-platform disk and memory information
- Real-time system streaming has configurable intervals (1-60 seconds)
- System analytics include formatted human-readable values and raw bytes
- Caddy status monitoring integrates with systemctl on Linux systems
