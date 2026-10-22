// A tiny GTFS-realtime decoder: just enough protobuf to read VehiclePosition
// entities (vehicle id/label, route, position, bearing, speed, time). Fields we
// don't use, including other entity types, are skipped by wire type. No deps.
// Spec: https://gtfs.org/documentation/realtime/proto/

export interface Vehicle {
  id: string;
  label: string;
  route: string;
  lat: number;
  lon: number;
  bearing: number | null;
  /** meters per second */
  speed: number | null;
  /** unix seconds */
  timestamp: number | null;
}

export interface Feed {
  /** unix seconds the feed was generated */
  timestamp: number | null;
  vehicles: Vehicle[];
}

/** Feeds this large aren't vehicle positions (or are hostile): refuse them. */
export const MAX_FEED_BYTES = 4_000_000;

const utf8 = new TextDecoder();

class Reader {
  private pos: number;
  private readonly buf: Uint8Array;
  private readonly end: number;
  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }
  varint(): number {
    // Up to 64-bit varints; precision past 2^53 doesn't matter here.
    let result = 0, mul = 1;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error("truncated varint");
      const b = this.buf[this.pos++]!;
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
    throw new Error("bad varint");
  }
  private span(): [number, number] {
    const len = this.varint();
    const start = this.pos;
    if (start + len > this.end) throw new Error("truncated field");
    this.pos += len;
    return [start, this.pos];
  }
  message(): Reader {
    const [a, b] = this.span();
    return new Reader(this.buf, a, b);
  }
  string(): string {
    const [a, b] = this.span();
    return utf8.decode(this.buf.subarray(a, b)).trim().slice(0, 64);
  }
  float(): number {
    if (this.pos + 4 > this.end) throw new Error("truncated float");
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }
  private skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.span();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`unsupported wire type ${wire}`);
    if (this.pos > this.end) throw new Error("truncated field");
  }
  /** Calls fn(field, wire) for each field; fn returns false to skip it. */
  each(fn: (field: number, wire: number) => boolean): void {
    while (this.pos < this.end) {
      const tag = this.varint();
      const field = Math.floor(tag / 8), wire = tag % 8;
      if (field === 0) throw new Error("bad field number");
      if (!fn(field, wire)) this.skip(wire);
    }
  }
}

const finite = (n: number) => (Number.isFinite(n) ? n : null);

function vehiclePosition(r: Reader): Vehicle {
  const v: Vehicle = { id: "", label: "", route: "", lat: NaN, lon: NaN, bearing: null, speed: null, timestamp: null };
  r.each((f, w) => {
    if (f === 1 && w === 2) {
      const trip = r.message(); // TripDescriptor
      trip.each((tf, tw) => (tf === 5 && tw === 2 ? ((v.route = trip.string()), true) : false));
    } else if (f === 2 && w === 2) {
      const p = r.message(); // Position (floats, wire type 5)
      p.each((pf, pw) => {
        if (pw !== 5) return false;
        const x = p.float();
        if (pf === 1) v.lat = x;
        else if (pf === 2) v.lon = x;
        else if (pf === 3) v.bearing = finite(x);
        else if (pf === 5) v.speed = finite(x);
        return true;
      });
    } else if (f === 5 && w === 0) v.timestamp = r.varint();
    else if (f === 8 && w === 2) {
      // VehicleDescriptor: id + label only (never the license plate, field 3).
      const d = r.message();
      d.each((df, dw) => {
        if (dw !== 2 || (df !== 1 && df !== 2)) return false;
        if (df === 1) v.id = d.string();
        else v.label = d.string();
        return true;
      });
    } else return false;
    return true;
  });
  return v;
}

/** Decode a GTFS-realtime FeedMessage, keeping only VehiclePosition entities.
 *  Throws on malformed input (callers keep the last good data). */
export function decodeVehicles(buf: Uint8Array): Feed {
  if (buf.length > MAX_FEED_BYTES) throw new Error("feed too large");
  const r = new Reader(buf);
  const out: Feed = { timestamp: null, vehicles: [] };
  r.each((f, w) => {
    if (f === 1 && w === 2) {
      const h = r.message(); // FeedHeader: timestamp is field 3
      h.each((hf, hw) => (hf === 3 && hw === 0 ? ((out.timestamp = h.varint()), true) : false));
    } else if (f === 2 && w === 2) {
      const e = r.message(); // FeedEntity: vehicle is field 4
      let deleted = false, eid = "";
      let veh: Vehicle | null = null;
      e.each((ef, ew) => {
        if (ef === 1 && ew === 2) eid = e.string();
        else if (ef === 2 && ew === 0) deleted = e.varint() !== 0;
        else if (ef === 4 && ew === 2) veh = vehiclePosition(e.message());
        else return false;
        return true;
      });
      const v = veh as Vehicle | null;
      if (v && !deleted) {
        v.id ||= eid;
        out.vehicles.push(v);
      }
    } else return false;
    return true;
  });
  return out;
}
