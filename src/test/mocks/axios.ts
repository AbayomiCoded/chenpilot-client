import { vi } from 'vitest';

// Mock axios for service tests
export const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
  })),
  interceptors: {
    request: {
      use: vi.fn(),
    },
    response: {
      use: vi.fn(),
    },
  },
};

vi.mock('axios', () => mockAxios);

// Helper to create mock axios responses
export const createMockResponse = <T = unknown>(data: T, status = 200) => ({
  data,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
  headers: {},
  config: {},
});

// Helper to create mock axios errors
export const createMockError = (message: string, status = 500) => {
  const error = new Error(message) as Error & {
    response?: {
      data: { message: string };
      status: number;
      statusText: string;
      headers: Record<string, string>;
      config: Record<string, unknown>;
    };
    isAxiosError?: boolean;
  };
  error.response = {
    data: { message },
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: {},
    config: {},
  };
  error.isAxiosError = true;
  return error;
};

// Reset all axios mocks between tests
export const resetAxiosMocks = () => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.put.mockReset();
  mockAxios.delete.mockReset();
  mockAxios.patch.mockReset();
};

/**
 * Mock builder for creating configurable axios instance mocks
 */
export class MockAxiosInstanceBuilder {
  private config: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
  } = {};

  private responses: Map<string, unknown> = new Map();
  private errors: Map<string, Error> = new Map();

  withBaseURL(baseURL: string) {
    this.config.baseURL = baseURL;
    return this;
  }

  withTimeout(timeout: number) {
    this.config.timeout = timeout;
    return this;
  }

  withHeaders(headers: Record<string, string>) {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  mockGet(url: string, response: unknown) {
    this.responses.set(`GET:${url}`, response);
    return this;
  }

  mockPost(url: string, response: unknown) {
    this.responses.set(`POST:${url}`, response);
    return this;
  }

  mockPut(url: string, response: unknown) {
    this.responses.set(`PUT:${url}`, response);
    return this;
  }

  mockDelete(url: string, response: unknown) {
    this.responses.set(`DELETE:${url}`, response);
    return this;
  }

  mockError(method: string, url: string, error: Error) {
    this.errors.set(`${method}:${url}`, error);
    return this;
  }

  build() {
    const mockInstance = {
      defaults: {
        baseURL: this.config.baseURL || 'http://localhost:2333',
        timeout: this.config.timeout || 30000,
        headers: this.config.headers || { 'Content-Type': 'application/json' },
      },
      get: vi.fn((url: string) => {
        const error = this.errors.get(`GET:${url}`);
        if (error) return Promise.reject(error);
        const response = this.responses.get(`GET:${url}`);
        return Promise.resolve({ data: response, status: 200 });
      }),
      post: vi.fn((url: string) => {
        const error = this.errors.get(`POST:${url}`);
        if (error) return Promise.reject(error);
        const response = this.responses.get(`POST:${url}`);
        return Promise.resolve({ data: response, status: 200 });
      }),
      put: vi.fn((url: string) => {
        const error = this.errors.get(`PUT:${url}`);
        if (error) return Promise.reject(error);
        const response = this.responses.get(`PUT:${url}`);
        return Promise.resolve({ data: response, status: 200 });
      }),
      delete: vi.fn((url: string) => {
        const error = this.errors.get(`DELETE:${url}`);
        if (error) return Promise.reject(error);
        const response = this.responses.get(`DELETE:${url}`);
        return Promise.resolve({ data: response, status: 200 });
      }),
      patch: vi.fn((url: string) => {
        const error = this.errors.get(`PATCH:${url}`);
        if (error) return Promise.reject(error);
        const response = this.responses.get(`PATCH:${url}`);
        return Promise.resolve({ data: response, status: 200 });
      }),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };

    return mockInstance;
  }
}

/**
 * Creates a mock axios instance with common service configurations
 */
export const createMockApiService = (overrides?: {
  baseURL?: string;
  timeout?: number;
}) => {
  return new MockAxiosInstanceBuilder()
    .withBaseURL(overrides?.baseURL || 'http://localhost:2333')
    .withTimeout(overrides?.timeout || 30000)
    .withHeaders({ 'Content-Type': 'application/json' })
    .build();
};

/**
 * Mock for authenticated requests with bearer token
 */
export const createMockAuthenticatedService = (token: string = 'test-token') => {
  return new MockAxiosInstanceBuilder()
    .withBaseURL('http://localhost:2333')
    .withHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    })
    .build();
};

/**
 * Mock for pagination responses
 */
export const createPaginatedResponse = <T>(
  data: T[],
  page: number = 1,
  pageSize: number = 10,
  total: number = data.length
) => ({
  data,
  meta: {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  },
});

/**
 * Mock for error responses with status codes
 */
export const createErrorResponse = (
  message: string,
  status: number = 500,
  code?: string
) => {
  const error = new Error(message) as Error & {
    response?: {
      data: { message: string; code: string };
      status: number;
      statusText: string;
    };
    isAxiosError?: boolean;
  };
  error.response = {
    data: {
      message,
      code: code || 'INTERNAL_ERROR',
    },
    status,
    statusText: status >= 500 ? 'Server Error' : 'Client Error',
  };
  error.isAxiosError = true;
  return error;
};

/**
 * Reset all mock builders
 */
export const resetMockBuilders = () => {
  // No persistent state to reset for builders
  // This is a placeholder for future stateful mock utilities
};
