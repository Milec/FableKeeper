import type { Metadata } from "next";
import { Dices } from "lucide-react";
import { DiceRoller } from "@/modules/dice/dice-roller";

export const metadata: Metadata = {
  title: "Dice Roller",
  description:
    "Roll standard dice notation with keep-highest/lowest, modifiers, and roll history.",
};

export default function DicePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Dices className="h-7 w-7 text-primary" />
          Dice Roller
        </h1>
        <p className="text-muted-foreground">
          Supports <code className="font-mono">d2</code>–
          <code className="font-mono">d100</code>, modifiers, and keep
          highest/lowest — e.g.{" "}
          <code className="font-mono">4d6kh3</code> or{" "}
          <code className="font-mono">2d20kl1</code>.
        </p>
      </div>
      <DiceRoller />
    </div>
  );
}
