#!/usr/bin/env python3
"""StandBy collection and prediction pipeline.

Only adapters explicitly enabled after a terms/licensing review may make network
requests. The default configuration performs no scraping and creates no cost.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, math, os, sqlite3, time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DB = Path(os.getenv("STANDBY_DB", ROOT / "standby.db"))
CONFIG = Path(os.getenv("STANDBY_CONFIG", ROOT / "providers.json"))

@dataclass
class Offer:
    source: str
    observed_at: str
    origin: str
    destination: str
    departure: str
    arrival: str | None
    carrier: str | None
    flight_number: str | None
    currency: str | None
    price: float | None
    seats_available: int | None
    booking_class: str | None
    bookable: bool | None
    source_url: str | None

    @property
    def key(self) -> str:
        raw = "|".join(str(x or "") for x in (self.source,self.origin,self.destination,self.departure,self.carrier,self.flight_number,self.booking_class))
        return hashlib.sha256(raw.encode()).hexdigest()[:24]

class ProviderError(RuntimeError): pass
class TermsNotApproved(ProviderError): pass

class Provider:
    """Base class for licensed/permitted APIs. Never scrape around a block."""
    name = "base"
    def __init__(self, cfg: dict[str, Any]): self.cfg = cfg
    def validate_gate(self) -> None:
        if not self.cfg.get("enabled"): raise TermsNotApproved(f"{self.name}: disabled")
        if not self.cfg.get("terms_reviewed") or not self.cfg.get("automation_permitted"):
            raise TermsNotApproved(f"{self.name}: terms/automation approval missing")
        if self.cfg.get("requires_api_key") and not os.getenv(self.cfg.get("api_key_env", "")):
            raise TermsNotApproved(f"{self.name}: API credential missing")
    def collect(self, route: dict[str, Any]) -> Iterable[Offer]: raise NotImplementedError

class JsonApiProvider(Provider):
    """Adapter for a provider approved by the owner.

    Response mapping is intentionally provider-specific and must be completed
    from that provider's official schema. Generic guessing is prohibited.
    """
    name = "licensed_json_api"
    def collect(self, route: dict[str, Any]) -> Iterable[Offer]:
        self.validate_gate()
        endpoint = self.cfg.get("endpoint")
        if not endpoint: raise ProviderError("endpoint not configured")
        key = os.getenv(self.cfg["api_key_env"])
        url = endpoint.format(**route)
        req = Request(url, headers={self.cfg.get("auth_header", "Authorization"): self.cfg.get("auth_prefix", "Bearer ") + key, "User-Agent":"StandBy/0.2 compliance-contact=" + self.cfg.get("contact", "unset")})
        with urlopen(req, timeout=30) as response:
            payload = json.load(response)
        mapper = self.cfg.get("mapper")
        if mapper != "standby_v1": raise ProviderError("official response mapper not implemented")
        for row in payload.get("offers", []):
            yield Offer(source=self.name, observed_at=utcnow(), origin=row["origin"], destination=row["destination"], departure=row["departure"], arrival=row.get("arrival"), carrier=row.get("carrier"), flight_number=row.get("flight_number"), currency=row.get("currency"), price=number(row.get("price")), seats_available=integer(row.get("seats_available")), booking_class=row.get("booking_class"), bookable=row.get("bookable"), source_url=row.get("source_url"))

PROVIDERS = {JsonApiProvider.name: JsonApiProvider}

def utcnow() -> str: return dt.datetime.now(dt.timezone.utc).isoformat()
def number(v):
    try: return float(v) if v is not None else None
    except (TypeError, ValueError): return None
def integer(v):
    try: return int(v) if v is not None else None
    except (TypeError, ValueError): return None

def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS observations(
      id INTEGER PRIMARY KEY, offer_key TEXT NOT NULL, source TEXT NOT NULL,
      observed_at TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL,
      departure TEXT NOT NULL, arrival TEXT, carrier TEXT, flight_number TEXT,
      currency TEXT, price REAL, seats_available INTEGER, booking_class TEXT,
      bookable INTEGER, source_url TEXT, raw_json TEXT NOT NULL,
      UNIQUE(offer_key, observed_at));
    CREATE INDEX IF NOT EXISTS route_time ON observations(origin,destination,departure,observed_at);
    CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, source TEXT, status TEXT, detail TEXT);
    CREATE TABLE IF NOT EXISTS predictions(offer_key TEXT, generated_at TEXT, probability REAL, confidence TEXT, inputs_json TEXT, model_version TEXT);
    """)
    return db

def store(db: sqlite3.Connection, offers: Iterable[Offer]) -> int:
    n=0
    for o in offers:
        d=asdict(o)
        db.execute("INSERT OR IGNORE INTO observations(offer_key,source,observed_at,origin,destination,departure,arrival,carrier,flight_number,currency,price,seats_available,booking_class,bookable,source_url,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (o.key,o.source,o.observed_at,o.origin,o.destination,o.departure,o.arrival,o.carrier,o.flight_number,o.currency,o.price,o.seats_available,o.booking_class,None if o.bookable is None else int(o.bookable),o.source_url,json.dumps(d,sort_keys=True)))
        n += db.total_changes > n
    db.commit(); return n

def predict(db: sqlite3.Connection) -> int:
    """Transparent baseline. Never emits odds without seat-history evidence."""
    rows=db.execute("""SELECT offer_key, departure, seats_available, observed_at FROM observations
      WHERE seats_available IS NOT NULL ORDER BY offer_key, observed_at""").fetchall()
    grouped: dict[str,list[tuple]]= {}
    for row in rows: grouped.setdefault(row[0],[]).append(row[1:])
    count=0
    for key, history in grouped.items():
        if len(history) < 8: continue
        seats=[h[1] for h in history]
        velocity=(seats[-1]-seats[0])/max(1,len(seats)-1)
        days=max(.25,(dt.datetime.fromisoformat(history[-1][0])-dt.datetime.now(dt.timezone.utc)).total_seconds()/86400)
        # Conservative interpretable baseline, capped away from certainty.
        logit=-1.0 + .16*seats[-1] + .9*velocity + .05*days
        probability=max(.03,min(.97,1/(1+math.exp(-logit))))
        confidence="medium" if len(history)>=16 else "low"
        inputs={"latest_seats":seats[-1],"seat_velocity_per_observation":round(velocity,3),"history_points":len(history),"days_to_departure":round(days,2)}
        db.execute("INSERT INTO predictions VALUES(?,?,?,?,?,?)",(key,utcnow(),probability,confidence,json.dumps(inputs),"baseline-0.1")); count+=1
    db.commit(); return count

def alerts(db: sqlite3.Connection, cfg: dict[str,Any]) -> list[dict[str,Any]]:
    threshold=float(cfg.get("alerts",{}).get("high_probability",.75)); out=[]
    for key,p,conf,inputs in db.execute("SELECT offer_key,probability,confidence,inputs_json FROM predictions WHERE generated_at IN (SELECT max(generated_at) FROM predictions GROUP BY offer_key) AND probability>=?",(threshold,)):
        out.append({"type":"high_probability","offer_key":key,"probability":p,"confidence":conf,"inputs":json.loads(inputs)})
    return out

def collect(cfg: dict[str,Any]) -> dict[str,Any]:
    db=connect(); summary={"started_at":utcnow(),"providers":[],"stored":0,"predictions":0,"alerts":[]}
    for name,pcfg in cfg.get("providers",{}).items():
        started=utcnow(); status="skipped"; detail=""
        try:
            cls=PROVIDERS.get(name)
            if not cls: raise ProviderError("adapter not implemented")
            provider=cls(pcfg); provider.validate_gate(); collected=[]
            for route in cfg.get("routes",[]):
                collected.extend(provider.collect(route)); time.sleep(max(1,float(pcfg.get("delay_seconds",2))))
            n=store(db,collected); summary["stored"]+=n; status="ok"; detail=f"{n} stored"
        except TermsNotApproved as e: detail=str(e)
        except Exception as e: status="error"; detail=f"{type(e).__name__}: {e}"
        db.execute("INSERT INTO runs(started_at,finished_at,source,status,detail) VALUES(?,?,?,?,?)",(started,utcnow(),name,status,detail)); db.commit()
        summary["providers"].append({"name":name,"status":status,"detail":detail})
    summary["predictions"]=predict(db); summary["alerts"]=alerts(db,cfg); summary["finished_at"]=utcnow(); return summary

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("command",choices=["collect","status"]); args=ap.parse_args()
    cfg=json.loads(CONFIG.read_text())
    if args.command=="collect": print(json.dumps(collect(cfg),indent=2))
    else:
        db=connect(); print(json.dumps({"observations":db.execute("select count(*) from observations").fetchone()[0],"latest_runs":db.execute("select finished_at,source,status,detail from runs order by id desc limit 10").fetchall()},indent=2))
if __name__=="__main__": main()
