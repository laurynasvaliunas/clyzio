import React from "react";
import * as RN from "react-native";
import { fireEvent, render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import RatingSheet from "../../components/RatingSheet";

/**
 * A driver rating their passenger used to be offered "Safe driver" / "Clean
 * car", and a duplicate rating surfaced a raw database error.
 */
describe("RatingSheet", () => {
  const baseProps = {
    visible: true,
    rideId: "ride-1",
    ratedId: "user-2",
    partnerName: "Aronas",
    onClose: jest.fn(),
  };

  // Badge renders labels upper-case.
  it("offers driver chips when rating a driver", () => {
    render(<RatingSheet {...baseProps} ratedRole="driver" />);
    expect(screen.getByText("SAFE DRIVER")).toBeTruthy();
    expect(screen.queryByText("READY AT PICKUP")).toBeNull();
  });

  it("offers passenger chips when rating a passenger", () => {
    render(<RatingSheet {...baseProps} ratedRole="passenger" />);
    expect(screen.getByText("READY AT PICKUP")).toBeTruthy();
    expect(screen.queryByText("SAFE DRIVER")).toBeNull();
    expect(screen.queryByText("CLEAN CAR")).toBeNull();
  });

  it("explains a duplicate rating instead of showing the database error", async () => {
    const alert = jest.spyOn(RN.Alert, "alert").mockImplementation(() => undefined);
    (supabase.from as jest.Mock).mockImplementation(() => ({
      insert: jest.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key value" } }),
    }));
    const onClose = jest.fn();

    render(<RatingSheet {...baseProps} onClose={onClose} ratedRole="driver" />);
    fireEvent.press(screen.getByLabelText("5 stars"));
    fireEvent.press(screen.getByText("Submit rating"));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Already rated", "You've already rated this ride."));
    expect(onClose).toHaveBeenCalled();
    alert.mockRestore();
  });
});
