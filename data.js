/* StandBy - simulated flight market.
 *
 * Everything in this file is SYNTHETIC. No live fares, seat maps, or airline
 * systems are connected. Values are generated deterministically from a seed
 * (route + date + flight number) so the demo looks the same on every reload.
 *
 * The shape of each flight record matches what a real feed would return, so
 * swapping this file for a live adapter later should not touch app.js.
 */

(function () {
  "use strict";

  // Deterministic PRNG (mulberry32) seeded from a string.
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seedStr) {
    let a = hashSeed(seedStr);
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ORIGINS = [
    { code: "BOS", city: "Boston", label: "Boston (BOS)" },
    { code: "PVD", city: "Providence", label: "Providence (PVD)" },
    { code: "MHT", city: "Manchester NH", label: "Manchester (MHT)" },
  ];

  // Destination catalog: route medians are rough, illustrative, and simulated.
  const DESTINATIONS = [
    { code: "DFW", city: "Dallas",        region: "Texas",       appeal: 7, medianFare: 189 },
    { code: "DAL", city: "Dallas (Love)", region: "Texas",       appeal: 7, medianFare: 164 },
    { code: "BNA", city: "Nashville",     region: "Tennessee",   appeal: 9, medianFare: 129 },
    { code: "MIA", city: "Miami",         region: "Florida",     appeal: 9, medianFare: 149 },
    { code: "ORD", city: "Chicago",       region: "Illinois",    appeal: 8, medianFare: 139 },
    { code: "DEN", city: "Denver",        region: "Colorado",    appeal: 8, medianFare: 159 },
    { code: "ATL", city: "Atlanta",       region: "Georgia",     appeal: 6, medianFare: 135 },
    { code: "AUS", city: "Austin",        region: "Texas",       appeal: 8, medianFare: 172 },
    { code: "MCO", city: "Orlando",       region: "Florida",     appeal: 8, medianFare: 118 },
    { code: "LAX", city: "Los Angeles",   region: "California",  appeal: 9, medianFare: 219 },
    { code: "CLT", city: "Charlotte",     region: "N. Carolina", appeal: 6, medianFare: 122 },
    { code: "PHX", city: "Phoenix",       region: "Arizona",     appeal: 7, medianFare: 198 },
  ];

  const AIRLINES = [
    { code: "UA", name: "United",    standbyFriendly: 0.8 },
    { code: "AA", name: "American",  standbyFriendly: 0.7 },
    { code: "DL", name: "Delta",     standbyFriendly: 0.7 },
    { code: "B6", name: "JetBlue",   standbyFriendly: 0.6 },
    { code: "WN", name: "Southwest", standbyFriendly: 0.9 },
    { code: "NK", name: "Spirit",    standbyFriendly: 0.2 },
    { code: "F9", name: "Frontier",  standbyFriendly: 0.2 },
  ];

  const FARE_CLASSES = [
    { code: "basic",   label: "Basic Economy", standbyEligible: false, changeFee: 0 },
    { code: "main",    label: "Main Cabin",    standbyEligible: true,  changeFee: 0 },
    { code: "flex",    label: "Flexible",      standbyEligible: true,  changeFee: 0 },
  ];

  const DEPARTURE_BLOCKS = [
    { h: 6,  m: 5 }, { h: 8, m: 20 }, { h: 11, m: 40 },
    { h: 14, m: 15 }, { h: 17, m: 30 }, { h: 19, m: 50 },
  ];

  function pad(n) { return String(n).padStart(2, "0"); }
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function durationMinutes(origin, dest) {
    // Crude stage-length proxy, simulated.
    const longHaul = ["LAX", "PHX", "DEN"].includes(dest.code);
    const mid = ["DFW", "DAL", "AUS", "MIA", "ORD"].includes(dest.code);
    const base = longHaul ? 330 : mid ? 230 : 150;
    return base + (origin.code === "PVD" ? 10 : 0);
  }

  function makeFlight(origin, dest, date, blockIdx, airlineIdx) {
    const key = origin.code + "-" + dest.code + "-" + dateKey(date) + "-" + blockIdx + "-" + airlineIdx;
    const r = rng(key);
    const airline = AIRLINES[Math.floor(r() * AIRLINES.length)];
    const block = DEPARTURE_BLOCKS[(blockIdx + airlineIdx) % DEPARTURE_BLOCKS.length];

    const capacity = 140 + Math.floor(r() * 60);                    // seats on the plane
    const loadFactor = 0.55 + r() * 0.44;                            // 55% - 99% full
    const openSeats = Math.max(0, Math.round(capacity * (1 - loadFactor)));
    const loadTrend = r() * 2 - 1;                                   // -1 emptying .. +1 filling
    const cancelRisk = Math.min(0.35, Math.max(0.01, r() * 0.12 + (block.h >= 17 ? 0.06 : 0)));
    const fareJitter = 0.62 + r() * 0.9;                             // below/above route median
    const fare = Math.max(49, Math.round(dest.medianFare * fareJitter * (origin.code === "PVD" ? 0.92 : 1)));
    const fareClass = r() < 0.45 ? FARE_CLASSES[0] : (r() < 0.8 ? FARE_CLASSES[1] : FARE_CLASSES[2]);

    const dep = new Date(date); dep.setHours(block.h, block.m, 0, 0);
    const arr = new Date(dep.getTime() + durationMinutes(origin, dest) * 60000);

    return {
      id: key,
      origin: origin.code,
      destination: dest.code,
      destCity: dest.city,
      destAppeal: dest.appeal,
      destMedianFare: dest.medianFare,
      date: dateKey(date),
      depTime: pad(block.h) + ":" + pad(block.m),
      arrTime: pad(arr.getHours()) + ":" + pad(arr.getMinutes()),
      depMs: dep.getTime(),
      airline: airline.name,
      airlineCode: airline.code,
      flightNo: airline.code + " " + (100 + Math.floor(r() * 8800)),
      fare: fare,
      fareClass: fareClass,
      openSeats: openSeats,
      capacity: capacity,
      loadFactor: loadFactor,
      loadTrend: loadTrend,
      cancelRisk: cancelRisk,
      standbyFriendly: airline.standbyFriendly,
    };
  }

  // Build the simulated market: every origin x destination x next N days.
  function buildMarket(days) {
    const flights = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let d = 1; d <= days; d++) {
      const date = new Date(today.getTime() + d * 86400000);
      for (const origin of ORIGINS) {
        for (const dest of DESTINATIONS) {
          const perDay = 2 + Math.floor(rng(origin.code + dest.code + d)() * 4); // 2-5 flights/day
          for (let i = 0; i < perDay; i++) {
            flights.push(makeFlight(origin, dest, date, i, d % AIRLINES.length));
          }
        }
      }
    }
    // Same-day backup counts: flights on the same city-pair later that day.
    const byPairDay = {};
    for (const f of flights) {
      const k = f.origin + "-" + f.destination + "-" + f.date;
      (byPairDay[k] = byPairDay[k] || []).push(f);
    }
    for (const f of flights) {
      const k = f.origin + "-" + f.destination + "-" + f.date;
      f.backups = byPairDay[k].filter(function (o) { return o.depMs > f.depMs; }).length;
    }
    return flights;
  }

  window.STANDBY_DATA = {
    ORIGINS: ORIGINS,
    DESTINATIONS: DESTINATIONS,
    AIRLINES: AIRLINES,
    FARE_CLASSES: FARE_CLASSES,
    MARKET_DAYS: 10,
    flights: buildMarket(10),
  };
})();
