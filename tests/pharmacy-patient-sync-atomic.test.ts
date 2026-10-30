import { afterEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  results: [] as unknown[][],
  committed: [] as Array<{ operation: string; values: Record<string, unknown> }>,
  conflicts: [] as Array<Record<string, unknown>>,
  conflictUpserts: [] as Array<Record<string, unknown>>,
  transactions: 0,
}));

vi.mock("../server/db", () => ({
  pool: {
    connect: async () => ({
      query: async () => ({ rows: [{ locked: true }] }),
      release: () => {},
    }),
  },
  db: {
    transaction: async (callback: (tx: unknown) => Promise<void>) => {
      fake.transactions++;
      const pending: typeof fake.committed = [];
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => fake.results.shift() ?? [],
            }),
          }),
        }),
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            pending.push({ operation: "insert", values });
            return {
              then: (resolve: () => void) => resolve(),
              onConflictDoUpdate: async (config: { set: Record<string, unknown> }) => {
                fake.conflictUpserts.push(config.set);
              },
            };
          },
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => { pending.push({ operation: "update", values }); },
          }),
        }),
      };
      await callback(tx);
      fake.committed.push(...pending);
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => { fake.conflicts.push(values); },
      }),
    }),
  },
}));

import { importPharmacyPatients } from "../server/pharmacy-patient-sync";

describe("patient-by-patient pharmacy import", () => {
  const originalUrl = process.env.CONCORDIA_API_URL;
  const originalKey = process.env.CONCORDIA_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalUrl === undefined) delete process.env.CONCORDIA_API_URL;
    else process.env.CONCORDIA_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.CONCORDIA_API_KEY;
    else process.env.CONCORDIA_API_KEY = originalKey;
    fake.results = [];
    fake.committed = [];
    fake.conflicts = [];
    fake.conflictUpserts = [];
    fake.transactions = 0;
  });

  it("rolls back an entire patient's writes on Rx ownership conflict, records review, then imports the next patient", async () => {
    process.env.CONCORDIA_API_URL = "https://pharmacy.example";
    process.env.CONCORDIA_API_KEY = "test-only";
    const feed = [
      {
        id: "pharmacy-1", concordiaId: "CP-000001",
        prescriptions: [
          { id: "rx-a", medicationName: "Earlier Rx", rxNumber: "A", refillsRemaining: 1, status: "active" },
          { id: "rx-b", medicationName: "Conflicting Rx", rxNumber: "B", refillsRemaining: 1, status: "active" },
        ],
      },
      {
        id: "pharmacy-2", concordiaId: "CP-000002",
        prescriptions: [
          { id: "rx-c", medicationName: "Next Patient Rx", rxNumber: "C", refillsRemaining: 1, status: "active" },
        ],
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ patients: feed, total: 2 }), { status: 200 })));
    // Each patient: CP lookup, pharmacy ID lookup, then external ID and
    // Rx-number lookups for each prescription. The second Rx belongs elsewhere.
    fake.results = [[], [], [], [], [{ id: 99, userId: "another-patient" }], [], [], [], [], []];

    const counts = await importPharmacyPatients();

    expect(fake.transactions).toBe(2);
    expect(counts).toMatchObject({
      fetched: 2, created: 1, conflicts: 1,
      prescriptionsCreated: 1, prescriptionsConflicts: 1,
    });
    expect(fake.committed.some((write) => write.values.name === "Earlier Rx")).toBe(false);
    expect(fake.committed.some((write) => write.values.concordiaId === "CP-000001")).toBe(false);
    expect(fake.committed.some((write) => write.values.name === "Next Patient Rx")).toBe(true);
    expect(fake.committed.filter((write) => write.values.status === "resolved")).toHaveLength(1);
    expect(fake.conflicts).toEqual([
      expect.objectContaining({
        conflictType: "prescription_ownership_conflict",
        concordiaId: "CP-000001",
        prescriptionId: "rx-b",
      }),
    ]);
  });

  it("keeps conflicting owners blocked, and reopens a previously resolved conflict if it recurs", async () => {
    process.env.CONCORDIA_API_URL = "https://pharmacy.example";
    process.env.CONCORDIA_API_KEY = "test-only";
    const feed = [{ id: "pharmacy-1", concordiaId: "CP-000001", prescriptions: [] }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ patients: feed, total: 1 }), { status: 200 })));
    fake.results = [
      [{ id: "local-1", concordiaId: "CP-000001", pharmacyPatientId: "pharmacy-2" }],
      [{ id: "local-2", concordiaId: "CP-000002", pharmacyPatientId: "pharmacy-1" }],
    ];

    const counts = await importPharmacyPatients();

    expect(counts).toMatchObject({ conflicts: 1, created: 0, updated: 0 });
    expect(fake.committed.some((write) => write.values.conflictType === "pharmacy_ownership_conflict")).toBe(true);
    expect(fake.committed.some((write) => write.values.status === "resolved")).toBe(false);
    expect(fake.conflictUpserts).toEqual([expect.objectContaining({ status: "open" })]);
  });

  it("imports the same patient twice without duplicating a prescription", async () => {
    process.env.CONCORDIA_API_URL = "https://pharmacy.example";
    process.env.CONCORDIA_API_KEY = "test-only";
    const feed = [{
      id: "pharmacy-3", concordiaId: "CP-000003",
      prescriptions: [{ id: "rx-d", medicationName: "Existing Rx", rxNumber: "D", refillsRemaining: 2, status: "active" }],
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ patients: feed, total: 1 }), { status: 200 })));
    fake.results = [[], [], [], []];

    const first = await importPharmacyPatients();
    expect(first).toMatchObject({ created: 1, prescriptionsCreated: 1, conflicts: 0 });
    const user = fake.committed.find((write) => write.values.concordiaId === "CP-000003")!.values;
    const medication = fake.committed.find((write) => write.values.externalRxId === "rx-d")!.values;
    const before = fake.committed.length;
    fake.results = [
      [{ ...user }], [{ ...user }],
      [{ id: 12, ...medication }], [{ id: 12, ...medication }],
    ];

    const second = await importPharmacyPatients();
    expect(second).toMatchObject({
      created: 0, updated: 0, unchanged: 1,
      prescriptionsCreated: 0, prescriptionsUpdated: 0, prescriptionsUnchanged: 1,
      conflicts: 0,
    });
    expect(fake.committed.slice(before).filter((write) => write.operation === "insert")).toHaveLength(0);
  });
});