const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidVin(vin: string) {
  return VIN_RE.test(normalizeVin(vin));
}
