import { mergeMatches } from "../lib/analytics/mergeMatches";
import { fetchTeamDataByName } from "../lib/fetchAll";
import { predictMatch } from "../lib/prediction/predictMatch";

async function main() {
  // Two teams genuinely outside our 5 configured leagues.
  const homeName = "River Plate";
  const awayName = "Boca Juniors";

  const [home, away] = await Promise.all([fetchTeamDataByName(homeName), fetchTeamDataByName(awayName)]);

  console.log("home resolvedLeague:", home.resolvedLeague, "fotmobLeagueName:", home.fotmobLeagueName);
  console.log("away resolvedLeague:", away.resolvedLeague, "fotmobLeagueName:", away.fotmobLeagueName);
  console.log(
    "home results:",
    home.results.map((r) => ({ source: r.source, matches: r.matches.length, error: r.error }))
  );
  console.log(
    "away results:",
    away.results.map((r) => ({ source: r.source, matches: r.matches.length, error: r.error }))
  );

  const homeMerged = mergeMatches(home.results);
  const awayMerged = mergeMatches(away.results);
  console.log("homeMerged length:", homeMerged.length, "awayMerged length:", awayMerged.length);

  if (homeMerged.length > 0 && awayMerged.length > 0) {
    const forecast = predictMatch(homeMerged, awayMerged);
    console.log("forecast:", JSON.stringify(forecast, null, 2));
  } else {
    console.log("Not enough data to forecast.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
