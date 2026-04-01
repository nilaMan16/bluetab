export type ItineraryItem = {
  id: string;
  title: string;
  day: string;
  time: string;
  notes: string;
  cost: number;
};

export type PlaceItem = {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  estimate: number;
  category: string;
};

export type ExpenseItem = {
  id: string;
  title: string;
  amount: number;
  category: string;
  date?: string;
  paidBy: string;
  splitBetween: string[];
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type TripMember = {
  id: string;
  name: string;
  email?: string;
};

export type TripRecord = {
  id: string;
  ownerId?: string;
  title: string;
  destination: string;
  tagline: string;
  startDate: string;
  endDate: string;
  currency: string;
  inviteCode: string;
  coverMood: string;
  itinerary: ItineraryItem[];
  places: PlaceItem[];
  expenses: ExpenseItem[];
  checklist: ChecklistItem[];
  notes: string;
  members: TripMember[];
  updatedAt: string;
  cloudSyncedAt?: string;
};

export type TripDraftInput = Pick<
  TripRecord,
  "title" | "destination" | "tagline" | "startDate" | "endDate" | "currency" | "coverMood"
>;

export type SupabaseTripRow = {
  id: string;
  owner_id: string;
  title: string;
  destination: string;
  tagline: string;
  start_date: string;
  end_date: string;
  currency: string;
  invite_code: string;
  cover_mood: string;
  itinerary: ItineraryItem[];
  places: PlaceItem[];
  expenses: ExpenseItem[];
  checklist: ChecklistItem[];
  notes: string;
  members: TripMember[];
  updated_at: string;
};
