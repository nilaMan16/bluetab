import Dexie, { type Table } from "dexie";
import type { TripRecord } from "./types";

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

export const loadLocalTrips = () => db.trips.orderBy("updatedAt").reverse().toArray();

export const saveLocalTrip = async (trip: TripRecord) => {
  await db.trips.put({
    ...trip,
    updatedAt: new Date().toISOString()
  });
};

export const removeLocalTrip = async (tripId: string) => {
  await db.trips.delete(tripId);
};
