import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import authReducer, { login } from "@/store/slices/authSlice";
import SignOutOtherDevices from "./SignOutOtherDevices";
import { authService } from "@/services/auth.service";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/services/auth.service", () => ({
  authService: { signOutAllOtherDevices: vi.fn() },
}));
vi.mock("@/services/api", () => ({
  default: {
    getMe: vi.fn().mockResolvedValue({ success: true, data: { id: "user-1", email: "person@example.com" } }),
    setStore: vi.fn(),
  },
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function renderComponent() {
  const store = configureStore({ reducer: { auth: authReducer } });
  store.dispatch(login({ email: "person@example.com", password: "Password1" }));
  render(
    <Provider store={store}>
      <SignOutOtherDevices />
    </Provider>,
  );
  return store;
}

describe("SignOutOtherDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("requires confirmation before calling the service", async () => {
    vi.mocked(authService.signOutAllOtherDevices).mockResolvedValue({ currentSessionRevoked: false });
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all other devices" }));
    expect(authService.signOutAllOtherDevices).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));
    await waitFor(() => expect(authService.signOutAllOtherDevices).toHaveBeenCalledTimes(1));
  });

  it("keeps the authenticated session on backend failure and offers retry", async () => {
    vi.mocked(authService.signOutAllOtherDevices).mockRejectedValue(new Error("offline"));
    const store = renderComponent();
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Sign out of all other devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current session is still active");
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
