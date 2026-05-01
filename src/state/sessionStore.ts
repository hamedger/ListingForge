import { create } from 'zustand';

import type {
  CapturedItemPhoto,
  CapturedStepPhoto,
  ConditionTier,
  GeneratedListing,
  ItemProductProfile,
  ListingMode,
  VinDecodedVehicle,
} from '@/src/domain/types';

interface SessionState {
  mode: ListingMode | null;
  vin: VinDecodedVehicle | null;
  condition: ConditionTier | null;
  vehicleDefectNotes: string;
  vehiclePhotos: CapturedStepPhoto[];
  itemPhotos: string[];
  itemPhotoPairs: CapturedItemPhoto[];
  itemNotes: string;
  itemSerial: string;
  itemProfile: ItemProductProfile | null;
  listing: GeneratedListing | null;
  ownerUnlocked: boolean;
  ownerPin: string | null;
  reset: () => void;
  setMode: (mode: ListingMode) => void;
  setVin: (vin: VinDecodedVehicle | null) => void;
  setCondition: (c: ConditionTier | null) => void;
  setVehicleDefectNotes: (notes: string) => void;
  setVehiclePhotos: (photos: CapturedStepPhoto[]) => void;
  addVehiclePhoto: (photo: CapturedStepPhoto) => void;
  upsertVehiclePhoto: (photo: CapturedStepPhoto) => void;
  setItemPhotos: (uris: string[]) => void;
  addItemPhoto: (uri: string) => void;
  addItemPhotoPair: (photo: CapturedItemPhoto) => void;
  setItemPhotoPairs: (photos: CapturedItemPhoto[]) => void;
  setItemNotes: (notes: string) => void;
  setItemSerial: (serial: string) => void;
  setItemProfile: (profile: ItemProductProfile | null) => void;
  setListing: (listing: GeneratedListing | null) => void;
  setOwnerAccess: (params: { unlocked: boolean; pin: string | null }) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  mode: null,
  vin: null,
  condition: null,
  vehicleDefectNotes: '',
  vehiclePhotos: [],
  itemPhotos: [],
  itemPhotoPairs: [],
  itemNotes: '',
  itemSerial: '',
  itemProfile: null,
  listing: null,
  ownerUnlocked: false,
  ownerPin: null,
  reset: () =>
    set({
      mode: null,
      vin: null,
      condition: null,
      vehicleDefectNotes: '',
      vehiclePhotos: [],
      itemPhotos: [],
      itemPhotoPairs: [],
      itemNotes: '',
      itemSerial: '',
      itemProfile: null,
      listing: null,
      ownerUnlocked: false,
      ownerPin: null,
    }),
  setMode: (mode) => set({ mode }),
  setVin: (vin) => set({ vin }),
  setCondition: (condition) => set({ condition }),
  setVehicleDefectNotes: (vehicleDefectNotes) => set({ vehicleDefectNotes }),
  setVehiclePhotos: (vehiclePhotos) => set({ vehiclePhotos }),
  addVehiclePhoto: (photo) => set((s) => ({ vehiclePhotos: [...s.vehiclePhotos, photo] })),
  upsertVehiclePhoto: (photo) =>
    set((s) => ({
      vehiclePhotos: [...s.vehiclePhotos.filter((p) => p.stepId !== photo.stepId), photo],
    })),
  setItemPhotos: (itemPhotos) => set({ itemPhotos }),
  addItemPhoto: (uri) => set((s) => ({ itemPhotos: [...s.itemPhotos, uri] })),
  addItemPhotoPair: (photo) => set((s) => ({ itemPhotoPairs: [...s.itemPhotoPairs, photo] })),
  setItemPhotoPairs: (itemPhotoPairs) => set({ itemPhotoPairs }),
  setItemNotes: (itemNotes) => set({ itemNotes }),
  setItemSerial: (itemSerial) => set({ itemSerial }),
  setItemProfile: (itemProfile) => set({ itemProfile }),
  setListing: (listing) => set({ listing }),
  setOwnerAccess: ({ unlocked, pin }) => set({ ownerUnlocked: unlocked, ownerPin: pin }),
}));
