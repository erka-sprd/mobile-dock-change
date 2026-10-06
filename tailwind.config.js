/**
 * Tailwind exists in this project only for the ported products drawer
 * (src/products-drawer/*, copied from the main proto). Preflight is off so the
 * rest of the app's hand-rolled CSS stays untouched — the drawer carries its
 * own scoped reset (`tw-scope` in src/products-drawer/tw.css) instead.
 */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        // Matches the main proto: MADE Outer Sans for display, Inter for text.
        display: ['"MADEOuterSans"', "sans-serif"],
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
