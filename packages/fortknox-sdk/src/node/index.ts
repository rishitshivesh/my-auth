/**
 * Fort Knox SDK - Node.js Module
 * 
 * For server-to-server communication:
 * - Backend services
 * - CRON jobs
 * - Webhooks
 * - Microservices
 * 
 * Uses client credentials flow (no cookies)
 */

import { FortKnoxClient } from '../core/client';
import type { FortKnoxConfig, Transport, TransportRequest, TransportResponse } from '../core/types';

interface NodeClientConfig extends Omit<FortKnoxConfig, 'transport'> {
  /**
   * Client ID for machine-to-machine auth
   */
  clientId?: string;
  
  /**
   * Client secret for machine-to-machine auth
   */
  clientSecret?: string;
  
  /**
   * API key for service authentication
   */
  apiKey?: string;
}

/**
 * Create a Node.js client for server-to-server communication
 */
export function createNodeClient(config: NodeClientConfig): FortKnoxClient {
  // Create custom transport with auth credentials
  const transport: Transport = async (req: TransportRequest): Promise<TransportResponse> => {
    const headers = {
      ...req.headers,
    };

    // Add API key if provided
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }

    // Add client credentials if provided
    if (config.clientId && config.clientSecret) {
      const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(req.url, {
      method: req.method,
      headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
    });

    let data: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
    };
  };

  return new FortKnoxClient({
    baseURL: config.baseURL,
    tenant: config.tenant,
    debug: config.debug,
    transport,
  });
}

// Re-export core
export { FortKnoxClient } from '../core/client';
export type * from '../core/types';
