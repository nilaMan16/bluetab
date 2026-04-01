import Dexie, { type Table } from "dexie";
import type { TripRecord } from "./types";
import { normalizeTrip } from "./utils";

class JourneyDatabase extends Dexie {
  trips!: Table<TripRecord, string>;

  constructor() {
    super("studio-journey");
    this.version(1).stores({
      trips: "id, updatedAt, inviteCode"
    });
  }
}

export const db = new JourneyDatabase();

export const loadLocalTrips = async () => {
  const trips = await db.trips.orderBy("updatedAt").reverse().toArray();
  return trips.map(normalizeTrip);
};

export const saveLocalTrip = async (trip: TripRecord) => {
  await db.trips.put({
    ...normalizeTrip(trip),
    updatedAt: new Date().toISOString()
  });
};

export const removeLocalTrip = async (tripId: string) => {
  await db.trips.delete(tripId);
};
