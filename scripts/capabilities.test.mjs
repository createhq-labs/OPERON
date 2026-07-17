import test from "node:test";
import assert from "node:assert/strict";
import { capabilitiesFor } from "../src/lib/workforce/capabilities.ts";

const caps = (roleName) => capabilitiesFor({ id: "user", roleName });
test("Creator is read-only and blocked from HR", () => { const c = caps("Creator"); assert.equal(c.isCreator, true); assert.equal(c.canManageContent, false); assert.equal(c.canAccessHr, false); assert.equal(c.canSubmitLeave, false); });
test("HR Executive manages HR but cannot finalize probation", () => { const c = caps("HR Executive"); assert.equal(c.canManageOnboarding, true); assert.equal(c.canManageAttendance, true); assert.equal(c.canFinalizeProbation, false); });
test("Creator Acquisition initiates only Creator deboarding", () => { const c = caps("Creator Acquisition"); assert.equal(c.canInitiateCreatorDeboarding, true); assert.equal(c.canInitiateEmployeeDeboarding, false); });
test("Content leads manage content and approve Creator deboarding", () => { const c = caps("IM Team Lead"); assert.equal(c.canManageContent, true); assert.equal(c.canApproveCreatorDeboarding, true); });
test("Co-Founder has final Workforce authority", () => { const c = caps("Co-Founder"); assert.equal(c.canFinalizeProbation, true); assert.equal(c.canManageAttendance, true); assert.equal(c.canInitiateEmployeeDeboarding, true); });
