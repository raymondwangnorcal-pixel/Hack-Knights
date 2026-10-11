// Detection dots: dark red near the middle of a district's reports, fading to light red at its edge.
export const DOT_CORE: [number, number, number] = [196, 30, 38];
export const DOT_EDGE: [number, number, number] = [252, 165, 165];
export const DOT_GRADIENT = `linear-gradient(to right, rgb(${DOT_CORE.join(" ")}), rgb(${DOT_EDGE.join(" ")}))`;

// A palette is a core (middle of a district's reports) and an edge (its outskirts). Red is the default
// everywhere; the home page and its full-screen map pass the orange one.
export interface DotPalette {
  core: [number, number, number];
  edge: [number, number, number];
}
export const RED_DOTS: DotPalette = { core: DOT_CORE, edge: DOT_EDGE };
export const ORANGE_DOTS: DotPalette = { core: [214, 88, 14], edge: [253, 192, 128] };
export const paletteGradient = (p: DotPalette) => `linear-gradient(to right, rgb(${p.core.join(" ")}), rgb(${p.edge.join(" ")}))`;
