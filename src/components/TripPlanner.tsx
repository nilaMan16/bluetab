import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchCloudTrips, joinTripByInviteCode, syncTripToCloud } from "../lib/sync";
import { supabase } from "../lib/supabase";
import { loadLocalTrips, removeLocalTrip, saveLocalTrip } from "../lib/local-db";
import {
  buildBlankTrip,
  createInviteCode,
  defaultExpenseCategory,
  expenseCategories,
  expensePerPerson,
  formatMoney,
  toMapSearchUrl,
  totalTripBudget,
  uid
} from "../lib/utils";
import type { TripRecord } from "../lib/types";

type TripPlannerProps = {
  session: Session | null;
  offlineOnly: boolean;
  preferredEntryMode?: "choose" | "create";
};

type PlannerTab = "overview" | "itinerary" | "places" | "budget" | "group" | "split" | "packing" | "notes";
type SplitView = "expenses" | "balances" | "settle" | "activity";

const tabs: Array<{ id: PlannerTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "🗺️" },
  { id: "itinerary", label: "Itinerary", icon: "🗓️" },
  { id: "places", label: "Places", icon: "📍" },
  { id: "budget", label: "Budget", icon: "💰" },
  { id: "group", label: "Group", icon: "👥" },
  { id: "split", label: "Split", icon: "💸" },
  { id: "packing", label: "Packing", icon: "🎒" },
  { id: "notes", label: "Notes", icon: "📝" }
];

type Settlement = {
  from: string;
  to: string;
  amount: number;
};

const categoryMetaByName = new Map<string, (typeof expenseCategories)[number]>(
  expenseCategories.map((item) => [item.label, item])
);

const buildBalanceMap = (trip: TripRecord) => {
  const memberNames = trip.members.map((member) => member.name.trim()).filter(Boolean);
  const uniqueMembers = Array.from(new Set(memberNames.length ? memberNames : ["Traveler"]));
  const balances = new Map<string, number>(uniqueMembers.map((name) => [name, 0]));

  trip.expenses.forEach((expense) => {
    const participants = expense.splitBetween.filter(Boolean);
    const splitMembers = participants.length ? participants : uniqueMembers;
    const share = splitMembers.length ? expense.amount / splitMembers.length : 0;

    splitMembers.forEach((name) => {
      balances.set(name, (balances.get(name) || 0) - share);
    });

    if (expense.paidBy) {
      balances.set(expense.paidBy, (balances.get(expense.paidBy) || 0) + expense.amount);
    }
  });

  return balances;
};

const buildSettlements = (balances: Map<string, number>) => {
  const creditors = Array.from(balances.entries())
    .filter(([, amount]) => amount > 0.5)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Array.from(balances.entries())
    .filter(([, amount]) => amount < -0.5)
    .map(([name, amount]) => ({ name, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    settlements.push({
      from: debtor.name,
      to: creditor.name,
      amount
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount <= 0.5) {
      creditorIndex += 1;
    }

    if (debtor.amount <= 0.5) {
      debtorIndex += 1;
    }
  }

  return settlements;
};

function ForestSpirit() {
  return (
    <svg viewBox="0 0 180 180" className="character spirit-character" aria-hidden="true">
      <defs>
        <linearGradient id="spiritGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8ebc8" />
          <stop offset="100%" stopColor="#bfdabb" />
        </linearGradient>
      </defs>
      <ellipse cx="95" cy="155" rx="46" ry="14" fill="rgba(51, 78, 55, 0.12)" />
      <path
        d="M45 120c0-33 20-70 46-70 28 0 45 36 45 68 0 23-16 37-45 37-31 0-46-12-46-35Z"
        fill="url(#spiritGlow)"
        stroke="#5f7d63"
        strokeWidth="3"
      />
      <circle cx="77" cy="102" r="5" fill="#2e312d" />
      <circle cx="106" cy="102" r="5" fill="#2e312d" />
      <path d="M82 121c7 5 15 5 22 0" stroke="#2e312d" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 58c10-18 18-27 28-31 4 14 3 24-5 33" fill="#7fa274" />
      <path d="M113 55c5-16 12-27 23-35 6 15 3 26-9 37" fill="#9abc86" />
      <circle cx="56" cy="127" r="8" fill="#f1cb8c" />
    </svg>
  );
}

function LanternBird() {
  return (
    <svg viewBox="0 0 180 180" className="character bird-character" aria-hidden="true">
      <ellipse cx="93" cy="150" rx="48" ry="13" fill="rgba(51, 78, 55, 0.1)" />
      <path
        d="M55 110c0-24 16-46 40-46 28 0 49 21 49 47 0 24-18 38-47 38-26 0-42-13-42-39Z"
        fill="#f3e0a7"
        stroke="#6b815a"
        strokeWidth="3"
      />
      <circle cx="109" cy="96" r="5" fill="#31312f" />
      <path d="M122 101l18 7-16 7" fill="#d98554" />
      <path d="M62 96c-11-6-20-8-28-8 7 8 14 14 27 18" fill="#97b888" />
      <path d="M78 58c8-14 18-24 31-30 2 17-2 28-15 38" fill="#7aa06e" />
      <circle cx="77" cy="71" r="15" fill="#ffcf74" />
      <path d="M77 49v12M77 81v11M55 71h11M88 71h11" stroke="#fff8df" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function TripPlanner({ session, offlineOnly, preferredEntryMode = "choose" }: TripPlannerProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<PlannerTab>("overview");
  const [splitView, setSplitView] = useState<SplitView>("expenses");
  const [status, setStatus] = useState("Choose whether to create a trip or join a group.");
  const [joinCode, setJoinCode] = useState("");
  const [tripSwitcherOpen, setTripSwitcherOpen] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [entryMode, setEntryMode] = useState<"choose" | "create" | "join">("choose");

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;

    const updateLowDataMode = () => {
      const effectiveType = connection?.effectiveType || "";
      setLowDataMode(Boolean(connection?.saveData || effectiveType.includes("2g")));
    };

    updateLowDataMode();
    connection?.addEventListener?.("change", updateLowDataMode);

    return () => {
      connection?.removeEventListener?.("change", updateLowDataMode);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const localTrips = await loadLocalTrips();

      if (localTrips.length) {
        setTrips(localTrips);
        setActiveTripId(localTrips[0].id);
      } else {
        setTrips([]);
        setActiveTripId("");
      }

      if (session && !offlineOnly) {
        try {
          const cloudTrips = await fetchCloudTrips(session);
          if (cloudTrips.length) {
            setTrips(cloudTrips);
            setActiveTripId((current) => current || cloudTrips[0].id);
            setStatus("Cloud sync is active.");
          } else {
            setStatus("Create a trip or join a group with a Group ID.");
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Cloud sync is temporarily unavailable.");
        }
      } else {
        setStatus("Working locally. Sign in when you want to sync or join a group.");
      }
    };

    void load();
  }, [offlineOnly, session]);

  useEffect(() => {
    if (!trips.length) {
      setEntryMode(preferredEntryMode);
    }
  }, [preferredEntryMode, trips.length]);

  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId) ?? trips[0] ?? null,
    [activeTripId, trips]
  );

  const addExpense = async () => {
    if (!activeTrip) {
      return;
    }

    await updateTrip((trip) => ({
      ...trip,
      expenses: [
        ...trip.expenses,
        {
          id: uid(),
          title: "",
          amount: 0,
          category: defaultExpenseCategory,
          date: new Date().toISOString().slice(0, 10),
          paidBy: trip.members[0]?.name || "",
          splitBetween: trip.members.map((member) => member.name).filter(Boolean)
        }
      ]
    }));
    setActiveTab("split");
    setSplitView("expenses");
  };

  const addItineraryStop = async (dayValue?: string) => {
    if (!activeTrip) {
      return;
    }

    await updateTrip((trip) => ({
      ...trip,
      itinerary: [
        ...trip.itinerary,
        {
          id: uid(),
          title: "",
          day: dayValue ?? trip.startDate ?? "",
          time: "09:00",
          location: "",
          mapUrl: "",
          notes: "",
          cost: 0
        }
      ]
    }));
  };

  const addItineraryDay = async () => {
    const sortedDays = (activeTrip?.itinerary || [])
      .map((item) => item.day)
      .filter(Boolean)
      .sort();
    const nextDay = sortedDays[sortedDays.length - 1] || activeTrip?.startDate || "";

    const resolvedDay = nextDay
      ? new Date(new Date(nextDay).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : "";

    await addItineraryStop(resolvedDay);
  };
  const updateTrip = async (updater: (trip: TripRecord) => TripRecord) => {
    if (!activeTrip) {
      return;
    }

    const nextTrip = {
      ...updater(activeTrip),
      currency: "INR",
      updatedAt: new Date().toISOString()
    };

    setTrips((current) => current.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)));
    await saveLocalTrip(nextTrip);

    if (session && !offlineOnly) {
      try {
        const synced = await syncTripToCloud(nextTrip, session);
        setTrips((current) => current.map((trip) => (trip.id === synced.id ? synced : trip)));
        setStatus(`Synced ${synced.title} to the cloud.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Saved locally. Cloud sync will retry later.");
      }
    }
  };

  const createTrip = async () => {
    if (!session) {
      setStatus("Sign in first so your new trip can get a Group ID and sync to the cloud.");
      return;
    }

    if (offlineOnly) {
      setStatus("Reconnect to the internet to create and share a new group.");
      return;
    }

    const creatorName =
      session.user.user_metadata?.full_name?.trim() ||
      session.user.email?.split("@")[0]?.trim() ||
      "Creator";

    const freshTrip = {
      ...buildBlankTrip(),
      members: [{ id: session.user.id, name: creatorName }]
    };
    setStatus("Creating trip and syncing Group ID...");

    let nextTrip = freshTrip;
    try {
      nextTrip = await syncTripToCloud(freshTrip, session);
      setStatus(`Trip created and synced. Group ID: ${nextTrip.inviteCode}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not sync the trip right now. Please try again.");
      return;
    }

    await saveLocalTrip(nextTrip);
    setTrips((current) => [nextTrip, ...current]);
    setActiveTripId(nextTrip.id);
    setActiveTab("overview");
    setEntryMode("choose");
  };

  const deleteTrip = async () => {
    if (!activeTrip) {
      return;
    }

    await removeLocalTrip(activeTrip.id);
    const remaining = trips.filter((trip) => trip.id !== activeTrip.id);
    setTrips(remaining);
    setActiveTripId(remaining[0]?.id || "");
  };

  const handleJoinTrip = async () => {
    if (!session || !joinCode.trim()) {
      return;
    }

    try {
      const joinedTrip = await joinTripByInviteCode(joinCode, session);
      setTrips((current) => {
        const withoutCurrent = current.filter((trip) => trip.id !== joinedTrip.id);
        return [joinedTrip, ...withoutCurrent];
      });
      setActiveTripId(joinedTrip.id);
      setActiveTab("overview");
      setJoinCode("");
      setEntryMode("choose");
      setStatus(`Joined ${joinedTrip.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to join trip.");
    }
  };

  if (!activeTrip) {
    return (
      <div className="planner-v2">
        <section className="planner-header card">
          <div className="brand-lockup">
            <img src="/bluetab-logo.png" alt="BlueTab logo" className="brand-logo-image" />
            <div>
              <h2>BlueTab</h2>
              <p className="eyebrow">Journey Planner</p>
            </div>
          </div>
        </section>

        <section className="card onboarding-card">
          <div className="onboarding-copy">
            <p className="eyebrow">Start here</p>
            <h2>Create or join</h2>
            <p className="muted">Create your first trip or enter a Group ID to join friends.</p>
          </div>

          <div className="onboarding-actions">
            <button
              type="button"
              className={`onboarding-choice ${entryMode === "create" ? "active" : ""}`}
              onClick={() => setEntryMode("create")}
            >
              Create trip
            </button>
            <button
              type="button"
              className={`onboarding-choice ${entryMode === "join" ? "active" : ""}`}
              onClick={() => setEntryMode("join")}
            >
              Join group
            </button>
          </div>

          {entryMode === "create" ? (
            <div className="onboarding-panel">
              <p className="muted">A Group ID is assigned automatically and the trip is synced online as soon as it is created.</p>
              <button
                type="button"
                className="primary-button"
                onClick={createTrip}
              >
                Create trip
              </button>
              {!session ? <p className="helper">Sign in to create a shareable trip.</p> : null}
              {session && offlineOnly ? <p className="helper">Reconnect to create and sync a new trip.</p> : null}
              <p className="status-line">{status}</p>
            </div>
          ) : null}

          {entryMode === "join" ? (
            <div className="onboarding-panel">
              <input
                value={joinCode}
                placeholder="Enter Group ID"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button type="button" className="primary-button" onClick={handleJoinTrip} disabled={!session}>
                Join group
              </button>
              <p className="helper">{session ? "Enter the Group ID shared by your trip creator." : "Sign in to join a shared group."}</p>
              {session ? <p className="status-line">{status}</p> : null}
            </div>
          ) : null}

          {entryMode === "choose" ? <p className="helper">{status}</p> : null}
        </section>
      </div>
    );
  }

  const recommendedBudget = totalTripBudget(activeTrip);
  const perTraveler = expensePerPerson(activeTrip);
  const tripDays =
    activeTrip.startDate && activeTrip.endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(activeTrip.endDate).getTime() - new Date(activeTrip.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      : 0;
  const spentTotal = activeTrip.expenses.reduce((sum, item) => sum + item.amount, 0);
  const plannedPercent = activeTrip.checklist.length
    ? Math.round((activeTrip.checklist.filter((item) => item.done).length / activeTrip.checklist.length) * 100)
    : 0;
  const mappedStops = activeTrip.itinerary
    .map((item) => ({
      id: item.id,
      name: item.title.trim(),
      address: item.location.trim(),
      mapUrl: item.mapUrl.trim() || toMapSearchUrl(item.location.trim())
    }))
    .filter((item) => item.name || item.address);
  const placesRouteLabel = `${activeTrip.destination || "Trip"} Route`;
  const primaryMapUrl =
    mappedStops.find((place) => place.mapUrl)?.mapUrl ||
    toMapSearchUrl(mappedStops.map((place) => place.address || place.name).filter(Boolean).join(" "));
  const estimatedJourneyKm = Math.max(mappedStops.length * 168, activeTrip.itinerary.length * 42, 0);
  const memberNames = activeTrip.members.map((member) => member.name.trim()).filter(Boolean);
  const expenseBalances = buildBalanceMap(activeTrip);
  const settlements = buildSettlements(expenseBalances);
  const balanceCards = Array.from(expenseBalances.entries()).map(([name, amount]) => ({
    name,
    amount
  }));
  const totalBudgetTarget = Math.max(recommendedBudget, spentTotal);
  const budgetRemaining = Math.max(totalBudgetTarget - spentTotal, 0);
  const budgetProgress = totalBudgetTarget ? Math.min((spentTotal / totalBudgetTarget) * 100, 100) : 0;
  const expensesByCategory = expenseCategories
    .map((category) => ({
      ...category,
      total: activeTrip.expenses
        .filter((expense) => (expense.category || defaultExpenseCategory) === category.label)
        .reduce((sum, expense) => sum + expense.amount, 0)
    }))
    .filter((category) => category.total > 0);
  const highestCategoryTotal = Math.max(...expensesByCategory.map((item) => item.total), 0);
  const recentExpenses = [...activeTrip.expenses]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 6);
  const groupedItinerary = Array.from(
    activeTrip.itinerary.reduce((map, item, index) => {
      const key = item.day || `undated-${index}`;
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
      return map;
    }, new Map<string, typeof activeTrip.itinerary>())
  );
  const shareJoinLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/?join=${encodeURIComponent(activeTrip.inviteCode)}`
      : activeTrip.inviteCode;

  const topStats = [
    { label: "Days", value: tripDays || "--" },
    { label: "Places", value: mappedStops.length || 0 },
    { label: "Budget", value: formatMoney(recommendedBudget, "INR") },
    { label: "Travelers", value: activeTrip.members.length || 1 }
  ];

  const copyGroupCode = async () => {
    try {
      await navigator.clipboard.writeText(activeTrip.inviteCode);
      setStatus("Group ID copied.");
    } catch {
      setStatus("Could not copy the Group ID.");
    }
  };

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(shareJoinLink);
      setStatus("Join link copied.");
    } catch {
      setStatus("Could not copy the join link.");
    }
  };

  const shareOnWhatsApp = () => {
    const text = encodeURIComponent(`Join my BlueTab trip with Group ID ${activeTrip.inviteCode}\n${shareJoinLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const regenerateGroupCode = () =>
    void updateTrip((trip) => ({
      ...trip,
      inviteCode: createInviteCode()
    }));

  return (
    <div className="planner-v2">
      <section className="planner-header card">
        <div className="brand-lockup">
          <img src="/bluetab-logo.png" alt="BlueTab logo" className="brand-logo-image" />
          <div>
            <h2>BlueTab</h2>
            <p className="eyebrow">Journey Planner</p>
          </div>
        </div>

        <div className="header-actions">
          {session && supabase ? (
            <button
              className="ghost-button compact-button"
              type="button"
              onClick={() => void syncTripToCloud(activeTrip, session)}
            >
              Share
            </button>
          ) : null}
        </div>
      </section>

      <section className="trip-picker">
        <div className="trip-switcher">
          <button
            type="button"
            className={`trip-pill active trip-switcher-trigger ${tripSwitcherOpen ? "open" : ""}`}
            onClick={() => setTripSwitcherOpen((current) => !current)}
          >
            <div>
              <strong>{activeTrip.title}</strong>
            </div>
            <span className="switcher-caret">{tripSwitcherOpen ? "▴" : "▾"}</span>
          </button>

          {tripSwitcherOpen ? (
            <div className="trip-switcher-menu">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  className={`trip-switcher-item ${trip.id === activeTrip.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveTripId(trip.id);
                    setTripSwitcherOpen(false);
                  }}
                >
                  <strong>{trip.title}</strong>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={createTrip}
        >
          New trip
        </button>
      </section>

      <nav className="tab-strip" aria-label="Planner sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-chip ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <>
          <section className="hero-panel card">
            <div className="hero-copy">
              <div className="title-band">
                <input
                  className="hero-title"
                  value={activeTrip.title}
                  placeholder="Add trip name"
                  onChange={(e) => void updateTrip((trip) => ({ ...trip, title: e.target.value }))}
                />
              </div>
              <div className="hero-date-grid">
                <label>
                  Departure
                  <input
                    type="date"
                    value={activeTrip.startDate}
                    onChange={(e) => void updateTrip((trip) => ({ ...trip, startDate: e.target.value }))}
                  />
                </label>
                <label>
                  Return
                  <input
                    type="date"
                    value={activeTrip.endDate}
                    onChange={(e) => void updateTrip((trip) => ({ ...trip, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <div className="hero-stats">
                {topStats.map((stat) => (
                  <div key={stat.label} className="mini-stat">
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-illustration">
              {!lowDataMode ? (
                <>
                  <ForestSpirit />
                  <LanternBird />
                </>
              ) : null}
              <p className="muted">{activeTrip.tagline}</p>
              {lowDataMode ? <p className="helper">Low-data mode keeps visuals lighter in weak networks.</p> : null}
            </div>
          </section>

          <section className="overview-grid">
          <article className="card summary-card">
            <span className="icon-badge">✅</span>
            <div>
              <strong>{plannedPercent}%</strong>
              <span>Planned</span>
            </div>
          </article>
          <article className="card summary-card">
            <span className="icon-badge">🏨</span>
            <div>
              <strong>{mappedStops.length}</strong>
              <span>Mapped</span>
            </div>
          </article>
          <article className="card summary-card">
            <span className="icon-badge">💸</span>
            <div>
              <strong>{formatMoney(spentTotal, "INR")}</strong>
              <span>Spent</span>
            </div>
          </article>
          <article className="card summary-card">
            <span className="icon-badge">🤝</span>
            <div>
              <strong>{formatMoney(perTraveler, "INR")}</strong>
              <span>Split each</span>
            </div>
          </article>

          <article className="card spotlight-stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Trip details</p>
                <h3>Overview</h3>
              </div>
            </div>
            <div className="compact-form">
              <label>
                Destination
                <input
                  value={activeTrip.destination}
                  placeholder="Add destination"
                  onChange={(e) => void updateTrip((trip) => ({ ...trip, destination: e.target.value }))}
                />
              </label>
              <label>
                Group ID
                <input
                  value={activeTrip.inviteCode}
                  readOnly
                />
              </label>
            </div>
            <textarea
              value={activeTrip.tagline}
              placeholder="Add a short note"
              onChange={(e) => void updateTrip((trip) => ({ ...trip, tagline: e.target.value }))}
            />
          </article>

          <article className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Travel crew</p>
                <h3>Members</h3>
              </div>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() =>
                  void updateTrip((trip) => ({
                    ...trip,
                    members: [...trip.members, { id: uid(), name: "" }]
                  }))
                }
              >
                Add
              </button>
            </div>
            <div className="member-list">
              {activeTrip.members.map((member, index) => (
                <div key={member.id} className="numbered-inline-field">
                  <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                  <input
                    value={member.name}
                    placeholder="Add member name"
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        members: trip.members.map((entry) =>
                          entry.id === member.id ? { ...entry, name: e.target.value } : entry
                        )
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <p className="eyebrow">Join group</p>
            <h3>Group ID</h3>
            <div className="stacked-row">
              <input
                value={joinCode}
                placeholder="Enter Group ID"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <button className="ghost-button compact-button" type="button" onClick={handleJoinTrip} disabled={!session}>
                Join group
              </button>
            </div>
            <p className="helper">
              {session ? "Join another group anytime with its Group ID." : "Sign in to join another shared group."}
            </p>
            {session ? <p className="status-line">{status}</p> : null}
          </article>
          </section>
        </>
      ) : null}

      {activeTab === "itinerary" ? (
        <section className="card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Your journey unfolding</p>
              <h3>Day by Day</h3>
            </div>
            <button
              className="ghost-button compact-button"
              type="button"
              onClick={() => void addItineraryStop()}
            >
              + Add event
            </button>
          </div>
          <div className="day-stack">
            {groupedItinerary.map(([groupKey, items], dayIndex) => (
              <article key={groupKey} className="day-card">
                <div className="day-card-head">
                  <div className="day-card-title">
                    <span className="day-badge">{dayIndex + 1}</span>
                    <div>
                      <h4>{`Day ${dayIndex + 1}`}</h4>
                      <p className="helper">{groupKey.startsWith("undated-") ? "Date not set" : groupKey}</p>
                    </div>
                  </div>
                  <button
                    className="ghost-button compact-button"
                    type="button"
                    onClick={() => void addItineraryStop(groupKey.startsWith("undated-") ? "" : groupKey)}
                  >
                    + Add event
                  </button>
                </div>

                <div className="stack-list">
                  {items.map((item) => (
                    <div key={item.id} className="list-card">
                      <input
                        value={item.title}
                        placeholder="Add event"
                        onChange={(e) =>
                          void updateTrip((trip) => ({
                            ...trip,
                            itinerary: trip.itinerary.map((entry) =>
                              entry.id === item.id ? { ...entry, title: e.target.value } : entry
                            )
                          }))
                        }
                      />
                      <div className="three-column">
                        <input
                          type="date"
                          value={item.day}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              itinerary: trip.itinerary.map((entry) =>
                                entry.id === item.id ? { ...entry, day: e.target.value } : entry
                              )
                            }))
                          }
                        />
                        <input
                          type="time"
                          value={item.time}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              itinerary: trip.itinerary.map((entry) =>
                                entry.id === item.id ? { ...entry, time: e.target.value } : entry
                              )
                            }))
                          }
                        />
                        <input
                          type="number"
                          value={item.cost}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              itinerary: trip.itinerary.map((entry) =>
                                entry.id === item.id ? { ...entry, cost: Number(e.target.value) } : entry
                              )
                            }))
                          }
                        />
                      </div>
                      <div className="two-column">
                        <input
                          value={item.location}
                          placeholder="Add location"
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              itinerary: trip.itinerary.map((entry) =>
                                entry.id === item.id
                                  ? {
                                      ...entry,
                                      location: e.target.value,
                                      mapUrl:
                                        entry.mapUrl ||
                                        (e.target.value.trim() ? toMapSearchUrl(e.target.value.trim()) : "")
                                    }
                                  : entry
                              )
                            }))
                          }
                        />
                        <input
                          value={item.mapUrl}
                          placeholder="Paste map link"
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              itinerary: trip.itinerary.map((entry) =>
                                entry.id === item.id ? { ...entry, mapUrl: e.target.value } : entry
                              )
                            }))
                          }
                        />
                      </div>
                      <textarea
                        value={item.notes}
                        onChange={(e) =>
                          void updateTrip((trip) => ({
                            ...trip,
                            itinerary: trip.itinerary.map((entry) =>
                              entry.id === item.id ? { ...entry, notes: e.target.value } : entry
                            )
                          }))
                        }
                        placeholder="Add notes"
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {!activeTrip.itinerary.length ? (
              <button className="primary-button full-button" type="button" onClick={() => void addItineraryDay()}>
                + Add New Day
              </button>
            ) : null}
            {activeTrip.itinerary.length ? (
              <button className="primary-button full-button" type="button" onClick={() => void addItineraryDay()}>
                + Add New Day
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "places" ? (
        <section className="card">
          <div className="route-map-card">
            <div className="route-map-glow route-map-glow-a" />
            <div className="route-map-glow route-map-glow-b" />
            {!lowDataMode ? (
              <img
                src="/ghibli-stickers.jpeg"
                alt="Character stickers"
                className="route-sticker-burst"
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {mappedStops.slice(0, 4).map((stop, index) => (
              <div
                key={stop.id}
                className={`route-pin ${["route-pin-green", "route-pin-blue", "route-pin-amber", "route-pin-orange"][index]}`}
              >
                <span>{stop.name.slice(0, 1).toUpperCase() || "•"}</span>
              </div>
            ))}
            <div className="route-map-content">
              <div className="route-map-icon">🗺️</div>
              <h3>{placesRouteLabel}</h3>
              <p className="muted">
                {mappedStops.length} places mapped · {estimatedJourneyKm} km journey
              </p>
              <a href={primaryMapUrl} target="_blank" rel="noreferrer" className="ghost-button route-map-button">
                Open full map ↗
              </a>
              {mappedStops.length ? (
                <div className="route-stop-tags">
                  {mappedStops.slice(0, 4).map((stop) => (
                    <span key={stop.id} className="route-stop-tag">
                      {stop.name || stop.address}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="section-head">
            <div>
              <p className="eyebrow">Mapped from itinerary</p>
              <h3>Places</h3>
            </div>
          </div>
          <div className="stack-list">
            {mappedStops.map((place, index) => (
              <div key={place.id} className="list-card">
                <div className="list-card-head">
                  <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                  <div className="place-card-title">
                    <strong>{place.name || `Stop ${index + 1}`}</strong>
                    <span>{place.address || "Location not added yet"}</span>
                  </div>
                </div>
                {place.mapUrl ? (
                  <a href={place.mapUrl} target="_blank" rel="noreferrer">
                    Open map
                  </a>
                ) : null}
              </div>
            ))}
            {!mappedStops.length ? (
              <p className="helper">Add a location or map link to your itinerary stops and they will appear here automatically.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "budget" ? (
        <section className="budget-layout">
          <div className="section-head budget-head budget-wide">
            <div>
              <p className="eyebrow">Keep your coins in order</p>
              <h3>Budget Tracker</h3>
            </div>
            <button className="primary-button compact-button" type="button" onClick={() => void addExpense()}>
              + Add Expense
            </button>
          </div>
          <article className="card budget-hero-card">
            <h3>Total Budget</h3>
            <div className="budget-amount">{formatMoney(spentTotal, "INR")}</div>
            <p className="muted">of {formatMoney(totalBudgetTarget, "INR")} total</p>
            <div className="budget-progress-track">
              <div className="budget-progress-fill" style={{ width: `${budgetProgress}%` }} />
            </div>
            <div className="budget-progress-meta">
              <span>{formatMoney(spentTotal, "INR")} spent</span>
              <span>{formatMoney(budgetRemaining, "INR")} left</span>
            </div>
          </article>

          <article className="card">
            <p className="eyebrow">By category</p>
            <h3>Where the money goes</h3>
            <div className="category-stack">
              {expensesByCategory.length ? (
                expensesByCategory.map((category) => (
                  <div key={category.label} className="category-row">
                    <div className="category-row-head">
                      <span>
                        {category.icon} {category.label}
                      </span>
                      <strong>{formatMoney(category.total, "INR")}</strong>
                    </div>
                    <div className="category-track">
                      <div
                        className="category-fill"
                        style={{
                          width: `${highestCategoryTotal ? (category.total / highestCategoryTotal) * 100 : 0}%`,
                          background: category.color
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="helper">Add expenses with categories to see the spending breakdown.</p>
              )}
            </div>
          </article>

          <article className="card budget-expenses-card">
            <p className="eyebrow">Expenses</p>
            <h3>Recent Expenses</h3>
            <div className="expense-table-head">
              <span>Date</span>
              <span>Description</span>
              <span>Category</span>
              <span>Paid by</span>
              <span>Amount</span>
            </div>
            <div className="recent-expense-list expense-table">
              {recentExpenses.length ? (
                recentExpenses.map((expense) => {
                  const category = categoryMetaByName.get(expense.category || defaultExpenseCategory);
                  return (
                    <div key={expense.id} className="recent-expense-row">
                      <span>{expense.date || "--"}</span>
                      <strong>{expense.title}</strong>
                      <span className="category-tag">
                        {category?.icon || "✨"} {expense.category || defaultExpenseCategory}
                      </span>
                      <span>{expense.paidBy}</span>
                      <strong>{formatMoney(expense.amount, "INR")}</strong>
                    </div>
                  );
                })
              ) : (
                <p className="helper">No expenses yet</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "group" ? (
        <section className="group-layout">
          <div className="section-head">
            <div>
              <p className="eyebrow">Invite friends with your unique trip code</p>
              <h3>Travel Crew</h3>
            </div>
            <button className="primary-button compact-button" type="button" onClick={regenerateGroupCode}>
              New Code
            </button>
          </div>

          <article className="card group-hero-card">
            <div className="group-hero-header">
              <div>
                <h3>{activeTrip.title || "Untitled Trip"}</h3>
                <p className="muted">{activeTrip.startDate && activeTrip.endDate ? `${activeTrip.startDate} to ${activeTrip.endDate}` : "Dates not set yet"}</p>
              </div>
            </div>

            <div className="group-code-panel">
              <p className="eyebrow">Your Trip Code</p>
              <button type="button" className="group-code-display" onClick={() => void copyGroupCode()}>
                {activeTrip.inviteCode}
              </button>
              <p className="helper">Click code to copy. Share with friends to join.</p>
            </div>

            <div className="group-share-actions">
              <button className="ghost-button compact-button" type="button" onClick={shareOnWhatsApp}>
                WhatsApp
              </button>
              <button className="ghost-button compact-button" type="button" onClick={() => void copyJoinLink()}>
                Copy Link
              </button>
              <button className="ghost-button compact-button" type="button" onClick={() => void copyGroupCode()}>
                Copy Code
              </button>
            </div>
          </article>

          <article className="card">
            <div className="section-head">
              <div>
                <h3>Members ({activeTrip.members.length})</h3>
              </div>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() =>
                  void updateTrip((trip) => ({
                    ...trip,
                    members: [...trip.members, { id: uid(), name: "" }]
                  }))
                }
              >
                + Add Friend
              </button>
            </div>
            <div className="group-member-list">
              {activeTrip.members.map((member, index) => (
                <div key={member.id} className="group-member-card">
                  <div className="group-member-avatar">{(member.name || "T").slice(0, 2).toUpperCase()}</div>
                  <div className="group-member-meta">
                    <strong>{member.name || `Traveler ${index + 1}`}</strong>
                    <span>{index === 0 ? "Trip organizer" : "Member"}</span>
                  </div>
                  <span className="group-member-status">Online</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <h3>Pending Invites</h3>
            <p className="helper">No pending invites</p>
            <p className="muted group-link-preview">{shareJoinLink}</p>
          </article>
        </section>
      ) : null}

      {activeTab === "split" ? (
        <section className="split-layout">
          <article className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Splitwise-style, fair, clear, no awkwardness</p>
                <h3>Split Expenses</h3>
              </div>
              <button className="primary-button compact-button" type="button" onClick={() => void addExpense()}>
                + Add Expense
              </button>
            </div>

            <div className="split-mode-tabs">
              {[
                ["expenses", "All Expenses"],
                ["balances", "Balances"],
                ["settle", "Settle Up"],
                ["activity", "Activity"]
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`split-mode-tab ${splitView === id ? "active" : ""}`}
                  onClick={() => setSplitView(id as SplitView)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="split-summary-grid">
              <article className="card metric-panel">
                <h3>{formatMoney(spentTotal, "INR")}</h3>
                <p>Total spent</p>
              </article>
              <article className="card metric-panel">
                <h3>{formatMoney(perTraveler, "INR")}</h3>
                <p>Per person</p>
              </article>
              <article className="card metric-panel">
                <h3 className={balanceCards.some((entry) => entry.amount > 0) ? "positive-text" : ""}>
                  {formatMoney(
                    balanceCards.find((entry) => entry.name === memberNames[0])?.amount || 0,
                    "INR"
                  )}
                </h3>
                <p>You're owed</p>
              </article>
            </div>

            <div className="stack-list">
              {splitView === "balances"
                ? balanceCards.map((entry) => (
                    <div key={entry.name} className={`split-balance-card ${entry.amount >= 0 ? "positive" : "negative"}`}>
                      <span>{entry.name}</span>
                      <strong>{formatMoney(Math.abs(entry.amount), "INR")}</strong>
                      <small>{entry.amount >= 0 ? "owed" : "owes"}</small>
                    </div>
                  ))
                : null}

              {splitView === "settle" ? (
                settlements.length ? (
                  <div className="settlement-card">
                    {settlements.map((settlement, index) => (
                      <div key={`${settlement.from}-${settlement.to}-${index}`} className="settlement-item">
                        <strong>{settlement.from}</strong>
                        <span>pays</span>
                        <strong>{settlement.to}</strong>
                        <span>{formatMoney(settlement.amount, "INR")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="helper">Everyone is settled up right now.</p>
                )
              ) : null}

              {splitView === "activity"
                ? recentExpenses.length
                  ? recentExpenses.map((expense) => (
                      <div key={expense.id} className="recent-expense-row card">
                        <span>{expense.date || "--"}</span>
                        <strong>{expense.title || "Untitled expense"}</strong>
                        <span>{expense.paidBy || "Unassigned"}</span>
                        <strong>{formatMoney(expense.amount, "INR")}</strong>
                      </div>
                    ))
                  : <p className="helper">No activity yet.</p>
                : null}

              {splitView === "expenses"
                ? activeTrip.expenses.map((expense, index) => (
                    <div key={expense.id} className="list-card split-expense-card">
                      <div className="list-card-head">
                        <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <input
                        value={expense.title}
                        placeholder="Expense description"
                        onChange={(e) =>
                          void updateTrip((trip) => ({
                            ...trip,
                            expenses: trip.expenses.map((entry) =>
                              entry.id === expense.id ? { ...entry, title: e.target.value } : entry
                            )
                          }))
                        }
                      />
                      <div className="three-column">
                        <input
                          type="number"
                          value={expense.amount}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              expenses: trip.expenses.map((entry) =>
                                entry.id === expense.id ? { ...entry, amount: Number(e.target.value) } : entry
                              )
                            }))
                          }
                          placeholder="Add amount"
                        />
                        <select
                          value={expense.category || defaultExpenseCategory}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              expenses: trip.expenses.map((entry) =>
                                entry.id === expense.id ? { ...entry, category: e.target.value } : entry
                              )
                            }))
                          }
                        >
                          {expenseCategories.map((category) => (
                            <option key={category.label} value={category.label}>
                              {category.icon} {category.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={expense.date || ""}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              expenses: trip.expenses.map((entry) =>
                                entry.id === expense.id ? { ...entry, date: e.target.value } : entry
                              )
                            }))
                          }
                        />
                      </div>
                      <div className="three-column">
                        <select
                          value={expense.paidBy}
                          onChange={(e) =>
                            void updateTrip((trip) => ({
                              ...trip,
                              expenses: trip.expenses.map((entry) =>
                                entry.id === expense.id ? { ...entry, paidBy: e.target.value } : entry
                              )
                            }))
                          }
                        >
                          {memberNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <div className="split-member-count">
                          {expense.splitBetween.length || memberNames.length} members
                        </div>
                        <div className="split-member-count">
                          {formatMoney(
                            expense.amount / Math.max(expense.splitBetween.length || memberNames.length, 1),
                            "INR"
                          )}{" "}
                          each
                        </div>
                      </div>
                      <div className="member-chip-row">
                        {memberNames.map((name) => {
                          const isSelected =
                            expense.splitBetween.length === 0
                              ? memberNames.includes(name)
                              : expense.splitBetween.includes(name);

                          return (
                            <button
                              key={name}
                              type="button"
                              className={`member-chip ${isSelected ? "selected" : ""}`}
                              onClick={() =>
                                void updateTrip((trip) => ({
                                  ...trip,
                                  expenses: trip.expenses.map((entry) => {
                                    if (entry.id !== expense.id) {
                                      return entry;
                                    }

                                    const currentParticipants = entry.splitBetween.length
                                      ? entry.splitBetween
                                      : memberNames;
                                    const nextParticipants = currentParticipants.includes(name)
                                      ? currentParticipants.filter((memberName) => memberName !== name)
                                      : [...currentParticipants, name];

                                    return {
                                      ...entry,
                                      splitBetween: nextParticipants.length ? nextParticipants : [name]
                                    };
                                  })
                                }))
                              }
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                : null}

              {splitView === "expenses" && !activeTrip.expenses.length ? <p className="helper">Add your first expense above.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "packing" ? (
        <section className="card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Packing</p>
              <h3>Checklist</h3>
            </div>
          </div>
          <article className="packing-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Packing and prep</p>
                <h3>Essentials</h3>
              </div>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() =>
                  void updateTrip((trip) => ({
                    ...trip,
                    checklist: [...trip.checklist, { id: uid(), label: "", done: false }]
                  }))
                }
              >
                Add item
              </button>
            </div>
            <div className="checklist">
              {activeTrip.checklist.map((item, index) => (
                <label key={item.id} className="checkbox-row">
                  <span className="sequence-badge checklist-badge">{String(index + 1).padStart(2, "0")}</span>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        checklist: trip.checklist.map((entry) =>
                          entry.id === item.id ? { ...entry, done: e.target.checked } : entry
                        )
                      }))
                    }
                  />
                  <input
                    value={item.label}
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        checklist: trip.checklist.map((entry) =>
                          entry.id === item.id ? { ...entry, label: e.target.value } : entry
                        )
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "notes" ? (
        <section className="card notes-layout">
          <div className="section-head">
            <div>
              <p className="eyebrow">A quick summary of your journey</p>
              <h3>Trip Notes</h3>
            </div>
          </div>
          <article className="card notes-editor-card">
            <textarea
              className="notes-editor"
              value={activeTrip.notes}
              onChange={(e) => void updateTrip((trip) => ({ ...trip, notes: e.target.value }))}
              placeholder="Add some notes about your trip - highlights, goals, packing reminders..."
            />
          </article>
        </section>
      ) : null}

      <div className="footer-actions footer-actions-mobile">
        <p className="status-line">{status}</p>
        <button className="ghost-button danger compact-button" type="button" onClick={deleteTrip}>
          Remove trip
        </button>
      </div>
    </div>
  );
}
