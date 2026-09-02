import { FlatCompat } from "@eslint/eslintrc";
import baseConfig from "@seapass/config/eslint-preset.cjs";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...baseConfig,
  ...compat.extends("next/core-web-vitals"),
  { ignores: ["next-env.d.ts"] },
];
