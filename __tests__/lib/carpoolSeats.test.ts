import { seatSummary, seatsOpenLabel, seatsTakenLabel } from "../../lib/carpoolSeats";

const driver = (seats: number | null) => ({ role: "driver" as const, passenger_capacity: seats });
const match = (status: string) => ({ status });

describe("seatSummary", () => {
  it("is only for drivers", () => {
    expect(seatSummary(null, [])).toBeNull();
    expect(seatSummary({ role: "passenger", passenger_capacity: null }, [match("confirmed")])).toBeNull();
  });

  it("starts with every seat free", () => {
    const s = seatSummary(driver(2), []);
    expect(s).toEqual({ total: 2, taken: 0, offered: 0, free: 2 });
    expect(seatsTakenLabel(s!)).toBe("0 of 2 seats taken");
    expect(seatsOpenLabel(s!)).toBe("2 seats still free");
  });

  it("keeps the second seat open after the first passenger is confirmed", () => {
    const s = seatSummary(driver(2), [match("confirmed")]);
    expect(s).toEqual({ total: 2, taken: 1, offered: 0, free: 1 });
    expect(seatsTakenLabel(s!)).toBe("1 of 2 seats taken");
    expect(seatsOpenLabel(s!)).toBe("1 seat still free");
  });

  it("counts an offer waiting for an answer as holding its seat", () => {
    const s = seatSummary(driver(3), [match("confirmed"), match("pending"), match("awaiting_other")]);
    expect(s).toEqual({ total: 3, taken: 1, offered: 2, free: 0 });
    expect(seatsOpenLabel(s!)).toBe("2 offers waiting for an answer");
    expect(seatsOpenLabel(seatSummary(driver(4), [match("confirmed"), match("pending")])!))
      .toBe("1 offer waiting for an answer · 2 seats still free");
  });

  it("says when the car is full", () => {
    const s = seatSummary(driver(2), [match("confirmed"), match("confirmed")]);
    expect(s).toEqual({ total: 2, taken: 2, offered: 0, free: 0 });
    expect(seatsTakenLabel(s!)).toBe("2 of 2 seats taken");
    expect(seatsOpenLabel(s!)).toBe("Your car is full");
  });

  it("uses one seat when the trip was saved without a number, like the server", () => {
    const s = seatSummary(driver(null), [match("confirmed")]);
    expect(s).toEqual({ total: 1, taken: 1, offered: 0, free: 0 });
    expect(seatsTakenLabel(s!)).toBe("1 of 1 seat taken");
  });

  it("handles a trip that offers no seats, and ignores finished matches", () => {
    const none = seatSummary(driver(0), []);
    expect(seatsTakenLabel(none!)).toBe("No seats offered");
    expect(seatsOpenLabel(none!)).toBeNull();
    expect(seatSummary(driver(2), [match("cancelled_by_passenger"), match("expired")]))
      .toEqual({ total: 2, taken: 0, offered: 0, free: 2 });
  });
});
