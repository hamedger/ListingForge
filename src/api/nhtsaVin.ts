import type { VinDecodedVehicle } from '@/src/domain/types';

type NhtsaRow = Record<string, string | undefined>;

function clean(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'not applicable' || s.toLowerCase() === 'error') return undefined;
  return s;
}

export async function decodeVinWithNhtsa(vin: string): Promise<VinDecodedVehicle> {
  const normalized = vin.trim().toUpperCase();
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${encodeURIComponent(
    normalized,
  )}?format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`VIN lookup failed (${res.status})`);
  }

  const json = (await res.json()) as { Results?: NhtsaRow[] };
  const row = json.Results?.[0];
  if (!row) {
    throw new Error('Unexpected VIN response');
  }

  return {
    vin: normalized,
    year: clean(row.ModelYear),
    make: clean(row.Make),
    model: clean(row.Model),
    trim: clean(row.Trim) ?? clean(row.Series),
    series: clean(row.Series),
    manufacturer: clean(row.Manufacturer),
    bodyClass: clean(row.BodyClass),
    driveType: clean(row.DriveType),
    fuelTypePrimary: clean(row.FuelTypePrimary),
    fuelTypeSecondary: clean(row.FuelTypeSecondary),
    transmissionStyle: clean(row.TransmissionStyle),
    transmissionSpeeds: clean(row.TransmissionSpeeds),
    doors: clean(row.Doors),
    seats: clean(row.Seats),
    seatRows: clean(row.SeatRows),
    engineCylinders: clean(row.EngineCylinders),
    engineHP: clean(row.EngineHP),
    engineKW: clean(row.EngineKW),
    engineModel: clean(row.EngineModel),
    engineConfiguration: clean(row.EngineConfiguration),
    displacementL: clean(row.DisplacementL),
    electrificationLevel: clean(row.ElectrificationLevel),
    batteryKWh: clean(row.BatteryKWh),
    batteryA: clean(row.BatteryA),
    batteryV: clean(row.BatteryV),
    chargingLevel: clean(row.ChargingLevel),
    gvwr: clean(row.GVWR),
  };
}
