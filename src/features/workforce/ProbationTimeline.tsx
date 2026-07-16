"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";
import type { ProbationRecord } from "@/core/operon";
import { daysUntil } from "@/core/operon";
import { motionPreset } from "@/styles/motionPresets";
import { S, T } from "@/styles/sharedUi";
import { PROBATION_STATUS_TOKENS } from "@/styles/statusColors";

type StageState = "done" | "current" | "upcoming";

interface Stage {
  title:       string;
  date?:       string;
  state:       StageState;
}

function buildStages(dateJoined: string, record: ProbationRecord): Stage[] {
  const reviewed = !!record.reviewedAt;
  const reviewDue = daysUntil(record.expectedReviewDate) <= 0;

  return [
    { title: "Employee Created",  date: dateJoined,               state: "done" },
    { title: "Probation Started", date: record.dateJoined,        state: "done" },
    {
      title: "Upcoming Review",
      date:  record.expectedReviewDate,
      state: reviewed || reviewDue ? "done" : "current",
    },
    {
      title: "HR Recommendation",
      state: reviewed ? "done" : reviewDue ? "current" : "upcoming",
    },
    {
      title: "Co-Founder Decision",
      date:  record.reviewedAt,
      state: reviewed ? "done" : "upcoming",
    },
  ];
}

/** Adapts renderTimeline.tsx's dot-and-connector grid for the fixed probation workflow. */
export function ProbationTimeline({ dateJoined, record }: { dateJoined: string; record: ProbationRecord }) {
  const stages = buildStages(dateJoined, record);
  const outcomeToken = record.reviewedAt ? PROBATION_STATUS_TOKENS[record.status] : undefined;

  return (
    <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "8px 20px 4px" }}>
      {stages.map((stage, i) => {
        const isLast = i === stages.length - 1;
        const dotColor =
          stage.state === "done" ? "#4ade80" : stage.state === "current" ? "var(--op-accent)" : "var(--op-border-hover)";
        const titleColor = stage.state === "upcoming" ? "var(--op-text-3)" : "var(--op-text)";

        return (
          <div
            key={stage.title}
            style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: "0 14px", paddingBottom: isLast ? "8px" : "0" }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <motion.div
                aria-hidden="true"
                initial={stage.state === "current" ? { scale: 0.6, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionPreset.fadeScale.transition}
                style={{
                  marginTop:    "18px",
                  width:        stage.state === "current" ? "10px" : "8px",
                  height:       stage.state === "current" ? "10px" : "8px",
                  borderRadius: "50%",
                  background:   stage.state === "upcoming" ? "transparent" : dotColor,
                  border:       stage.state === "upcoming" ? "1.5px solid var(--op-border-hover)" : "none",
                  boxShadow:    stage.state === "current" ? `0 0 0 4px ${dotColor}22` : "none",
                  flexShrink:   0,
                }}
              />
              {!isLast && (
                <div
                  aria-hidden="true"
                  style={{ flex: 1, width: "1px", minHeight: "22px", background: stage.state === "done" ? "#4ade8055" : "var(--op-border)", marginTop: "4px" }}
                />
              )}
            </div>

            <div style={{ paddingTop: "12px", paddingBottom: isLast ? "8px" : "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, color: titleColor }}>
                  {stage.title}
                </span>
                {stage.state === "current" && (
                  <span style={{ ...S.badgeAccent, padding: "1px 8px", fontSize: "var(--text-10)" }}>In progress</span>
                )}
                {isLast && outcomeToken && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: outcomeToken.fg, fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 600 }}>
                    <outcomeToken.icon size={12} /> {outcomeToken.label}
                  </span>
                )}
              </div>
              {stage.date && (
                <div style={{ ...T.caption, marginTop: "2px" }}>{stage.date}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Amber at ≤30 days out, critical at ≤7 or overdue. Renders nothing once decided or far out. */
export function ProbationReviewBanner({ record }: { record: ProbationRecord }) {
  if (record.reviewedAt) return null;

  const days = daysUntil(record.expectedReviewDate);
  if (days > 30) return null;

  const critical = days <= 7;
  const fg = critical ? "#e5484d" : "#fbbf24";
  const bg = critical ? "rgba(229,72,77,0.12)" : "rgba(251,191,36,0.12)";
  const border = critical ? "rgba(229,72,77,0.3)" : "rgba(251,191,36,0.3)";
  const message =
    days < 0 ? `Probation review is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
    : days === 0 ? "Probation review is due today"
    : `Probation review due in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 16px", borderRadius: "var(--r-md)",
        background: bg, border: `1px solid ${border}`, color: fg,
      }}
    >
      {critical ? <AlertTriangle size={16} /> : <Clock size={16} />}
      <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600 }}>{message}</span>
    </motion.div>
  );
}
