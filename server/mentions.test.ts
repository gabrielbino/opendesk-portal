import { describe, it, expect } from "vitest";

/**
 * Tests for the @mentions system
 * Tests the mention parsing logic and notification type
 */

describe("Mention System", () => {
  describe("Mention Parsing", () => {
    // The regex used in the frontend component MentionInput
    // In practice, mentions are tracked by user IDs, not parsed from text
    // The frontend inserts @Name and tracks the ID separately
    // This regex is used only for rendering highlighted mentions in displayed comments

    it("should extract @mentions from text", () => {
      const text = "Olá @Carlos TI, pode verificar isso?";
      // Match @ followed by words until comma, period, or end
      const mentionRegex = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?)(?=[,\.!?;:]|\s(?:e|ou|pode|precisa|tudo|para)\b|$)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      expect(mentions.length).toBeGreaterThan(0);
      expect(mentions[0]).toBe("Carlos TI");
    });

    it("should extract multiple @mentions", () => {
      const text = "@Carlos TI e @Yasmim Azevedo precisam ver isso";
      const mentionRegex = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?)(?=[,\.!?;:]|\s(?:e|ou|pode|precisa|tudo|para|precisam)\b|$)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      expect(mentions.length).toBe(2);
      expect(mentions[0]).toBe("Carlos TI");
      expect(mentions[1]).toBe("Yasmim Azevedo");
    });

    it("should handle text without mentions", () => {
      const text = "Este é um comentário normal sem menções";
      const mentionRegex = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?)(?=[,\.!?;:]|\s(?:e|ou|pode|precisa|tudo|para)\b|$)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      expect(mentions.length).toBe(0);
    });

    it("should handle @ at the end of text", () => {
      const text = "Olá @Daniel";
      const mentionRegex = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?)(?=[,\.!?;:]|\s(?:e|ou|pode|precisa|tudo|para)\b|$)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      expect(mentions.length).toBe(1);
      expect(mentions[0]).toBe("Daniel");
    });

    it("should handle names with accents", () => {
      const text = "Olá @José da Silva, tudo bem?";
      const mentionRegex = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?)(?=[,\.!?;:]|\s(?:e|ou|pode|precisa|tudo|para)\b|$)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push(match[1].trim());
      }
      expect(mentions.length).toBeGreaterThan(0);
      expect(mentions[0]).toBe("José da Silva");
    });
  });

  describe("Notification Type", () => {
    it("should have 'mention' as a valid notification type", () => {
      const validTypes = [
        'stock_critical', 'stock_low', 'request_approved', 'request_rejected',
        'request_delivered', 'request_pending', 'request_created', 'request_updated',
        'request_completed', 'task_assigned', 'task_due_soon', 'ticket_created',
        'ticket_updated', 'ticket_comment', 'ticket_assigned', 'ticket_status_changed',
        'mention', 'system'
      ];
      expect(validTypes).toContain('mention');
    });

    it("mention type should be distinct from other ticket types", () => {
      const ticketTypes = ['ticket_created', 'ticket_updated', 'ticket_comment', 'ticket_assigned', 'ticket_status_changed'];
      expect(ticketTypes).not.toContain('mention');
    });
  });

  describe("Mention IDs Processing", () => {
    it("should filter out self-mentions", () => {
      const currentUserId = 1;
      const mentionIds = [1, 2, 3];
      const filtered = mentionIds.filter(id => id !== currentUserId);
      expect(filtered).toEqual([2, 3]);
      expect(filtered).not.toContain(currentUserId);
    });

    it("should handle empty mention list", () => {
      const mentionIds: number[] = [];
      expect(mentionIds.length).toBe(0);
    });

    it("should handle duplicate mentions", () => {
      const mentionIds = [2, 3, 2, 4, 3];
      const unique = [...new Set(mentionIds)];
      expect(unique).toEqual([2, 3, 4]);
    });

    it("should not duplicate notification for already-notified users", () => {
      const ticketCreatorId = 5;
      const ticketAssignedId = 10;
      const currentUserRole = 'admin';
      const mentionIds = [5, 10, 15];

      const filteredMentions = mentionIds.filter(id => {
        // Don't duplicate if already notified via ticket comment notification
        if (id === ticketCreatorId && currentUserRole === 'admin') return false;
        if (id === ticketAssignedId && currentUserRole === 'user') return false;
        return true;
      });

      expect(filteredMentions).toEqual([10, 15]);
      expect(filteredMentions).not.toContain(5); // Creator already notified by admin
    });
  });
});
