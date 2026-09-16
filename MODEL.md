# Seat-availability model

## Target

The model predicts either `seats_at_departure` or `P(seats_at_departure > 0)` for a specific flight. It does **not** claim to predict a traveler's standby clearance. That requires their priority category, check-in/lottery position, airline rules, operational upgrades, no-shows, and the live standby list.

## Source hierarchy

1. **Licensed flight-level availability history** is the target and strongest signal: current bookable seats by class, 24h/72h seat change, fare movement, and days to departure.
2. **T-100 Domestic Segment** provides monthly route/carrier seats, passengers, departures, aircraft capacity and load-factor priors.
3. **DB1B through June 2025, then DB1C from July 2025** provides route demand, fare, itinerary and seasonality priors. DB1B is a 10% quarterly ticket sample; DB1C is the current 40% monthly successor. Neither says how many seats remain on a specific future flight.
4. **BTS On-Time Performance** adds cancellation and delay rates when validation shows they improve the seat target.
5. Cargo/mail fields are excluded by default. They enter only if time-split cross-validation proves lift for seat availability.

Official sources:
- DB1B profile: https://www.transtats.bts.gov/DatabaseInfo.asp?DB_URL=&QO_VQ=EFI
- DB1B to DB1C transition: https://www.bts.gov/topics/airlines-and-airports/origin-and-destination-survey-data
- T-100 fields: https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FIM
- On-Time data: https://www.transtats.bts.gov/ontime/

## Training discipline

Use route-and-time splits, never random rows that leak future observations. Hold out the latest quarter plus unseen routes. Compare against simple route/month load-factor and latest-seat baselines. Report MAE for remaining seats, Brier score and calibration error for any-seat probability, broken down by days-to-departure bucket. Do not publish probabilities until licensed flight-level labels exist and calibration beats the baseline.

`seat_model.py` defines the narrow feature contract, validates missing labels, and supplies a visibly low-confidence baseline for end-to-end plumbing. It deliberately refuses to pretend it trained a model without enough real labels.
