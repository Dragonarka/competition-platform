export interface ComponentManifest {
  component: string;
  defaultProps?: Record<string, unknown>;
  requiredPlatformHooks: string[];
}

export interface FormatUI {
  judgeInput: ComponentManifest;
  publicDisplay: ComponentManifest;
  adminConfig: ComponentManifest;
  presenterView?: ComponentManifest;
}
