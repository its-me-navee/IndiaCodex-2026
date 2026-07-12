import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ForecastDiscovery } from "@/components/forecast-discovery";
import { demoMarkets } from "@/data/demo";

describe("ForecastDiscovery", () => {
  it("shows 100-forecast progress instead of a 50/50 default", () => {
    const discovery = demoMarkets.find((market) => market.status === "PRICE_DISCOVERY")!;
    render(<ForecastDiscovery market={discovery} />);
    expect(screen.getByText("74/100")).toBeInTheDocument();
    expect(screen.getByText(/does not default to 50\/50/i)).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });
});
