import type { Session } from "@supabase/supabase-js";
import { saveLocalTrip } from "./local-db";
import { hasSupabaseEnv, supabase } from "./supabase";
import type { SupabaseTripRow, TripRecord } from "./types";

const mapTripToRow = (trip: TripRecord, ownerId: string): SupabaseTripRow => ({
  id: trip.id,
  owner_id: ownerId,
  title: trip.title,
  destination: trip.destination,
  tagline: trip.tagline,
  start_date: trip.startDate,
  end_date: trip.endDate,
  currency: trip.currency,
  invite_code: trip.inviteCode,
  cover_mood: trip.coverMood,
  itinerary: trip.itinerary,
  places: trip.places,
  expenses: trip.expenses,
  checklist: trip.checklist,
  notes: trip.notes,
  members: trip.members,
  updated_at: new Date().toISOString()
});

const mapRowToTrip = (row: SupabaseTripRow): TripRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  destination: row.destination,
  tagline: row.tagline,
  startDate: row.start_date,
  endDate: row.end_date,
  currency: row.currency,
  inviteCode: row.invite_code,
  coverMood: row.cover_mood,
  itinerary: row.itinerary || [],
  places: row.places || [],
  expenses: row.expenses || [],
  checklist: row.checklist || [],
  notes: row.notes || "",
  members: row.members || [],
  updatedAt: row.updated_at,
  cloudSyncedAt: row.updated_at
});

export const syncTripToCloud = async (trip: TripRecord, session: Session | null) => {
  if (!hasSupabaseEnv || !supabase || !session?.user) {
    return trip;
  }

  const row = mapTripToRow(trip, trip.ownerId || session.user.id);
  const { data, error } = await supabase
    .from("trips")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error || !data) {
    throw error || new Error("Trip sync failed.");
  }

  const syncedTrip = mapRowToTrip(data as SupabaseTripRow);
  await saveLocalTrip(syncedTrip);
  return syncedTrip;
};

export const fetchCloudTrips = async (session: Session | null) => {
  if (!hasSupabaseEnv || !supabase || !session?.user) {
    return [] as TripRecord[];
  }

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error || !data) {
    throw error || new Error("Cloud fetch failed.");
  }

  const trips = (data as SupabaseTripRow[]).map(mapRowToTrip);
  await Promise.all(trips.map((trip) => saveLocalTrip(trip)));
  return trips;
};

export const joinTripByInviteCode = async (inviteCode: string, session: Session | null) => {
  if (!hasSupabaseEnv || !supabase || !session?.user) {
    throw new Error("Cloud sync is not configured.");
  }

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .single();

  if (error || !data) {
    throw new Error("No online group was found for that Group ID. Ask the creator to sign in and sync the trip first.");
  }

  const row = data as SupabaseTripRow;
  const existingMember = row.members.find((member) => member.id === session.user.id);
  const nextMembers = existingMember
    ? row.members
    : [
        ...row.members,
        {
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email || "Travel friend",
          email: session.user.email
        }
      ];

  const { data: updatedRow, error: updateError } = await supabase
    .from("trips")
    .update({
      members: nextMembers,
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .select()
    .single();

  if (updateError || !updatedRow) {
    throw new Error("This group exists, but joining failed. Ask the creator to open the trip and sync again.");
  }

  const trip = mapRowToTrip(updatedRow as SupabaseTripRow);
  await saveLocalTrip(trip);
  return trip;
};
