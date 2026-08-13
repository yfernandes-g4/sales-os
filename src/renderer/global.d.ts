import type { SalesOSApi } from '../shared/types';

declare global {
  interface Window {
    salesOS: SalesOSApi;
  }
}

export {};
