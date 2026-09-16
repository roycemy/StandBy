/* StandBy - scoring engine + UI.
 *
 * SIMULATED PROTOTYPE. All inventory comes from data.js (synthetic), and the
 * checkout below never talks to a real airline or payment system.
 */

(function () {
  "use strict";

  const DATA = window.STANDBY_DATA;
  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ------------------------------------------------------------------ *
   * Scoring model
   * ------------------------------------------------------------------ */

  // scoreFlight: the seam where real feeds would plug in.
  // Returns { total, parts } with total in 0..100.
  function scoreFlight(f) {
    const fareRatio = f.fare / f.destMedianFare;              // <1 is a deal
    const fareScore = clamp01((1.25 - fareRatio) / 0.85);     // 1.25x median -> 0, 0.4x -> 1
    const seatScore = clamp01(f.openSeats / 40);              // 40+ open seats -> 1
    const trendScore = clamp01(0.5 - f.loadTrend / 2);        // filling fast is worse
    const riskScore = clamp01(1 - f.cancelRisk / 0.35);
    const backupScore = clamp01(f.backups / 4);               // 4+ later flights -> 1

    const parts = {
      fare: fareScore,
      seats: seatScore,
      trend: trendScore,
      risk: riskScore,
      backups: backupScore,
    };
    const total = Math.round(100 * (
      fareScore * 0.30 +
      seatScore * 0.25 +
      trendScore * 0.15 +
      riskScore * 0.15 +
      backupScore * 0.15
    ));
    return { total: total, parts: parts };
  }

  // Discovery ranking: confidence + price + destination appeal + schedule sanity.
  function opportunityScore(f, confidence) {
    const deal = clamp01((f.destMedianFare - f.fare) / f.destMedianFare + 0.5);
    return Math.round(
      confidence * 0.55 +
      deal * 100 * 0.25 +
      f.destAppeal * 10 * 0.12 +
      clamp01(f.backups / 4) * 100 * 0.08
    );
  }

  // Standby odds for moving to an alternative same-day flight.
  // Simulated: open seats + airline friendliness + fare-class eligibility.
  function standbyOdds(target, bookedFareClass) {
    if (!bookedFareClass.standbyEligible) {
      return { pct: 0, eligible: false, reason: "Your fare class is not standby-eligible." };
    }
    const seatFactor = clamp01(target.openSeats / 25);
    const trendFactor = clamp01(0.5 - target.loadTrend / 2);
    const pct = Math.round(100 * (seatFactor * 0.55 + target.standbyFriendly * 0.30 + trendFactor * 0.15));
    return {
      pct: Math.min(97, pct),
      eligible: true,
      reason: target.flightNo + " has " + target.openSeats + " open seats; " +
        target.airline + " same-day standby is " +
        (target.standbyFriendly >= 0.7 ? "generally friendly" : "restrictive") + " for your fare.",
    };
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function confidenceLabel(c) {
    if (c >= 80) return { word: "Strong", cls: "good" };
    if (c >= 60) return { word: "Solid", cls: "ok" };
    if (c >= 40) return { word: "Risky", cls: "warn" };
    return { word: "Long shot", cls: "bad" };
  }
  function fmtDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const state = {
    mode: "discover",       // "search" | "discover"
    booked: null,           // simulated booking
  };

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function flightCard(f, opts) {
    opts = opts || {};
    const s = scoreFlight(f);
    const c = confidenceLabel(s.total);
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML =
      '<div class="card-top">' +
        '<div class="route">' + f.origin + ' &rarr; ' + f.destination +
          '<span class="city">' + f.destCity + '</span></div>' +
        '<div class="confidence ' + c.cls + '">' + s.total + '%<span>' + c.word + '</span></div>' +
      '</div>' +
      '<div class="meta">' +
        '<span>' + fmtDate(f.date) + '</span>' +
        '<span>' + f.depTime + ' &ndash; ' + f.arrTime + '</span>' +
        '<span>' + f.airline + ' ' + f.flightNo + '</span>' +
      '</div>' +
      '<div class="meta sub">' +
        '<span>' + f.fareClass.label + '</span>' +
        '<span>' + f.openSeats + ' seats open</span>' +
        '<span>' + f.backups + ' backup flight' + (f.backups === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="card-bottom">' +
        '<div class="price">$' + f.fare + '<span>simulated fare</span></div>' +
        '<button class="btn" type="button">View plan</button>' +
      '</div>' +
      (opts.rank ? '<div class="rank">#' + opts.rank + '</div>' : '');
    el.querySelector(".btn").addEventListener("click", function () { openDetail(f); });
    el.addEventListener("click", function (e) {
      if (e.target.tagName !== "BUTTON") openDetail(f);
    });
    return el;
  }

  function renderResults(list, container, opts) {
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = '<p class="empty">No simulated flights match. Widen the dates or airports.</p>';
      return;
    }
    list.forEach(function (f, i) {
      container.appendChild(flightCard(f, { rank: opts && opts.rank ? i + 1 : null }));
    });
  }

  /* ---------------- Search mode ---------------- */

  function runSearch() {
    const dests = $$("#dest-chips .chip.on").map(function (c) { return c.dataset.code; });
    const origins = $$("#origin-chips .chip.on").map(function (c) { return c.dataset.code; });
    const from = $("#date-from").value;
    const to = $("#date-to").value;
    const priority = $("#priority").value; // "price" | "balanced" | "schedule"

    let pool = DATA.flights.filter(function (f) {
      if (origins.length && origins.indexOf(f.origin) === -1) return false;
      if (dests.length && dests.indexOf(f.destination) === -1) return false;
      if (from && f.date < from) return false;
      if (to && f.date > to) return false;
      return true;
    });

    pool.sort(function (a, b) {
      const sa = scoreFlight(a), sb = scoreFlight(b);
      if (priority === "price") return a.fare - b.fare || sb.total - sa.total;
      if (priority === "schedule") return a.depMs - b.depMs;
      return sb.total - sa.total || a.fare - b.fare;
    });

    const cheapest = pool.length ? pool[0].fare : 0;
    renderResults(pool.slice(0, 24), $("#results"));
    $("#results-note").textContent = pool.length
      ? pool.length + " simulated options" + (cheapest ? " - cheapest $" + cheapest : "") +
        " - ranked by " + (priority === "price" ? "price" : priority === "schedule" ? "departure time" : "confidence")
      : "";
  }

  /* ---------------- Discovery mode ---------------- */

  function runDiscover() {
    const origins = $$("#origin-chips .chip.on").map(function (c) { return c.dataset.code; });
    const from = $("#date-from").value;
    const to = $("#date-to").value;

    // Best option per destination city: highest opportunity score.
    const bestByCity = {};
    for (const f of DATA.flights) {
      if (origins.length && origins.indexOf(f.origin) === -1) continue;
      if (from && f.date < from) continue;
      if (to && f.date > to) continue;
      const s = scoreFlight(f);
      const opp = opportunityScore(f, s.total);
      const key = f.destCity;
      if (!bestByCity[key] || opp > bestByCity[key].opp) bestByCity[key] = { f: f, opp: opp };
    }
    const list = Object.keys(bestByCity).map(function (k) { return bestByCity[k]; })
      .sort(function (a, b) { return b.opp - a.opp; })
      .map(function (x) { return x.f; });

    renderResults(list, $("#results"), { rank: true });
    $("#results-note").textContent = list.length
      ? "Best simulated opportunity per destination, ranked by confidence, price, and appeal."
      : "";
  }

  /* ---------------- Detail + simulated checkout ---------------- */

  function openDetail(f) {
    const s = scoreFlight(f);
    const c = confidenceLabel(s.total);
    const bar = function (label, v) {
      return '<div class="bar-row"><span>' + label + '</span>' +
        '<div class="bar"><div style="width:' + Math.round(v * 100) + '%"></div></div></div>';
    };

    $("#detail-body").innerHTML =
      '<div class="detail-head">' +
        '<h2>' + f.origin + ' &rarr; ' + f.destination + ' <small>' + f.destCity + '</small></h2>' +
        '<div class="confidence ' + c.cls + ' big">' + s.total + '%<span>' + c.word + '</span></div>' +
      '</div>' +
      '<p class="detail-meta">' + fmtDate(f.date) + ' &middot; ' + f.depTime + ' &ndash; ' + f.arrTime +
        ' &middot; ' + f.airline + ' ' + f.flightNo + ' &middot; ' + f.fareClass.label + '</p>' +
      '<div class="price big-price">$' + f.fare + '<span>simulated fare - not a live price</span></div>' +
      '<h3>Why this score</h3>' +
      bar("Fare vs. route median ($" + f.destMedianFare + ")", s.parts.fare) +
      bar("Open seats (" + f.openSeats + " of " + f.capacity + ")", s.parts.seats) +
      bar("Load trend " + (f.loadTrend > 0.25 ? "(filling fast)" : f.loadTrend < -0.25 ? "(emptying)" : "(steady)"), s.parts.trend) +
      bar("On-time reliability (" + Math.round((1 - f.cancelRisk) * 100) + "%)", s.parts.risk) +
      bar("Backup flights later that day (" + f.backups + ")", s.parts.backups) +
      '<div class="actions">' +
        '<button class="btn primary" id="book-btn" type="button">Book this flight (simulation)</button>' +
      '</div>' +
      '<p class="fine">Prototype checkout - no real ticket is purchased and no live airline inventory is touched.</p>';

    $("#book-btn").addEventListener("click", function () { simulateBooking(f); });
    $("#detail").classList.add("open");
  }

  function simulateBooking(f) {
    state.booked = f;

    // Same-day alternatives on this city-pair for the standby layer.
    const alts = DATA.flights.filter(function (o) {
      return o.origin === f.origin && o.destination === f.destination && o.date === f.date && o.id !== f.id;
    }).sort(function (a, b) { return a.depMs - b.depMs; });

    const rows = alts.map(function (o) {
      const odds = standbyOdds(o, f.fareClass);
      const cls = odds.pct >= 70 ? "good" : odds.pct >= 45 ? "ok" : "warn";
      return '<div class="standby-row">' +
        '<div><strong>' + o.depTime + '</strong> ' + o.airline + ' ' + o.flightNo +
          '<span class="fine">' + o.openSeats + ' seats open</span></div>' +
        '<div class="confidence ' + cls + '">' + (odds.eligible ? odds.pct + "%" : "n/a") +
          '<span>' + (odds.eligible ? "standby odds" : "not eligible") + '</span></div>' +
      '</div>';
    }).join("");

    $("#booking-body").innerHTML =
      '<h2>Booked (simulation)</h2>' +
      '<p><strong>' + f.airline + ' ' + f.flightNo + '</strong> - ' + f.origin + ' &rarr; ' + f.destination +
        ' - ' + fmtDate(f.date) + ' at ' + f.depTime + ' - $' + f.fare + ' - ' + f.fareClass.label + '</p>' +
      '<p class="fine">This is a simulated confirmation. No purchase happened, and no airline system was involved.</p>' +
      '<h3>Same-day standby &amp; change odds</h3>' +
      (f.fareClass.standbyEligible
        ? '<p class="fine">If plans shift, these are your estimated odds of moving to another flight that day. Standby is a change to your existing ticket - not a separate product.</p>'
        : '<p class="fine warn-text">Basic Economy is usually not standby-eligible. Booking Main Cabin or Flexible would unlock this layer.</p>') +
      (rows || '<p class="empty">No other simulated flights on this route that day.</p>');

    $("#detail").classList.remove("open");
    $("#booking").classList.add("open");
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  function chipRow(containerId, items, defaults) {
    const c = $(containerId);
    c.innerHTML = "";
    items.forEach(function (it) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (defaults.indexOf(it.code) !== -1 ? " on" : "");
      b.dataset.code = it.code;
      b.textContent = it.label || it.city;
      b.addEventListener("click", function () {
        b.classList.toggle("on");
        state.mode === "search" ? runSearch() : runDiscover();
      });
      c.appendChild(b);
    });
  }

  function setMode(mode) {
    state.mode = mode;
    $("#tab-search").classList.toggle("on", mode === "search");
    $("#tab-discover").classList.toggle("on", mode === "discover");
    $("#dest-row").style.display = mode === "search" ? "" : "none";
    mode === "search" ? runSearch() : runDiscover();
  }

  function init() {
    chipRow("#origin-chips", DATA.ORIGINS, ["BOS"]);
    chipRow("#dest-chips", DATA.DESTINATIONS.map(function (d) {
      return { code: d.code, label: d.city };
    }), ["DFW", "DAL"]);

    const today = new Date();
    const iso = function (d) { return d.toISOString().slice(0, 10); };
    $("#date-from").value = iso(new Date(today.getTime() + 86400000));
    $("#date-to").value = iso(new Date(today.getTime() + 8 * 86400000));

    $("#tab-search").addEventListener("click", function () { setMode("search"); });
    $("#tab-discover").addEventListener("click", function () { setMode("discover"); });
    $("#date-from").addEventListener("change", function () { state.mode === "search" ? runSearch() : runDiscover(); });
    $("#date-to").addEventListener("change", function () { state.mode === "search" ? runSearch() : runDiscover(); });
    $("#priority").addEventListener("change", runSearch);

    $$(".overlay").forEach(function (o) {
      o.addEventListener("click", function (e) { if (e.target === o) o.classList.remove("open"); });
    });
    $$(".close").forEach(function (b) {
      b.addEventListener("click", function () { b.closest(".overlay").classList.remove("open"); });
    });

    setMode("discover");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
