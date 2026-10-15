interface ImportMetaEnv {
  /** The root `package.json`'s version, which the footer shows. Set in `vite.config.ts`. */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
