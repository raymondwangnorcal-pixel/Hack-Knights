// Plain-language explanations of the numbers shown with districts. The risk formula is the one in
// db/tiger/002_risk.sql (0.5 detections rank + 0.3 cases rank + 0.2 weather, ranked within a country).

export const RISK_SCORE_TITLE = "Risk score, 0 to 100";

export const RISK_SCORE_BODY =
  "An index, not a percentage and not a chance of infection. It ranks this area against the others in the same country: " +
  "recent mosquito detections count 50%, recent cases 30% and weather that favors mosquitoes 20%. " +
  "Around 50 is typical for the country; higher means act sooner.";

export const RISK_SCORE_CITY_NOTE = " The citywide figure is the average of its districts, weighted by their detections.";

export const DETECTIONS_TITLE = "Mosquito detections, last seven days";

export const DETECTIONS_BODY =
  "How many mosquitoes were identified in this district over the past seven days. Each one is a mosquito recognized " +
  "from a recorded buzz, by a phone or a smart trap. More detections suggest more mosquitoes around.";
