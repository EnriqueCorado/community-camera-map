# Plate-reader tiles (seed)

Nationwide license plate readers (OpenStreetMap via DeFlock; © OpenStreetMap
contributors, ODbL), cut into 5-degree tiles by
`backend/scripts/build_alpr_usa.py`. CI starts from this copy whenever its
cache is empty, then refreshes cells from Overpass (least recently fetched
first). To reseed from a machine DeFlock's CDN allows:

    cd backend && uv run python scripts/build_alpr_usa.py
    # then copy frontend/public/data/alpr/ here and commit
