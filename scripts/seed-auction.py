#!/usr/bin/env python3
"""Generate and upload dummy auction data mapping all golfers to 8 participants."""
import urllib.request
import json
import random

BASE = "https://masters-auction.sam-ansara-demo-account.workers.dev"
random.seed(42)

# Fetch current leaderboard
req = urllib.request.Request(f"{BASE}/api/leaderboard", headers={"User-Agent": "Mozilla/5.0"})
resp = urllib.request.urlopen(req, timeout=15)
data = json.loads(resp.read())
lb = data["leaderboard"]

participants = [
    "Mike Johnson", "Sarah Williams", "Tom Davis", "Lisa Chen",
    "Dave Brown", "Chris Miller", "Amy Taylor", "Jake Wilson",
]

purchases = []
for i, g in enumerate(lb):
    participant = participants[i % len(participants)]
    price = max(20, 500 - (i * 3)) + random.randint(-15, 15)
    purchases.append({"participant": participant, "golfer": g["name"], "price": price})

payload = json.dumps({"tournament_id": 1, "purchases": purchases}).encode()

# Upload
req2 = urllib.request.Request(
    f"{BASE}/api/admin/upload-auction",
    data=payload,
    headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    method="POST",
)
resp2 = urllib.request.urlopen(req2, timeout=15)
result = json.loads(resp2.read())

# Summary
total_by_p = {}
for p in purchases:
    total_by_p[p["participant"]] = total_by_p.get(p["participant"], 0) + p["price"]

print("Upload result:", result)
print("Total golfers mapped: %d" % len(purchases))
for name in sorted(total_by_p, key=lambda x: -total_by_p[x]):
    count = sum(1 for p in purchases if p["participant"] == name)
    print("  %-18s %d golfers  $%d" % (name, count, total_by_p[name]))
