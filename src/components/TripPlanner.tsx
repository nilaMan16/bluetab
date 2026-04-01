import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchCloudTrips, joinTripByInviteCode, syncTripToCloud } from "../lib/sync";
import { supabase } from "../lib/supabase";
import { loadLocalTrips, removeLocalTrip, saveLocalTrip } from "../lib/local-db";
import {
  buildBlankTrip,
  defaultExpenseCategory,
  expenseCategories,
  expensePerPerson,
  formatMoney,
  toMapSearchUrl,
  totalTripBudget,
  uid
} from "../lib/utils";
import type { TripRecord } from "../lib/types";
import { InviteCard } from "./InviteCard";

type TripPlannerProps = {
  session: Session | null;
  offlineOnly: boolean;
};

type PlannerTab = "overview" | "itinerary" | "places" | "budget" | "split" | "packing";

const tabs: Array<{ id: PlannerTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "🗺️" },
  { id: "itinerary", label: "Itinerary", icon: "🗓️" },
  { id: "places", label: "Places", icon: "📍" },
  { id: "budget", label: "Budget", icon: "💰" },
  { id: "split", label: "Split", icon: "🤝" },
  { id: "packing", label: "Packing", icon: "🎒" }
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
  const uniqueMembers = Array.from(new Set(memberNames.length ? memberNames : ["You"]));
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

export function TripPlanner({ session, offlineOnly }: TripPlannerProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [activeTripId, setActiveTripId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<PlannerTab>("overview");
  const [status, setStatus] = useState("Loading your travel notebook...");
  const [joinCode, setJoinCode] = useState("");
  const [tripSwitcherOpen, setTripSwitcherOpen] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);

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
        const starter = buildBlankTrip();
        await saveLocalTrip(starter);
        setTrips([starter]);
        setActiveTripId(starter.id);
      }

      if (session && !offlineOnly) {
        try {
          const cloudTrips = await fetchCloudTrips(session);
          if (cloudTrips.length) {
            setTrips(cloudTrips);
            setActiveTripId((current) => current || cloudTrips[0].id);
            setStatus("Cloud sync is active.");
          } else {
            setStatus("Offline-first mode is ready. Your cloud space is empty for now.");
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Cloud sync is temporarily unavailable.");
        }
      } else {
        setStatus("Working locally. You can still plan everything offline.");
      }
    };

    void load();
  }, [offlineOnly, session]);

  const activeTrip = useMemo(
    () => trips.find((trip) => trip.id === activeTripId) ?? trips[0] ?? null,
    [activeTripId, trips]
  );

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
    const freshTrip = buildBlankTrip({
      title: `Trip ${trips.length + 1}`
    });
    await saveLocalTrip(freshTrip);
    setTrips((current) => [freshTrip, ...current]);
    setActiveTripId(freshTrip.id);
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
      setJoinCode("");
      setStatus(`Joined ${joinedTrip.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to join trip.");
    }
  };

  if (!activeTrip) {
    return null;
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
  const placesRouteLabel = `${activeTrip.destination || "Trip"} Route`;
  const primaryMapUrl =
    activeTrip.places.find((place) => place.mapUrl)?.mapUrl ||
    toMapSearchUrl(
      activeTrip.places.map((place) => place.address || place.name).filter(Boolean).join(" ")
    );
  const estimatedJourneyKm = Math.max(activeTrip.places.length * 168, activeTrip.itinerary.length * 42, 0);
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

  const topStats = [
    { label: "Days", value: tripDays || "--" },
    { label: "Places", value: activeTrip.places.length || 0 },
    { label: "Budget", value: formatMoney(recommendedBudget, "INR") },
    { label: "Travelers", value: activeTrip.members.length || 1 }
  ];

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
        <button className="primary-button compact-button" type="button" onClick={createTrip}>
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
              <strong>{activeTrip.places.filter((place) => /hotel|stay|resort/i.test(place.category)).length}</strong>
              <span>Hotels</span>
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
                  onChange={(e) => void updateTrip((trip) => ({ ...trip, destination: e.target.value }))}
                  placeholder="Where are you going?"
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
              onChange={(e) => void updateTrip((trip) => ({ ...trip, tagline: e.target.value }))}
              placeholder="Add a short note..."
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
                    members: [...trip.members, { id: uid(), name: "New friend" }]
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
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter group ID"
              />
              <button className="ghost-button compact-button" type="button" onClick={handleJoinTrip} disabled={!session}>
                Join group
              </button>
            </div>
            <p className="helper">{session ? status : "Sign in first to join shared trips."}</p>
          </article>
          </section>
        </>
      ) : null}

      {activeTab === "itinerary" ? (
        <section className="card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Plan the route</p>
              <h3>Itinerary</h3>
            </div>
            <button
              className="ghost-button compact-button"
              type="button"
              onClick={() =>
                void updateTrip((trip) => ({
                  ...trip,
                  itinerary: [
                    ...trip.itinerary,
                      {
                        id: uid(),
                        title: "",
                        day: trip.startDate,
                        time: "09:00",
                        notes: "",
                      cost: 0
                    }
                  ]
                }))
              }
            >
              Add stop
            </button>
          </div>
          <div className="stack-list">
            {activeTrip.itinerary.map((item, index) => (
                <div key={item.id} className="list-card">
                  <div className="list-card-head">
                    <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                <input
                  value={item.title}
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
                    placeholder="Cost in INR"
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
            {!activeTrip.itinerary.length ? <p className="helper">Start with major stops, then fill in time and costs.</p> : null}
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
            <div className="route-pin route-pin-green">★</div>
            <div className="route-pin route-pin-blue">★</div>
            <div className="route-pin route-pin-amber">★</div>
            <div className="route-pin route-pin-orange">★</div>
            <div className="route-map-content">
              <div className="route-map-icon">🗺️</div>
              <h3>{placesRouteLabel}</h3>
              <p className="muted">
                {activeTrip.places.length} places saved · {estimatedJourneyKm} km journey
              </p>
              <a href={primaryMapUrl} target="_blank" rel="noreferrer" className="ghost-button route-map-button">
                Open full map ↗
              </a>
            </div>
          </div>

          <div className="section-head">
            <div>
              <p className="eyebrow">Saved spots</p>
              <h3>Places</h3>
            </div>
            <button
              className="ghost-button compact-button"
              type="button"
              onClick={() =>
                void updateTrip((trip) => ({
                  ...trip,
                  places: [
                    ...trip.places,
                    {
                      id: uid(),
                      name: "",
                      address: "",
                      mapUrl: "",
                      estimate: 0,
                      category: ""
                    }
                  ]
                }))
              }
            >
              Add place
            </button>
          </div>
          <div className="stack-list">
            {activeTrip.places.map((place, index) => (
              <div key={place.id} className="list-card">
                <div className="list-card-head">
                  <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <input
                  value={place.name}
                  onChange={(e) =>
                    void updateTrip((trip) => ({
                      ...trip,
                      places: trip.places.map((entry) =>
                        entry.id === place.id ? { ...entry, name: e.target.value } : entry
                      )
                    }))
                  }
                />
                <input
                  value={place.address}
                  onChange={(e) =>
                    void updateTrip((trip) => ({
                      ...trip,
                      places: trip.places.map((entry) =>
                        entry.id === place.id
                          ? {
                              ...entry,
                              address: e.target.value,
                              mapUrl: entry.mapUrl || toMapSearchUrl(e.target.value)
                            }
                          : entry
                      )
                    }))
                  }
                    placeholder="Address"
                />
                <div className="three-column">
                  <input
                    value={place.category}
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        places: trip.places.map((entry) =>
                          entry.id === place.id ? { ...entry, category: e.target.value } : entry
                        )
                      }))
                    }
                  />
                  <input
                    type="number"
                    value={place.estimate}
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        places: trip.places.map((entry) =>
                          entry.id === place.id ? { ...entry, estimate: Number(e.target.value) } : entry
                        )
                      }))
                    }
                      placeholder="Estimate"
                  />
                  <input
                    value={place.mapUrl}
                    onChange={(e) =>
                      void updateTrip((trip) => ({
                        ...trip,
                        places: trip.places.map((entry) =>
                          entry.id === place.id ? { ...entry, mapUrl: e.target.value } : entry
                        )
                      }))
                    }
                      placeholder="Map URL"
                  />
                </div>
                {place.mapUrl ? (
                  <a href={place.mapUrl} target="_blank" rel="noreferrer">
                    Open map
                  </a>
                ) : null}
              </div>
            ))}
            {!activeTrip.places.length ? <p className="helper">Keep your must-visit stops, food spots, and stays here.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "budget" ? (
        <section className="budget-layout">
          <article className="card budget-hero-card">
            <p className="eyebrow">Budget Tracker</p>
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
            <p className="eyebrow">Recent expenses</p>
            <h3>Latest spending</h3>
            <div className="recent-expense-list">
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
                <p className="helper">No expenses yet. Add them in Split to build this tracker.</p>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "split" ? (
        <section className="split-layout">
          <article className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Shared expenses</p>
                <h3>Split money</h3>
              </div>
              <button
                className="ghost-button compact-button"
                type="button"
                onClick={() =>
                  void updateTrip((trip) => ({
                    ...trip,
                    expenses: [
                      ...trip.expenses,
                      {
                        id: uid(),
                        title: "",
                        amount: 0,
                        category: defaultExpenseCategory,
                        date: new Date().toISOString().slice(0, 10),
                        paidBy: trip.members[0]?.name || "You",
                        splitBetween: trip.members.map((member) => member.name)
                      }
                    ]
                  }))
                }
              >
                Add expense
              </button>
            </div>
            <div className="split-balance-grid">
              {balanceCards.map((entry) => (
                <div key={entry.name} className={`split-balance-card ${entry.amount >= 0 ? "positive" : "negative"}`}>
                  <span>{entry.name}</span>
                  <strong>{formatMoney(Math.abs(entry.amount), "INR")}</strong>
                  <small>{entry.amount >= 0 ? "gets back" : "owes"}</small>
                </div>
              ))}
            </div>
            <div className="settlement-card">
              <p className="eyebrow">Suggested settlements</p>
              {settlements.length ? (
                <div className="settlement-list">
                  {settlements.map((settlement, index) => (
                    <div key={`${settlement.from}-${settlement.to}-${index}`} className="settlement-item">
                      <strong>{settlement.from}</strong>
                      <span>owes</span>
                      <strong>{settlement.to}</strong>
                      <span>{formatMoney(settlement.amount, "INR")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="helper">Everyone is settled up right now.</p>
              )}
            </div>
            <div className="stack-list">
              {activeTrip.expenses.map((expense, index) => (
                <div key={expense.id} className="list-card split-expense-card">
                  <div className="list-card-head">
                    <span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <input
                    value={expense.title}
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
                      placeholder="Amount in INR"
                    />
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
                  </div>
                  <div className="three-column">
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
              ))}
              {!activeTrip.expenses.length ? <p className="helper">Add shared expenses for this group.</p> : null}
            </div>
          </article>

          <div className="split-side">
            <article className="card metric-panel">
              <p className="eyebrow">Per traveler</p>
              <h3>{formatMoney(perTraveler, "INR")}</h3>
              <p className="muted">A quick equal-share estimate across all current trip members.</p>
            </article>
            <InviteCard inviteCode={activeTrip.inviteCode} tripTitle={activeTrip.title} />
          </div>
        </section>
      ) : null}

      {activeTab === "packing" ? (
        <section className="overview-grid">
          <article className="card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Packing and prep</p>
                <h3>Checklist</h3>
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

          <article className="card">
            <p className="eyebrow">Travel notes</p>
            <h3>Keep everything handy</h3>
            <textarea
              value={activeTrip.notes}
              onChange={(e) => void updateTrip((trip) => ({ ...trip, notes: e.target.value }))}
              placeholder="Packing ideas, visa notes, station reminders, hotel check-in details..."
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
