export type VehicleStepId =
  | 'front_3_4'
  | 'side'
  | 'rear_3_4'
  | 'interior_front'
  | 'dashboard'
  | 'odometer';

export interface VehicleCaptureStep {
  id: VehicleStepId;
  title: string;
  subtitle: string;
}

export const VEHICLE_CAPTURE_STEPS: VehicleCaptureStep[] = [
  {
    id: 'front_3_4',
    title: 'Front 3/4',
    subtitle: 'Stand at the front corner so we see the front and one full side.',
  },
  {
    id: 'side',
    title: 'Profile',
    subtitle: 'Straight side shot, wheels visible, whole vehicle in frame.',
  },
  {
    id: 'rear_3_4',
    title: 'Rear 3/4',
    subtitle: 'Rear corner angle showing the tail and one side.',
  },
  {
    id: 'interior_front',
    title: 'Interior (front)',
    subtitle: 'Front seats and door panels, even lighting.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    subtitle: 'Cluster and center stack, reduce windshield glare.',
  },
  {
    id: 'odometer',
    title: 'Odometer',
    subtitle: 'Clear mileage reading, no blur.',
  },
];
