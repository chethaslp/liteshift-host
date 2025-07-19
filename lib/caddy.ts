import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dbHelpers } from './db';

const execAsync = promisify(exec);

export interface CaddyDirective {
  domain: string;
  port: number;
  ssl?: boolean;
  redirectWww?: boolean;
  additionalDirectives?: string[];
}

class CaddyManager {
  private caddyConfigPath: string;
  private caddyApiUrl: string;

  constructor() {
    this.caddyConfigPath = dbHelpers.getSetting('caddy_config_path') || '/etc/caddy/Caddyfile';
    this.caddyApiUrl = 'http://localhost:2019';
  }

  async generateCaddyfile(): Promise<string> {
    const apps = dbHelpers.getAllApps();
    const dashboardURL = dbHelpers.getSetting('dashboard_url') || ':8008';
    let config = `# Auto-generated Caddyfile for LiteShift
# Generated at ${new Date().toISOString()}

# Default site (dashboard)
${dashboardURL} {
	reverse_proxy localhost:8008
}
`;

    for (const app of apps as any[]) {
      const domains = dbHelpers.getAppDomains(app.id);
      
      if (domains && domains.length > 0) {
        for (const domain of domains as any[]) {
          const appPort = this.getAppPort(app.name);
          
          config += `
# App: ${app.name}
${domain.domain} {
	reverse_proxy localhost:${appPort}
	
	# Enable automatic HTTPS
	tls {
		${domain.ssl_enabled ? 'on_demand' : 'off'}
	}
	
	# Security headers
	header {
		# Enable HSTS
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		# Prevent MIME type sniffing
		X-Content-Type-Options "nosniff"
		# Prevent clickjacking
		X-Frame-Options "DENY"
		# Enable XSS protection
		X-XSS-Protection "1; mode=block"
		# Referrer policy
		Referrer-Policy "strict-origin-when-cross-origin"
	}
	
	# Compression
	encode gzip
}

`;

          // Add www redirect if needed
          if (domain.domain.startsWith('www.')) {
            const nonWwwDomain = domain.domain.replace('www.', '');
            config += `# Redirect non-www to www for ${app.name}
${nonWwwDomain} {
	redir https://${domain.domain}{uri} permanent
}

`;
          } else {
            config += `# Redirect www to non-www for ${app.name}
www.${domain.domain} {
	redir https://${domain.domain}{uri} permanent
}

`;
          }
        }
      }
    }

    return config;
  }

  private getAppPort(appName: string): number {
    // Simple port allocation based on app name hash
    // In production, you might want to store this in the database
    let hash = 0;
    for (let i = 0; i < appName.length; i++) {
      const char = appName.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Map to port range 4000-9000
    return 4000 + (Math.abs(hash) % 5000);
  }

  async getLogs(): Promise<string> {
    try {
      const { stdout } = await execAsync('journalctl -u caddy --no-pager');
      return stdout;
    } catch (error) {
      console.error('Failed to get Caddy logs:', error);
      return 'Error retrieving logs';
    }
  }

  async writeCaddyfile(): Promise<void> {
    try {
      const config = await this.generateCaddyfile();
      
      // Create backup of existing config
      try {
        const existingConfig = await fs.readFile(this.caddyConfigPath, 'utf-8');
        const backupPath = `${this.caddyConfigPath}.backup.${Date.now()}`;
        await fs.writeFile(backupPath, existingConfig);
        console.log(`Backed up existing Caddyfile to ${backupPath}`);
      } catch (error) {
        // File might not exist, which is fine
        console.log('No existing Caddyfile found, creating new one');
      }
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.caddyConfigPath), { recursive: true });
      
      // Write new config
      await fs.writeFile(this.caddyConfigPath, config);
      console.log(`Caddyfile updated at ${this.caddyConfigPath}`);
      
    } catch (error) {
      console.error('Failed to write Caddyfile:', error);
      throw error;
    }
  }

  async reloadCaddy(): Promise<void> {
    try {
      // Try to reload Caddy gracefully
      await execAsync('caddy reload --config ' + this.caddyConfigPath);
      console.log('Caddy reloaded successfully');
    } catch (error) {
      console.error('Failed to reload Caddy:', error);
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      await execAsync(`caddy validate --config ${this.caddyConfigPath}`);
      return true;
    } catch (error) {
      console.error('Caddy config validation failed:', error);
      return false;
    }
  }

  async addDomain(appName: string, domain: string): Promise<void> {
    const app = dbHelpers.getAppByName(appName);
    if (!app) {
      throw new Error(`App ${appName} not found`);
    }

    // Add domain to database
    dbHelpers.addAppDomain((app as any).id, domain);
    
    // Regenerate and reload Caddyfile
    await this.writeCaddyfile();
    
    // Validate config before reloading
    const isValid = await this.validateConfig();
    if (!isValid) {
      throw new Error('Generated Caddy configuration is invalid');
    }
    
    await this.reloadCaddy();
  }

  async removeDomain(domainId: number): Promise<void> {
    dbHelpers.removeAppDomain(domainId);
    
    // Regenerate and reload Caddyfile
    await this.writeCaddyfile();
    await this.reloadCaddy();
  }

  async getCaddyStatus(): Promise<any> {
    try {
      const { stdout } = await execAsync('curl -s http://localhost:2019/config/');
      return JSON.parse(stdout);
    } catch (error) {
      console.error('Failed to get Caddy status:', error);
      return null;
    }
  }

  async getCaddyVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('caddy version');
      return stdout.trim();
    } catch (error) {
      console.error('Failed to get Caddy version:', error);
      return 'Unknown';
    }
  }

  async isCaddyRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('systemctl is-active caddy');
      return stdout.trim() === 'active';
    } catch (error) {
      return false;
    }
  }

  async startCaddy(): Promise<void> {
    try {
      await execAsync(`caddy start --config ${this.caddyConfigPath}`);
    } catch (error) {
      console.error('Failed to start Caddy:', error);
      throw error;
    }
  }

  async stopCaddy(): Promise<void> {
    try {
      await execAsync('caddy stop');
    } catch (error) {
      console.error('Failed to stop Caddy:', error);
      throw error;
    }
  }
}

export default new CaddyManager();
