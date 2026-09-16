# StandBy

**See where you can go this week.**

StandBy is a flexible-flight discovery app for travelers who care more about price
than exact timing. Instead of asking for one exact date and airport, you tell it
roughly where and when you can travel - and it ranks the cheap, realistic options
by both price and the odds the trip goes smoothly.

> **Prototype notice:** this MVP runs entirely on **simulated data**. No live
> fares, seat maps, or airline systems are connected, and the in-app checkout is
> a simulation - no real ticket is ever purchased. The point of the prototype is
> the ranking model and the product flow, not real inventory.

## The two ways in

1. **Search mode** - "I need to reach Dallas sometime Tue-Fri, from BOS or PVD."
   You give a destination, a date range, one or more departure airports, and
   whether you care more about price or schedule. StandBy returns the best
   confirmed cheap tickets, nearby-airport and flexible-date combinations, and
   same-day standby or change options - each with a confidence score and a
   fallback if the risky plan fails.

2. **Discovery mode** - "Show me the best flights I could realistically take."
   No destination needed. StandBy browses the simulated market and ranks
   opportunity cards ("Nashville - Friday - 87% - $79") by price, confidence,
   schedule, destination appeal, and backup options.

## How the confidence score works (simulated model)

Each flight gets a 0-100 confidence score from five weighted inputs:

| Input | What it represents | Weight |
| --- | --- | --- |
| Fare position | Price vs. the route's recent median | 30% |
| Open seats | Estimated unsold seats on the flight | 25% |
| Load trend | Whether the flight is filling or emptying | 15% |
| Disruption risk | Cancellation / delay history for the flight | 15% |
| Backup options | Later same-day flights that could catch you | 15% |

In the prototype every input is generated deterministically from the route,
date, and flight number, so the demo is stable between reloads. The scoring
function in `app.js` (`scoreFlight`) is the seam where real feeds (fare
search, seat availability, flight-status history) would plug in later.

## The standby layer

After you "book" a flight in the simulator, StandBy shows the second half of
the product: for each alternative same-day flight, the estimated odds of a
same-day standby or change clearing, based on open seats, your fare class, and
airline rules. Real airline rules treat standby as a change to an existing
eligible ticket, not a standalone product - so the flow sells the confirmed
ticket first and manages flexibility afterward.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

- `index.html` - single-page shell
- `styles.css` - dark, aviation-inspired UI
- `data.js` - deterministic simulated flight market (routes, airlines, fares)
- `app.js` - scoring engine, search/discovery UI, simulated checkout + standby

## Roadmap (what real data would unlock)

- Live fare search and nearby-airport/date expansion
- Real seat-availability and load-factor signals
- Airline-specific standby / same-day-change rules per fare class
- Purchase through real ticketing rails, then monitored flexibility alerts
