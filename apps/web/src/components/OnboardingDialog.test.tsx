import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingDialog } from "./OnboardingDialog";

describe("OnboardingDialog", () => {
  it("walks through the optional introduction and completes", () => {
    const complete = vi.fn();
    render(<OnboardingDialog onComplete={complete} />);
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-complete"));
    expect(complete).toHaveBeenCalledOnce();
  });
});
