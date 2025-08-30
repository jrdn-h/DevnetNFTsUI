import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const collection = req.nextUrl.searchParams.get("collection");
  const HELIUS = process.env.HELIUS_RPC_URL; // e.g. https://devnet.helius-rpc.com/?api-key=YOUR_KEY

  if (!owner || !collection) {
    return NextResponse.json({ error: "owner & collection required" }, { status: 400 });
  }
  if (!HELIUS) {
    return NextResponse.json({ error: "Missing HELIUS_RPC_URL" }, { status: 500 });
  }

  // Primary call: owner + collection in one go
  const body = {
    jsonrpc: "2.0",
    id: "wallet-collection",
    method: "searchAssets",
    params: {
      ownerAddress: owner,
      grouping: ["collection", collection],     // <-- correct shape per docs
      tokenType: "nonFungible",                 // NFTs only (faster / cleaner)
      page: 1,
      limit: 1000,
      // display options add extra fields; they don't change filtering
      displayOptions: { showCollectionMetadata: false }
    }
  };

  let j: any = null;
  try {
    const r = await fetch(HELIUS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 30 }, // short cache/dedupe
    });
    j = await r.json().catch(() => null);
    if (!r.ok || j?.error) {
      return NextResponse.json(
        { upstreamStatus: r.status, upstreamError: j?.error ?? j ?? r.statusText },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  // DAS returns JSON-RPC with result.items for searchAssets (handle variants defensively)
  const items =
    j?.result?.items ??
    j?.assets?.items ??              // some examples/doc blocks show this
    j?.result?.assets?.items ?? [];

  // Fallback: if nothing came back, double-check wallet then filter client-side
  if (!Array.isArray(items) || items.length === 0) {
    const fallback = await fetch(HELIUS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "fallback",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          options: { showUnverifiedCollections: true }
        },
      }),
    }).then(r => r.json()).catch(() => null);

    const fItems =
      fallback?.result?.items ??
      fallback?.assets?.items ?? [];

    const filtered = fItems.filter((a: any) =>
      Array.isArray(a?.grouping) &&
      a.grouping.some((g: any) => g.group_key === "collection" && g.group_value === collection)
    );

    return NextResponse.json(filtered);
  }

  return NextResponse.json(items);
}
