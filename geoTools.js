const iowaZipcodes = require("./iowaZipcodes.js").zips;

const haversineDistance = ([lat1, lon1], [lat2, lon2], isMiles = true) => {
  const toRadian = (angle) => (Math.PI / 180) * angle;
  const distance = (a, b) => (Math.PI / 180) * (a - b);
  const RADIUS_OF_EARTH_IN_KM = 6371;
  const dLat = distance(lat2, lat1);
  const dLon = distance(lon2, lon1);
  lat1 = toRadian(lat1);
  lat2 = toRadian(lat2);

  // Haversine Formula
  const a =
    Math.pow(Math.sin(dLat / 2), 2) +
    Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.asin(Math.sqrt(a));

  let finalDistance = RADIUS_OF_EARTH_IN_KM * c;
  if (isMiles) finalDistance /= 1.60934;

  return finalDistance;
};

const getCoordsFromZipcode = (zipcode) => {
  const zipObj = iowaZipcodes.find((a) => a.fields.zip === zipcode);
  return [zipObj.fields.latitude, zipObj.fields.longitude];
};

const getLocationsWithinRadius = (locations, userZip, radius) => {
  let result = [];

  if (locations === []) return [];

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const locationCoords = location.geometry.coordinates;
    const distance =
      Math.ceil(
        haversineDistance(
          locationCoords[0] < locationCoords[1]
            ? locationCoords.reverse()
            : locationCoords,
          getCoordsFromZipcode(userZip)
        ) / 10
      ) * 10;

    console.log(location.properties.name, distance);
    if (distance <= radius) {
      result.push(location);
    }
  }
  return result;
};

module.exports = { getLocationsWithinRadius };
