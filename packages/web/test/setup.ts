// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect, with their TypeScript types.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
