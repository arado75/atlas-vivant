import { validateCities } from "../../data/city-validation";
import {
  temperatureReferenceCities,
  temperatureReferenceCitiesValidationReport
} from "../../data/temperatureReferenceCities";

const requiredMajorCityIds = [
  "paris",
  "london",
  "berlin",
  "madrid",
  "rome",
  "amsterdam",
  "brussels",
  "vienna",
  "warsaw",
  "prague",
  "budapest",
  "athens",
  "lisbon",
  "dublin",
  "copenhagen",
  "stockholm",
  "oslo",
  "helsinki",
  "zurich",
  "geneva",
  "munich",
  "hamburg",
  "bratislava",
  "riga",
  "vilnius",
  "tallinn",
  "new_york",
  "mexico_city",
  "sao_paulo",
  "lagos",
  "cairo",
  "mumbai",
  "tokyo",
  "sydney"
];

export function runCityValidationCheck() {
  const finalReport = validateCities(temperatureReferenceCities);
  const cityIdSet = new Set(temperatureReferenceCities.map((city) => city.id));
  const missingMajorCities = requiredMajorCityIds.filter((cityId) => !cityIdSet.has(cityId));

  console.log("\n[AtlasMind][CityValidation]");
  console.log("Nombre de villes (final):", temperatureReferenceCities.length);
  console.log("Doublons detectes (normalisation):", temperatureReferenceCitiesValidationReport.duplicateCount);
  console.log(
    "Anomalies corrigees (coordonnees):",
    temperatureReferenceCitiesValidationReport.correctedCoordinatesCount
  );
  console.log("Villes ajoutees:", temperatureReferenceCitiesValidationReport.addedCities);
  console.log("Doublons proches restants (<5km):", finalReport.nearDuplicateCount);
  console.log("Coordonnees invalides restantes:", finalReport.invalidCoordinateCount);
  console.log("Grandes villes/capitales manquantes:", missingMajorCities);

  return {
    totalCities: temperatureReferenceCities.length,
    normalization: {
      duplicatesDetected: temperatureReferenceCitiesValidationReport.duplicateCount,
      removedDuplicates: temperatureReferenceCitiesValidationReport.removedDuplicatesCount,
      correctedCoordinates: temperatureReferenceCitiesValidationReport.correctedCoordinatesCount,
      addedCities: temperatureReferenceCitiesValidationReport.addedCities
    },
    finalValidation: {
      invalidCoordinates: finalReport.invalidCoordinateCount,
      nearDuplicates: finalReport.nearDuplicateCount
    },
    missingMajorCities,
    isDatasetStable:
      finalReport.invalidCoordinateCount === 0 &&
      finalReport.nearDuplicateCount === 0 &&
      missingMajorCities.length === 0
  };
}
