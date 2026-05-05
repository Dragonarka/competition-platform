// Tells React 19's act() that we're inside a test environment so async
// state updates flushed via createRoot/act() don't emit the
// "current testing environment is not configured to support act(...)" warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export {};
