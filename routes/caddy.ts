import type { Server, Socket } from "socket.io";
import CaddyManager from "../lib/caddy";
import { dbHelpers } from "../lib/db";

// Get Caddy status
const getCaddyStatus = async (data: {}, callback: (response: any) => void) => {
  try {
    const isRunning = await CaddyManager.isCaddyRunning();
    const status = await CaddyManager.getCaddyStatus();
    const version = await CaddyManager.getCaddyVersion();
    
    callback({
      success: true,
      data: {
        running: isRunning,
        version,
        status
      }
    });
  } catch (error) {
    console.error('Get Caddy status error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get Caddy logs
const getCaddyLogs = async (data: {}, callback: (response: any) => void) => {
  try {
    const logs = await CaddyManager.getLogs();
    callback({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Get Caddy logs error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get Caddy config
const getCaddyConfig = async (data: {}, callback: (response: any) => void) => {
  try {
    const config = await CaddyManager.generateCaddyfile();
    callback({
      success: true,
      data: { config }
    });
  } catch (error) {
    console.error('Get Caddy config error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Validate Caddy config
const validateCaddyConfig = async (data: {}, callback: (response: any) => void) => {
  try {
    const isValid = await CaddyManager.validateConfig();
    callback({
      success: true,
      data: { valid: isValid }
    });
  } catch (error) {
    console.error('Validate Caddy config error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Get all domains
const getCaddyDomains = async (data: {}, callback: (response: any) => void) => {
  try {
    const domains = dbHelpers.getAllDomains();
    callback({
      success: true,
      data: { domains }
    });
  } catch (error) {
    console.error('Get Caddy domains error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Start Caddy
const startCaddy = async (data: {}, callback: (response: any) => void) => {
  try {
    await CaddyManager.startCaddy();
    callback({
      success: true,
      message: 'Caddy started successfully'
    });
  } catch (error) {
    console.error('Start Caddy error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Stop Caddy
const stopCaddy = async (data: {}, callback: (response: any) => void) => {
  try {
    await CaddyManager.stopCaddy();
    callback({
      success: true,
      message: 'Caddy stopped successfully'
    });
  } catch (error) {
    console.error('Stop Caddy error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Reload Caddy
const reloadCaddy = async (data: {}, callback: (response: any) => void) => {
  try {
    await CaddyManager.reloadCaddy();
    callback({
      success: true,
      message: 'Caddy reloaded successfully'
    });
  } catch (error) {
    console.error('Reload Caddy error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Regenerate Caddyfile
const regenerateCaddyfile = async (data: {}, callback: (response: any) => void) => {
  try {
    await CaddyManager.writeCaddyfile();
    callback({
      success: true,
      message: 'Caddyfile regenerated successfully'
    });
  } catch (error) {
    console.error('Regenerate Caddyfile error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Add domain
const addCaddyDomain = async (data: { appName: string; domain: string }, callback: (response: any) => void) => {
  try {
    const { appName, domain } = data;
    if (!appName || !domain) {
      callback({
        success: false,
        error: 'appName and domain are required'
      });
      return;
    }
    
    // Validate input types
    if (typeof appName !== 'string' || typeof domain !== 'string') {
      callback({
        success: false,
        error: 'appName and domain must be strings'
      });
      return;
    }
    
    await CaddyManager.addDomain(appName, domain);
    callback({
      success: true,
      message: `Domain ${domain} added to app ${appName} successfully`
    });
  } catch (error) {
    console.error('Add Caddy domain error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Remove domain
const removeCaddyDomain = async (data: { domainId: number }, callback: (response: any) => void) => {
  try {
    const { domainId } = data;
    if (!domainId) {
      callback({
        success: false,
        error: 'domainId is required'
      });
      return;
    }
    
    await CaddyManager.removeDomain(domainId);
    callback({
      success: true,
      message: 'Domain removed successfully'
    });
  } catch (error) {
    console.error('Remove Caddy domain error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Update Caddy configuration
const updateCaddyConfig = async (data: {}, callback: (response: any) => void) => {
  try {
    // Regenerate and reload Caddyfile
    await CaddyManager.writeCaddyfile();
    
    // Validate before reloading
    const isValid = await CaddyManager.validateConfig();
    if (!isValid) {
      callback({
        success: false,
        error: 'Generated configuration is invalid'
      });
      return;
    }
    
    await CaddyManager.reloadCaddy();
    callback({
      success: true,
      message: 'Caddy configuration updated and reloaded successfully'
    });
  } catch (error) {
    console.error('Update Caddy config error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

// Delete domain (alternative method)
const deleteCaddyDomain = async (data: { domainId: number }, callback: (response: any) => void) => {
  try {
    const { domainId } = data;
    if (!domainId) {
      callback({
        success: false,
        error: 'domainId is required'
      });
      return;
    }

    await CaddyManager.removeDomain(domainId);
    callback({
      success: true,
      message: 'Domain removed successfully'
    });
  } catch (error) {
    console.error('Delete Caddy domain error:', error);
    callback({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

export default (server: Server, socket: Socket) => {
  socket.on("caddy:status", getCaddyStatus);
  socket.on("caddy:logs", getCaddyLogs);
  socket.on("caddy:config", getCaddyConfig);
  socket.on("caddy:validate", validateCaddyConfig);
  socket.on("caddy:domains", getCaddyDomains);
  socket.on("caddy:start", startCaddy);
  socket.on("caddy:stop", stopCaddy);
  socket.on("caddy:reload", reloadCaddy);
  socket.on("caddy:regenerate", regenerateCaddyfile);
  socket.on("caddy:add-domain", addCaddyDomain);
  socket.on("caddy:remove-domain", removeCaddyDomain);
  socket.on("caddy:update-config", updateCaddyConfig);
  socket.on("caddy:delete", deleteCaddyDomain);
}