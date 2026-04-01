import type { TripDraftInput, TripRecord } from "./types";

export const expenseCategories = [
  { label: "Accommodation", icon: "🏨", color: "#c99b67" },
  { label: "Transport", icon: "🚆", color: "#7ea6cf" },
  { label: "Food", icon: "🍜", color: "#d7a04f" },
  { label: "Activities", icon: "🎟️", color: "#9ab98a" },
  { label: "Shopping", icon: "🛍️", color: "#d9899a" },
  { label: "Other", icon: "✨", color: "#a89cc8" }
] as const;

export const defaultExpenseCategory = expenseCategories[0].label;

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

export const createInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value || 0);

export const totalTripBudget = (trip: TripRecord) =>
  trip.places.reduce((sum, place) => sum + place.estimate, 0) +
  trip.itinerary.reduce((sum, item) => sum + item.cost, 0) +
  trip.expenses.reduce((sum, item) => sum + item.amount, 0);

export const expensePerPerson = (trip: TripRecord) => {
  const memberCount = Math.max(trip.members.length, 1);
  return totalTripBudget(trip) / memberCount;
};

export const buildBlankTrip = (input?: Partial<TripDraftInput>): TripRecord => ({
  id: uid(),
  title: input?.title || "Whispering Valley Escape",
  destination: input?.destination || "Kyoto",
  tagline: input?.tagline || "Tea houses, train windows, and soft evening skies.",
  startDate: input?.startDate || "",
  endDate: input?.endDate || "",
  currency: input?.currency || "INR",
  inviteCode: createInviteCode(),
  coverMood: input?.coverMood || "Sunlit countryside",
  itinerary: [],
  places: [],
  expenses: [],
  checklist: [
    { id: uid(), label: "Book stay", done: false },
    { id: uid(), label: "Buy train passes", done: false },
    { id: uid(), label: "Save offline maps", done: false }
  ],
  notes: "",
  members: [{ id: uid(), name: "You" }],
  updatedAt: new Date().toISOString()
});

export const toMapSearchUrl = (query: string) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
