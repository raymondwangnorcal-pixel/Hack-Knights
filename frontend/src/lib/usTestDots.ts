import { loadTestDots } from "./testDots";

// "USA test": simulated West Nile detections (scripts/build_us_test_dots.py), at most 800.
export const MAX_TEST_DOTS = 800;

export const loadUsTestDots = (days: number) =>
  loadTestDots({ url: "/geo/us-test-dots.json", idPrefix: "us-test", country: "US", genus: "culex", max: MAX_TEST_DOTS }, days);
