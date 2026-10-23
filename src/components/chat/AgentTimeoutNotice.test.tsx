import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessage } from "@/types";

const { getActionStatus } = vi.hoisted(() => ({ getActionStatus: vi.fn() }));

vi.mock("@/services/agentService", () => ({
  agentService: { getActionStatus },
  default: { getActionStatus },
}));

import { AgentTimeoutNotice } from "./AgentTimeoutNotice";

const timedOut = (overrides: Partial<NonNullable<ChatMessage["metadata"]>> = {}): ChatMessage => ({
  id: "msg_agent_1",
  type: "agent",
  content: "This action is taking longer than expected and may still be running.",
  timestamp: new Date().toISOString(),
  metadata: {
    success: false,
    errorKind: "timeout",
    requestId: "req_1",
    stateChanging: true,
    ...overrides,
  },
});

describe("AgentTimeoutNotice (#274)", () => {
  beforeEach(() => {
    getActionStatus.mockReset();
  });

  it("renders nothing for non-timeout failures", () => {
    const { container } = render(
      <AgentTimeoutNotice message={timedOut({ errorKind: "network" })} onResolve={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a status check instead of retry for state-changing actions", () => {
    render(<AgentTimeoutNotice message={timedOut()} onResolve={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByText(/may still be running/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });

  it("offers retry for read-only queries", () => {
    const onRetry = vi.fn();
    render(
      <AgentTimeoutNotice message={timedOut({ stateChanging: false })} onResolve={vi.fn()} onRetry={onRetry} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Check status" })).not.toBeInTheDocument();
  });

  it("applies a late completion to the message", async () => {
    getActionStatus.mockResolvedValue({
      requestId: "req_1",
      status: "completed",
      result: { success: true, data: "Sent 50 XLM", transactionHash: "tx_9" },
      checkedAt: new Date().toISOString(),
    });
    const onResolve = vi.fn();
    render(<AgentTimeoutNotice message={timedOut()} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "Check status" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(getActionStatus).toHaveBeenCalledWith("req_1");
    const updates = onResolve.mock.calls[0][0];
    expect(updates.content).toBe("Sent 50 XLM");
    expect(updates.metadata).toMatchObject({
      success: true,
      actionStatus: "completed",
      transactionHash: "tx_9",
      errorKind: undefined,
    });
  });

  it("explains when the action is still running", async () => {
    getActionStatus.mockResolvedValue({ requestId: "req_1", status: "pending", checkedAt: "" });
    const onResolve = vi.fn();
    render(<AgentTimeoutNotice message={timedOut()} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "Check status" }));

    expect(await screen.findByText(/Still running/)).toBeInTheDocument();
    expect(onResolve).toHaveBeenCalledWith({ metadata: expect.objectContaining({ actionStatus: "pending" }) });
  });

  it("warns the user to check history when status is unknown", async () => {
    getActionStatus.mockResolvedValue({ requestId: "req_1", status: "unknown", checkedAt: "" });
    render(<AgentTimeoutNotice message={timedOut()} onResolve={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Check status" }));

    expect(await screen.findByText(/transaction history/)).toBeInTheDocument();
  });

  it("hides once the action is resolved", () => {
    const { container } = render(
      <AgentTimeoutNotice message={timedOut({ actionStatus: "completed" })} onResolve={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
