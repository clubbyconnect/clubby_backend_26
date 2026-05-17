/** Offline-only post body validation (showroom required; reject legacy online fields). */

const ONLINE_ONLY_FIELDS = [
  'deliveryLocation',
  'delivery_location',
  'advancePayment',
  'advance_payment',
  'paymentMethod',
  'payment_method',
  'onlinePost',
  'online_post',
  'deliveryPoint',
  'delivery_point',
];

function findOnlineOnlyFields(body = {}) {
  return ONLINE_ONLY_FIELDS.filter(
    key => body[key] !== undefined && body[key] !== null && body[key] !== '',
  );
}

function validateShowroomLocation(body = {}) {
  const { store_location_latitude, store_location_longitude, showroomAddress } =
    body;
  const address =
    typeof showroomAddress === 'string' ? showroomAddress.trim() : '';
  const lat = parseFloat(store_location_latitude);
  const lng = parseFloat(store_location_longitude);

  if (!address) {
    return 'showroomAddress is required.';
  }
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return 'Valid store_location_latitude and store_location_longitude are required.';
  }
  return null;
}

function validateShowroomLocationIfPresent(body = {}) {
  const { store_location_latitude, store_location_longitude, showroomAddress } =
    body;
  const hasAny =
    store_location_latitude !== undefined ||
    store_location_longitude !== undefined ||
    showroomAddress !== undefined;

  if (!hasAny) {
    return null;
  }
  return validateShowroomLocation(body);
}

module.exports = {
  ONLINE_ONLY_FIELDS,
  findOnlineOnlyFields,
  validateShowroomLocation,
  validateShowroomLocationIfPresent,
};
