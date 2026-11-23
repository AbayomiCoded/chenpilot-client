import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import accountReducer, { updateAccountStatus } from "@/store/slices/accountSlice";
import authReducer, { login } from "@/store/slices/authSlice";
import TransactionsPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { horizonFetch } = vi.hoisted(() => ({ horizonFetch: vi.fn() }));

vi.mock("@/utils/horizonFetch", () => ({
  horizonFetch,
}));

const transaction = {
  id: "tx-1",
  hash: "abc123hash",
  ledger: 123,
  created_at: "2026-10-20T00:00:00.000Z",
  source_account: "Gsource",
  fee_charged: "100",
  operation_count: 1,
  successful: true,
  memo: "Invoice 42",
  operations: [
    {
      id: "op-1",
      type: "payment",
      amount: "25",
      asset: "USDC",
      to: "Gdestination",
      source_account: "Gsource",
    },
  ],
};

function renderPage() {
  const store = configureStore({
    reducer: { account: accountReducer, auth: authReducer },
  });
  store.dispatch(login({ email: "person@example.com", password: "Password1" }));
  store.dispatch(updateAccountStatus({ publicKey: "G" + "A".repeat(55) }));
  render(
    <Provider store={store}>
      <TransactionsPage />
    </Provider>,
  );
  return store;
}

// The page dispatches on mount, so the initial empty render is replaced by the
// loading state and then by the settled result. Wait for the request to be
// issued and for the slice to settle before asserting on the DOM.
async function waitForSettled(store: ReturnType<typeof renderPage>) {
  await waitFor(() => expect(horizonFetch).toHaveBeenCalled());
  await waitFor(() =>
    expect(store.getState().account.transactions.isLoading).toBe(false),
  );
}

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    horizonFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [] } }),
    });
  });

  it("renders the empty state when there are no transactions", async () => {
    const store = renderPage();
    await waitForSettled(store);

    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  });

  it("opens details for a stored transaction", async () => {
    horizonFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [{
            ...transaction,
            _embedded: {
              records: [{
                id: "op-1",
                type: "payment",
                amount: "25",
                asset_type: "credit_alphanum4",
                asset_code: "USDC",
                asset_issuer: "Gissuer",
                to: "Gdestination",
                source_account: "Gsource",
              }],
            },
          }],
        },
      }),
    });

    const store = renderPage();
    await waitForSettled(store);

    const { transactions } = store.getState().account;
    expect(transactions.transactions).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /view details for transaction/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /view details for transaction/i }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Invoice 42");
    expect(screen.getByRole("dialog")).toHaveTextContent("25 USDC");
  });
});
