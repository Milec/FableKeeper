import type { QuestStatus } from "@/types/database";

/** Display labels and badge styling for quest statuses. */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
  on_hold: "On hold",
};

export const QUEST_STATUS_ORDER: readonly QuestStatus[] = [
  "active",
  "on_hold",
  "completed",
  "failed",
];

export function questStatusVariant(
  status: QuestStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "completed":
      return "secondary";
    case "failed":
      return "destructive";
    case "on_hold":
      return "outline";
  }
}
