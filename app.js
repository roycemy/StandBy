(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  let trip = "round";

  function isoLocal(d) {
    const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 10);
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function validCode(value) { return /^[A-Z]{3}$/.test(value); }
  function prettyDate(value) {
    return new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  function normalize(input) { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3); }

  function setTrip(next) {
    trip = next;
    document.querySelectorAll(".toggle").forEach((b) => b.classList.toggle("on", b.dataset.trip === trip));
    $("#return-wrap").hidden = trip === "oneway";
  }

  function buildQuery() {
    const origin = $("#origin").value;
    const destination = $("#destination").value;
    const depart = $("#depart").value;
    const returning = $("#return").value;
    const travelers = $("#travelers").value;
    const cabin = $("#cabin").value;
    if (!validCode(origin) || !validCode(destination)) throw new Error("Use 3-letter airport codes, like BOS or DFW.");
    if (origin === destination) throw new Error("Choose two different airports.");
    if (!depart) throw new Error("Choose a departure date.");
    if (trip === "round" && !returning) throw new Error("Choose a return date.");
    if (trip === "round" && returning < depart) throw new Error("Return date must be after departure.");
    let query = `Flights from ${origin} to ${destination} on ${prettyDate(depart)}`;
    if (trip === "round") query += ` returning ${prettyDate(returning)}`;
    else query += " one way";
    query += ` for ${travelers} ${travelers === "1" ? "adult" : "adults"} in ${cabin}`;
    return query;
  }

  function search() {
    const error = $("#error");
    error.textContent = "";
    try {
      const query = buildQuery();
      const url = "https://www.google.com/travel/flights?hl=en-US&curr=USD&q=" + encodeURIComponent(query);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = url;
    } catch (e) { error.textContent = e.message; }
  }

  function init() {
    const today = new Date();
    $("#depart").min = isoLocal(today);
    $("#return").min = isoLocal(today);
    $("#depart").value = isoLocal(addDays(today, 7));
    $("#return").value = isoLocal(addDays(today, 11));
    [$("#origin"), $("#destination")].forEach((input) => input.addEventListener("input", () => normalize(input)));
    $("#depart").addEventListener("change", () => {
      $("#return").min = $("#depart").value;
      if ($("#return").value < $("#depart").value) $("#return").value = $("#depart").value;
    });
    document.querySelectorAll(".toggle").forEach((b) => b.addEventListener("click", () => setTrip(b.dataset.trip)));
    $("#swap").addEventListener("click", () => { const v = $("#origin").value; $("#origin").value = $("#destination").value; $("#destination").value = v; });
    $("#search-live").addEventListener("click", search);
    setTrip("round");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
