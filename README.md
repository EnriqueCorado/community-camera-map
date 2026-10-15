# History data

Daily snapshots of the map's fast-changing layers, written by the `history`
job in `.github/workflows/pages.yml` (`backend/scripts/snapshot_history.py`).
Each build copies this branch to `data/history/` for the map's History slider.
The last 90 days are kept. Flights are never archived.
