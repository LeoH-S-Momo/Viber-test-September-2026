import baseConfig from "@seapass/config/eslint-preset.cjs";

export default [
  ...baseConfig,
  {
    languageOptions: {
      sourceType: "commonjs",
    },
  },
];
