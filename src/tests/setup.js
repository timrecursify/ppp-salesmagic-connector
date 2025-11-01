/**
 * Test Setup Configuration
 * Sets up global mocks and environment for tests
 */

import { vi, beforeEach } from 'vitest';

// Mock global fetch
globalThis.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
globalThis.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
globalThis.sessionStorage = sessionStorageMock;

// Mock location
const locationMock = {
  href: 'https://example.com',
  hostname: 'example.com',
  pathname: '/',
  search: '',
  hash: ''
};
globalThis.location = locationMock;

// Mock navigator
const navigatorMock = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  language: 'en-US',
  cookieEnabled: true,
  doNotTrack: '0'
};
globalThis.navigator = navigatorMock;

// Mock document
const documentMock = {
  cookie: '',
  title: 'Test Page',
  referrer: '',
  readyState: 'complete',
  addEventListener: vi.fn(),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(() => []),
  createElement: vi.fn(() => ({
    getContext: vi.fn()
  }))
};
globalThis.document = documentMock;

// Mock window
const windowMock = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  performance: {
    timing: {
      navigationStart: Date.now() - 1000,
      loadEventEnd: Date.now() - 500,
      domContentLoadedEventEnd: Date.now() - 800,
      responseEnd: Date.now() - 900,
      domainLookupEnd: Date.now() - 980,
      domainLookupStart: Date.now() - 990,
      connectEnd: Date.now() - 970,
      connectStart: Date.now() - 985
    }
  },
  screen: {
    width: 1920,
    height: 1080,
    colorDepth: 24
  },
  WebGLRenderingContext: function() {}
};
globalThis.window = windowMock;

// Mock console for testing
globalThis.console = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

// Mock Date.now for consistent testing
const mockDateNow = vi.fn(() => 1640995200000); // 2022-01-01 00:00:00 UTC
globalThis.Date.now = mockDateNow;

// Mock crypto for UUID generation
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: vi.fn(() => new Uint8Array(16))
  },
  writable: true,
  configurable: true
});

// Mock Intl for timezone testing
globalThis.Intl = {
  DateTimeFormat: vi.fn(() => ({
    resolvedOptions: () => ({ timeZone: 'America/New_York' })
  }))
};

// Mock Image for pixel tracking
globalThis.Image = vi.fn(() => ({
  onload: null,
  onerror: null,
  src: ''
}));

// Mock setTimeout/clearTimeout
globalThis.setTimeout = vi.fn((callback, delay) => {
  return setTimeout(callback, delay);
});
globalThis.clearTimeout = vi.fn();

// Mock URL constructor
globalThis.URL = class URL {
  constructor(url) {
    this.href = url;
    this.pathname = new URL(url).pathname;
    this.search = new URL(url).search;
    this.searchParams = new URLSearchParams(this.search);
  }
};

// Mock URLSearchParams
globalThis.URLSearchParams = class URLSearchParams {
  constructor(search) {
    this.params = new Map();
    if (search) {
      search.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key) {
          this.params.set(decodeURIComponent(key), decodeURIComponent(value || ''));
        }
      });
    }
  }
  
  get(key) {
    return this.params.get(key);
  }
  
  set(key, value) {
    this.params.set(key, value);
  }
  
  forEach(callback) {
    this.params.forEach(callback);
  }
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockDateNow.mockReturnValue(1640995200000);
  
  // Reset localStorage
  localStorageMock.getItem.mockReturnValue(null);
  localStorageMock.setItem.mockImplementation(() => {});
  localStorageMock.removeItem.mockImplementation(() => {});
  localStorageMock.clear.mockImplementation(() => {});
  
  // Reset sessionStorage
  sessionStorageMock.getItem.mockReturnValue(null);
  sessionStorageMock.setItem.mockImplementation(() => {});
  sessionStorageMock.removeItem.mockImplementation(() => {});
  sessionStorageMock.clear.mockImplementation(() => {});
  
  // Reset location
  locationMock.href = 'https://example.com';
  locationMock.hostname = 'example.com';
  locationMock.pathname = '/';
  locationMock.search = '';
  locationMock.hash = '';
  
  // Reset document
  documentMock.cookie = '';
  documentMock.title = 'Test Page';
  documentMock.referrer = '';
  documentMock.readyState = 'complete';
}); 