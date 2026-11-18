import React from "react";
import { act, fireEvent, render, screen } from "../utils/test-utils";
import AddressInput from "../../components/AddressInput";
import { searchAddresses, type AddressSuggestion } from "../../lib/addressSearch";

jest.mock("../../lib/addressSearch", () => ({
  ...jest.requireActual("../../lib/addressSearch"),
  searchAddresses: jest.fn(),
}));
const search = searchAddresses as jest.Mock;

const row = (title: string, subtitle: string, lng = 25.26, lat = 54.71): AddressSuggestion => ({
  id: `address.${title}.${subtitle}`,
  place_name: `${title}, ${subtitle}`,
  title,
  subtitle,
  coordinates: [lng, lat],
});

/** A search whose answer the test delivers when it chooses. */
function pendingSearch() {
  let deliver: (rows: AddressSuggestion[]) => void = () => undefined;
  search.mockImplementationOnce(() => new Promise<AddressSuggestion[]>((resolve) => { deliver = resolve; }));
  return (rows: AddressSuggestion[]) => act(async () => { deliver(rows); });
}

const type = (text: string) => {
  fireEvent.changeText(screen.getByPlaceholderText("Home address"), text);
  act(() => { jest.advanceTimersByTime(400); });
};

describe("AddressInput suggestions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    search.mockReset();
    search.mockResolvedValue([]);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("lists matches as street and town, and hands the picked one to the form", async () => {
    const onPress = jest.fn();
    const answer = pendingSearch();
    render(<AddressInput placeholder="Home address" onPress={onPress} near={{ lat: 54.69, lng: 25.28 }} />);

    type("Ozo 25");
    expect(search).toHaveBeenCalledWith("Ozo 25", { near: { lat: 54.69, lng: 25.28 } });
    await answer([row("Ozo g. 25", "Vilnius 07150, Lithuania"), row("Ozo g. 25", "Domeikava 54340, Lithuania", 23.93, 54.96)]);

    expect(screen.getAllByText("Ozo g. 25")).toHaveLength(2);
    expect(screen.getByText("Domeikava 54340, Lithuania")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Ozo g. 25, Vilnius 07150, Lithuania"));
    expect(onPress).toHaveBeenCalledWith(
      { description: "Ozo g. 25, Vilnius 07150, Lithuania" },
      expect.objectContaining({
        formatted_address: "Ozo g. 25, Vilnius 07150, Lithuania",
        geometry: { location: { lat: 54.71, lng: 25.26 } },
      }),
    );
    expect(screen.getByDisplayValue("Ozo g. 25, Vilnius 07150, Lithuania")).toBeTruthy();
    expect(screen.queryByText("Domeikava 54340, Lithuania")).toBeNull();
  });

  it("shows the answer for the latest text when an earlier one arrives late", async () => {
    render(<AddressInput placeholder="Home address" />);

    const answerOzo = pendingSearch();
    type("Ozo");
    const answerOzo25 = pendingSearch();
    type("Ozo 25");

    await answerOzo25([row("Ozo g. 25", "Vilnius 07150, Lithuania")]);
    await answerOzo([row("Ozolų g.", "Kaunas 46247, Lithuania")]);

    expect(screen.getByText("Ozo g. 25")).toBeTruthy();
    expect(screen.queryByText("Ozolų g.")).toBeNull();
  });

  it("doesn't reopen the list when an answer arrives after a pick", async () => {
    render(<AddressInput placeholder="Home address" onPress={jest.fn()} />);

    const first = pendingSearch();
    type("Ozo");
    await first([row("Ozo g. 25", "Vilnius 07150, Lithuania")]);

    // Still typing: the next search is on its way when a row is tapped.
    const late = pendingSearch();
    type("Ozo g");
    fireEvent.press(screen.getByLabelText("Ozo g. 25, Vilnius 07150, Lithuania"));
    await late([row("Ozo g. 18", "Vilnius 08243, Lithuania")]);

    expect(screen.queryByText("Ozo g. 18")).toBeNull();
    expect(screen.getByDisplayValue("Ozo g. 25, Vilnius 07150, Lithuania")).toBeTruthy();
  });
});
