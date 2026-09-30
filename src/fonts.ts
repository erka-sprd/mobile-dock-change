/**
 * Fonts — ported from the main proto (lib/fonts.ts + hooks/useFonts.ts).
 *
 * The same 50 Google Fonts its FontPanel offers, loaded on demand through a
 * stylesheet <link>, resolved once document.fonts reports the family
 * available; a module-level Set + Promise map keeps any family from being
 * requested twice. getFontVariants reads the registered FontFace objects to
 * tell whether a family really ships bold / italic faces.
 */

export type FontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";

export type FontDef = {
  family: string;
  category: FontCategory;
};

export const FONTS: FontDef[] = [
  // create-omat's DEFAULT_FONT, so a new text arrives in the same face there
  // and here. First in the list because it is the default.
  { family: "Lobster Two", category: "handwriting" },
  { family: "Anton", category: "display" },
  { family: "Archivo Black", category: "display" },
  { family: "Alfa Slab One", category: "display" },
  { family: "Abril Fatface", category: "display" },
  { family: "Bebas Neue", category: "display" },
  { family: "Permanent Marker", category: "handwriting" },
  { family: "DM Serif Display", category: "serif" },
  { family: "Russo One", category: "display" },
  { family: "Oswald", category: "display" },
  { family: "Fjalla One", category: "display" },
  { family: "Righteous", category: "display" },
  { family: "Playfair Display", category: "serif" },
  { family: "Yeseva One", category: "display" },
  { family: "Montserrat", category: "sans-serif" },
  { family: "Poppins", category: "sans-serif" },
  { family: "Merriweather", category: "serif" },
  { family: "Ubuntu", category: "sans-serif" },
  { family: "Pacifico", category: "handwriting" },
  { family: "Space Mono", category: "monospace" },
  { family: "Inter", category: "sans-serif" },
  { family: "Roboto", category: "sans-serif" },
  { family: "Work Sans", category: "sans-serif" },
  { family: "DM Sans", category: "sans-serif" },
  { family: "Lora", category: "serif" },
  { family: "Nunito", category: "sans-serif" },
  { family: "Manrope", category: "sans-serif" },
  { family: "Kalam", category: "handwriting" },
  { family: "Roboto Mono", category: "monospace" },
  { family: "PT Serif", category: "serif" },
  { family: "Satisfy", category: "handwriting" },
  { family: "JetBrains Mono", category: "monospace" },
  { family: "Lato", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Karla", category: "sans-serif" },
  { family: "Quicksand", category: "sans-serif" },
  { family: "Raleway", category: "sans-serif" },
  { family: "Spectral", category: "serif" },
  { family: "Libre Baskerville", category: "serif" },
  { family: "Crimson Text", category: "serif" },
  { family: "EB Garamond", category: "serif" },
  { family: "Cormorant Garamond", category: "serif" },
  { family: "Source Code Pro", category: "monospace" },
  { family: "Fira Code", category: "monospace" },
  { family: "Inconsolata", category: "monospace" },
  { family: "Caveat", category: "handwriting" },
  { family: "Dancing Script", category: "handwriting" },
  { family: "Indie Flower", category: "handwriting" },
  { family: "Shadows Into Light", category: "handwriting" },
  { family: "Sacramento", category: "handwriting" },
  { family: "Great Vibes", category: "handwriting" },
];

/** create-omat's DEFAULT_FONT — what a fresh text is set in. */
export const DEFAULT_FONT_FAMILY = "Lobster Two";

/**
 * The range every size control offers — create-omat's MIN_FONT_SIZE and
 * MAX_FONT_SIZE, shared by the editor bar and the mobile SizePanel alike.
 * Fixed, and deliberately not derived from what is typed: the range belongs
 * to the control, not the content.
 */
export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 320;

const loadedFonts = new Set<string>();
const loadingPromises = new Map<string, Promise<string>>();

// Request regular + bold + italic (both weights). Google Fonts silently omits
// variants a family doesn't have, so this is safe for every font and lets us
// detect availability afterwards via getFontVariants().
const buildGoogleFontsUrl = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family.replace(
    / /g,
    "+"
  )}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;

/**
 * Which style variants a (loaded) font actually provides, read from the
 * registered FontFace objects. Optimistic { true, true } for a family that
 * hasn't registered any faces yet (unknown → don't disable prematurely).
 */
export const getFontVariants = (family: string): { bold: boolean; italic: boolean } => {
  if (typeof document === "undefined") return { bold: true, italic: true };
  let found = false;
  let bold = false;
  let italic = false;
  document.fonts.forEach(f => {
    const fam = f.family.replace(/^["']|["']$/g, "");
    if (fam !== family) return;
    found = true;
    // Variable fonts report a weight range like "100 900" — take the upper bound.
    const weights = String(f.weight)
      .split(/\s+/)
      .map(Number)
      .filter(n => !Number.isNaN(n));
    if (weights.length && Math.max(...weights) >= 600) bold = true;
    if (/italic|oblique/i.test(f.style)) italic = true;
  });
  return found ? { bold, italic } : { bold: true, italic: true };
};

export const loadFont = (family: string): Promise<string> => {
  if (typeof document === "undefined") return Promise.resolve(family);
  if (loadedFonts.has(family)) return Promise.resolve(family);
  const inFlight = loadingPromises.get(family);
  if (inFlight) return inFlight;

  const promise = new Promise<string>(resolve => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = buildGoogleFontsUrl(family);
    link.onload = () => {
      // Best-effort load of the regular, bold and italic faces so their
      // FontFace entries are registered for getFontVariants().
      Promise.allSettled([
        document.fonts.load(`16px "${family}"`),
        document.fonts.load(`700 16px "${family}"`),
        document.fonts.load(`italic 16px "${family}"`),
      ]).finally(() => {
        loadedFonts.add(family);
        loadingPromises.delete(family);
        resolve(family);
      });
    };
    link.onerror = () => {
      console.error("Failed to load font:", family);
      loadingPromises.delete(family);
      resolve(family);
    };
    document.head.appendChild(link);
  });

  loadingPromises.set(family, promise);
  return promise;
};
