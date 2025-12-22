// Re-export for backward compatibility
export { MemoryStateManager as StateManager } from "./state/memory";
export type { StateManager as IStateManager } from "./state/types";
export type { StateManagerConfig, RedisConfig } from "./state/types";
export { MemoryStateManager } from "./state/memory";
export { RedisStateManager } from "./state/redis";
