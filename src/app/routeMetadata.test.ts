import { describe, expect, it } from "vitest";
import { metadata as auditMetadata } from "./admin/audit/layout";
import { metadata as loginMetadata } from "./auth/login/layout";
import { metadata as registerMetadata } from "./auth/register/layout";
import { metadata as chatMetadata } from "./chat/layout";
import { metadata as conversationMetadata } from "./chat/[conversationId]/layout";
import { metadata as historyMetadata } from "./chat/history/layout";
import { metadata as contactsMetadata } from "./contacts/layout";
import { metadata as dashboardMetadata } from "./dashboard/layout";
import { metadata as sendMetadata } from "./send/layout";
import { metadata as settingsMetadata } from "./settings/layout";
import { metadata as transactionsMetadata } from "./transactions/layout";

describe("route metadata", () => {
    it("provides a descriptive title for each page route", () => {
        expect([
            auditMetadata.title,
            loginMetadata.title,
            registerMetadata.title,
            chatMetadata.title,
            conversationMetadata.title,
            historyMetadata.title,
            contactsMetadata.title,
            dashboardMetadata.title,
            sendMetadata.title,
            settingsMetadata.title,
            transactionsMetadata.title,
        ]).toEqual([
            "Audit Log",
            "Sign In",
            "Create Account",
            "Chat",
            "Conversation",
            "Chat History",
            "Contacts",
            "Dashboard",
            "Send Payment",
            "Settings",
            "Transactions",
        ]);
    });
});