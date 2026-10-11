// Detection dots: dark red near the middle of a district's reports, fading to light red at its edge.
export const DOT_CORE: [number, number, number] = [196, 30, 38];
export const DOT_EDGE: [number, number, number] = [252, 165, 165];
export const DOT_GRADIENT = `linear-gradient(to right, rgb(${DOT_CORE.join(" ")}), rgb(${DOT_EDGE.join(" ")}))`;
