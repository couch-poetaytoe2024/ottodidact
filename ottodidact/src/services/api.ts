// Renderer requests travel through the narrow preload bridge.
// The Electron main process calls the local backend; no provider credentials enter this bundle.
export { command } from '../state/sessionStore';
