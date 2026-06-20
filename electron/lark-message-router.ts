import { messageTargetDecision, type MessageTargetDecision } from "./message-target.js";
import type { BotConfig, LarkBotIdentity, LarkMessage } from "./types.js";

export interface LarkRouteDecision {
  bot: BotConfig | null;
  decision: MessageTargetDecision | null;
  ignored: Array<{ bot: BotConfig; decision: MessageTargetDecision }>;
  reason: string;
}

export function selectLarkMessageTarget(
  bots: BotConfig[],
  message: LarkMessage,
  identities: Map<string, LarkBotIdentity>,
  strictGroupTargeting: boolean
): LarkRouteDecision {
  const decisions = bots.map((bot) => ({
    bot,
    decision: messageTargetDecision(bot, message, identities.get(bot.id), strictGroupTargeting)
  }));
  const targeted = decisions.filter((item) => item.decision.targeted);
  if (targeted.length === 1) {
    return {
      bot: targeted[0].bot,
      decision: targeted[0].decision,
      ignored: decisions.filter((item) => item.bot.id !== targeted[0].bot.id),
      reason: targeted[0].decision.reason
    };
  }
  if (targeted.length > 1) {
    const mentionMatched = targeted.filter((item) => item.decision.reason.includes("mention-match"));
    if (mentionMatched.length === 1) {
      return {
        bot: mentionMatched[0].bot,
        decision: mentionMatched[0].decision,
        ignored: decisions.filter((item) => item.bot.id !== mentionMatched[0].bot.id),
        reason: mentionMatched[0].decision.reason
      };
    }
    return {
      bot: null,
      decision: null,
      ignored: decisions,
      reason: "ambiguous-target"
    };
  }
  return {
    bot: null,
    decision: null,
    ignored: decisions,
    reason: decisions[0]?.decision.reason ?? "no-running-bot"
  };
}
