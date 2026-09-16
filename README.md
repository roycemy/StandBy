# StandBy

StandBy is moving from a simulated demo to an honest live flight-search and standby intelligence product.

**Live beta:** https://roycemy.github.io/StandBy/

## What works now

- Search form for route, trip dates, travelers, and cabin
- Handoff to Google Flights for current schedules, displayed fares, stops, duration, and real booking links
- No invented open-seat counts, passenger loads, or standby probabilities
- A Python collection framework with SQLite history, provider gates, backoff-friendly delays, run logs, prediction storage, and alert output
- A four-times-daily GitHub Actions schedule at staggered minutes

## The compliance boundary

The collector does not scrape any airline or travel site by default. A provider runs only when all of these are true in `providers.json`:

1. `enabled` is true
2. `terms_reviewed` is true
3. `automation_permitted` is true
4. A required credential is present
5. Its official response schema has a reviewed adapter

A CAPTCHA, robots restriction, blocked request, login wall, or terms prohibition is a stop signal. StandBy does not bypass controls, rotate IPs, or disguise traffic. The scheduler uses four spaced runs per day, one run at a time, plus source-specific delays. A provider's stricter published limit always wins.

## Data model

Each observation preserves source, timestamp, route, departure, carrier, flight number, displayed price, booking class, bookable status, seat availability when the provider legitimately supplies it, and a source URL. Missing fields remain `null`.

The baseline probability model refuses to emit a result without at least eight legitimate seat-history observations. Its output is labeled low or medium confidence and keeps the exact inputs used. It is a starting baseline, not a claim about airline standby priority.

## Run locally

```bash
python standby_pipeline.py status
python standby_pipeline.py collect
```

The default run is safe and produces a skipped-provider report because no source is approved or credentialed yet.

## What is still required

Choose a provider that contractually permits automated collection and consumer display of live fares, booking-class/seat availability, and derived probability scores. Add its credential as the `STANDBY_PROVIDER_KEY` repository secret, complete its official schema adapter, and turn on the three permission gates.

Actual standby lists, passenger loads, employee/non-rev priority, and clearance order are airline-controlled. If a provider cannot license those fields, StandBy can model a route-level opportunity indicator from permitted availability history, but must not call it a true standby probability.
