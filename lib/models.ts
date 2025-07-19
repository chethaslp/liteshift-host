/**
 * User model representing the users table
 */
export interface User {
    id: number;
    username: string;
    password_hash: string;
    email?: string;
    role: string;
    created_at: string; // ISO date string
    last_login?: string; // ISO date string
}

/**
 * App model representing the apps table
 */
export interface App {
    id: number;
    name: string;
    pm2_id?: number;
    repository_url?: string;
    branch: string;
    deploy_path: string;
    start_command: string;
    build_command?: string;
    install_command: string;
    status: string;
    created_at: string; // ISO date string
    updated_at: string; // ISO date string
}

/**
 * AppDomain model representing the app_domains table
 */
export interface AppDomain {
    id: number;
    app_id: number;
    domain: string;
    is_primary: boolean;
    ssl_enabled: boolean;
    created_at: string; // ISO date string
}

/**
 * AppEnvVar model representing the app_env_vars table
 */
export interface AppEnvVar {
    id: number;
    app_id: number;
    key: string;
    value: string;
    created_at: string; // ISO date string
}

/**
 * Deployment model representing the deployments table
 */
export interface Deployment {
    id: number;
    app_id: number;
    status: string;
    log?: string;
    deployed_at: string; // ISO date string
}

/**
 * DeploymentQueueItem model representing the deployment_queue table
 */
export interface DeploymentQueueItem {
    id: number;
    app_name: string;
    type: 'git' | 'file';
    status: 'queued' | 'building' | 'completed' | 'failed';
    options: string; // JSON string typically
    logs: string;
    created_at: string; // ISO date string
    started_at?: string; // ISO date string
    completed_at?: string; // ISO date string
    error_message?: string;
}

/**
 * Setting model representing the settings table
 */
export interface Setting {
    id: number;
    key: string;
    value: string;
    updated_at: string; // ISO date string
}