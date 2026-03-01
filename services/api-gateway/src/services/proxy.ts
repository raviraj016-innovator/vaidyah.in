import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Request } from 'express';
import config from '../config';
import { CircuitState, CircuitBreakerOptions, ServiceEndpoint } from '../types';
import { AppError } from '../middleware/errorHandler';

// ─── Service Registry ───────────────────────────────────────────────────────

const SERVICE_ENDPOINTS: Record<string, ServiceEndpoint> = {
  voice: {
    name: 'voice-service',
    baseUrl: config.services.voiceService,
    timeoutMs: 30000,
    retries: 1,
  },
  clinical: {
    name: 'clinical-service',
    baseUrl: config.services.clinicalService,
    timeoutMs: 15000,
    retries: 2,
  },
  nlu: {
    name: 'nlu-service',
    baseUrl: config.services.nluService,
    timeoutMs: 15000,
    retries: 2,
  },
  trial: {
    name: 'trial-service',
    baseUrl: config.services.trialService,
    timeoutMs: 20000,
    retries: 2,
  },
  integration: {
    name: 'integration-service',
    baseUrl: config.services.integrationService,
    timeoutMs: 20000,
    retries: 2,
  },
};

// ─── Circuit Breaker ────────────────────────────────────────────────────────

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
}

const DEFAULT_CB_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 2,
};

const circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitBreaker(serviceName: string): CircuitBreakerState {
  let cb = circuitBreakers.get(serviceName);
  if (!cb) {
    cb = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
    };
    circuitBreakers.set(serviceName, cb);
  }
  return cb;
}

function checkCircuit(
  serviceName: string,
  opts: CircuitBreakerOptions = DEFAULT_CB_OPTIONS,
): void {
  const cb = getCircuitBreaker(serviceName);

  if (cb.state === 'open') {
    const elapsed = Date.now() - cb.lastFailureTime;
    if (elapsed >= opts.resetTimeoutMs) {
      // Transition to half-open
      cb.state = 'half-open';
      cb.halfOpenAttempts = 0;
      console.log(`[CircuitBreaker] ${serviceName}: open -> half-open`);
    } else {
      throw AppError.serviceUnavailable(serviceName);
    }
  }

  if (cb.state === 'half-open' && cb.halfOpenAttempts >= opts.halfOpenMaxAttempts) {
    // Too many half-open attempts, go back to open
    cb.state = 'open';
    cb.lastFailureTime = Date.now();
    throw AppError.serviceUnavailable(serviceName);
  }
}

function recordSuccess(serviceName: string): void {
  const cb = getCircuitBreaker(serviceName);
  if (cb.state === 'half-open') {
    console.log(`[CircuitBreaker] ${serviceName}: half-open -> closed`);
  }
  cb.state = 'closed';
  cb.failures = 0;
  cb.halfOpenAttempts = 0;
}

function recordFailure(
  serviceName: string,
  opts: CircuitBreakerOptions = DEFAULT_CB_OPTIONS,
): void {
  const cb = getCircuitBreaker(serviceName);

  if (cb.state === 'half-open') {
    cb.halfOpenAttempts++;
    if (cb.halfOpenAttempts >= opts.halfOpenMaxAttempts) {
      cb.state = 'open';
      cb.lastFailureTime = Date.now();
      console.warn(`[CircuitBreaker] ${serviceName}: half-open -> open (attempts exhausted)`);
    }
    return;
  }

  cb.failures++;
  cb.lastFailureTime = Date.now();

  if (cb.failures >= opts.failureThreshold) {
    cb.state = 'open';
    console.warn(
      `[CircuitBreaker] ${serviceName}: closed -> open (${cb.failures} failures)`,
    );
  }
}

// ─── HTTP Proxy Request ─────────────────────────────────────────────────────

export interface ProxyOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  timeoutMs?: number;
}

export interface ProxyResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

function buildQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        searchParams.append(key, v);
      }
    } else {
      searchParams.append(key, value);
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

function makeRequest(
  endpoint: ServiceEndpoint,
  options: ProxyOptions,
): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.baseUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const timeout = options.timeoutMs ?? endpoint.timeoutMs;

    const queryString = options.query ? buildQueryString(options.query) : '';
    const fullPath = `${options.path}${queryString}`;

    const bodyStr =
      options.body !== undefined ? JSON.stringify(options.body) : undefined;

    const reqOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: fullPath,
      method: options.method,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
        ...options.headers,
      },
    };

    const req = transport.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          parsedBody = rawBody;
        }
        resolve({
          statusCode: res.statusCode ?? 500,
          headers: res.headers,
          body: parsedBody,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(AppError.gatewayTimeout(endpoint.name));
    });

    req.on('error', (err) => {
      reject(
        new AppError(
          `Upstream error from ${endpoint.name}: ${err.message}`,
          502,
          'BAD_GATEWAY',
        ),
      );
    });

    if (bodyStr) {
      req.write(bodyStr);
    }

    req.end();
  });
}

// ─── Proxy With Retries + Circuit Breaker ───────────────────────────────────

async function proxyWithRetry(
  endpoint: ServiceEndpoint,
  options: ProxyOptions,
  retriesLeft: number,
): Promise<ProxyResponse> {
  try {
    const response = await makeRequest(endpoint, options);

    // 5xx from upstream counts as a failure for circuit breaker
    if (response.statusCode >= 500) {
      recordFailure(endpoint.name);
      if (retriesLeft > 0) {
        console.warn(
          `[Proxy] ${endpoint.name} returned ${response.statusCode}, retrying (${retriesLeft} left)`,
        );
        await sleep(500);
        return proxyWithRetry(endpoint, options, retriesLeft - 1);
      }
    } else {
      recordSuccess(endpoint.name);
    }

    return response;
  } catch (err) {
    recordFailure(endpoint.name);

    if (retriesLeft > 0 && isRetryable(err)) {
      console.warn(
        `[Proxy] ${endpoint.name} error, retrying (${retriesLeft} left):`,
        (err as Error).message,
      );
      await sleep(500);
      return proxyWithRetry(endpoint, options, retriesLeft - 1);
    }

    throw err;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) {
    // Retry on gateway timeout and bad gateway, not on circuit breaker open
    return err.code === 'GATEWAY_TIMEOUT' || err.code === 'BAD_GATEWAY';
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Forward a request to a named microservice with circuit breaker + retries.
 */
export async function proxyRequest(
  serviceName: string,
  options: ProxyOptions,
): Promise<ProxyResponse> {
  const endpoint = SERVICE_ENDPOINTS[serviceName];
  if (!endpoint) {
    throw new AppError(`Unknown service: ${serviceName}`, 500, 'CONFIG_ERROR');
  }

  // Check circuit breaker before making the request
  checkCircuit(endpoint.name);

  return proxyWithRetry(endpoint, options, endpoint.retries);
}

/**
 * Convenience: forward an Express request to a microservice and send
 * the upstream response back to the original client.
 */
export async function forwardRequest(
  serviceName: string,
  req: Request,
  path: string,
  overrides: Partial<ProxyOptions> = {},
): Promise<ProxyResponse> {
  const options: ProxyOptions = {
    method: req.method,
    path,
    body: req.body as unknown,
    query: req.query as Record<string, string>,
    headers: {
      ...(req.headers['x-request-id'] ? { 'x-request-id': req.headers['x-request-id'] as string } : {}),
      ...(req.headers['x-correlation-id'] ? { 'x-correlation-id': req.headers['x-correlation-id'] as string } : {}),
    },
    ...overrides,
  };

  return proxyRequest(serviceName, options);
}

/**
 * Get the current circuit breaker status for monitoring/health checks.
 */
export function getCircuitStatus(): Record<string, { state: CircuitState; failures: number }> {
  const status: Record<string, { state: CircuitState; failures: number }> = {};
  for (const [name, cb] of circuitBreakers.entries()) {
    status[name] = { state: cb.state, failures: cb.failures };
  }
  return status;
}
