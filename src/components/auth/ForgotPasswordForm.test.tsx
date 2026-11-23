import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { authService } from "@/services/auth.service";

vi.mock("@/services/auth.service", () => ({
  authService: { requestPasswordReset: vi.fn() },
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a neutral confirmation after a valid request", async () => {
    vi.mocked(authService.requestPasswordReset).mockResolvedValue({ success: true, data: { message: "Reset email sent" } });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists for that email");
    expect(authService.requestPasswordReset).toHaveBeenCalledWith("user@example.com");
  });

  it("uses the same neutral confirmation for server errors to avoid account enumeration", async () => {
    vi.mocked(authService.requestPasswordReset).mockRejectedValue(new Error("User not found"));
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists for that email");
  });
});
