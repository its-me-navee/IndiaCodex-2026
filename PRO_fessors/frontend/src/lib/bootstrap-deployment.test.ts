import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { UTxO } from "@meshsdk/core";

import {
  BOOTSTRAP_STATE_LOVELACE,
  BOOTSTRAP_DEMO_MARKET,
  BootstrapPreparationError,
  LIQUIDITY_STATE_NAME,
  MARKET_STATE_NAME,
  assembleBootstrapUnsignedTransaction,
  assertBootstrapTransactionSize,
  assertConfiguredAddressesMatch,
  bootstrapConfigurationIssues,
  buildDemoGenesisDatums,
  deriveBootstrapGraph,
  selectBootstrapInputs,
  type BootstrapConfiguration,
  type BootstrapScriptTools,
  type BootstrapTxBuilder,
  type ContractBlueprint,
} from "@/lib/bootstrap-deployment";

const admin = "ab".repeat(28);
const titles = [
  "state_token.state_token.mint",
  "position.position.spend",
  "lp_receipt.lp_receipt.spend",
  "position_token.position_token.mint",
  "lp_receipt_token.lp_receipt_token.mint",
  "market_settlement.market_settlement.spend",
  "market.market.spend",
  "market_lifecycle.market_lifecycle.spend",
  "liquidity.liquidity.spend",
];

function blueprint(): ContractBlueprint {
  return {
    preamble: { plutusVersion: "v3" },
    validators: titles.map((title) => ({ title, compiledCode: title })),
  };
}

function fakeTools(applied: string[]): BootstrapScriptTools {
  return {
    applyParamsToScript: (rawScript, params, type) => {
      expect(type).toBe("JSON");
      applied.push(rawScript);
      return `${rawScript}:${JSON.stringify(params)}`;
    },
    resolveScriptHash: (script) => `hash-${script}`,
    serializePlutusScript: (script) => ({ address: `addr_test1-${script.code}` }),
    assetClass: (policyId, assetName) => ({ constructor: 0, fields: [policyId, assetName] }),
    byteString: (value) => ({ bytes: value }),
    outputReference: (txHash, outputIndex) => ({
      constructor: 0,
      fields: [{ bytes: txHash }, { int: outputIndex }],
    }),
  };
}

function utxo(
  txHash: string,
  outputIndex: number,
  lovelace: string,
  address = "addr-admin",
  extraAssets: UTxO["output"]["amount"] = [],
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address,
      amount: [{ unit: "lovelace", quantity: lovelace }, ...extraAssets],
    },
  };
}

describe("bootstrap deployment plan", () => {
  it("commits the disclosed demo terms instead of placeholder hashes", () => {
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");

    expect(digest(BOOTSTRAP_DEMO_MARKET.canonicalTerms)).toBe(
      BOOTSTRAP_DEMO_MARKET.termsHash,
    );
    expect(digest(BOOTSTRAP_DEMO_MARKET.canonicalMetadata)).toBe(
      BOOTSTRAP_DEMO_MARKET.metadataHash,
    );
    expect(digest(BOOTSTRAP_DEMO_MARKET.canonicalResolutionCriteria)).toBe(
      BOOTSTRAP_DEMO_MARKET.resolutionCriteriaHash,
    );
  });

  it("applies every validator in the documented dependency order", () => {
    const applied: string[] = [];
    const graph = deriveBootstrapGraph(
      blueprint(),
      { txHash: "01".repeat(32), outputIndex: 2 },
      admin,
      fakeTools(applied),
    );

    expect(applied).toEqual(titles);
    expect(graph.assets.market.name).toBe(MARKET_STATE_NAME);
    expect(graph.assets.liquidity.name).toBe(LIQUIDITY_STATE_NAME);
    expect(Object.keys(graph.scripts)).toEqual([
      "lifecycle",
      "trading",
      "settlement",
      "liquidity",
      "position",
    ]);
  });

  it("stops when the live seed derives addresses different from reviewed config", () => {
    const graph = deriveBootstrapGraph(
      blueprint(),
      { txHash: "01".repeat(32), outputIndex: 2 },
      admin,
      fakeTools([]),
    );
    const configuration: BootstrapConfiguration = {
      network: "preprod",
      blockfrostProjectId: "preprod_project",
      adminPaymentCredential: admin,
      minimumCollateralLovelace: 5_000_000,
      addresses: {
        lifecycle: graph.scripts.lifecycle.address,
        trading: graph.scripts.trading.address,
        settlement: "addr_test1-stale",
        liquidity: graph.scripts.liquidity.address,
        position: graph.scripts.position.address,
      },
    };

    expect(() => assertConfiguredAddressesMatch(graph, configuration)).toThrowError(
      expect.objectContaining({ code: "CONFIG_MISMATCH" }),
    );
  });

  it("selects the largest pure-ADA admin seed outside the collateral set", () => {
    const designatedCollateral = utxo("cc".repeat(32), 0, "5000000");
    const tooLargeButCollateral = utxo("dd".repeat(32), 0, "9999999999");
    const selectedSeed = utxo("ee".repeat(32), 2, "9990896192");
    const smallerSeed = utxo("ff".repeat(32), 1, "500000000");
    const tokenUtxo = utxo("11".repeat(32), 0, "9999999999", "addr-admin", [
      { unit: "policytoken", quantity: "1" },
    ]);
    const wrongCredential = utxo("22".repeat(32), 0, "9999999999", "addr-wrong");

    const selection = selectBootstrapInputs(
      [tooLargeButCollateral, selectedSeed, smallerSeed, tokenUtxo, wrongCredential],
      [tooLargeButCollateral, designatedCollateral],
      admin,
      5_000_000,
      (address) => (address === "addr-admin" ? admin : "cd".repeat(28)),
    );

    expect(selection.seed).toBe(selectedSeed);
    expect(selection.collateral).toBe(designatedCollateral);
  });

  it("requires a dedicated collateral UTxO", () => {
    expect(() =>
      selectBootstrapInputs(
        [utxo("ee".repeat(32), 2, "9990896192")],
        [],
        admin,
        5_000_000,
        () => admin,
      ),
    ).toThrowError(expect.objectContaining({ code: "COLLATERAL_REQUIRED" }));
  });

  it("builds the fixed PendingActivation and empty-liquidity inline datums", () => {
    const { marketDatum, liquidityDatum } = buildDemoGenesisDatums(admin, "ef".repeat(28));
    const marketFields = (marketDatum as { fields: Array<Record<string, unknown>> }).fields;
    const liquidityFields = (liquidityDatum as { fields: Array<Record<string, unknown>> }).fields;

    expect(marketFields).toHaveLength(31);
    expect(marketFields[25]).toEqual({ int: Number(BOOTSTRAP_STATE_LOVELACE) });
    expect(marketFields[26]).toEqual({ constructor: 0, fields: [] });
    expect(marketFields[27]).toEqual({ constructor: 1, fields: [] });
    expect(marketFields[28]).toEqual({ constructor: 1, fields: [] });
    expect(liquidityFields).toHaveLength(8);
    expect(liquidityFields[3]).toMatchObject({ int: Number(BOOTSTRAP_STATE_LOVELACE) });
    expect(liquidityFields[4]).toMatchObject({ int: 0 });
    expect(liquidityFields[5]).toMatchObject({ int: 0 });
    expect(liquidityFields[6]).toMatchObject({ int: 0 });
    expect(liquidityFields[7]).toMatchObject({ constructor: 0, fields: [] });
  });

  it("assembles exactly two state mints, two inline outputs, one seed, and separate collateral", async () => {
    const applied: string[] = [];
    const graph = deriveBootstrapGraph(
      blueprint(),
      { txHash: "ee".repeat(32), outputIndex: 2 },
      admin,
      fakeTools(applied),
    );
    const seed = utxo("ee".repeat(32), 2, "9990896192");
    const collateral = utxo("cc".repeat(32), 0, "5000000");
    const { marketDatum, liquidityDatum } = buildDemoGenesisDatums(
      admin,
      graph.statePolicy.policyId,
    );
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let proxy: BootstrapTxBuilder;
    proxy = new Proxy({} as BootstrapTxBuilder, {
      get: (_target, property) => {
        if (property === "complete") return async () => "unsigned-cbor";
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return proxy;
        };
      },
    });

    await expect(
      assembleBootstrapUnsignedTransaction(proxy, {
        selection: { seed, collateral },
        changeAddress: "addr_test1change",
        adminPaymentCredential: admin,
        graph,
        marketDatum,
        liquidityDatum,
        invalidHereafterSlot: 123_456,
      }),
    ).resolves.toBe("unsigned-cbor");

    expect(calls.filter((call) => call.method === "txIn")).toHaveLength(1);
    expect(calls.find((call) => call.method === "txIn")?.args.slice(0, 2)).toEqual([
      seed.input.txHash,
      seed.input.outputIndex,
    ]);
    expect(calls.find((call) => call.method === "txInCollateral")?.args.slice(0, 2)).toEqual([
      collateral.input.txHash,
      collateral.input.outputIndex,
    ]);
    expect(calls.filter((call) => call.method === "inputForEvaluation")).toHaveLength(2);
    expect(calls.filter((call) => call.method === "txOut")).toHaveLength(2);
    expect(calls.filter((call) => call.method === "txOutInlineDatumValue")).toHaveLength(2);
    expect(calls.filter((call) => call.method === "mint").map((call) => call.args)).toEqual([
      ["1", graph.statePolicy.policyId, MARKET_STATE_NAME],
      ["1", graph.statePolicy.policyId, LIQUIDITY_STATE_NAME],
    ]);
    expect(calls.find((call) => call.method === "requiredSignerHash")?.args).toEqual([admin]);
    expect(calls.find((call) => call.method === "setTotalCollateral")?.args).toEqual([
      "2000000",
    ]);
    expect(calls.find((call) => call.method === "setCollateralReturnAddress")?.args).toEqual([
      "addr_test1change",
    ]);
    expect(calls.find((call) => call.method === "invalidHereafter")?.args).toEqual([123_456]);
  });

  it("requires all five reviewed testnet addresses and a real preprod evaluator key", () => {
    const configuration: BootstrapConfiguration = {
      network: "preprod",
      blockfrostProjectId: "preprod_project",
      adminPaymentCredential: admin,
      minimumCollateralLovelace: 5_000_000,
      addresses: {
        lifecycle: "addr_test1lifecycle",
        trading: "addr_test1trading",
        settlement: "addr_test1settlement",
        liquidity: "addr_test1liquidity",
        position: "addr_test1position",
      },
    };
    expect(bootstrapConfigurationIssues(configuration)).toEqual([]);

    expect(
      bootstrapConfigurationIssues({
        ...configuration,
        blockfrostProjectId: "preprod_REPLACE_ME",
        addresses: { ...configuration.addresses, settlement: "" },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/blockfrost/i),
        expect.stringMatching(/settlement/i),
      ]),
    );
  });

  it("reserves witness space beneath the protocol transaction-size limit", () => {
    expect(assertBootstrapTransactionSize("aa".repeat(15_000), 16_384, 512)).toBe(15_000);
    expect(() =>
      assertBootstrapTransactionSize("aa".repeat(16_000), 16_384, 512),
    ).toThrowError(expect.objectContaining({ code: "BUILD_FAILED" }));
  });

  it("uses typed preparation errors for guard failures", () => {
    const error = new BootstrapPreparationError("SEED_SPENT", "spent");
    expect(error).toMatchObject({ name: "BootstrapPreparationError", code: "SEED_SPENT" });
  });
});
