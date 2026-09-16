#!/usr/bin/env python3
"""Focused seat-availability model for StandBy.

Target: seats expected to remain at departure / probability any seat remains.
This is not a standby-clearance model: it has no priority-list or employee-status label.
"""
from __future__ import annotations
import argparse, csv, json, math, pickle
from pathlib import Path

FEATURES = [
  "route_load_factor_12m", "route_load_factor_same_month", "carrier_route_load_factor",
  "days_to_departure", "current_seats_available", "seat_change_24h", "seat_change_72h",
  "fare_change_24h", "weekday", "departure_hour", "holiday_window",
  "route_cancellation_rate", "route_delay_rate", "scheduled_frequency_day",
  "later_same_day_frequency", "aircraft_seats"
]

# DB1B ended in July 2025. DB1C is its monthly 40% successor and should be used for
# current demand-pattern refreshes. T-100 supplies monthly route/carrier seats,
# passengers, departures and load factor. On-Time supplies disruptions.
SOURCE_ROLES = {
 "db1b_db1c": "route demand, fare, itinerary and seasonality priors; never a flight-level open-seat label",
 "t100": "monthly carrier-route capacity, passengers, departures and load-factor priors",
 "on_time": "route/carrier cancellation and delay features",
 "licensed_realtime": "flight-level bookable seats/classes, fares and changes; required target signal"
}

def sigmoid(x): return 1/(1+math.exp(-max(-30,min(30,x))))

class FocusedBaseline:
    """Dependency-free, auditable baseline until enough licensed labels exist."""
    version="seat-focused-0.2"
    def fit(self, rows):
        usable=[r for r in rows if r.get("seats_at_departure") not in (None,"")]
        if len(usable)<500: raise ValueError("Need at least 500 licensed flight-level departure labels")
        # Deliberately refuses to claim ML training without sklearn/validated pipeline.
        raise RuntimeError("Use train_gradient_boosting.py in a controlled training environment; baseline stays untrained")
    def predict(self, r):
        required=("current_seats_available","seat_change_24h","days_to_departure")
        if any(r.get(k) is None for k in required): return {"probability":None,"reason":"missing real-time seat inputs"}
        open_now=float(r["current_seats_available"]); velocity=float(r["seat_change_24h"])
        days=max(.25,float(r["days_to_departure"])); expected=max(0,open_now+velocity*days)
        p=sigmoid(-1.4+.30*expected-.08*max(0,-velocity)+.4*float(r.get("route_load_factor_same_month",.82)-.82)*-1)
        return {"seat_availability_probability":round(max(.02,min(.98,p)),4),"expected_seats_at_departure":round(expected,1),"confidence":"low","model_version":self.version,"not_standby_clearance_probability":True}

def validate(rows):
    report={"rows":len(rows),"missing":{},"warning":[]}
    for f in FEATURES: report["missing"][f]=sum(r.get(f) in (None,"") for r in rows)
    if not any(r.get("seats_at_departure") not in (None,"") for r in rows): report["warning"].append("No licensed departure-seat target labels")
    return report

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("command",choices=["spec","validate","predict"]); ap.add_argument("--input"); a=ap.parse_args()
    if a.command=="spec": print(json.dumps({"target_regression":"seats_at_departure","target_classification":"seats_at_departure > 0","features":FEATURES,"sources":SOURCE_ROLES,"exclusions":["cargo tonnage unless cross-validation improves seat target","tail/aircraft operational fields without demonstrated lift","standby priority or success labels not actually observed"]},indent=2)); return
    rows=list(csv.DictReader(open(a.input)))
    if a.command=="validate": print(json.dumps(validate(rows),indent=2)); return
    m=FocusedBaseline()
    for r in rows: print(json.dumps(m.predict({k:(float(v) if v not in (None,"") else None) for k,v in r.items()})))
if __name__=="__main__": main()
