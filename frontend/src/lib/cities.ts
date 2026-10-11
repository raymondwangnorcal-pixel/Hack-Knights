import type { Country } from "@/lib/types";

export interface City {
  name: string;
  lat: number;
  lng: number;
  hasData?: boolean;
  /** Zoom when this city is clicked; defaults to CITY_ZOOM. Cities with data frame all their districts. */
  zoom?: number;
}

// Cities shown on the map and in the side menu. Cities with detection data are highlighted.
export const CITIES: Record<Country, City[]> = {
  NG: [
    { name: "Lagos", lat: 6.5244, lng: 3.3792, hasData: true, zoom: 11.1 },
    { name: "Abuja", lat: 9.0765, lng: 7.3986 },
    { name: "Kano", lat: 12.0022, lng: 8.592 },
    { name: "Ibadan", lat: 7.3775, lng: 3.947 },
    { name: "Port Harcourt", lat: 4.8156, lng: 7.0498 },
    { name: "Kaduna", lat: 10.5105, lng: 7.4165 },
    { name: "Benin City", lat: 6.335, lng: 5.6037 },
    { name: "Maiduguri", lat: 11.8333, lng: 13.15 },
    { name: "Enugu", lat: 6.4584, lng: 7.5464 },
  ],
  BR: [
    { name: "São Paulo", lat: -23.5505, lng: -46.6333, hasData: true, zoom: 9.8 },
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729 },
    { name: "Brasília", lat: -15.7939, lng: -47.8828 },
    { name: "Salvador", lat: -12.9777, lng: -38.5016 },
    { name: "Fortaleza", lat: -3.7319, lng: -38.5267 },
    { name: "Belo Horizonte", lat: -19.9167, lng: -43.9345 },
    { name: "Manaus", lat: -3.119, lng: -60.0217 },
    { name: "Curitiba", lat: -25.4284, lng: -49.2733 },
    { name: "Recife", lat: -8.0476, lng: -34.877 },
    { name: "Porto Alegre", lat: -30.0346, lng: -51.2177 },
    { name: "Belém", lat: -1.4558, lng: -48.4902 },
  ],
  US: [
    { name: "New York", lat: 40.7128, lng: -74.006, hasData: true, zoom: 11.1 },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
    { name: "Chicago", lat: 41.8781, lng: -87.6298 },
    { name: "Houston", lat: 29.7604, lng: -95.3698 },
    { name: "Phoenix", lat: 33.4484, lng: -112.074 },
    { name: "Miami", lat: 25.7617, lng: -80.1918 },
    { name: "Atlanta", lat: 33.749, lng: -84.388 },
    { name: "Seattle", lat: 47.6062, lng: -122.3321 },
    { name: "Denver", lat: 39.7392, lng: -104.9903 },
    { name: "Washington", lat: 38.9072, lng: -77.0369 },
    { name: "Boston", lat: 42.3601, lng: -71.0589 },
  ],
};

export const CITY_ZOOM = 13;
export const DISTRICT_ZOOM = 13.5;

// Asks the map to fly somewhere (or back out to the whole country). `key` makes repeat requests fire.
export type MapFocus = { key: number } & (
  | { reset: true }
  | { reset?: false; lat: number; lng: number; zoom: number }
);


// A map camera handle: read the current view, or jump to one without animation (used to carry the view
// between the home page map and its full-screen version).
export interface MapView {
  get(): { lat: number; lng: number; zoom: number };
  set(lat: number, lng: number, zoom: number): void;
}
