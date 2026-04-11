module.exports = {
  extends: ["expo", "prettier"],
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": "off",
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "react-hooks/exhaustive-deps": "warn",
  },
};
