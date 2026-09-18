import "@testing-library/jest-dom/vitest";
// jsdom não implementa IndexedDB — necessário para testar src/lib/offlineQueue.ts (Fase 8).
import "fake-indexeddb/auto";
